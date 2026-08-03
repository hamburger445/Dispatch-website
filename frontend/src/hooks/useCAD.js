import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from '../constants';

export function useCAD() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const notify = useCallback((n) => {
    const id = Date.now() + Math.random();
    setNotifications(p => [...p.slice(-4), { ...n, id }]);
    setTimeout(() => setNotifications(p => p.filter(x => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    api('GET', '/state').then(setState).catch(console.error);
    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state:update', setState);
    socket.on('notification', notify);
    return () => socket.disconnect();
  }, [notify]);

  const setTheme = useCallback(async (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.colorScheme = theme;
    await api('PUT', '/settings', { theme });
  }, []);

  return { state, connected, notifications, setTheme, notify };
}
