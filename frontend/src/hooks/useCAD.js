import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from '../constants';
import { useAuth } from '../auth';

export function useCAD() {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [officerNotes, setOfficerNotes] = useState([]);

  const notify = useCallback((n) => {
    const id = n.id || Date.now() + Math.random();
    setNotifications(p => [...p.slice(-4), { ...n, id }]);
    setTimeout(() => setNotifications(p => p.filter(x => x.id !== id)), n.sticky ? 12000 : 5000);
  }, []);

  const dismissNote = useCallback(async (id) => {
    setOfficerNotes(p => p.filter(n => n.id !== id));
    try { await api('POST', `/my/notifications/${id}/read`); } catch {}
  }, []);

  useEffect(() => {
    if (!user) {
      setState(null);
      setConnected(false);
      setOfficerNotes([]);
      return;
    }

    let socket;
    let cancelled = false;

    api('GET', '/state').then(s => { if (!cancelled) setState(s); }).catch((e) => {
      if (String(e.message || '').includes('401') || String(e.message || '').includes('disabled')) {
        localStorage.removeItem('cad_token');
      }
    });

    if (user.role === 'personnel') {
      api('GET', '/my/notifications').then(rows => {
        if (!cancelled) setOfficerNotes((rows || []).filter(n => !n.read));
      }).catch(() => {});
    }

    const token = localStorage.getItem('cad_token');
    socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      setConnected(true);
      if (token) socket.emit('auth', token);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state:update', (s) => {
      if (user.role === 'personnel' && s?.calls) {
        setState({ ...s, calls: s.calls.map(({ dispatcher_notes, ...c }) => c) });
      } else setState(s);
    });
    socket.on('notification', notify);
    socket.on('officer:notification', (n) => {
      setOfficerNotes(p => [n, ...p.filter(x => x.id !== n.id)].slice(0, 20));
      notify({ type: n.type === 'assignment' ? 'call' : (n.type || 'info'), message: n.message, sticky: true });
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [user?.id, user?.role, notify]);

  const setTheme = useCallback(async (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.colorScheme = theme;
    await api('PUT', '/settings', { theme });
  }, []);

  return { state, connected, notifications, setTheme, notify, officerNotes, dismissNote };
}
