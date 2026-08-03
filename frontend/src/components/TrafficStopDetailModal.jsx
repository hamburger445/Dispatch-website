import { useState } from 'react';
import { formatDateTime } from '../constants';

export default function TrafficStopDetailModal({ stop, units, onClose, onAddUnit }) {
  const [pickId, setPickId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const onStop = stop.units || [];
  const onStopIds = new Set(onStop.map(u => u.id));
  const available = units.filter(u => !onStopIds.has(u.id));

  const addUnit = async () => {
    if (!pickId) return;
    setError('');
    setSaving(true);
    try {
      await onAddUnit(stop.id, pickId);
      setPickId('');
    } catch (e) {
      setError(e.message || 'Failed to add unit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <h2>Traffic Stop</h2>
        <p className="hint">{stop.location} · Started {formatDateTime(stop.started_at)}</p>
        {error && <div className="form-error">{error}</div>}

        <div className="form-grid">
          <label>Plate<input className="input" readOnly value={stop.plate_number || '—'} /></label>
          <label>Vehicle<input className="input" readOnly value={stop.vehicle_description || '—'} /></label>
        </div>

        <section className="assign-section">
          <h3>Units on Stop</h3>
          <div className="unit-chips">
            {onStop.map(u => (
              <span key={u.id} className="unit-chip">{u.callsign} — {u.officer_name}</span>
            ))}
            {!onStop.length && <span className="muted">No units</span>}
          </div>
        </section>

        <section className="assign-section">
          <h3>Add Unit <span className="hint-inline">Unit is marked Traffic Stop</span></h3>
          <div className="assign-row">
            <select className="input" value={pickId} onChange={e => setPickId(e.target.value)} disabled={saving}>
              <option value="">Select unit to add...</option>
              {available.map(u => (
                <option key={u.id} value={u.id}>{u.callsign} — {u.officer_name} ({u.department})</option>
              ))}
            </select>
            <button type="button" className="btn secondary" disabled={!pickId || saving} onClick={addUnit}>
              {saving ? 'Adding...' : 'Add Unit'}
            </button>
          </div>
        </section>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
