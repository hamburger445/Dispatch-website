import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [unit, setUnit] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('cad_token')) { setLoading(false); return; }
    try {
      const res = await api('GET', '/auth/me');
      setUser(res.user);
      setUnit(res.unit);
    } catch {
      localStorage.removeItem('cad_token');
      setUser(null);
      setUnit(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    const res = await api('POST', '/auth/login', { username, password });
    localStorage.setItem('cad_token', res.token);
    setUser(res.user);
    await refresh();
    return res.user;
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api('POST', '/auth/logout'); } catch {}
    localStorage.removeItem('cad_token');
    setUser(null);
    setUnit(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, unit, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
