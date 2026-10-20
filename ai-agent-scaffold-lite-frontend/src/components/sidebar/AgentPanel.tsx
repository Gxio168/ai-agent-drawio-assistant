import type { AiAgentConfig } from '../../models/api';

interface AgentPanelProps {
  agents: AiAgentConfig[];
  loading: boolean;
  error: string | null;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onReload: () => void;
  onManage: () => void;
}

/** 智能体选择区：数据来自 GET /api/v1/query_ai_agent_config_list */
export default function AgentPanel({
  agents,
  loading,
  error,
  selectedAgentId,
  onSelectAgent,
  onReload,
  onManage,
}: AgentPanelProps) {
  return (
    <section className="agent-panel">
      <div className="agent-panel-heading">
        <div className="agent-panel-title">智能体</div>
        <button type="button" className="agent-manage-btn" onClick={onManage}>管理</button>
      </div>

      {loading && <div className="agent-hint">加载中…</div>}

      {!loading && error && (
        <div className="agent-error">
          <div className="agent-error-text">{error}</div>
          <button type="button" className="ghost-btn small" onClick={onReload}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="agent-hint">后端暂无可用智能体</div>
      )}

      {!loading && agents.length > 0 && (
        <ul className="agent-list">
          {agents.map((agent) => {
            const active = agent.agentId === selectedAgentId;
            return (
              <li key={agent.agentId}>
                <button
                  type="button"
                  className={`agent-item ${active ? 'active' : ''}`}
                  onClick={() => onSelectAgent(agent.agentId)}
                  title={agent.agentDesc || agent.agentName}
                >
                  <span className="agent-name">{agent.agentName}</span>
                  {agent.agentDesc && <span className="agent-desc">{agent.agentDesc}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
