/**
 * 后端接口契约类型定义
 *
 * 与后端 DTO 一一对应：
 * - cn.bugstack.ai.api.response.Response
 * - cn.bugstack.ai.api.dto.AiAgentConfigResponseDTO
 * - cn.bugstack.ai.api.dto.CreateSessionRequestDTO / CreateSessionResponseDTO
 * - cn.bugstack.ai.api.dto.ChatRequestDTO / ChatResponseDTO
 */

/** 后端统一响应包装：Response<T> */
export interface ApiResponse<T> {
  /** 业务状态码，成功为 "0000" */
  code: string;
  /** 业务提示信息 */
  info: string;
  /** 业务数据，失败时可能为 null */
  data: T | null;
}

/** 智能体配置 — AiAgentConfigResponseDTO */
export interface AiAgentConfig {
  /** 智能体 ID */
  agentId: string;
  /** 智能体名称 */
  agentName: string;
  /** 智能体描述 */
  agentDesc: string;
}

/** Agent 应用完整配置 — 与后端 AiAgentConfigTableVO 对齐 */
export type AgentMcpConfig = {
  sse: {
    name: string;
    baseUri: string;
    sseEndpoint: string;
    requestTimeout?: number;
  };
} | {
  stdio: {
    name: string;
    requestTimeout?: number;
    serverParameters: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
} | { local: { name: string } };

export interface AgentSkillConfig {
  type: string;
  path: string;
}

export interface AgentAppConfig {
  appName: string;
  enabled?: boolean;
  agent: {
    agentId: string;
    agentName: string;
    agentDesc?: string;
  };
  module: {
    aiApi: {
      baseUrl: string;
      /** 新增/轮换密钥时提交；详情查询不会返回密钥值。 */
      apiKey?: string | null;
      apiKeyConfigured?: boolean;
      completionsPath?: string;
      embeddingsPath?: string;
    };
    chatModel: {
      model: string;
      reasoningEffort?: string;
      toolMcpList?: AgentMcpConfig[];
      toolSkillsList?: AgentSkillConfig[];
    };
    agents: Array<{
      name: string;
      instruction: string;
      description?: string;
      outputKey?: string;
      canvasX?: number;
      canvasY?: number;
    }>;
    agentWorkflows: Array<{
      type: 'sequential' | 'parallel' | 'loop' | string;
      name: string;
      subAgents: string[];
      description?: string;
      maxIterations?: number;
      canvasX?: number;
      canvasY?: number;
    }>;
    runner: {
      agentName: string;
      pluginNameList?: string[];
    };
  };
}

/** 创建会话请求 — CreateSessionRequestDTO */
export interface CreateSessionRequest {
  agentId: string;
  /** 后端以字符串接收，登录态中的 userId(1) 需转成字符串传递 */
  userId: string;
}

/** 创建会话响应 — CreateSessionResponseDTO */
export interface CreateSessionData {
  sessionId: string;
}

/** 对话请求 — ChatRequestDTO */
export interface ChatRequest {
  agentId: string;
  userId: string;
  /** 为空时后端会自动创建会话 */
  sessionId: string;
  message: string;
}

/** 对话响应 — ChatResponseDTO */
export interface ChatData {
  /**
   * 后端返回的是 ADK Event.stringifyContent() 结果按 "\n" 拼接的字符串，
   * 通常形如 {"role":"model","parts":[{"text":"..."}]}，需要前端再解析。
   */
  content: string;
}

/** GET /api/v1/query_chat_sessions */
export interface ChatSessionData {
  sessionId: string;
  lastUpdateTime: number | string;
}

/** GET /api/v1/query_chat_history */
export interface ChatHistoryMessageData {
  eventId: string;
  role: string;
  /** ADK Event.stringifyContent() 的序列化内容 */
  content: string;
  timestamp: number | string;
}

/** 业务异常的可序列化形态（ApiError.toShape() 返回值 / 跨模块传递用） */
export interface ApiErrorShape {
  /** 业务错误码；非业务异常时为 TIMEOUT / NETWORK_ERROR / HTTP_xxx 等 */
  code: string;
  /** 可读的错误描述 */
  info: string;
  /** HTTP 状态码，网络异常时为 0 */
  status: number;
}
