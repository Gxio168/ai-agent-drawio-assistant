import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../../models';
import { removeDrawioXml } from '../../utils/drawio';

interface ChatPanelProps {
  messages: Message[];
  input: string;
  sending: boolean;
  historyLoading?: boolean;
  agentName?: string;
  /** 是否已选中一个已存在的会话（用于恢复会话时的提示） */
  hasActiveConversation?: boolean;
  onInputChange: (value: string) => void;
  canvasXml: string | null;
  currentDiagramXml: string | null;
  onSend: (includeDiagramContext: boolean) => void;
  onRestoreDiagram: (message: Message) => void;
  onRestoreCurrentDiagram: () => void;
}

/** 复制文本到剪贴板，非安全上下文（http 局域网）回落到 execCommand */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 继续走回落方案 */
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function ChatPanel({
  messages,
  input,
  sending,
  historyLoading = false,
  agentName,
  hasActiveConversation = false,
  canvasXml,
  currentDiagramXml,
  onInputChange,
  onSend,
  onRestoreDiagram,
  onRestoreCurrentDiagram,
}: ChatPanelProps) {
  const canSend = Boolean(input.trim()) && !sending && !historyLoading;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [includeDiagramContext, setIncludeDiagramContext] = useState(false);

  // 新消息 / 生成状态变化时，始终把会话滚到最底部
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const frame = requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, sending]);

  const handleCopy = async (message: Message) => {
    const ok = await copyText(message.content);
    if (!ok) return;
    setCopiedId(message.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === message.id ? null : current));
    }, 1500);
  };

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div>
          <div className="chat-title">对话</div>
          {agentName && <div className="chat-subtitle">当前智能体：{agentName}</div>}
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className="msg-tool-btn session-diagram-btn"
            disabled={!currentDiagramXml}
            title="将当前会话最近的流程图载入中间画布"
            onClick={onRestoreCurrentDiagram}
          >
            载入本会话图形
          </button>
          <span className="chat-badge">{messages.length} 条</span>
        </div>
      </header>

      <div className="chat-messages" ref={listRef}>
        {historyLoading && messages.length === 0 && (
          <div className="chat-empty">正在从服务端加载会话历史…</div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="chat-empty">
            {hasActiveConversation ? (
              <>
                已恢复上次的会话，继续发送消息即可沿用同一个 sessionId。
                <br />
                历史气泡未在后端保存，若画布为空可让智能体重新画一次。
              </>
            ) : (
              <>
                描述你想要的流程，例如：「画一个用户登录流程图，包含验证码校验和失败重试」。
                <br />
                如果智能体返回了 draw.io 图形，会自动载入中间画布。
              </>
            )}
          </div>
        )}

        {messages.map((msg) => {
          // 生成过程中原样展示，包括尚未完整的 XML；结束后再把 XML 从气泡移除。
          const displayContent = msg.streaming ? msg.content : removeDrawioXml(msg.content);
          const bubbleContent =
            displayContent ||
            (msg.diagramXml || /<(?:mxGraphModel|mxfile)[\s>]|&lt;(?:mxGraphModel|mxfile)/i.test(msg.content)
              ? '已生成流程图，可载入画布查看。'
              : msg.content);

          return (
            <div key={msg.id} className={`msg ${msg.role}`}>
              <div className="msg-avatar">{msg.role === 'user' ? '我' : 'AI'}</div>
              <div className="msg-body">
                <div className="msg-bubble markdown-content">
                  {msg.streaming && !msg.content ? (
                    <span className="typing" role="status" aria-live="polite">
                      <span>正在生成</span>
                      <span className="typing-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </span>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {bubbleContent}
                    </ReactMarkdown>
                  )}
                </div>
                <div className="msg-tools">
                  <span className="msg-time">{msg.time}</span>
                  {msg.appliedToCanvas && <span className="msg-tag">已载入画布</span>}
                  {msg.diagramContextAttached && <span className="msg-tag">已附带画布上下文</span>}
                  <button
                    type="button"
                    className="msg-tool-btn"
                    onClick={() => void handleCopy(msg)}
                  >
                    {copiedId === msg.id ? '已复制' : '复制'}
                  </button>
                  {msg.role === 'assistant' && msg.diagramXml && (
                    <button
                      type="button"
                      className="msg-tool-btn"
                      title="把这条回复里的图形重新载入画布"
                      onClick={() => onRestoreDiagram(msg)}
                    >
                      载入画布
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sending && !messages.some((message) => message.streaming) && (
          <div className="msg assistant">
            <div className="msg-avatar">AI</div>
            <div className="msg-body">
              <div className="msg-bubble typing" role="status" aria-live="polite">
                <span>正在生成</span>
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <button
          type="button"
          className={`diagram-context-toggle${includeDiagramContext ? ' active' : ''}`}
          disabled={!canvasXml || sending}
          aria-pressed={includeDiagramContext}
          title={canvasXml ? '将当前画布中的流程图 XML 随下一条消息发送给 AI' : '当前画布没有可附带的流程图'}
          onClick={() => setIncludeDiagramContext((value) => !value)}
        >
          {includeDiagramContext ? '✓ 已附带当前画布' : '＋ 将当前画布带入 AI 上下文'}
        </button>
        <div className="chat-input-box">
          <textarea
            value={input}
            placeholder="描述你想画的流程…（Enter 发送，Shift + Enter 换行）"
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) onSend(includeDiagramContext);
              }
            }}
          />
          <button type="button" className="send-btn" onClick={() => onSend(includeDiagramContext)} disabled={!canSend}>
            {sending ? '生成中…' : '发送'}
          </button>
        </div>
      </div>
    </aside>
  );
}
