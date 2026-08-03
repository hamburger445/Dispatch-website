import { DEPARTMENTS, getStatusColor, timeSince } from '../constants';
import UnitsPanel from './UnitsPanel';
import ActivityPanel from './ActivityPanel';

function ActiveCallsSummary({ calls, onSelectCall }) {
  const active = calls.filter(c => !['Closed', 'Cancelled'].includes(c.status)).slice(0, 8);

  return (
    <div className="panel right-summary">
      <div className="panel-top"><h2>Active Calls</h2></div>
      <div className="summary-list">
        {active.map(c => (
          <button key={c.id} type="button" className="summary-item" onClick={() => onSelectCall?.(c.id)}>
            <span className="mono fw">{c.incident_number}</span>
            <span className="summary-meta">{c.call_type}</span>
            <span className="summary-meta truncate">{c.address || 'No address'}</span>
          </button>
        ))}
        {!active.length && <p className="empty">No active calls</p>}
      </div>
    </div>
  );
}

function TrafficSummary({ stops, onSelectStop }) {
  const active = (stops || []).filter(s => !s.cleared_at).slice(0, 6);

  return (
    <div className="panel right-summary">
      <div className="panel-top"><h2>Active Stops</h2></div>
      <div className="summary-list">
        {active.map(s => (
          <button key={s.id} type="button" className="summary-item" onClick={() => onSelectStop?.(s)}>
            <span className="mono fw">{(s.units || []).map(u => u.callsign).join(', ') || '—'}</span>
            <span className="summary-meta truncate">{s.location}</span>
          </button>
        ))}
        {!active.length && <p className="empty">No active traffic stops</p>}
      </div>
    </div>
  );
}

function UnitSnapshot({ units }) {
  const byDept = Object.keys(DEPARTMENTS).map(dept => ({
    dept,
    count: units.filter(u => u.department === dept && u.status !== '10-7').length,
  }));

  return (
    <div className="panel right-summary">
      <div className="panel-top"><h2>Unit Snapshot</h2></div>
      <div className="snapshot-grid">
        {byDept.map(({ dept, count }) => (
          <div key={dept} className="snapshot-cell">
            <span className="dept-tag" style={{ background: DEPARTMENTS[dept]?.color }}>{dept}</span>
            <b>{count}</b>
          </div>
        ))}
      </div>
      <div className="summary-list compact">
        {units.filter(u => u.status !== '10-8' && u.status !== '10-7').slice(0, 6).map(u => (
          <div key={u.id} className="summary-row">
            <span className="mono fw">{u.callsign}</span>
            <span className="status-dot" style={{ background: getStatusColor(u.status) }} />
            <span className="summary-meta">{u.status}</span>
            <span className="muted">{timeSince(u.status_changed_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RightSidebar({
  view,
  state,
  onEditUnit,
  onStatusChange,
  onTrafficStop,
  onSelectCall,
  onSelectStop,
}) {
  return (
    <>
      {view === 'traffic' && (
        <TrafficSummary stops={state.trafficStops} onSelectStop={onSelectStop} />
      )}
      {view === 'calls' && (
        <ActiveCallsSummary calls={state.calls} onSelectCall={onSelectCall} />
      )}
      {(view === 'units' || view === 'activity') && (
        <UnitSnapshot units={state.units} />
      )}
      <UnitsPanel
        units={state.units}
        compact
        onEdit={onEditUnit}
        onStatusChange={onStatusChange}
        onTrafficStop={onTrafficStop}
      />
      <ActivityPanel entries={state.activity} />
    </>
  );
}
