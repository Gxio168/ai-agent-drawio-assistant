import type { AiAgentConfig } from '../../models/api';
import type { Conversation, User } from '../../models';
import AgentPanel from './AgentPanel';
import ConversationList from './ConversationList';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onRemoveConversation: (id: string) => void;
  onNewConversation: () => void;
  agents: AiAgentConfig[];
  agentsLoading: boolean;
  agentsError: string | null;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onReloadAgents: () => void;
  onManageAgents: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  user,
  conversations,
  activeConversationId,
  onSelectConversation,
  onRemoveConversation,
  onNewConversation,
  agents,
  agentsLoading,
  agentsError,
  selectedAgentId,
  onSelectAgent,
  onReloadAgents,
  onManageAgents,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button type="button" className="new-chat-btn" onClick={onNewConversation}>
          <span className="plus">+</span> 新建对话
        </button>
      </div>

      <AgentPanel
        agents={agents}
        loading={agentsLoading}
        error={agentsError}
        selectedAgentId={selectedAgentId}
        onSelectAgent={onSelectAgent}
        onReload={onReloadAgents}
        onManage={onManageAgents}
      />

      <div className="conv-section-title">会话记录</div>
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={onSelectConversation}
        onRemove={onRemoveConversation}
      />

      <div className="sidebar-footer">
        <div className="avatar">{user.avatarText}</div>
        <div className="user-meta">
          <div className="user-name">{user.displayName}</div>
          <div className="user-sub">userId: {user.userId}</div>
        </div>
        <button type="button" className="logout-btn" onClick={onLogout}>
          退出
        </button>
      </div>
    </aside>
  );
}
