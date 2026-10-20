import type { Conversation } from '../../models';
import { formatRelative } from '../../utils/time';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** 会话列表直接来自后端的 session 列表。 */
export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onRemove,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return <div className="conv-empty">还没有会话，发送第一条消息即可创建</div>;
  }

  return (
    <div className="conv-list">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`conv-item ${conv.id === activeConversationId ? 'active' : ''}`}
          onClick={() => onSelect(conv.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(conv.id);
            }
          }}
        >
          <div className="conv-title">{conv.title}</div>
          <div className="conv-meta">
            <span className="conv-time">{formatRelative(conv.updatedAt)}</span>
            <span className="conv-session">session: {shortId(conv.sessionId)}</span>
          </div>
          <button
            type="button"
            className="conv-remove"
            title="从当前列表隐藏；后端没有删除接口"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(conv.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
