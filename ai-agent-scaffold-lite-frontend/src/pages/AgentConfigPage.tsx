import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  createAgentConfig,
  deleteAgentConfig,
  queryAgentConfigs,
  queryAgentConfig,
  updateAgentConfig,
} from '../api/agent-api';
import { ApiError } from '../api/http';
import type { AgentAppConfig, AgentMcpConfig, AgentSkillConfig } from '../models/api';
import './agent-config-page.css';

interface AgentConfigPageProps {
  onClose: () => void;
  onChanged: (agentId?: string) => void;
}

type WorkflowKind = 'sequential' | 'parallel' | 'loop';

interface GraphAgentNode {
  id: string;
  kind: 'agent';
  name: string;
  description: string;
  instruction: string;
  outputKey: string;
  x: number;
  y: number;
}

interface GraphWorkflowNode {
  id: string;
  kind: 'workflow';
  workflowType: WorkflowKind;
  name: string;
  description: string;
  maxIterations: number;
  x: number;
  y: number;
}

type GraphNode = GraphAgentNode | GraphWorkflowNode;
interface GraphEdge { from: string; to: string }
interface DraggingNode { id: string; offsetX: number; offsetY: number }
interface Point { x: number; y: number }

const NODE_WIDTH = 252;
const NODE_PORT_Y = 52;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1400;

const workflowLabels: Record<WorkflowKind, string> = {
  sequential: '串行',
  parallel: '并行',
  loop: '循环',
};

