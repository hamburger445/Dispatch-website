import { useState } from 'react';

export default function TrafficStopModal({ unit, onClose, onSave }) {
  const [form, setForm] = useState({ location: '', plate_number: '', vehicle_description: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.location.trim()) {
      setError('Location is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave({ unit_id: unit.id, ...form, location: form.location.trim() });
    } catch (e) {
      setError(e.message || 'Failed to start traffic stop. Restart Start.bat if the server was not restarted after an update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Traffic Stop — {unit?.callsign}</h2>
        <p className="hint">{unit?.officer_name} · {unit?.department}</p>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label className="full">Location *<input className="input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. WIS 15 & County HH" autoFocus onKeyDown={e => e.key === 'Enter' && submit()} /></label>
          <label>Plate Number<input className="input" value={form.plate_number} onChange={e => set('plate_number', e.target.value)} /></label>
          <label>Vehicle Description<input className="input" value={form.vehicle_description} onChange={e => set('vehicle_description', e.target.value)} /></label>
          <label className="full">Notes<textarea className="input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Start Traffic Stop'}</button>
        </div>
      </div>
    </div>
  );
}
