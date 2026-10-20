import { useCallback, useEffect, useState } from 'react';
import { queryAiAgentConfigList } from '../api/agent-api';
import { ApiError } from '../api/http';
import type { AiAgentConfig } from '../models/api';

interface UseAgentsResult {
  agents: AiAgentConfig[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * 智能体列表：GET /api/v1/query_ai_agent_config_list
 * 仅负责拉取数据，"当前选中的智能体"由 useWorkspace 统一维护。
 */
export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<AiAgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await queryAiAgentConfigList();
        if (cancelled) return;
        setAgents(Array.isArray(list) ? list : []);
      } catch (err) {
        if (cancelled) return;
        setAgents([]);
        setError(err instanceof ApiError ? err.message : '智能体列表加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadFlag]);

  const reload = useCallback(() => setReloadFlag((flag) => flag + 1), []);

  return { agents, loading, error, reload };
}
