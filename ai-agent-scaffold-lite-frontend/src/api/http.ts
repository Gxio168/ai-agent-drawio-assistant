import { API_BASE_URL, REQUEST_TIMEOUT, RESPONSE_CODE_INFO, SUCCESS_CODE } from '../config/api-config';
import type { ApiErrorShape, ApiResponse } from '../models/api';

/** 业务/网络异常统一封装 */
export class ApiError extends Error {
  /** 业务错误码；非业务异常时为 TIMEOUT / NETWORK_ERROR / HTTP_xxx 等 */
  readonly code: string;
  /** HTTP 状态码，网络异常时为 0 */
  readonly status: number;

  constructor(message: string, code = 'UNKNOWN', status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** 与 models/api.ts 的 ApiErrorShape 对齐 */
  toShape(): ApiErrorShape {
    return { code: this.code, info: this.message, status: this.status };
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  /** GET 查询参数 */
  query?: Record<string, string | number | undefined>;
  /** POST 请求体 */
  body?: unknown;
  /** 0 表示不超时 */
  timeout?: number;
}

/** 把业务码翻译成可读信息 */
function describeCode(code: string, info: string): string {
  const fallback = RESPONSE_CODE_INFO[code];
  if (info && fallback && info !== fallback) return `${info}（${code}）`;
  if (info) return `${info}（${code}）`;
  return fallback ? `${fallback}（${code}）` : `接口返回异常（${code}）`;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * 统一请求方法：负责超时、JSON 解析、后端 Response<T> 拆包与错误归一化。
 * 返回值直接是 Response<T>.data，失败时抛出 ApiError。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, timeout = REQUEST_TIMEOUT } = options;

  const controller = new AbortController();
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : undefined;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(`请求超时，请检查后端服务是否已启动（${API_BASE_URL}）`, 'TIMEOUT');
    }
    throw new ApiError(
      '无法连接后端服务，请确认 ai-agent-scaffold-lite 已在 localhost:8091 启动',
      'NETWORK_ERROR',
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw new ApiError(
      `接口请求失败：HTTP ${response.status}${raw ? ` - ${raw.slice(0, 200)}` : ''}`,
      `HTTP_${response.status}`,
      response.status,
    );
  }

  let payload: ApiResponse<T>;
  try {
    payload = JSON.parse(raw) as ApiResponse<T>;
  } catch {
    throw new ApiError(`接口返回内容不是合法 JSON：${raw.slice(0, 200)}`, 'INVALID_JSON', response.status);
  }

  if (payload.code !== SUCCESS_CODE) {
    throw new ApiError(
      describeCode(payload.code, payload.info),
      payload.code,
      response.status,
    );
  }

  if (payload.data === null || payload.data === undefined) {
    throw new ApiError('接口返回数据为空', 'EMPTY_DATA', response.status);
  }

  return payload.data;
}
