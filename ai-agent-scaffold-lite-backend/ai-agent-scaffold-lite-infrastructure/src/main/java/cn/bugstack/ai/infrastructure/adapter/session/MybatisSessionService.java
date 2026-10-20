package cn.bugstack.ai.infrastructure.adapter.session;

import cn.bugstack.ai.infrastructure.dao.AgentChatSessionMapper;
import cn.bugstack.ai.infrastructure.dao.AgentChatSessionEventMapper;
import cn.bugstack.ai.infrastructure.dao.po.AgentChatSessionEventPO;
import cn.bugstack.ai.infrastructure.dao.po.AgentChatSessionPO;
import com.google.adk.events.Event;
import com.google.adk.sessions.BaseSessionService;
import com.google.adk.sessions.GetSessionConfig;
import com.google.adk.sessions.ListEventsResponse;
import com.google.adk.sessions.ListSessionsResponse;
import com.google.adk.sessions.Session;
import com.google.adk.sessions.State;
import com.google.genai.types.Content;
import com.google.genai.types.Part;
import io.reactivex.rxjava3.core.Completable;
import io.reactivex.rxjava3.core.Maybe;
import io.reactivex.rxjava3.core.Single;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 将 Google ADK 会话及事件通过 MyBatis 持久化到 MySQL。
 */
@Service
public class MybatisSessionService implements BaseSessionService {

    private final AgentChatSessionMapper sessionMapper;
    private final AgentChatSessionEventMapper eventMapper;
    private final TransactionTemplate transactionTemplate;
    private final ConcurrentMap<StreamEventKey, StringBuilder> partialAssistantText = new ConcurrentHashMap<>();

