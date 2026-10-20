import { useState } from 'react';
import CanvasArea from '../components/canvas/CanvasArea';
import ChatPanel from '../components/chat/ChatPanel';
import Sidebar from '../components/sidebar/Sidebar';
import AgentConfigPage from './AgentConfigPage';
import { useAgents } from '../hooks/use-agents';
import { useWorkspace } from '../hooks/use-workspace';
import type { User } from '../models';

interface WorkspaceProps {
  user: User;
  onLogout: () => void;
}

export default function Workspace({ user, onLogout }: WorkspaceProps) {
  const { agents, loading: agentsLoading, error: agentsError, reload: reloadAgents } = useAgents();
  const [input, setInput] = useState('');
  const [showAgentAdmin, setShowAgentAdmin] = useState(false);

  const workspace = useWorkspace({ user, agents, agentsLoading });

  const handleSend = (includeDiagramContext = false) => {
    const text = input.trim();
    if (!text || workspace.sending) return;
    setInput('');
    void workspace.sendMessage(text, includeDiagramContext);
  };

  if (showAgentAdmin) {
    return (
      <AgentConfigPage
        onClose={() => setShowAgentAdmin(false)}
        onChanged={(agentId) => {
          void reloadAgents();
          if (agentId) workspace.selectAgent(agentId);
        }}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        conversations={workspace.conversations}
        activeConversationId={workspace.activeConversationId}
        onSelectConversation={workspace.selectConversation}
        onRemoveConversation={workspace.removeConversation}
        onNewConversation={workspace.startNewConversation}
        agents={agents}
        agentsLoading={agentsLoading}
        agentsError={agentsError}
        selectedAgentId={workspace.selectedAgentId}
        onSelectAgent={workspace.selectAgent}
        onReloadAgents={reloadAgents}
        onManageAgents={() => setShowAgentAdmin(true)}
        onLogout={onLogout}
      />

      <CanvasArea
        title={workspace.activeConversation?.title ?? '未命名图表'}
        xml={workspace.canvasXml}
        onXmlChange={workspace.saveCanvasXml}
      />

      <ChatPanel
        key={workspace.activeConversationId ?? 'new-conversation'}
        messages={workspace.messages}
        input={input}
        sending={workspace.sending}
        historyLoading={workspace.historyLoading}
        agentName={workspace.selectedAgent?.agentName}
        hasActiveConversation={workspace.activeConversation !== null}
        canvasXml={workspace.canvasXml}
        currentDiagramXml={
          workspace.activeConversation?.lastDiagramXml ??
          workspace.messages.findLast((message) => message.diagramXml)?.diagramXml ??
          null
        }
        onInputChange={setInput}
        onSend={handleSend}
        onRestoreDiagram={workspace.restoreDiagram}
        onRestoreCurrentDiagram={workspace.restoreCurrentDiagram}
      />

      {workspace.notice && (
        <div className={`notice ${workspace.notice.type}`} role="alert">
          <span>{workspace.notice.text}</span>
          <button type="button" className="notice-close" onClick={workspace.dismissNotice}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
