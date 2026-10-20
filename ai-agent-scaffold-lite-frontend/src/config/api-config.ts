/**
 * 统一 API 地址管理
 *
 * 约定：
 * - 开发环境统一走同源相对路径 `/api/v1`，由 vite dev server 反向代理到后端（见 vite.config.ts），
 *   好处是浏览器端不产生跨域请求，也不需要在前端代码里写死后端域名端口。
 * - 若需要直连后端（例如临时指向远端环境），在项目根目录新建 `.env.local`：
 *
 *     VITE_API_BASE_URL=http://192.168.1.10:8091/api/v1
 *
 *   此时 baseUrl 会被完整覆盖，proxy 配置不再生效。
 */

/** 后端服务默认地址（仅用于提示/调试展示） */
export const BACKEND_ORIGIN = 'http://localhost:8091';

/** 后端接口版本前缀（AgentServiceController @RequestMapping("/api/v1/") ） */
export const API_PREFIX = '/api/v1';

/** 后端业务成功码，对应 ResponseCode.SUCCESS */
export const SUCCESS_CODE = '0000';

/** 后端业务错误码，对应 ResponseCode */
export const RESPONSE_CODE_INFO: Record<string, string> = {
  '0001': '未知失败',
  '0002': '非法参数',
  '0003': '不存在的方法',
  E0001: '智能体ID不存在',
  E0002: '智能体MCP配置不在可加载范围',
};

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

/** 最终生效的接口基地址 */
export const API_BASE_URL = (envBaseUrl?.trim() || `${API_PREFIX}`).replace(/\/+$/, '');

/**
 * 接口路径表 —— 所有后端接口地址集中在此维护
 * 与 AgentServiceController 一一对应
 */
export const API_ENDPOINTS = {
  /** GET 查询智能体配置列表 */
  queryAiAgentConfigList: '/query_ai_agent_config_list',
  /** POST 创建会话（后端同时支持 GET，这里统一用 POST） */
  createSession: '/create_session',
  /** GET 查询用户在智能体下的会话列表 */
  queryChatSessions: '/query_chat_sessions',
  /** GET 查询指定会话的消息历史 */
  queryChatHistory: '/query_chat_history',
  /** POST 对话（一次性返回） */
  chat: '/chat',
  /** POST 流式对话 */
  chatStream: '/chat_stream',
  /** 智能体配置管理 CRUD */
  agentConfigs: '/agent-configs',
} as const;

/** 请求超时时间（毫秒），对话接口通常较慢 */
export const REQUEST_TIMEOUT = 300_000;