    public MybatisSessionService(AgentChatSessionMapper sessionMapper,
                                 AgentChatSessionEventMapper eventMapper,
                                 PlatformTransactionManager transactionManager) {
        this.sessionMapper = sessionMapper;
        this.eventMapper = eventMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    public Single<Session> createSession(String appName, String userId,
                                         ConcurrentMap<String, Object> state, String sessionId) {
        return Single.fromCallable(() -> {
            String resolvedSessionId = sessionId == null || sessionId.trim().isEmpty()
                    ? UUID.randomUUID().toString()
                    : sessionId.trim();
            ConcurrentMap<String, Object> initialState = state == null
                    ? new ConcurrentHashMap<>()
                    : new ConcurrentHashMap<>(state);
            Session session = Session.builder(resolvedSessionId)
                    .appName(appName)
                    .userId(userId)
                    .state(initialState)
                    .events(new ArrayList<>())
                    .lastUpdateTime(Instant.now())
                    .build();
            return transactionTemplate.execute(status -> {
                if (sessionMapper.insert(toPO(session)) != 1) {
                    throw new IllegalStateException("创建会话记录失败");
                }
                return session;
            });
        });
    }

    @Override
    public Maybe<Session> getSession(String appName, String userId, String sessionId,
                                     Optional<GetSessionConfig> config) {
        return Maybe.fromCallable(() -> {
            AgentChatSessionPO record = sessionMapper.findOne(appName, userId, sessionId);
            return record == null ? null : toSession(record, config);
        });
    }

    @Override
    public Single<ListSessionsResponse> listSessions(String appName, String userId) {
        return Single.fromCallable(() -> {
            List<Session> sessions = new ArrayList<>();
            for (AgentChatSessionPO record : sessionMapper.findByUser(appName, userId)) {
                sessions.add(Session.builder(record.getSessionId())
                        .appName(record.getAppName())
                        .userId(record.getUserId())
                        .state(new ConcurrentHashMap<>())
                        .events(new ArrayList<>())
                        .lastUpdateTime(Instant.ofEpochMilli(record.getLastUpdateTime()))
                        .build());
            }
            return ListSessionsResponse.builder().sessions(sessions).build();
        });
    }

    @Override
    public Completable deleteSession(String appName, String userId, String sessionId) {
        return Completable.fromAction(() -> transactionTemplate.executeWithoutResult(status -> {
            AgentChatSessionPO session = sessionMapper.findOne(appName, userId, sessionId);
            if (session == null) {
                return;
            }
            eventMapper.deleteBySession(session.getId());
            sessionMapper.deleteById(session.getId());
        }));
    }

    @Override
    public Single<ListEventsResponse> listEvents(String appName, String userId, String sessionId) {
        return getSession(appName, userId, sessionId, Optional.empty())
                .map(session -> ListEventsResponse.builder().events(new ArrayList<>(session.events())).build())
                .switchIfEmpty(Single.just(ListEventsResponse.builder().build()));
    }

    @Override
    public Single<Event> appendEvent(Session session, Event event) {
        if (event.partial().orElse(false)) {
            if (event.functionCalls().isEmpty()) {
                bufferAssistantText(session, event);
            }
            return Single.just(event);
        }

        StreamEventKey streamKey = streamKey(session, event);
        if (!event.functionCalls().isEmpty()) {
            partialAssistantText.remove(streamKey);
            return persistEvent(session, event, event);
        }

        if (event.turnComplete().orElse(false)) {
            StringBuilder buffered = partialAssistantText.remove(streamKey);
            if (buffered != null) {
                String completeText = mergeText(buffered.toString(), extractText(event));
                if (!completeText.isBlank()) {
                    return persistEvent(session, event, withCompleteText(event, completeText));
                }
            }
        } else if (event.errorCode().isPresent() || event.interrupted().orElse(false)) {
            partialAssistantText.remove(streamKey);
        }

        return persistEvent(session, event, event);
    }

    private Single<Event> persistEvent(Session session, Event event, Event persistedEvent) {
        return Single.fromCallable(() -> transactionTemplate.execute(status -> {
            AgentChatSessionPO storedSession = sessionMapper.findOneForUpdate(
                    session.appName(), session.userId(), session.id());
            if (storedSession == null) {
                throw new IllegalStateException("会话记录不存在: " + session.id());
            }
            Event appendedEvent = BaseSessionService.super.appendEvent(session, event).blockingGet();
            Session persistedState = Session.fromJson(storedSession.getSessionState());
            BaseSessionService.super.appendEvent(persistedState, persistedEvent).blockingGet();
            ConcurrentMap<String, Object> temporaryState = new ConcurrentHashMap<>();
            session.state().forEach((key, value) -> {
                if (key.startsWith(State.TEMP_PREFIX)) {
                    temporaryState.put(key, value);
                }
            });
            session.state().clear();
            session.state().putAll(persistedState.state());
            session.state().putAll(temporaryState);
            long latestUpdateTime = Math.max(storedSession.getLastUpdateTime(), event.timestamp());
            session.lastUpdateTime(Instant.ofEpochMilli(latestUpdateTime));
            if (sessionMapper.updateState(toPO(session, storedSession.getId())) != 1) {
                throw new IllegalStateException("更新会话记录失败: " + session.id());
            }
            if (eventMapper.insert(toEventPO(storedSession.getId(), persistedEvent)) != 1) {
                throw new IllegalStateException("写入会话事件失败: " + event.id());
            }
            return appendedEvent;
        }));
    }

    private void bufferAssistantText(Session session, Event event) {
        String chunk = extractText(event);
        if (chunk.isEmpty()) {
            return;
        }

        StreamEventKey key = streamKey(session, event);
        partialAssistantText.compute(key, (ignored, current) -> {
            String accumulated = current == null ? "" : current.toString();
            return new StringBuilder(mergeText(accumulated, chunk));
        });
    }

    private StreamEventKey streamKey(Session session, Event event) {
        return new StreamEventKey(session.id(), event.invocationId(), event.author());
    }

    private String extractText(Event event) {
        StringBuilder text = new StringBuilder();
        event.content().ifPresent(content -> content.parts().orElse(List.of()).forEach(part ->
                part.text().ifPresent(text::append)));
        return text.toString();
    }

    private String mergeText(String accumulated, String chunk) {
        if (chunk.isEmpty()) {
            return accumulated;
        }
        if (accumulated.isEmpty() || chunk.startsWith(accumulated)) {
            return chunk;
        }
        return accumulated + chunk;
    }

    private Event withCompleteText(Event event, String text) {
        String role = event.content()
                .flatMap(Content::role)
                .orElse("model");
        Content content = Content.builder()
                .role(role)
                .parts(List.of(Part.fromText(text)))
                .build();
        return event.toBuilder()
                .content(content)
                .partial(false)
                .turnComplete(true)
                .build();
    }

    private record StreamEventKey(String sessionId, String invocationId, String author) {
    }

    private AgentChatSessionPO toPO(Session session) {
        return toPO(session, null);
    }

    private AgentChatSessionPO toPO(Session session, Long id) {
        Session stateSnapshot = Session.builder(session.id())
                .appName(session.appName())
                .userId(session.userId())
                .state(new ConcurrentHashMap<>(session.state()))
                .events(new ArrayList<>())
                .lastUpdateTime(session.lastUpdateTime())
                .build();
        AgentChatSessionPO record = new AgentChatSessionPO();
        record.setId(id);
        record.setAppName(session.appName());
        record.setUserId(session.userId());
        record.setSessionId(session.id());
        record.setSessionState(stateSnapshot.toJson());
        record.setLastUpdateTime(session.lastUpdateTime() == null
                ? System.currentTimeMillis()
                : session.lastUpdateTime().toEpochMilli());
        return record;
    }

    private Session toSession(AgentChatSessionPO record, Optional<GetSessionConfig> config) {
        Session stateSnapshot = Session.fromJson(record.getSessionState());
        List<Event> events = eventMapper.findBySession(record.getId()).stream()
                .map(event -> Event.fromJson(event.getEventData()))
                .toList();
        if (config != null && config.isPresent()) {
            GetSessionConfig eventConfig = config.get();
            if (eventConfig.afterTimestamp().isPresent()) {
                Instant afterTimestamp = eventConfig.afterTimestamp().get();
                events = events.stream()
                        .filter(event -> Instant.ofEpochMilli(event.timestamp()).isAfter(afterTimestamp))
                        .toList();
            }
            if (eventConfig.numRecentEvents().isPresent()) {
                int recentEventCount = eventConfig.numRecentEvents().get();
                events = events.subList(Math.max(0, events.size() - recentEventCount), events.size());
            }
        }
        return Session.builder(record.getSessionId())
                .appName(record.getAppName())
                .userId(record.getUserId())
                .state(new ConcurrentHashMap<>(stateSnapshot.state()))
                .events(new ArrayList<>(events))
                .lastUpdateTime(Instant.ofEpochMilli(record.getLastUpdateTime()))
                .build();
    }

    private AgentChatSessionEventPO toEventPO(Long sessionPk, Event event) {
        AgentChatSessionEventPO record = new AgentChatSessionEventPO();
        record.setSessionPk(sessionPk);
        record.setEventId(event.id());
        record.setInvocationId(event.invocationId());
        record.setAuthor(event.author());
        record.setEventTimestamp(event.timestamp());
        record.setEventData(event.toJson());
        return record;
    }
}
