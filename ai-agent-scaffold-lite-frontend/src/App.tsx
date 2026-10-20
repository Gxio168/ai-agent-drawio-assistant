import { useAuth } from './hooks/use-auth';
import LoginPage from './pages/LoginPage';
import Workspace from './pages/Workspace';
import './styles/app.css';

function App() {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <LoginPage onLogin={(username, password) => login(username, password) !== null} />;
  }

  return <Workspace user={user} onLogout={logout} />;
}

export default App;
