/**
 * 前端本地视图模型类型
 * 后端接口契约类型见 ./api.ts
 */

export type { AiAgentConfig } from './api';

/** 登录用户信息 */
export interface User {
  userId: number;
  username: string;
  displayName: string;
  /** 头像占位文字 */
  avatarText: string;
}

export type Role = 'user' | 'assistant';

export interface Message {
  id: string;
  role: Role;
  content: string;
  time: string;
  /** 该条回复是否已成功注入画布 */
  appliedToCanvas?: boolean;
  /** 流式生成中的回复；完成后关闭，届时才从聊天气泡中隐藏 XML。 */
  streaming?: boolean;
  /**
   * 该条回复中解析出的 draw.io XML。
   * 存下来有两个作用：刷新后可以点「载入画布」重新注入；避免重复解析。
   */
  diagramXml?: string;
  /** 发送该条用户消息时是否将当时画布 XML 附带给智能体 */
  diagramContextAttached?: boolean;
}

/** 一次对话 = 后端的一个 session */
export interface Conversation {
  id: string;
  title: string;
  /** 后端返回的 sessionId */
  sessionId: string;
  /** 该会话使用的智能体 ID */
  agentId: string;
  createdAt: number;
  updatedAt: number;
  /** 当前页面内存中的最近画布 XML；不会写入 localStorage */
  lastDiagramXml?: string;
  /** 从后端按需加载的对话记录，仅保存在当前页面内存中 */
  messages: Message[];
}

/** 页面级提示 */
export interface Notice {
  type: 'error' | 'info' | 'success';
  text: string;
}
