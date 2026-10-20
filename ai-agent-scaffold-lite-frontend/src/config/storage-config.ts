/**
 * localStorage 键名统一管理
 */
export const STORAGE_KEYS = {
  /** 登录态 */
  auth: 'ai-agent:auth',
  /** 会话列表 */
  conversations: 'ai-agent:conversations',
  /** 当前激活会话 */
  activeConversation: 'ai-agent:active-conversation',
  /** 当前选择的智能体 */
  selectedAgent: 'ai-agent:selected-agent',
} as const;
