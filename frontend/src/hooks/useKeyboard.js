import { useState, useEffect } from 'react';

export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handler = (e) => {
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        const combo = `ctrl+${key}`;
        if (shortcuts[combo]) {
          e.preventDefault();
          shortcuts[combo]();
        }
      } else if (shortcuts[key] && !e.target.matches('input, textarea, select')) {
        shortcuts[key]();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
