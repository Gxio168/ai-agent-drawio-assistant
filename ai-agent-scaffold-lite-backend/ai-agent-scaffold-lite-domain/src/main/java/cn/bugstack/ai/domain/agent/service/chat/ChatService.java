package cn.bugstack.ai.domain.agent.service.chat;

import cn.bugstack.ai.domain.agent.model.entity.ChatCommandEntity;
import cn.bugstack.ai.domain.agent.model.valobj.AiAgentConfigTableVO;
import cn.bugstack.ai.domain.agent.model.valobj.AiAgentRegisterVO;
import cn.bugstack.ai.domain.agent.model.valobj.ChatMessageVO;
import cn.bugstack.ai.domain.agent.model.valobj.ChatSessionVO;
import cn.bugstack.ai.domain.agent.repository.IAgentConfigRepository;
import cn.bugstack.ai.domain.agent.service.IChatService;
import cn.bugstack.ai.domain.agent.service.armory.factory.DefaultArmoryFactory;
import cn.bugstack.ai.types.enums.ResponseCode;
import cn.bugstack.ai.types.exception.AppException;
import com.google.adk.agents.RunConfig;
import com.google.adk.events.Event;
import com.google.adk.runner.Runner;
import com.google.adk.sessions.Session;
import com.google.genai.types.Content;
import com.google.genai.types.Part;
import io.reactivex.rxjava3.core.Flowable;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ChatService implements IChatService {

    @Resource
    private DefaultArmoryFactory defaultArmoryFactory;

    @Resource
    private IAgentConfigRepository agentConfigRepository;

    /**
     * 获取 agent 配置列表
     * @return
     */
    @Override
    public List<AiAgentConfigTableVO.Agent> queryAiAgentConfigList() {
        List<AiAgentConfigTableVO.Agent> agentList = new ArrayList<>();
        for (AiAgentConfigTableVO vo : agentConfigRepository.findEnabled()) {
            if (vo.getAgent() != null) agentList.add(vo.getAgent());
        }

        return agentList;
    }

    /**
     * 创建会话
     * @param agentId
     * @param userId
     * @return
     */
    @Override
    public String createSession(String agentId, String userId) {
        AiAgentRegisterVO aiAgentRegisterVO = defaultArmoryFactory.getAiAgentRegisterVO(agentId);

        if (null == aiAgentRegisterVO) {
            throw new AppException(ResponseCode.E0001.getCode());
        }

        String appName = aiAgentRegisterVO.getAppName();
        Runner runner = aiAgentRegisterVO.getRunner();
        Session session = runner.sessionService().createSession(appName, userId).blockingGet();
        return session.id();
    }

    @Override
    public List<ChatSessionVO> queryChatSessions(String agentId, String userId) {
        AiAgentRegisterVO register = getAgentRegister(agentId);
        return register.getRunner().sessionService()
                .listSessions(register.getAppName(), userId)
                .blockingGet()
                .sessions()
                .stream()
                .map(session -> {
                    ChatSessionVO sessionVO = new ChatSessionVO();
                    sessionVO.setSessionId(session.id());
                    sessionVO.setLastUpdateTime(session.lastUpdateTime());
                    return sessionVO;
                })
                .toList();
    }

    @Override
    public List<ChatMessageVO> queryChatHistory(String agentId, String userId, String sessionId) {
        AiAgentRegisterVO register = getAgentRegister(agentId);
        Runner runner = register.getRunner();
        Session session = runner.sessionService()
                .getSession(register.getAppName(), userId, sessionId, java.util.Optional.empty())
                .blockingGet();
        if (session == null) {
            throw new AppException(ResponseCode.E0003.getCode(), ResponseCode.E0003.getInfo());
        }

        List<ChatMessageVO> messages = new ArrayList<>();
        for (Event event : session.events()) {
            String role = event.author();
            String content = event.stringifyContent();
            boolean userMessage = "user".equalsIgnoreCase(role);
            boolean completedAgentMessage = event.turnComplete().orElse(false);
            boolean toolCallEvent = !event.functionCalls().isEmpty();
            if ((!userMessage && (!completedAgentMessage || toolCallEvent)) || content == null || content.isBlank()) {
                continue;
            }
            ChatMessageVO messageVO = new ChatMessageVO();
            messageVO.setEventId(event.id());
            messageVO.setRole(userMessage ? "user" : "assistant");
            messageVO.setContent(content);
            messageVO.setTimestamp(event.timestamp());
            messages.add(messageVO);
        }
        return messages;
    }

    private AiAgentRegisterVO getAgentRegister(String agentId) {
        AiAgentRegisterVO register = defaultArmoryFactory.getAiAgentRegisterVO(agentId);
        if (register == null) {
            throw new AppException(ResponseCode.E0001.getCode(), ResponseCode.E0001.getInfo());
        }
        return register;
    }

    @Override
    public List<String> handleMessage(String agentId, String userId, String message) {

        AiAgentRegisterVO aiAgentRegisterVO = defaultArmoryFactory.getAiAgentRegisterVO(agentId);

        if (null == aiAgentRegisterVO) {
            throw new AppException(ResponseCode.E0001.getCode());
        }

        String sessionId = createSession(agentId, userId);

        return handleMessage(agentId, userId, sessionId, message);
    }

    @Override
    public List<String> handleMessage(String agentId, String userId, String sessionId, String message) {

        AiAgentRegisterVO aiAgentRegisterVO = defaultArmoryFactory.getAiAgentRegisterVO(agentId);

        if (null == aiAgentRegisterVO) {
            throw new AppException(ResponseCode.E0001.getCode());
        }

        Runner runner = aiAgentRegisterVO.getRunner();

        Content userMsg = Content.fromParts(Part.fromText(message));
        Flowable<Event> events = runner.runAsync(userId, sessionId, userMsg);

        List<String> outputs = new ArrayList<>();
        events.blockingForEach(event -> outputs.add(event.stringifyContent()));

        return outputs;
    }

    @Override
    public Flowable<Event> handleMessageStream(String agentId, String userId, String sessionId, String message) {
        AiAgentRegisterVO aiAgentRegisterVO = defaultArmoryFactory.getAiAgentRegisterVO(agentId);

        if (null == aiAgentRegisterVO) {
            throw new AppException(ResponseCode.E0001.getCode());
        }

        Runner runner = aiAgentRegisterVO.getRunner();

        Content userMsg = Content.fromParts(Part.fromText(message));
        RunConfig runConfig = RunConfig.builder()
                .setStreamingMode(RunConfig.StreamingMode.SSE)
                .build();
        return runner.runAsync(userId, sessionId, userMsg, runConfig);
    }

    @Override
    public List<String> handleMessage(ChatCommandEntity chatCommandEntity) {
        AiAgentRegisterVO aiAgentRegisterVO = defaultArmoryFactory.getAiAgentRegisterVO(chatCommandEntity.getAgentId());

        if (null == aiAgentRegisterVO) {
            throw new AppException(ResponseCode.E0001.getCode());
        }

        List<Part> parts = new ArrayList<>();

        List<ChatCommandEntity.Content.Text> texts = chatCommandEntity.getTexts();
        if (null != texts && !texts.isEmpty()) {
            for (ChatCommandEntity.Content.Text text : texts) {
                parts.add(Part.fromText(text.getMessage()));
            }
        }

        List<ChatCommandEntity.Content.File> files = chatCommandEntity.getFiles();
        if (null != files && !files.isEmpty()) {
            for (ChatCommandEntity.Content.File file : files) {
                parts.add(Part.fromUri(file.getFileUri(), file.getMimeType()));
            }
        }

        List<ChatCommandEntity.Content.InlineData> inlineDatas = chatCommandEntity.getInlineDatas();
        if (null != inlineDatas && !inlineDatas.isEmpty()) {
            for (ChatCommandEntity.Content.InlineData inlineData : inlineDatas) {
                parts.add(Part.fromBytes(inlineData.getBytes(), inlineData.getMimeType()));
            }
        }

        Content content = Content.builder().role("user").parts(parts).build();

        // 获取运行体
        Runner runner = aiAgentRegisterVO.getRunner();

        Flowable<Event> events = runner.runAsync(chatCommandEntity.getUserId(), chatCommandEntity.getSessionId(), content);

        List<String> outputs = new ArrayList<>();
        events.blockingForEach(event -> outputs.add(event.stringifyContent()));

        return outputs;
    }

}
