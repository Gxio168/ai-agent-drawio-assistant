import { STORAGE_KEYS } from '../config/storage-config';

export { STORAGE_KEYS };

/** localStorage 单键软上限（约 2M 字符），避免把浏览器配额用满 */
export const STORAGE_SOFT_LIMIT = 2_000_000;

/** 读取并反序列化，解析失败时回退到默认值 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 序列化写入；写入失败（隐私模式/超配额）时返回 false */
export function writeStorage(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

interface HasMessageHistory {
  messages: unknown[];
  lastDiagramXml?: string;
}

/**
 * 让写入适配 localStorage 配额：
 * - 先直接写；
 * - 超过软上限或写入失败时开始裁剪最旧的消息（保留画布 XML，它比聊天记录更值钱）；
 * - 极端情况下再丢弃画布 XML 并只保留最近若干条消息。
 *
 * 返回实际写入的数据，便于调用方同步内存状态。
 */
export function writeStorageWithTrim<T>(
  key: string,
  data: T[],
  limit = STORAGE_SOFT_LIMIT,
): T[] {
  if (writeStorage(key, data) && JSON.stringify(data).length <= limit) {
    return data;
  }

  const list = data as unknown as HasMessageHistory[];
  const total = list.reduce((sum, item) => sum + (item.messages?.length ?? 0), 0);
  if (total === 0) {
    // 没有可裁剪的内容，尽量写一次并接受结果
    writeStorage(key, data);
    return data;
  }

  const maxKeep = 40;
  let low = 1;
  let high = Math.min(total, maxKeep);
  let best = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = list.map((item) => ({
      ...item,
      messages: (item.messages ?? []).slice(-mid),
    })) as unknown as T[];

    const ok = writeStorage(key, candidate) && JSON.stringify(candidate).length <= limit;
    if (ok) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const trimmed = (list.map((item) => ({
    ...item,
    messages: (item.messages ?? []).slice(-best),
  })) as unknown as T[]);

  if (!writeStorage(key, trimmed) || JSON.stringify(trimmed).length > limit) {
    // 还是太大：丢掉画布 XML，只保留最近的消息
    const slim = (list.map((item) => ({
      ...item,
      messages: (item.messages ?? []).slice(-best),
      lastDiagramXml: undefined,
    })) as unknown as T[]);
    writeStorage(key, slim);
    return slim;
  }

  return trimmed;
}
