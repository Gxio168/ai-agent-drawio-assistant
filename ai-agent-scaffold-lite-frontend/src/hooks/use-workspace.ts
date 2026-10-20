import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatStream, createSession, queryChatHistory, queryChatSessions } from '../api/chat-api';
import { ApiError } from '../api/http';
import { STORAGE_KEYS } from '../config/storage-config';
import type { AiAgentConfig, ChatHistoryMessageData, ChatSessionData } from '../models/api';
import type { Conversation, Message, Notice, Role, User } from '../models';
import { parseAgentContent } from '../utils/agent-content';
import { buildConversationTitle, extractDrawioXml } from '../utils/drawio';
import { createId } from '../utils/id';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';
import { formatClock } from '../utils/time';

interface UseWorkspaceOptions {
  user: User;
  agents: AiAgentConfig[];
  /** 智能体列表是否仍在加载，加载完成前禁止发送 */
  agentsLoading: boolean;
}

interface WorkspaceState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  activeConversationId: string | null;
  messages: Message[];
  selectedAgentId: string;
  selectedAgent: AiAgentConfig | null;
  canvasXml: string | null;
  sending: boolean;
  historyLoading: boolean;
  notice: Notice | null;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  startNewConversation: () => void;
  selectAgent: (agentId: string) => void;
  sendMessage: (message: string, includeDiagramContext?: boolean) => Promise<void>;
  saveCanvasXml: (xml: string) => void;
  /** 把某条消息里的图形重新灌回画布 */
  restoreDiagram: (message: Message) => void;
  restoreCurrentDiagram: () => void;
  dismissNotice: () => void;
}

/** 只从旧缓存中迁移当前 sessionId，不再恢复缓存的消息正文和画布 XML。 */
function readInitialActiveSessionId(): string | null {
  const conversations = readStorage<Conversation[]>(STORAGE_KEYS.conversations, []);
  const storedActive = readStorage<string | null>(STORAGE_KEYS.activeConversation, null);
  const active =
    typeof storedActive === 'string'
      ? conversations.find((item) => item.id === storedActive) ?? null
      : null;
  return active?.sessionId ?? (storedActive?.startsWith('conv_') ? null : storedActive);
}

