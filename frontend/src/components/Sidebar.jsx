import { useState, useEffect } from 'react';

const NAV = [
  { id: 'dispatch', label: 'Dispatch', icon: '📡' },
  { id: 'calls', label: 'All Calls', icon: '📞' },
  { id: 'units', label: 'Units', icon: '🚔' },
  { id: 'traffic', label: 'Traffic Stops', icon: '🛑' },
  { id: 'activity', label: 'Activity Log', icon: '📋' },
];

export default function Sidebar({ view, setView, stats, onReports }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="cad-sidebar">
      <div className="cad-brand">
        <div className="cad-brand-mark">GC</div>
        <div>
          <strong>Greenville CAD</strong>
          <span>Dispatch Console</span>
        </div>
      </div>

      <div className="cad-clock">
        <time>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        <span>{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>

      <nav className="cad-nav">
        {NAV.map(n => (
          <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}>
            <span>{n.icon}</span> {n.label}
          </button>
        ))}
        <button onClick={onReports}><span>📊</span> Reports</button>
      </nav>

      <div className="cad-sidebar-stats">
        <h4>Status Board</h4>
        <div className="mini-stat"><span>Active Calls</span><b>{stats.activeCalls}</b></div>
        <div className="mini-stat"><span>Pending</span><b>{stats.pendingCalls}</b></div>
        <div className="mini-stat"><span>Closed</span><b>{stats.closedCalls}</b></div>
        <div className="mini-stat"><span>Online Units</span><b>{stats.onlineUnits}</b></div>
        <div className="mini-stat"><span>Available</span><b className="c-green">{stats.availableUnits}</b></div>
        <div className="mini-stat"><span>Busy</span><b className="c-amber">{stats.busyUnits}</b></div>
      </div>
    </aside>
  );
}
