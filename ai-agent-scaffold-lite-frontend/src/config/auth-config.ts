import { STORAGE_KEYS, readStorage, removeStorage, writeStorage } from '../utils/storage';
import type { User } from '../models';

/**
 * 登录凭证配置
 *
 * 后端 ai-agent-scaffold-lite 当前未提供登录接口，
 * 因此前端采用 mock 登录：admin / admin 通过后写入固定的 userId = 1，
 * 后续所有接口（create_session、chat）都以该 userId 作为参数。
 */
export const MOCK_CREDENTIALS = {
  username: 'admin',
  password: 'admin',
} as const;

/** mock 登录成功后落在 localStorage 里的用户信息 */
export const MOCK_USER: User = {
  userId: 1,
  username: MOCK_CREDENTIALS.username,
  displayName: 'admin',
  avatarText: 'A',
};

/** 校验登录信息并返回用户对象，失败返回 null */
export function verifyCredentials(username: string, password: string): User | null {
  const matched =
    username.trim() === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password;
  return matched ? { ...MOCK_USER } : null;
}

/** 读取本地登录态 */
export function readAuthUser(): User | null {
  const cached = readStorage<User | null>(STORAGE_KEYS.auth, null);
  if (!cached || typeof cached.userId !== 'number' || !cached.username) return null;
  return cached;
}

/** 持久化登录态，刷新页面后仍保持登录 */
export function saveAuthUser(user: User): void {
  writeStorage(STORAGE_KEYS.auth, user);
}

/**
 * 退出登录：只清理本应用的存储键，不整体清空 localStorage
 */
export function clearAuthAndAppState(): void {
  removeStorage(STORAGE_KEYS.auth);
  removeStorage(STORAGE_KEYS.conversations);
  removeStorage(STORAGE_KEYS.activeConversation);
  removeStorage(STORAGE_KEYS.selectedAgent);
}