function toTimestamp(value: number | string): number {
  if (typeof value === 'number') return value;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function mapSession(session: ChatSessionData, agentId: string): Conversation {
  const updatedAt = toTimestamp(session.lastUpdateTime);
  return {
    id: session.sessionId,
    sessionId: session.sessionId,
    agentId,
    title: `会话 ${new Date(updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
    createdAt: updatedAt,
    updatedAt,
    messages: [],
  };
}

const DIAGRAM_CONTEXT_MARKER = '\n\n【当前画布中的 draw.io 流程图 XML，请基于此图进行分析或修改】\n';

function mapHistoryMessage(item: ChatHistoryMessageData): Message | null {
  const role: Role = item.role.toLowerCase() === 'user' ? 'user' : 'assistant';
  const parsedContent = parseAgentContent(item.content);
  const contextIndex = parsedContent.indexOf(DIAGRAM_CONTEXT_MARKER);
  const content = contextIndex >= 0 ? parsedContent.slice(0, contextIndex).trimEnd() : parsedContent;
  if (!content.trim()) return null;
  const diagramXml = role === 'assistant' ? extractDrawioXml(parsedContent) ?? undefined : undefined;
  return {
    id: item.eventId,
    role,
    content,
    time: formatClock(toTimestamp(item.timestamp)),
    diagramXml,
    diagramContextAttached: contextIndex >= 0,
  };
}

/**
 * 工作台状态编排：
 * - 会话列表和消息历史以服务端为准，页面只保留当前 sessionId
 * - 发送消息前保证 session 已创建（POST /api/v1/create_session）
 * - 对话走 POST /api/v1/chat_stream，逐段展示回复，完成后提取 XML 并载入画布
 */
export function useWorkspace({ user, agents, agentsLoading }: UseWorkspaceOptions): WorkspaceState {
  const [initialActiveSessionId] = useState(readInitialActiveSessionId);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialActiveSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() =>
    readStorage<string>(STORAGE_KEYS.selectedAgent, ''),
  );
  const [canvasXml, setCanvasXml] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const sendingRef = useRef(false);
  const sessionRequestRef = useRef(0);
  const historyRequestRef = useRef(0);

  // 清除旧版本缓存的完整聊天记录和 XML；之后只保留当前 sessionId。
  useEffect(() => {
    removeStorage(STORAGE_KEYS.conversations);
  }, []);

  // 供异步流程读取最新的消息列表，避免闭包拿到旧值
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  // 智能体列表就绪后校正选中项（本地缓存的 ID 可能已失效）
  const resolvedAgentId = useMemo(() => {
    if (agents.length === 0) return '';
    return agents.some((agent) => agent.agentId === selectedAgentId)
      ? selectedAgentId
      : agents[0]!.agentId ?? '';
  }, [agents, selectedAgentId]);

  // 校正结果写回本地，保证下次打开仍然选中同一个智能体
  useEffect(() => {
    if (resolvedAgentId && resolvedAgentId !== selectedAgentId) {
      writeStorage(STORAGE_KEYS.selectedAgent, resolvedAgentId);
    }
  }, [resolvedAgentId, selectedAgentId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === resolvedAgentId) ?? null,
    [agents, resolvedAgentId],
  );

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
    writeStorage(STORAGE_KEYS.activeConversation, id);
  }, []);

  /** 更新当前画布和内存中的会话快照。 */
  const applyCanvasXml = useCallback(
    (xml: string | null, conversationId: string | null) => {
      setCanvasXml(xml);
      if (!conversationId) return;
      setConversations((prev) =>
        prev.map((item) => item.id === conversationId ? { ...item, lastDiagramXml: xml ?? undefined } : item),
      );
    },
    [],
  );

  const saveCanvasXml = useCallback(
    (xml: string) => applyCanvasXml(xml, activeConversationId),
    [activeConversationId, applyCanvasXml],
  );

  const loadConversationHistory = useCallback(async (conversation: Conversation) => {
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setMessages([]);
    messagesRef.current = [];
    setCanvasXml(null);
    try {
      const history = await queryChatHistory(
        conversation.agentId,
        String(user.userId),
        conversation.sessionId,
      );
      if (requestId !== historyRequestRef.current) return;

      let loadedMessages = history
        .map(mapHistoryMessage)
        .filter((item): item is Message => item !== null);
      const lastDiagramIndex = loadedMessages.findLastIndex((item) => Boolean(item.diagramXml));
      if (lastDiagramIndex >= 0) {
        loadedMessages = loadedMessages.map((item, index) => ({
          ...item,
          appliedToCanvas: index === lastDiagramIndex,
        }));
      }
      messagesRef.current = loadedMessages;
      setMessages(loadedMessages);

      const lastDiagram = [...loadedMessages].reverse().find((item) => item.diagramXml)?.diagramXml ?? null;
      setCanvasXml(lastDiagram);
      const firstUserMessage = loadedMessages.find((item) => item.role === 'user')?.content;
      setConversations((prev) => prev.map((item) => item.id === conversation.id
        ? {
            ...item,
            title: firstUserMessage ? buildConversationTitle(firstUserMessage) : item.title,
            messages: loadedMessages,
            lastDiagramXml: lastDiagram ?? undefined,
          }
        : item));
    } catch (error) {
      if (requestId !== historyRequestRef.current) return;
      setNotice({
        type: 'error',
        text: error instanceof ApiError ? error.message : '加载会话历史失败，请稍后重试',
      });
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }, [user.userId]);

  // 会话列表以服务端为准；浏览器只记住最后选中的 sessionId。
  useEffect(() => {
    if (!resolvedAgentId) return;
    const requestId = ++sessionRequestRef.current;
    historyRequestRef.current += 1;
    setHistoryLoading(true);
    setConversations([]);
    setMessages([]);
    messagesRef.current = [];
    setCanvasXml(null);
    setNotice(null);

    void queryChatSessions(resolvedAgentId, String(user.userId))
      .then((sessions) => {
        if (requestId !== sessionRequestRef.current) return;
        const loaded = sessions
          .map((session) => mapSession(session, resolvedAgentId))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        setConversations(loaded);
        const target = loaded.find((item) => item.sessionId === initialActiveSessionId) ?? loaded[0];
        if (target) {
          setActiveConversation(target.sessionId);
          void loadConversationHistory(target);
        } else {
          setActiveConversation(null);
          setHistoryLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (requestId !== sessionRequestRef.current) return;
        setHistoryLoading(false);
        setNotice({
          type: 'error',
          text: error instanceof ApiError ? error.message : '加载会话列表失败，请稍后重试',
        });
      });

    return () => {
      if (requestId === sessionRequestRef.current) sessionRequestRef.current += 1;
    };
  }, [initialActiveSessionId, loadConversationHistory, resolvedAgentId, setActiveConversation, user.userId]);

  const selectConversation = useCallback((id: string) => {
    const target = conversations.find((item) => item.id === id) ?? null;
    if (!target) return;
    setActiveConversation(id);
    setNotice(null);
    void loadConversationHistory(target);
  }, [conversations, loadConversationHistory, setActiveConversation]);

  const startNewConversation = useCallback(() => {
    historyRequestRef.current += 1;
    setHistoryLoading(false);
    setActiveConversation(null);
    messagesRef.current = [];
    setMessages([]);
    setNotice(null);
    setCanvasXml(null);
  }, [setActiveConversation]);

  const removeConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (activeConversationId === id) {
        historyRequestRef.current += 1;
        setHistoryLoading(false);
        setActiveConversation(null);
        messagesRef.current = [];
        setMessages([]);
        setCanvasXml(null);
      }
    },
    [activeConversationId, setActiveConversation],
  );

  const selectAgent = useCallback((agentId: string) => {
    if (agentId === resolvedAgentId) return;
    setSelectedAgentId(agentId);
    writeStorage(STORAGE_KEYS.selectedAgent, agentId);
    historyRequestRef.current += 1;
    setHistoryLoading(false);
    setActiveConversation(null);
    messagesRef.current = [];
    setMessages([]);
    setConversations([]);
    setCanvasXml(null);
  }, [resolvedAgentId]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  /** 仅同步内存中的当前消息，不把历史正文写入 localStorage。 */
  const applyMessages = useCallback(
    (next: Message[], conversationId: string | null) => {
      messagesRef.current = next;
      setMessages(next);
      if (conversationId) {
        setConversations((prev) => prev.map((item) => item.id === conversationId
          ? { ...item, messages: next, updatedAt: Date.now() }
          : item));
      }
    },
    [],
  );

  const restoreDiagram = useCallback(
    (message: Message) => {
      if (!message.diagramXml) return;
      applyCanvasXml(message.diagramXml, activeConversationId);
    },
    [activeConversationId, applyCanvasXml],
  );

  const restoreCurrentDiagram = useCallback(() => {
    const xml =
      activeConversation?.lastDiagramXml ??
      [...messages].reverse().find((item) => item.diagramXml)?.diagramXml;
    if (xml) applyCanvasXml(xml, activeConversationId);
  }, [activeConversation, activeConversationId, applyCanvasXml, messages]);

  const sendMessage = useCallback(
    async (rawMessage: string, includeDiagramContext = false) => {
      const message = rawMessage.trim();
      if (!message || sendingRef.current) return;

      if (!resolvedAgentId) {
        setNotice({
          type: 'error',
          text: agentsLoading ? '智能体列表加载中，请稍候…' : '暂无可用智能体，请检查后端配置',
        });
        return;
      }

      sendingRef.current = true;
      setSending(true);
      setNotice(null);

      // 以当前消息列表为基准推进，保证用户消息与 AI 回复的顺序
      const base = messagesRef.current;
      const diagramContext = includeDiagramContext ? canvasXml : null;
      if (includeDiagramContext && !diagramContext) {
        setNotice({ type: 'error', text: '当前画布没有可带入的流程图，请先载入或编辑一张图。' });
        sendingRef.current = false;
        setSending(false);
        return;
      }
      let staged: Message[] = base;
      let conversationId = activeConversation?.id ?? null;
      const assistantMessageId = createId('msg');

      try {
        // 会话已存在则直接复用，否则先向后端创建 session
        const existing = activeConversation;
        let sessionId = existing?.sessionId ?? '';

        if (!existing) {
          const session = await createSession({
            agentId: resolvedAgentId,
            userId: String(user.userId),
          });
          sessionId = session.sessionId;
          conversationId = sessionId;

          const timestamp = Date.now();
          const created: Conversation = {
            id: sessionId,
            title: buildConversationTitle(message),
            sessionId,
            agentId: resolvedAgentId,
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [],
          };
          setConversations((prev) => [created, ...prev]);
          setActiveConversation(sessionId);
        }

        // 1) 先把用户消息写入会话
        staged = [
          ...base,
          {
            id: createId('msg'),
            role: 'user',
            content: message,
            time: formatClock(),
            diagramContextAttached: Boolean(diagramContext),
          },
        ];
        applyMessages(staged, conversationId);

        // 2) 请求后端
        // 先放入空的 AI 气泡；后续每收到一段文本就更新它。
        staged = [
          ...staged,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            time: formatClock(),
            streaming: true,
          },
        ];
        applyMessages(staged, conversationId);

        let streamedReply = '';
        await chatStream({
          agentId: resolvedAgentId,
          userId: String(user.userId),
          sessionId,
          message: diagramContext
            ? `${message}\n\n【当前画布中的 draw.io 流程图 XML，请基于此图进行分析或修改】\n${diagramContext}`
            : message,
        }, (text) => {
          streamedReply += text;
          staged = staged.map((item) =>
            item.id === assistantMessageId ? { ...item, content: streamedReply } : item,
          );
          applyMessages(staged, conversationId);
        });

        const reply = streamedReply.trim() || '（智能体未返回文本内容）';
        const diagramXml = extractDrawioXml(reply);
        if (diagramXml) applyCanvasXml(diagramXml, conversationId);

        // 流结束后关闭流式状态；聊天栏此时才隐藏 XML。
        staged = staged.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: reply,
                streaming: false,
                appliedToCanvas: Boolean(diagramXml),
                diagramXml: diagramXml ?? undefined,
              }
            : item,
        );
        applyMessages(staged, conversationId);
      } catch (error) {
        const text = error instanceof ApiError ? error.message : '对话请求失败，请稍后重试';
        setNotice({ type: 'error', text });
        const hasAssistant = staged.some((item) => item.id === assistantMessageId);
        staged = hasAssistant
          ? staged.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content ? `${item.content}\n\n⚠️ ${text}` : `⚠️ ${text}`,
                    streaming: false,
                  }
                : item,
            )
          : [
              ...staged,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: `⚠️ ${text}`,
                time: formatClock(),
              },
            ];
        applyMessages(staged, conversationId);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [
      activeConversation,
      agentsLoading,
      applyCanvasXml,
      applyMessages,
      canvasXml,
      resolvedAgentId,
      setActiveConversation,
      user.userId,
    ],
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    messages,
    selectedAgentId: resolvedAgentId,
    selectedAgent,
    canvasXml,
    saveCanvasXml,
    sending,
    historyLoading,
    notice,
    selectConversation,
    removeConversation,
    startNewConversation,
    selectAgent,
    sendMessage,
    restoreDiagram,
    restoreCurrentDiagram,
    dismissNotice,
  };
}
