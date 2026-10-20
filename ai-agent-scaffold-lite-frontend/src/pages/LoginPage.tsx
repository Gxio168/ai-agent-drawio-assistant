import { useState } from 'react';
import { MOCK_CREDENTIALS } from '../config/auth-config';
import { API_BASE_URL, BACKEND_ORIGIN } from '../config/api-config';
import './login.css';

interface LoginPageProps {
  onLogin: (username: string, password: string) => boolean;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }

    if (!onLogin(username, password)) {
      setError('账号或密码错误（演示账号：admin / admin）');
      return;
    }
    setError(null);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">AI 流程图助手</h1>
        <p className="login-subtitle">登录后即可使用智能体对话，并自动生成 draw.io 图形</p>

        <label className="login-field">
          <span>账号</span>
          <input
            type="text"
            value={username}
            autoComplete="username"
            placeholder={MOCK_CREDENTIALS.username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleLogin();
            }}
          />
        </label>

        <label className="login-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder={MOCK_CREDENTIALS.password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleLogin();
            }}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="button" className="login-btn" onClick={handleLogin}>
          登录
        </button>

        <div className="login-tip">
          演示账号：{MOCK_CREDENTIALS.username} / {MOCK_CREDENTIALS.password}
          <br />
          登录后使用固定 userId = 1 调用后端接口
          <br />
          接口基地址：{API_BASE_URL}（后端 {BACKEND_ORIGIN}）
        </div>
      </div>
    </div>
  );
}
