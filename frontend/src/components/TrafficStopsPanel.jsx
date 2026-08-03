import { useState } from 'react';
import { formatDateTime } from '../constants';
import Select from './Select';

export default function TrafficStopsPanel({ stops = [], units = [], onStart, onClear, onSelectStop }) {
  const [unitId, setUnitId] = useState('');
  const active = stops.filter(s => !s.cleared_at);
  const history = stops.filter(s => s.cleared_at);
  const selected = units.find(u => u.id === unitId);

  const unitLabel = (s) => (s.units?.length
    ? s.units.map(u => u.callsign).join(', ')
    : s.callsign || '—');

  return (
    <div className="panel traffic-panel">
      <div className="panel-top">
        <h2>Traffic Stops</h2>
        <div className="traffic-start-row">
          <Select
            className="traffic-unit-select"
            size="sm"
            value={unitId}
            onChange={setUnitId}
            placeholder="Select unit..."
            options={units.map(u => ({
              value: u.id,
              label: `${u.callsign} — ${u.officer_name} (${u.department})`,
            }))}
          />
          <button
            className="btn primary"
            disabled={!unitId}
            onClick={() => selected && onStart(selected)}
          >
            Start Traffic Stop
          </button>
        </div>
      </div>

      <h3 className="sub-head">Active <span className="hint-inline">Click a stop to add units</span></h3>
      <div className="table-scroll">
        <table className="cad-table">
          <thead><tr><th>Units</th><th>Location</th><th>Plate</th><th>Vehicle</th><th>Started</th><th></th></tr></thead>
          <tbody>
            {active.map(s => (
              <tr key={s.id} className="clickable" onClick={() => onSelectStop?.(s)}>
                <td className="mono fw">{unitLabel(s)}</td>
                <td>{s.location}</td>
                <td>{s.plate_number || '—'}</td>
                <td>{s.vehicle_description || '—'}</td>
                <td>{formatDateTime(s.started_at)}</td>
                <td>
                  <button
                    className="btn-xs success"
                    onClick={e => { e.stopPropagation(); onClear(s.id); }}
                  >
                    Clear (10-8)
                  </button>
                </td>
              </tr>
            ))}
            {!active.length && <tr><td colSpan={6} className="empty">No active traffic stops</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="sub-head">History</h3>
      <div className="table-scroll short">
        <table className="cad-table compact">
          <thead><tr><th>Units</th><th>Location</th><th>Plate</th><th>Started</th><th>Cleared</th></tr></thead>
          <tbody>
            {history.slice(0, 30).map(s => (
              <tr key={s.id}>
                <td className="mono">{unitLabel(s)}</td>
                <td>{s.location}</td>
                <td>{s.plate_number || '—'}</td>
                <td>{formatDateTime(s.started_at)}</td>
                <td>{formatDateTime(s.cleared_at)}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={5} className="empty">No traffic stop history yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
