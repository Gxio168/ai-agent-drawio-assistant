import { useEffect, useRef, useState } from 'react';
import { DrawIoEmbed } from 'react-drawio';
import type { DrawIoEmbedRef, EventExport } from 'react-drawio';
import { EMPTY_DIAGRAM_XML } from '../../utils/drawio';

interface CanvasAreaProps {
  /** 标题（当前会话名） */
  title?: string;
  /** 由 AI 回复解析出的 draw.io XML，变化时自动灌入画布 */
  xml: string | null;
  /** 编辑器自动保存时同步最新 XML，保证会话和 AI 上下文使用手动修改后的图形。 */
  onXmlChange: (xml: string) => void;
}

// 放在组件外，避免每次渲染重建对象导致 iframe 重载
const DRAWIO_PARAMS = {
  ui: 'kennedy',
  spin: true,
  libraries: true,
  saveAndExit: false,
} as const;

/** 把加载到画布上的 XML 导出为文件并触发下载 */
function downloadExport(data: EventExport) {
  const { format, data: payload, xml } = data;
  if (!payload) return;

  // png/xmlpng/svg 等格式返回的是 base64（可能是 data URL），html 格式返回标记文本
  const isMarkup = payload.trimStart().startsWith('<');
  const isSvg = format === 'svg';
  const mime = isSvg ? 'image/svg+xml' : `image/${format}`;
  const base64 = payload.startsWith('data:') ? payload.slice(payload.indexOf(',') + 1) : payload;

  const anchor = document.createElement('a');
  if (isMarkup) {
    // html/html2 或（极少数情况下）直接返回的 XML 文本
    const text = xml ?? payload;
    anchor.href = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    anchor.download = `diagram-${Date.now()}.${xml ? 'xml' : format}`;
  } else {
    anchor.href = `data:${mime};base64,${base64}`;
    anchor.download = `diagram-${Date.now()}.${format}`;
  }
  anchor.click();
}

export default function CanvasArea({ title = '未命名图表', xml, onXmlChange }: CanvasAreaProps) {
  const drawioRef = useRef<DrawIoEmbedRef | null>(null);
  /** 已灌入画布的图形，放在 ref 里避免为它多跑一轮渲染 */
  const appliedXmlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // 画布就绪后把最新的 XML 灌进去；same-as-current 时跳过，不覆盖手动改动
  useEffect(() => {
    if (!ready || xml === appliedXmlRef.current) return;
    const nextXml = xml ?? EMPTY_DIAGRAM_XML;
    drawioRef.current?.load({ xml: nextXml, autosave: false });
    appliedXmlRef.current = xml;
  }, [ready, xml]);

  // iframe 发出 load 事件说明编辑器已就绪
  const handleLoad = () => setReady(true);
  const handleAutoSave = (data: { xml: string }) => {
    if (!data.xml) return;
    appliedXmlRef.current = data.xml;
    onXmlChange(data.xml);
  };

  return (
    <main className="canvas-area">
      <header className="canvas-header">
        <div>
          <div className="canvas-title">{title}</div>
          <div className="canvas-subtitle">
            draw.io 编辑器 · AI 返回图形后自动载入画布
          </div>
        </div>
        <div className="canvas-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={!ready}
            title="重新载入当前图形，丢弃手动改动"
            onClick={() => drawioRef.current?.load({ xml: appliedXmlRef.current ?? EMPTY_DIAGRAM_XML })}
          >
            重载图形
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!ready}
            onClick={() => drawioRef.current?.exportDiagram({ format: 'png', spin: true })}
          >
            导出
          </button>
        </div>
      </header>

      <div className="canvas-stage">
        <div className="canvas-frame">
          <DrawIoEmbed
            ref={drawioRef}
            urlParameters={DRAWIO_PARAMS}
            autosave
            onLoad={handleLoad}
            onAutoSave={handleAutoSave}
            onExport={downloadExport}
          />
        </div>
      </div>
    </main>
  );
}
