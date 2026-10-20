import { API_ENDPOINTS } from '../config/api-config';
import type { AgentAppConfig, AiAgentConfig } from '../models/api';
import { request } from './http';

/**
 * GET /api/v1/query_ai_agent_config_list
 * 查询智能体配置列表（对应 IAgentService#queryAiAgentConfigList）
 */
export function queryAiAgentConfigList(): Promise<AiAgentConfig[]> {
  return request<AiAgentConfig[]>(API_ENDPOINTS.queryAiAgentConfigList);
}

/** GET /api/v1/agent-configs：查询完整 Agent 配置列表（密钥已脱敏） */
export function queryAgentConfigs(): Promise<AgentAppConfig[]> {
  return request<AgentAppConfig[]>(API_ENDPOINTS.agentConfigs);
}

/** GET /api/v1/agent-configs/{agentId} */
export function queryAgentConfig(agentId: string): Promise<AgentAppConfig> {
  return request<AgentAppConfig>(`${API_ENDPOINTS.agentConfigs}/${encodeURIComponent(agentId)}`);
}

/** POST /api/v1/agent-configs：新增并触发后端装配 */
export function createAgentConfig(config: AgentAppConfig): Promise<AgentAppConfig> {
  return request<AgentAppConfig>(API_ENDPOINTS.agentConfigs, { method: 'POST', body: config });
}

/** PUT /api/v1/agent-configs/{agentId}：更新并触发后端重新装配 */
export function updateAgentConfig(agentId: string, config: AgentAppConfig): Promise<AgentAppConfig> {
  return request<AgentAppConfig>(`${API_ENDPOINTS.agentConfigs}/${encodeURIComponent(agentId)}`, {
    method: 'PUT',
    body: config,
  });
}

/** DELETE /api/v1/agent-configs/{agentId}：删除并移除运行时 Agent */
export function deleteAgentConfig(agentId: string): Promise<boolean> {
  return request<boolean>(`${API_ENDPOINTS.agentConfigs}/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
}
