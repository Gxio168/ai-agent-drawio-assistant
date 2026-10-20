import { API_BASE_URL, API_ENDPOINTS, REQUEST_TIMEOUT } from '../config/api-config';
import type {
  ChatData,
  ChatHistoryMessageData,
  ChatRequest,
  ChatSessionData,
  CreateSessionData,
  CreateSessionRequest,
} from '../models/api';
import { ApiError } from './http';
import { request } from './http';

/**
 * POST /api/v1/create_session
 * 创建会话（对应 IAgentService#createSession），后端返回 sessionId
 */
export function createSession(payload: CreateSessionRequest): Promise<CreateSessionData> {
  return request<CreateSessionData>(API_ENDPOINTS.createSession, {
    method: 'POST',
    body: payload,
  });
}
/** GET /api/v1/query_chat_sessions */
export function queryChatSessions(agentId: string, userId: string): Promise<ChatSessionData[]> {
  return request<ChatSessionData[]>(API_ENDPOINTS.queryChatSessions, {
    query: { agentId, userId },
  });
}

/** GET /api/v1/query_chat_history */
export function queryChatHistory(
  agentId: string,
  userId: string,
  sessionId: string,
): Promise<ChatHistoryMessageData[]> {
  return request<ChatHistoryMessageData[]>(API_ENDPOINTS.queryChatHistory, {
    query: { agentId, userId, sessionId },
  });
}

/**
 * POST /api/v1/chat
 * 对话（对应 IAgentService#chat）。
 * sessionId 传空时后端会自动创建会话；建议先调用 createSession 以便前端持有 session。
 */
export function chat(payload: ChatRequest): Promise<ChatData> {
  return request<ChatData>(API_ENDPOINTS.chat, {
    method: 'POST',
    body: payload,
  });
}

/**
 * POST /api/v1/chat_stream
 * 后端将 ADK 事件内容作为纯文本分段发送。网络分块边界不一定与字符边界一致，
 * 因此用流式 TextDecoder 解码后，把每次读取到的文本立即交给调用方。
 */
export async function chatStream(payload: ChatRequest, onText: (text: string) => void): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.chatStream}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查后端服务是否已启动', 'TIMEOUT');
    }
    throw new ApiError('无法连接后端服务，请确认 ai-agent-scaffold-lite 已启动', 'NETWORK_ERROR');
  }

  try {
    if (!response.ok) {
      const raw = await response.text();
      throw new ApiError(
        `接口请求失败：HTTP ${response.status}${raw ? ` - ${raw.slice(0, 200)}` : ''}`,
        `HTTP_${response.status}`,
        response.status,
      );
    }
    if (!response.body) throw new ApiError('浏览器不支持读取流式响应', 'STREAM_UNAVAILABLE');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunksSincePaint = 0;
    const yieldToPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!text) continue;

        // 保留调试输出，同时确认打印的内容就是交给对话界面的增量文本。
        console.log(text);
        onText(text);

        // 分批让浏览器绘制，避免连续读取时状态更新被合并到流结束后。
        chunksSincePaint += 1;
        if (chunksSincePaint >= 4) {
          chunksSincePaint = 0;
          await yieldToPaint();
        }
      }
      const remainingText = decoder.decode();
      if (remainingText) {
        console.log(remainingText);
        onText(remainingText);
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查后端服务是否已启动', 'TIMEOUT');
    }
    throw new ApiError('读取流式对话失败，请检查网络或后端日志', 'STREAM_ERROR');
  } finally {
    clearTimeout(timer);
  }
}
 