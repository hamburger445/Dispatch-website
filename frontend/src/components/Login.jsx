import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="cad-brand-mark big">GC</div>
        <h1>Greenville CAD</h1>
        <p className="muted">Multi-Agency Dispatch System</p>
        <label>Username
          <input className="input" autoFocus value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
        </label>
        <label>Password
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="password" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary lg" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <div className="login-hint muted">
          Demo accounts — admin/admin123 · dispatch01/dispatch123 · jdoe/officer123 · fire101/fire123 · med203/ems123
        </div>
      </form>
    </div>
  );
}
