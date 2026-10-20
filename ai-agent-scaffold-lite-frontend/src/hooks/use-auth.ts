import { useCallback, useState } from 'react';
import {
  clearAuthAndAppState,
  readAuthUser,
  saveAuthUser,
  verifyCredentials,
} from '../config/auth-config';
import type { User } from '../models';

interface UseAuthResult {
  user: User | null;
  login: (username: string, password: string) => User | null;
  logout: () => void;
}

/**
 * 登录态管理：初始化时从 localStorage 恢复，避免刷新页面重新登录
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(() => readAuthUser());

  const login = useCallback((username: string, password: string): User | null => {
    const matched = verifyCredentials(username, password);
    if (!matched) return null;

    saveAuthUser(matched);
    setUser(matched);
    return matched;
  }, []);

  const logout = useCallback(() => {
    clearAuthAndAppState();
    setUser(null);
  }, []);

  return { user, login, logout };
}