function starterConfig(): AgentAppConfig {
  return {
    appName: 'new-agent-app',
    enabled: true,
    agent: { agentId: 'new-agent', agentName: '新智能体', agentDesc: '' },
    module: {
      aiApi: {
        baseUrl: 'https://api.openai.com',
        apiKey: '',
        completionsPath: 'v1/chat/completions',
        embeddingsPath: 'v1/embeddings',
      },
      chatModel: { model: 'gpt-4.1', toolMcpList: [], toolSkillsList: [] },
      agents: [],
      agentWorkflows: [],
      runner: { agentName: '', pluginNameList: [] },
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function nodeId(kind: GraphNode['kind'], name: string): string {
  return `${kind}:${name}`;
}

function hydrateGraph(config: AgentAppConfig): { nodes: GraphNode[]; edges: GraphEdge[]; runnerId: string | null } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const agents = config.module.agents ?? [];
  const workflows = config.module.agentWorkflows ?? [];

  agents.forEach((agent, index) => {
    nodes.push({
      id: nodeId('agent', agent.name),
      kind: 'agent',
      name: agent.name,
      description: agent.description ?? '',
      instruction: agent.instruction ?? '',
      outputKey: agent.outputKey ?? '',
      x: agent.canvasX ?? 80,
      y: agent.canvasY ?? 70 + index * 170,
    });
  });

  workflows.forEach((workflow, index) => {
    const type: WorkflowKind = workflow.type === 'parallel' || workflow.type === 'loop' ? workflow.type : 'sequential';
    const workflowNode: GraphWorkflowNode = {
      id: nodeId('workflow', workflow.name),
      kind: 'workflow',
      workflowType: type,
      name: workflow.name,
      description: workflow.description ?? '',
      maxIterations: workflow.maxIterations ?? 3,
      x: workflow.canvasX ?? 560,
      y: workflow.canvasY ?? 70 + index * 190,
    };
    nodes.push(workflowNode);
    for (const childName of workflow.subAgents ?? []) {
      const child = nodes.find((candidate) => candidate.name === childName);
      if (child) edges.push({ from: child.id, to: workflowNode.id });
    }
  });

  const runner = nodes.find((node) => node.name === config.module.runner.agentName);
  return { nodes, edges, runnerId: runner?.id ?? null };
}

function compileGraph(
  draft: AgentAppConfig,
  nodes: GraphNode[],
  edges: GraphEdge[],
  runnerId: string | null,
): AgentAppConfig {
  if (!draft.appName.trim() || !draft.agent.agentId.trim() || !draft.agent.agentName.trim()) {
    throw new Error('请填写应用名称、Agent ID 和显示名称。');
  }
  if (!draft.module.aiApi.baseUrl.trim() || !draft.module.chatModel.model.trim()) {
    throw new Error('请填写模型服务地址和模型名称。');
  }
  if (!draft.module.aiApi.apiKey?.trim() && !draft.module.aiApi.apiKeyConfigured) {
    throw new Error('请填写模型 API Key。');
  }
  if (nodes.length === 0) throw new Error('先从左侧拖入至少一个 Agent 节点。');

  const names = new Set<string>();
  for (const node of nodes) {
    if (!node.name.trim()) throw new Error('节点名称不能为空。');
    if (names.has(node.name.trim())) throw new Error(`节点名称重复：${node.name}`);
    names.add(node.name.trim());
    if (node.kind === 'agent' && !node.instruction.trim()) throw new Error(`${node.name} 还没有填写指令。`);
  }

  const agents = nodes.filter((node): node is GraphAgentNode => node.kind === 'agent');
  const workflows = nodes.filter((node): node is GraphWorkflowNode => node.kind === 'workflow');
  const available = new Set(agents.map((node) => node.name));
  const pending = [...workflows];
  const orderedWorkflows: GraphWorkflowNode[] = [];

  while (pending.length > 0) {
    const readyIndex = pending.findIndex((workflow) => {
      const children = edges.filter((edge) => edge.to === workflow.id);
      return children.length > 0 && children.every((edge) => {
        const source = nodes.find((node) => node.id === edge.from);
        return source != null && available.has(source.name);
      });
    });
    if (readyIndex < 0) {
      throw new Error('每个工作流都需要连接子 Agent；请检查是否有循环引用或未连接的工作流。');
    }
    const [workflow] = pending.splice(readyIndex, 1);
    if (!workflow) break;
    const childEdges = edges.filter((edge) => edge.to === workflow.id);
    const childNames = childEdges.map((edge) => nodes.find((node) => node.id === edge.from)!.name);
    if ((workflow.workflowType === 'sequential' || workflow.workflowType === 'parallel') && childNames.length < 2) {
      throw new Error(`${workflowLabels[workflow.workflowType]}工作流「${workflow.name}」至少要连接两个 Agent。`);
    }
    if (workflow.workflowType === 'loop' && workflow.maxIterations < 1)
      throw new Error(`循环工作流「${workflow.name}」的最大循环次数必须大于 0。`);
    orderedWorkflows.push(workflow);
    available.add(workflow.name);
  }

  const runner = nodes.find((node) => node.id === runnerId);
  if (!runner) throw new Error('请设置一个 Runner 入口节点。');

  return {
    ...draft,
    agent: { ...draft.agent },
    enabled: draft.enabled !== false,
    module: {
      ...draft.module,
      aiApi: { ...draft.module.aiApi },
      chatModel: { ...draft.module.chatModel },
      agents: agents.map((node) => ({
        name: node.name.trim(),
        description: node.description,
        instruction: node.instruction,
        outputKey: node.outputKey || undefined,
        canvasX: Math.round(node.x),
        canvasY: Math.round(node.y),
      })),
      agentWorkflows: orderedWorkflows.map((node) => ({
        type: node.workflowType,
        name: node.name.trim(),
        description: node.description,
        subAgents: edges.filter((edge) => edge.to === node.id)
          .map((edge) => nodes.find((child) => child.id === edge.from)!.name),
        maxIterations: node.workflowType === 'loop' ? node.maxIterations : undefined,
        canvasX: Math.round(node.x),
        canvasY: Math.round(node.y),
      })),
      runner: {
        ...draft.module.runner,
        agentName: runner.name,
        pluginNameList: draft.module.runner.pluginNameList ?? [],
      },
    },
  };
}

export default function AgentConfigPage({ onClose, onChanged }: AgentConfigPageProps) {
  const [configs, setConfigs] = useState<AgentAppConfig[]>([]);
  const [draft, setDraft] = useState<AgentAppConfig | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<DraggingNode | null>(null);
  const [wireFrom, setWireFrom] = useState<string | null>(null);
  const [wirePoint, setWirePoint] = useState<Point | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const applyConfig = (config: AgentAppConfig, id: string | null) => {
    const graph = hydrateGraph(config);
    setDraft({ ...config, module: { ...config.module, aiApi: { ...config.module.aiApi, apiKey: '' } } });
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setRunnerId(graph.runnerId);
    setSelectedId(id);
    setSelectedNodeId(null);
    setMode(id == null ? 'create' : 'edit');
  };

  const loadConfigs = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const items = await queryAgentConfigs();
      setConfigs(items);
      const nextId = preferredId && items.some((item) => item.agent.agentId === preferredId)
        ? preferredId
        : items[0]?.agent.agentId ?? null;
      if (nextId) applyConfig(await queryAgentConfig(nextId), nextId);
      else applyConfig(starterConfig(), null);
    } catch (loadError) {
      setError(errorMessage(loadError));
      if (!draft) applyConfig(starterConfig(), null);
    } finally {
      setLoading(false);
    }
  }, [draft]);

  useEffect(() => {
    void loadConfigs();
    // Load once when opening the manager; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCreate = () => {
    applyConfig(starterConfig(), null);
    setNotice(null);
    setError(null);
  };

  const selectConfig = async (agentId: string) => {
    setError(null);
    setNotice(null);
    try {
      applyConfig(await queryAgentConfig(agentId), agentId);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  };

  const updateDraft = (updater: (current: AgentAppConfig) => AgentAppConfig) => {
    setDraft((current) => current ? updater(current) : current);
  };

  const updateAgent = (field: 'agentId' | 'agentName' | 'agentDesc', value: string) => {
    updateDraft((current) => ({ ...current, agent: { ...current.agent, [field]: value } }));
  };

  const updateApi = (field: 'baseUrl' | 'apiKey' | 'completionsPath' | 'embeddingsPath', value: string) => {
    updateDraft((current) => ({
      ...current,
      module: { ...current.module, aiApi: { ...current.module.aiApi, [field]: value } },
    }));
  };

  const updateModel = (field: 'model' | 'reasoningEffort', value: string) => {
    updateDraft((current) => ({
      ...current,
      module: { ...current.module, chatModel: { ...current.module.chatModel, [field]: value } },
    }));
  };

  const updateMcp = (index: number, updater: (item: AgentMcpConfig) => AgentMcpConfig) => {
    updateDraft((current) => {
      const list = [...(current.module.chatModel.toolMcpList ?? [])];
      const item = list[index];
      if (!item) return current;
      list[index] = updater(item);
      return { ...current, module: { ...current.module, chatModel: { ...current.module.chatModel, toolMcpList: list } } };
    });
  };

  const addMcp = (kind: 'local' | 'sse' | 'stdio') => {
    const item: AgentMcpConfig = kind === 'local'
      ? { local: { name: '' } }
      : kind === 'sse'
        ? { sse: { name: '', baseUri: '', sseEndpoint: '', requestTimeout: 30000 } }
        : { stdio: { name: '', requestTimeout: 30000, serverParameters: { command: '', args: [], env: {} } } };
    updateDraft((current) => ({
      ...current,
      module: { ...current.module, chatModel: { ...current.module.chatModel, toolMcpList: [...(current.module.chatModel.toolMcpList ?? []), item] } },
    }));
  };

  const removeMcp = (index: number) => updateDraft((current) => ({
    ...current,
    module: { ...current.module, chatModel: { ...current.module.chatModel, toolMcpList: (current.module.chatModel.toolMcpList ?? []).filter((_, itemIndex) => itemIndex !== index) } },
  }));

  const replaceMcpKind = (index: number, kind: 'local' | 'sse' | 'stdio') => {
    updateMcp(index, (item) => {
      const name = 'local' in item ? item.local.name : 'sse' in item ? item.sse.name : item.stdio.name;
      if (kind === 'local') return { local: { name } };
      if (kind === 'sse') return { sse: { name, baseUri: '', sseEndpoint: '', requestTimeout: 30000 } };
      return { stdio: { name, requestTimeout: 30000, serverParameters: { command: '', args: [], env: {} } } };
    });
  };

  const updateSkill = (index: number, field: keyof AgentSkillConfig, value: string) => updateDraft((current) => {
    const list = [...(current.module.chatModel.toolSkillsList ?? [])];
    const item = list[index];
    if (!item) return current;
    list[index] = { ...item, [field]: value };
    return { ...current, module: { ...current.module, chatModel: { ...current.module.chatModel, toolSkillsList: list } } };
  });

  const addSkill = () => updateDraft((current) => ({
    ...current,
    module: { ...current.module, chatModel: { ...current.module.chatModel, toolSkillsList: [...(current.module.chatModel.toolSkillsList ?? []), { type: 'resource', path: '' }] } },
  }));

  const removeSkill = (index: number) => updateDraft((current) => ({
    ...current,
    module: { ...current.module, chatModel: { ...current.module.chatModel, toolSkillsList: (current.module.chatModel.toolSkillsList ?? []).filter((_, itemIndex) => itemIndex !== index) } },
  }));

  const pointInCanvas = (event: { clientX: number; clientY: number }): Point => {
    const viewport = viewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    if (!viewport || !rect) return { x: 80, y: 80 };
    return {
      x: event.clientX - rect.left + viewport.scrollLeft,
      y: event.clientY - rect.top + viewport.scrollTop,
    };
  };

  const addNode = (kind: GraphNode['kind'], workflowType: WorkflowKind = 'sequential', point?: Point) => {
    const namePrefix = kind === 'agent' ? 'agent' : `${workflowType}-workflow`;
    let index = 1;
    while (nodes.some((node) => node.name === `${namePrefix}${index}`)) index++;
    const name = `${namePrefix}${index}`;
    const position = point ?? { x: 90 + (nodes.length % 2) * 300, y: 70 + Math.floor(nodes.length / 2) * 185 };
    const id = nodeId(kind, name);
    const node: GraphNode = kind === 'agent'
      ? {
          id, kind, name, description: '新的 LLM Agent', instruction: '请在右侧填写这个 Agent 的指令。', outputKey: '',
          x: Math.max(20, position.x - NODE_WIDTH / 2), y: Math.max(20, position.y - 25),
        }
      : {
          id, kind, name, workflowType, description: `${workflowLabels[workflowType]}工作流`, maxIterations: 3,
          x: Math.max(20, position.x - NODE_WIDTH / 2), y: Math.max(20, position.y - 25),
        };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
    if (!runnerId) setRunnerId(id);
  };

  const onCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/agent-node-kind') as GraphNode['kind'];
    const workflowType = event.dataTransfer.getData('application/workflow-type') as WorkflowKind;
    if (kind === 'agent' || kind === 'workflow') addNode(kind, workflowType || 'sequential', pointInCanvas(event));
  };

  const startNodeMove = (event: ReactPointerEvent<HTMLElement>, node: GraphNode) => {
    if ((event.target as HTMLElement).closest('button,input,textarea,select,.workflow-port')) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointInCanvas(event);
    setSelectedNodeId(node.id);
    setDraggingNode({ id: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y });
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointInCanvas(event);
    if (draggingNode) {
      setNodes((current) => current.map((node) => node.id === draggingNode.id
        ? { ...node, x: Math.max(12, point.x - draggingNode.offsetX), y: Math.max(12, point.y - draggingNode.offsetY) }
        : node));
    }
    if (wireFrom) setWirePoint(point);
  };

  const connectNodes = (targetId: string) => {
    const source = nodes.find((node) => node.id === wireFrom);
    const target = nodes.find((node) => node.id === targetId);
    if (!source || !target || target.kind !== 'workflow' || source.id === target.id) {
      setWireFrom(null);
      setWirePoint(null);
      return;
    }
    if (edges.some((edge) => edge.from === source.id && edge.to === target.id)) {
      setWireFrom(null);
      setWirePoint(null);
      return;
    }
    const reaches = (start: string, sought: string, visited = new Set<string>()): boolean => {
      if (start === sought) return true;
      if (visited.has(start)) return false;
      visited.add(start);
      return edges.filter((edge) => edge.from === start).some((edge) => reaches(edge.to, sought, visited));
    };
    if (reaches(target.id, source.id)) {
      setError('这条连线会形成循环引用，请调整工作流连接。');
    } else {
      setEdges((current) => [...current, { from: source.id, to: target.id }]);
      setError(null);
    }
    setWireFrom(null);
    setWirePoint(null);
  };

  const removeNode = (id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.from !== id && edge.to !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    if (runnerId === id) setRunnerId(null);
  };

  const updateNode = (id: string, field: string, value: string | number) => {
    const currentNode = nodes.find((node) => node.id === id);
    if (!currentNode) return;
    if (field === 'name' && nodes.some((candidate) => candidate.id !== id && candidate.name === value)) {
      setError(`节点名称重复：${value}`);
      return;
    }
    if (field === 'name') {
      const nextId = nodeId(currentNode.kind, String(value));
      setEdges((currentEdges) => currentEdges.map((edge) => ({
        from: edge.from === id ? nextId : edge.from,
        to: edge.to === id ? nextId : edge.to,
      })));
      if (runnerId === id) setRunnerId(nextId);
      setSelectedNodeId(nextId);
    }
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, [field]: value, ...(field === 'name' ? { id: nodeId(node.kind, String(value)) } : {}) } as GraphNode
      : node));
    setError(null);
  };

  const reorderWorkflowEdge = (workflowId: string, edgeIndex: number, offset: -1 | 1) => {
    const currentEdges = edges.filter((edge) => edge.to === workflowId);
    const targetIndex = edgeIndex + offset;
    if (targetIndex < 0 || targetIndex >= currentEdges.length) return;
    const first = currentEdges[edgeIndex];
    const second = currentEdges[targetIndex];
    if (!first || !second) return;
    setEdges((current) => current.map((edge) => {
      if (edge.to !== workflowId) return edge;
      if (edge === first) return second;
      if (edge === second) return first;
      return edge;
    }));
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const config = compileGraph(draft, nodes, edges, runnerId);
      const saved = mode === 'create'
        ? await createAgentConfig(config)
        : await updateAgentConfig(selectedId!, config);
      const savedId = saved.agent.agentId;
      setNotice(mode === 'create' ? '已保存，后端已装配并缓存这个 Agent。' : '已保存，后端已重新装配并替换缓存。');
      applyConfig(saved, savedId);
      await loadConfigs(savedId);
      onChanged(savedId);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm('删除后会从后端运行时缓存中移除该 Agent，确定继续吗？')) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAgentConfig(selectedId);
      setNotice('Agent 已删除，并已从后端缓存中移除。');
      await loadConfigs(null);
      onChanged();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedWorkflowEdges = selectedNode?.kind === 'workflow'
    ? edges.filter((edge) => edge.to === selectedNode.id)
    : [];
  const renderEdge = (edge: GraphEdge, key: string) => {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (!from || !to) return null;
    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_PORT_Y;
    const endX = to.x;
    const endY = to.y + NODE_PORT_Y;
    const bend = Math.max(50, (endX - startX) * 0.48);
    return <path key={key} d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`} className="workflow-edge" markerEnd="url(#workflow-arrow)" />;
  };

  return (
    <main className="agent-admin">
      <header className="agent-admin-header">
        <div className="agent-admin-brand">
          <div className="agent-admin-mark">A</div>
          <div>
            <div className="agent-admin-eyebrow">AGENT STUDIO</div>
            <h1>智能体编排</h1>
          </div>
        </div>
        <div className="agent-admin-header-actions">
          <span className="agent-admin-count">{configs.length} 个配置</span>
          <button type="button" className="admin-secondary-btn" onClick={onClose}>返回工作区</button>
        </div>
      </header>

      <div className="agent-admin-body">
        <aside className="agent-admin-list-panel">
          <div className="agent-admin-list-heading">
            <div><h2>我的智能体</h2><p>选择配置或创建新的工作流</p></div>
            <button type="button" className="admin-add-btn" onClick={startCreate} aria-label="新建配置">+</button>
          </div>
          {error && <div className="admin-error" role="alert">{error}</div>}
          {loading ? <div className="admin-empty">正在读取配置…</div> : configs.length === 0 ? (
            <div className="admin-empty-card">
              <div className="admin-empty-icon">✦</div>
              <strong>还没有智能体</strong>
              <span>新建配置，再拖入 Agent 开始编排</span>
              <button type="button" className="admin-primary-btn" onClick={startCreate}>新建配置</button>
            </div>
          ) : (
            <div className="agent-admin-config-list">
              {configs.map((config) => {
                const agentId = config.agent.agentId;
                return (
                  <button type="button" key={agentId}
                    className={`agent-admin-config-item ${selectedId === agentId && mode === 'edit' ? 'selected' : ''}`}
                    onClick={() => void selectConfig(agentId)}>
                    <span className="admin-agent-avatar">{config.agent.agentName.slice(0, 1) || 'A'}</span>
                    <span className="admin-agent-copy">
                      <span className="admin-agent-name">{config.agent.agentName}</span>
                      <span className="admin-agent-desc">{config.agent.agentDesc || config.appName}</span>
                    </span>
                    <span className={`admin-status ${config.enabled === false ? 'disabled' : ''}`}>
                      {config.enabled === false ? '停用' : '启用'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="agent-admin-list-footer">
            <span>保存后后端自动装配</span>
            <button type="button" className="admin-text-btn" onClick={() => void loadConfigs(selectedId)}>刷新</button>
          </div>
        </aside>

        <section className="agent-admin-workbench">
          <div className="workflow-toolbar">
            <div className="workflow-toolbar-title">
              <div className="agent-admin-eyebrow">{mode === 'create' ? 'NEW WORKFLOW' : 'VISUAL WORKFLOW'}</div>
              <h2>{draft?.agent.agentName || '新建智能体'}</h2>
            </div>
            <div className="workflow-palette">
              <span className="workflow-palette-label">拖入节点</span>
              <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/agent-node-kind', 'agent')}
                onClick={() => addNode('agent')} className="palette-node palette-agent"><i>✦</i> Agent</button>
              {(['sequential', 'parallel', 'loop'] as const).map((type) => (
                <button type="button" draggable key={type}
                  onDragStart={(event) => { event.dataTransfer.setData('application/agent-node-kind', 'workflow'); event.dataTransfer.setData('application/workflow-type', type); }}
                  onClick={() => addNode('workflow', type)}
                  className={`palette-node palette-${type}`}>
                  <i>{type === 'sequential' ? '→' : type === 'parallel' ? '⋈' : '↻'}</i>{workflowLabels[type]}
                </button>
              ))}
            </div>
            <div className="workflow-actions">
              {mode === 'edit' && <button type="button" className="admin-danger-btn" onClick={() => void handleDelete()} disabled={deleting || loading}>{deleting ? '删除中…' : '删除'}</button>}
              <button type="button" className="admin-primary-btn" onClick={() => void handleSave()} disabled={saving || loading}>{saving ? '装配中…' : '保存并装配'}</button>
            </div>
          </div>

          {notice && <div className="admin-success" role="status">{notice}</div>}
          <div className="workflow-workspace">
            <div ref={viewportRef} className={`workflow-viewport ${wireFrom ? 'is-wiring' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onCanvasDrop}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={() => { setDraggingNode(null); setWireFrom(null); setWirePoint(null); }}>
              <div className="workflow-canvas-surface" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
                <svg className="workflow-connections" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true">
                  <defs><marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
                  {edges.map((edge, index) => renderEdge(edge, `${edge.from}-${edge.to}-${index}`))}
                  {wireFrom && wirePoint && (() => {
                    const source = nodes.find((node) => node.id === wireFrom);
                    if (!source) return null;
                    const startX = source.x + NODE_WIDTH;
                    const startY = source.y + NODE_PORT_Y;
                    const bend = Math.max(45, (wirePoint.x - startX) * 0.45);
                    return <path d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${wirePoint.x - bend} ${wirePoint.y}, ${wirePoint.x} ${wirePoint.y}`} className="workflow-edge workflow-edge-preview" />;
                  })()}
                </svg>

                {nodes.map((node) => (
                  <article key={node.id}
                    className={`workflow-node ${node.kind === 'agent' ? 'node-agent' : `node-${node.workflowType}`} ${selectedNodeId === node.id ? 'node-selected' : ''} ${runnerId === node.id ? 'node-runner' : ''}`}
                    style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
                    onPointerDown={(event) => startNodeMove(event, node)}
                    onClick={() => setSelectedNodeId(node.id)}>
                    {node.kind === 'workflow' && <button type="button" className="workflow-port workflow-port-input" title="连接到这个工作流" onPointerUp={(event) => { event.stopPropagation(); connectNodes(node.id); }} />}
                    <div className="workflow-node-topline">
                      <span className="workflow-node-icon">{node.kind === 'agent' ? '✦' : node.workflowType === 'sequential' ? '→' : node.workflowType === 'parallel' ? '⋈' : '↻'}</span>
                      <span className="workflow-node-kind">{node.kind === 'agent' ? 'LLM AGENT' : `${workflowLabels[node.workflowType]}工作流`}</span>
                      {runnerId === node.id && <span className="runner-badge">RUNNER</span>}
                      <button type="button" className="workflow-node-remove" aria-label={`删除 ${node.name}`} onClick={(event) => { event.stopPropagation(); removeNode(node.id); }}>×</button>
                    </div>
                    <strong>{node.name}</strong>
                    <span className="workflow-node-description">{node.description || '点击节点编辑说明'}</span>
                    {node.kind === 'workflow' && <span className="workflow-child-count">{edges.filter((edge) => edge.to === node.id).length} 个输入节点</span>}
                    <button type="button" className="workflow-port workflow-port-output" title="拖动连线到工作流" onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedNodeId(node.id);
                      setWireFrom(node.id);
                      setWirePoint(pointInCanvas(event));
                    }} />
                  </article>
                ))}

                {nodes.length === 0 && (
                  <div className="workflow-canvas-empty">
                    <div className="workflow-empty-orbit">✦</div>
                    <strong>从 Agent 开始搭建工作流</strong>
                    <span>拖入 Agent 节点，再将 Agent 连到串行、并行或循环工作流</span>
                  </div>
                )}
              </div>
            </div>

            <aside className="workflow-inspector">
              <div className="workflow-inspector-heading">
                <div className="workflow-inspector-title">
                  <span>{selectedNode ? (selectedNode.kind === 'agent' ? 'AGENT 节点' : '工作流节点') : '应用设置'}</span>
                  <strong>{selectedNode?.name ?? '配置入口和模型'}</strong>
                </div>
                <button type="button" className={`inspector-settings-btn ${selectedNode ? '' : 'active'}`} onClick={() => setSelectedNodeId(null)}>
                  应用设置
                </button>
              </div>

              {selectedNode?.kind === 'agent' ? (
                <div className="inspector-fields">
                  <label>Agent 名称<input value={selectedNode.name} onChange={(event) => updateNode(selectedNode.id, 'name', event.target.value)} /></label>
                  <label>说明<input value={selectedNode.description} onChange={(event) => updateNode(selectedNode.id, 'description', event.target.value)} /></label>
                  <label>输出变量<input value={selectedNode.outputKey} onChange={(event) => updateNode(selectedNode.id, 'outputKey', event.target.value)} placeholder="可选" /></label>
                  <label>系统指令<textarea className="inspector-instruction" value={selectedNode.instruction} onChange={(event) => updateNode(selectedNode.id, 'instruction', event.target.value)} /></label>
                  <button type="button" className={`runner-select-btn ${runnerId === selectedNode.id ? 'active' : ''}`} onClick={() => setRunnerId(selectedNode.id)}>
                    {runnerId === selectedNode.id ? '当前是 Runner 入口' : '设为 Runner 入口'}
                  </button>
                </div>
              ) : selectedNode?.kind === 'workflow' ? (
                <div className="inspector-fields">
                  <label>工作流名称<input value={selectedNode.name} onChange={(event) => updateNode(selectedNode.id, 'name', event.target.value)} /></label>
                  <label>执行方式<select value={selectedNode.workflowType} onChange={(event) => updateNode(selectedNode.id, 'workflowType', event.target.value)}>
                    <option value="sequential">串行：按顺序执行</option><option value="parallel">并行：同时执行</option><option value="loop">循环：重复执行</option>
                  </select></label>
                  <label>说明<input value={selectedNode.description} onChange={(event) => updateNode(selectedNode.id, 'description', event.target.value)} /></label>
                  {selectedNode.workflowType === 'loop' && <label>最大循环次数<input type="number" min={1} max={100} value={selectedNode.maxIterations} onChange={(event) => updateNode(selectedNode.id, 'maxIterations', Number(event.target.value))} /></label>}
                  <div className="workflow-order-label">输入节点顺序 <span>{selectedNode.workflowType === 'parallel' ? '并行任务' : '可拖线添加，再用箭头排序'}</span></div>
                  <ol className="workflow-member-list">
                    {selectedWorkflowEdges.map((edge, index) => {
                      const child = nodes.find((node) => node.id === edge.from);
                      if (!child) return null;
                      return <li key={`${edge.from}-${index}`}><span>{index + 1}</span><strong>{child.name}</strong>
                        <button type="button" aria-label="上移" onClick={() => reorderWorkflowEdge(selectedNode.id, index, -1)} disabled={index === 0}>↑</button>
                        <button type="button" aria-label="下移" onClick={() => reorderWorkflowEdge(selectedNode.id, index, 1)} disabled={index === selectedWorkflowEdges.length - 1}>↓</button>
                        <button type="button" aria-label="移除连接" onClick={() => setEdges((current) => current.filter((candidate) => candidate !== edge))}>×</button>
                      </li>;
                    })}
                    {selectedWorkflowEdges.length === 0 && <li className="workflow-no-members">从节点右侧圆点拖线到这个工作流</li>}
                  </ol>
                  <button type="button" className={`runner-select-btn ${runnerId === selectedNode.id ? 'active' : ''}`} onClick={() => setRunnerId(selectedNode.id)}>
                    {runnerId === selectedNode.id ? '当前是 Runner 入口' : '设为 Runner 入口'}
                  </button>
                </div>
              ) : draft ? (
                <div className="inspector-fields">
                  <div className="inspector-section-label">应用信息</div>
                  <label>应用名称<input value={draft.appName} onChange={(event) => updateDraft((current) => ({ ...current, appName: event.target.value }))} /></label>
                  <label>Agent ID<input value={draft.agent.agentId} disabled={mode === 'edit'} onChange={(event) => updateAgent('agentId', event.target.value)} /></label>
                  <label>显示名称<input value={draft.agent.agentName} onChange={(event) => updateAgent('agentName', event.target.value)} /></label>
                  <label>简介<input value={draft.agent.agentDesc ?? ''} onChange={(event) => updateAgent('agentDesc', event.target.value)} /></label>
                  <label className="inspector-checkbox"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => updateDraft((current) => ({ ...current, enabled: event.target.checked }))} />启用这个 Agent</label>

                  <div className="inspector-section-label">模型服务</div>
                  <label>API 地址<input value={draft.module.aiApi.baseUrl} onChange={(event) => updateApi('baseUrl', event.target.value)} /></label>
                  <label>API Key<input type="password" autoComplete="new-password" value={draft.module.aiApi.apiKey ?? ''} placeholder={draft.module.aiApi.apiKeyConfigured ? '已保存，留空表示不更改' : '请输入 API Key'} onChange={(event) => updateApi('apiKey', event.target.value)} /></label>
                  <label>对话接口路径<input value={draft.module.aiApi.completionsPath ?? ''} onChange={(event) => updateApi('completionsPath', event.target.value)} placeholder="v1/chat/completions" /></label>
                  <label>向量接口路径<input value={draft.module.aiApi.embeddingsPath ?? ''} onChange={(event) => updateApi('embeddingsPath', event.target.value)} placeholder="v1/embeddings" /></label>
                  <label>模型名称<input value={draft.module.chatModel.model} onChange={(event) => updateModel('model', event.target.value)} /></label>
                  <label>推理强度<input value={draft.module.chatModel.reasoningEffort ?? ''} onChange={(event) => updateModel('reasoningEffort', event.target.value)} placeholder="沿用服务商默认值" /></label>
                  <label>Runner 入口<select value={runnerId ?? ''} onChange={(event) => setRunnerId(event.target.value || null)}>
                    <option value="">请选择入口节点</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}（{node.kind === 'agent' ? 'Agent' : workflowLabels[node.workflowType]}）</option>)}
                  </select></label>
                  <label>插件名称 <span className="inspector-label-hint">逗号分隔</span><input
                    value={(draft.module.runner.pluginNameList ?? []).join(', ')}
                    onChange={(event) => updateDraft((current) => ({ ...current, module: { ...current.module, runner: { ...current.module.runner, pluginNameList: event.target.value.split(',').map((name) => name.trim()).filter(Boolean) } } }))}
                    placeholder="myTestPlugin, myLogPlugin" /></label>
                  <div className="inspector-section-label">MCP 工具 <span className="inspector-label-hint">{draft.module.chatModel.toolMcpList?.length ?? 0}</span></div>
                  {(draft.module.chatModel.toolMcpList ?? []).map((mcp, index) => {
                    const kind: 'local' | 'sse' | 'stdio' = 'local' in mcp ? 'local' : 'sse' in mcp ? 'sse' : 'stdio';
                    const name = 'local' in mcp ? mcp.local.name : 'sse' in mcp ? mcp.sse.name : mcp.stdio.name;
                    return <section className="inspector-config-card" key={`mcp-${index}`}>
                      <div className="inspector-card-heading"><strong>MCP {index + 1}</strong><button type="button" className="inspector-remove-btn" onClick={() => removeMcp(index)}>移除</button></div>
                      <label>连接方式<select value={kind} onChange={(event) => replaceMcpKind(index, event.target.value as 'local' | 'sse' | 'stdio')}>
                        <option value="local">本地 Bean</option><option value="sse">SSE 服务</option><option value="stdio">stdio 命令</option>
                      </select></label>
                      <label>名称<input value={name} onChange={(event) => updateMcp(index, (item) => {
                        if ('local' in item) return { local: { name: event.target.value } };
                        if ('sse' in item) return { sse: { ...item.sse, name: event.target.value } };
                        return { stdio: { ...item.stdio, name: event.target.value } };
                      })} placeholder={kind === 'local' ? 'myToolCallbackProvider' : '工具服务名称'} /></label>
                      {'sse' in mcp && <>
                        <label>服务地址<input value={mcp.sse.baseUri} onChange={(event) => updateMcp(index, (item) => 'sse' in item ? { sse: { ...item.sse, baseUri: event.target.value } } : item)} placeholder="https://example.com" /></label>
                        <label>SSE 端点<input value={mcp.sse.sseEndpoint} onChange={(event) => updateMcp(index, (item) => 'sse' in item ? { sse: { ...item.sse, sseEndpoint: event.target.value } } : item)} placeholder="/sse" /></label>
                        <label>请求超时（毫秒）<input type="number" min={1} value={mcp.sse.requestTimeout ?? 30000} onChange={(event) => updateMcp(index, (item) => 'sse' in item ? { sse: { ...item.sse, requestTimeout: Number(event.target.value) } } : item)} /></label>
                      </>}
                      {'stdio' in mcp && <>
                        <label>请求超时（毫秒）<input type="number" min={1} value={mcp.stdio.requestTimeout ?? 30000} onChange={(event) => updateMcp(index, (item) => 'stdio' in item ? { stdio: { ...item.stdio, requestTimeout: Number(event.target.value) } } : item)} /></label>
                        <label>启动命令<input value={mcp.stdio.serverParameters.command} onChange={(event) => updateMcp(index, (item) => 'stdio' in item ? { stdio: { ...item.stdio, serverParameters: { ...item.stdio.serverParameters, command: event.target.value } } } : item)} placeholder="npx" /></label>
                        <label>命令参数 <span className="inspector-label-hint">每行一个参数</span><textarea value={(mcp.stdio.serverParameters.args ?? []).join('\n')} onChange={(event) => updateMcp(index, (item) => 'stdio' in item ? { stdio: { ...item.stdio, serverParameters: { ...item.stdio.serverParameters, args: event.target.value.split('\n').filter((arg) => arg.length > 0) } } } : item)} placeholder="-y\n@scope/mcp-server" /></label>
                        <label>环境变量 <span className="inspector-label-hint">每行 KEY=VALUE</span><textarea value={Object.entries(mcp.stdio.serverParameters.env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n')} onChange={(event) => updateMcp(index, (item) => {
                          if (!('stdio' in item)) return item;
                          const env: Record<string, string> = {};
                          event.target.value.split('\n').forEach((line) => { const separator = line.indexOf('='); if (separator > 0) env[line.slice(0, separator).trim()] = line.slice(separator + 1); });
                          return { stdio: { ...item.stdio, serverParameters: { ...item.stdio.serverParameters, env } } };
                        })} placeholder="API_TOKEN=..." /></label>
                      </>}
                    </section>;
                  })}
                  <div className="inspector-button-row">
                    <button type="button" className="inspector-add-btn" onClick={() => addMcp('local')}>＋本地工具</button>
                    <button type="button" className="inspector-add-btn" onClick={() => addMcp('sse')}>＋SSE</button>
                    <button type="button" className="inspector-add-btn" onClick={() => addMcp('stdio')}>＋stdio</button>
                  </div>

                  <div className="inspector-section-label">Skills 配置 <span className="inspector-label-hint">{draft.module.chatModel.toolSkillsList?.length ?? 0}</span></div>
                  {(draft.module.chatModel.toolSkillsList ?? []).map((skill, index) => <section className="inspector-config-card" key={`skill-${index}`}>
                    <div className="inspector-card-heading"><strong>Skill {index + 1}</strong><button type="button" className="inspector-remove-btn" onClick={() => removeSkill(index)}>移除</button></div>
                    <label>类型<select value={skill.type} onChange={(event) => updateSkill(index, 'type', event.target.value)}><option value="resource">资源目录</option><option value="directory">文件目录</option></select></label>
                    <label>路径<input value={skill.path} onChange={(event) => updateSkill(index, 'path', event.target.value)} placeholder="agent/skills" /></label>
                  </section>)}
                  <button type="button" className="inspector-add-btn" onClick={addSkill}>＋添加 Skill</button>
                </div>
              ) : <div className="admin-empty">正在准备配置…</div>}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
