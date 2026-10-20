/**
 * ADK Event 文本解析
 *
 * 后端 IAgentService#chat 返回的 content 是
 *    List<Event>.stream().map(Event::stringifyContent).collect(joining("\n"))
 * 即若干段 ADK content JSON 用 "\n" 拼成的字符串，例如：
 *   {"role":"model","parts":[{"text":"好的，这是流程图："}]}
 *   {"role":"model","parts":[{"text":"<mxGraphModel>...</mxGraphModel>"}]}
 *
 * 本模块负责把这段"半结构化文本"还原成人可读的回复文本。
 */

/** 递归收集任意结构里的 text 字段 */
function collectTexts(value: unknown, out: string[], depth = 0): void {
  if (depth > 12) return;

  if (Array.isArray(value)) {
    for (const item of value) collectTexts(item, out, depth + 1);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const text = record.text;
  if (typeof text === 'string' && text.trim()) {
    out.push(text);
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') collectTexts(nested, out, depth + 1);
  }
}

/** 尝试把一段文本按 JSON 解析，成功则返回其中的 text 片段 */
function extractJsonTexts(candidate: string): string[] | null {
  try {
    const json: unknown = JSON.parse(candidate);
    const out: string[] = [];
    collectTexts(json, out);
    return out;
  } catch {
    return null;
  }
}

/**
 * 把后端返回的 content 字符串解析为可展示文本。
 * - 逐行尝试 JSON 解析，能解析出 parts[].text 就采用；
 * - 不是 JSON 的行按纯文本保留（模型输出的 XML 会被 join 进来）；
 * - 整体为单个大 JSON 时递归查找 text；
 * - 什么都解析不出来时回退为原始字符串，便于排查。
 */
export function parseAgentContent(raw: string): string {
  const source = (raw ?? '').trim();
  if (!source) return '';

  // 整体就是一个 JSON（后面没有紧跟其它事件行）时优先深度解析
  const whole = extractJsonTexts(source);
  if (whole && whole.length > 0) return whole.join('\n').trim();

  const chunks: string[] = [];
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const texts = extractJsonTexts(trimmed);
      if (texts) {
        for (const text of texts) {
          if (text.trim()) chunks.push(text);
        }
        continue;
      }
    }
    // 纯文本行（含 XML）原样保留
    chunks.push(line);
  }

  const merged = chunks.join('\n').trim();
  return merged || source;
}
