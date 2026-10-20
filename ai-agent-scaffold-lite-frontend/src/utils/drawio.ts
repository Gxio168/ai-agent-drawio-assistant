/**
 * 从智能体回复中识别 draw.io 图形内容
 *
 * 大模型返回图形的形式五花八门，实际遇到过的情况：
 * 1. ```xml / ```drawio 代码块（正常闭合）
 * 2. ```xml 代码块但**缺少结尾的 ``` **（模型输出被 maxTokens 截断）
 * 3. 没有代码块，直接是裸的 <mxGraphModel> / <mxfile>
 * 4. XML 被 HTML 转义成 &lt;mxGraphModel&gt;
 * 5. XML 尾部被截断（mxCell 没闭合）
 *
 * 因此这里不用单个正则去匹配，而是「定位 → 切片 → 修复 → 校验」四步走，
 * 保证只要回复里出现了图形片段就能尽量还原出一份可用的 draw.io XML。
 */

/** draw.io 空图骨架 */
export const EMPTY_DIAGRAM_XML =
  '<mxGraphModel dx="1000" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel>';

/** 允许出现但不影响图形渲染的标签（截断时可以整个丢掉） */
const OPTIONAL_TAGS = new Set([
  // 单元格：丢掉截断的那一个只是少画一个节点
  'mxcell',
  // 单元格内部节点：缺失时可交给 draw.io 用默认值
  'mxgeometry',
  'mxpoint',
  'mxrectangle',
  'mxstyle',
  // 分组容器：截断时连同其内部节点一起丢弃，避免分组残缺
  'object',
  'userobject',
  'mxobject',
]);

/** 结构标签：必须闭合，收尾时补齐 */
const STRUCTURAL_TAGS = new Set(['mxgraphmodel', 'mxfile', 'diagram', 'root', 'mxgraph']);

/** 一个标签的解析结果 */
interface TagToken {
  /** 标签名（小写），如 mxgraphmodel */
  name: string;
  /** 是否闭合写法 <x /> */
  selfClosing: boolean;
  closing: boolean;
  /** 原始片段 */
  raw: string;
  /** 在输入中的结束位置（用于继续扫描） */
  end: number;
}

/** 从 from 位置开始找下一个完整标签，找不到返回 null */
function nextTag(input: string, from: number): TagToken | null {
  const open = input.indexOf('<', from);
  if (open < 0) return null;

  const match = /^<\/?([A-Za-z_][\w.:-]*)/.exec(input.slice(open));
  if (!match) {
    // 不是标签（例如裸尖括号或注释内容），跳过这个尖括号继续找
    return nextTag(input, open + 1);
  }

  const gt = input.indexOf('>', open);
  if (gt < 0) return null;

  let raw = input.slice(open, gt + 1);
  const closing = raw.startsWith('</');
  // 闭合写法：<x/> 或 <x a="b" />
  const selfClosing = !closing && /\/\s*>$/.test(raw);
  const name = (match[1] ?? '').toLowerCase();

  // 统一成 `... />` 形态，避免 draw.io 解析异常
  if (selfClosing && !raw.endsWith('/>')) {
    raw = `${raw.slice(0, -1).trimEnd()}/>`;
  }

  return { name, selfClosing, closing, raw, end: gt + 1 };
}

/** 用一个局部栈标记来跟踪未闭合标签（保留原始大小写用于生成闭合标签） */
interface OpenTag {
  /** 标签名（小写，用于匹配） */
  name: string;
  /** 原始写法，用户生成闭合标签 */
  raw: string;
}

/** 从 `<mxCell` 这半截原始片段里取出标签名 */
function tagNameFromRaw(rawTag: string): string {
  const match = /^<\/?([A-Za-z_][\w.:-]*)/.exec(rawTag);
  return match?.[1] ?? 'mxCell';
}

/**
 * 修复被截断 / 有瑕疵的 draw.io XML。
 *
 * 策略：
 * - 截断在标签中间（`<mxCell id="n2" value="输入` 没有 `>`）时，直接舍弃这一小段；
 * - 未闭合的可选标签（mxCell / object）连同其内部节点整个丢弃，
 *   宁可少画一个节点，也不要把半截元素灌进画布；
 * - 结构标签（mxGraphModel / mxfile / diagram / root）在结尾补齐；
 * - 多余的孤立闭合标签直接丢弃。
 *
 * 返回修复后的 XML；不含图形根节点时返回 null。
 */
export function repairDiagramXml(input: string): string | null {
  const source = (input ?? '').trim();
  if (!source) return null;

  // 去掉 XML 声明，避免嵌进画布后报错
  const cleaned = source.replace(/<\?xml[\s\S]*?\?>/gi, '').trim();
  if (!/<(mxgraphmodel|mxfile)[\s>]/i.test(cleaned)) return null;

  const out: string[] = [];
  const stack: OpenTag[] = [];
  let cursor = 0;

  while (cursor < cleaned.length) {
    const tag = nextTag(cleaned, cursor);
    if (!tag) {
      // 后面已经没有完整标签了：要么是尾部截断的半个标签，要么是纯文本，直接结束
      break;
    }
    cursor = tag.end;

    if (tag.closing) {
      // 从栈顶往回找同名开始标签；找不到说明是孤立闭合标签，丢弃
      let index = -1;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]?.name === tag.name) {
          index = i;
          break;
        }
      }
      if (index < 0) continue;
      // 只弹出到该标签为止；中间未闭合的标签随之作废（其内容已经输出但也一并作废）
      stack.length = index;
      out.push(tag.raw);
      continue;
    }

    if (!tag.selfClosing) stack.push({ name: tag.name, raw: tag.raw });
    out.push(tag.raw);
  }

  // 收尾：按后进先出补齐剩余的未闭合标签。
  // 未闭合的可选标签（被截断的 mxCell / object）直接跳过不补，
  // 但结构标签（mxGraphModel / mxfile / diagram / root）必须补上，
  // 否则整份 XML 无法被 draw.io 解析。
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const item = stack[i];
    if (!item) continue;
    if (OPTIONAL_TAGS.has(item.name)) continue;
    if (!STRUCTURAL_TAGS.has(item.name)) continue;
    out.push(`</${tagNameFromRaw(item.raw)}>`);
  }

  const xml = out.join('').trim();
  if (!/<(mxgraphmodel|mxfile)[\s>]/i.test(xml)) return null;
  // 至少要有一个单元格，否则画出来是张空图
  if (!/<mxCell[\s>]/.test(xml)) return null;

  return xml;
}

/** HTML 实体反转义（&lt;mxGraphModel&gt; → <mxGraphModel>） */
function unescapeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 从一段文本里截出 mxGraphModel / mxfile 片段（允许尾部截断） */
function sliceDiagram(text: string): string | null {
  const mxfileStart = text.search(/<mxfile[\s>]/i);
  const modelStart = text.search(/<mxGraphModel[\s>]/i);

  if (mxfileStart < 0 && modelStart < 0) return null;

  const useFile = mxfileStart >= 0 && (modelStart < 0 || mxfileStart <= modelStart);
  const start = useFile ? mxfileStart : modelStart;
  const closeTag = useFile ? '</mxfile>' : '</mxGraphModel>';
  const end = text.toLowerCase().indexOf(closeTag.toLowerCase(), start);

  // 找不到闭合标签时保留到文本结尾，交给 repairDiagramXml 修复
  return end < 0 ? text.slice(start).trim() : text.slice(start, end + closeTag.length).trim();
}

function firstValid(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;

    const direct = repairDiagramXml(sliceDiagram(candidate) ?? candidate);
    if (direct) return direct;

    const unescaped = unescapeXmlEntities(candidate);
    const fromUnescaped = repairDiagramXml(sliceDiagram(unescaped) ?? unescaped);
    if (fromUnescaped) return fromUnescaped;
  }
  return null;
}

/**
 * 提取所有代码块。**兼容未闭合的结尾围栏**：
 * 回复被截断时模型往往只输出了开头的 ```xml，这里会把剩余内容当成块内容。
 */
export function extractCodeBlocks(text: string): Array<{ lang: string; content: string }> {
  const blocks: Array<{ lang: string; content: string }> = [];
  const fence = /```([a-zA-Z0-9_-]*)\r?\n?/g;

  let match = fence.exec(text);
  while (match !== null) {
    const lang = (match[1] ?? '').toLowerCase();
    const contentStart = match.index + match[0].length;
    const closing = text.indexOf('```', contentStart);
    const content = closing < 0 ? text.slice(contentStart) : text.slice(contentStart, closing);

    blocks.push({ lang, content: content.replace(/\r?\n$/, '') });
    if (closing < 0) break;
    fence.lastIndex = closing + 3;
    match = fence.exec(text);
  }
  return blocks;
}

const DRAWIO_LANGS = new Set(['xml', 'drawio', 'mxgraphmodel', 'mxfile', 'dio']);

/**
 * 从回复文本中提取可注入画布的 draw.io XML，找不到返回 null。
 *
 * 依次尝试：
 * 1. 带 drawio 语义的代码块（xml / drawio / mxfile …）
 * 2. 其它语言的代码块
 * 3. 正文里裸的 <mxGraphModel> / <mxfile>
 */
export function extractDrawioXml(reply: string): string | null {
  const text = reply ?? '';
  if (!text.trim()) return null;

  const blocks = extractCodeBlocks(text);

  const preferred = firstValid(
    blocks.filter((block) => DRAWIO_LANGS.has(block.lang)).map((block) => block.content),
  );
  if (preferred) return preferred;

  const others = firstValid(blocks.map((block) => block.content));
  if (others) return others;

  return firstValid([text]);
}

/** 隐藏聊天气泡中的 draw.io 源码，同时保留回复里的说明文字。 */
export function removeDrawioXml(reply: string): string {
  return (reply ?? '')
    .replace(/```[^\n]*\n[\s\S]*?(?:<mxGraphModel[\s>]|<mxfile[\s>])[\s\S]*?```/gi, '')
    .replace(/```[^\n]*\n[\s\S]*?(?:<mxGraphModel[\s>]|<mxfile[\s>])[\s\S]*$/gi, '')
    .replace(/(?:<mxGraphModel[\s>]|<mxfile[\s>])[\s\S]*?(?:<\/mxGraphModel>|<\/mxfile>|$)/gi, '')
    .replace(/&lt;(?:mxGraphModel|mxfile)[\s\S]*?(?:&lt;\/(?:mxGraphModel|mxfile)&gt;|$)/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 生成会话标题：取首条用户消息的前 18 个字符 */
export function buildConversationTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return '新对话';
  return normalized.length > 18 ? `${normalized.slice(0, 18)}…` : normalized;
}
