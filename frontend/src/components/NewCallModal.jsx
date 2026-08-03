import { useState } from 'react';
import { CALL_TYPES } from '../constants';
import Select from './Select';

export default function NewCallModal({ units, onClose, onSave }) {
  const [form, setForm] = useState({
    call_type: 'Other', priority: 3,
    address: '', cross_street: '', city: 'Greenville',
    description: '', dispatcher_notes: '',
  });
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [pickId, setPickId] = useState('');
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const available = units.filter(u => !selectedUnits.some(s => s.id === u.id));

  const addUnit = () => {
    const u = units.find(x => x.id === pickId);
    if (u) {
      setSelectedUnits(s => [...s, u]);
      setPickId('');
      setError('');
    }
  };

  const submit = () => {
    if (!selectedUnits.length) {
      setError('Add at least one unit to this call.');
      return;
    }
    onSave({ ...form, unit_ids: selectedUnits.map(u => u.id) });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <h2>New Incident</h2>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          <label>Call Type
            <Select
              value={form.call_type}
              onChange={(v) => set('call_type', v)}
              options={CALL_TYPES.map(t => ({ value: t, label: t }))}
            />
          </label>
          <label>Priority
            <Select
              value={form.priority}
              onChange={(v) => set('priority', +v)}
              options={[1, 2, 3, 4, 5].map(p => ({ value: p, label: `P${p}` }))}
            />
          </label>
          <label className="wide">Address<input className="input" value={form.address} onChange={e => set('address', e.target.value)} /></label>
          <label>Cross Street<input className="input" value={form.cross_street} onChange={e => set('cross_street', e.target.value)} /></label>
          <label>City<input className="input" value={form.city} onChange={e => set('city', e.target.value)} /></label>
          <label className="full">Description<textarea className="input textarea-lg" value={form.description} onChange={e => set('description', e.target.value)} /></label>
        </div>

        <section className="assign-section">
          <h3>Assign Units * <span className="hint-inline">Units are marked 10-97 on scene</span></h3>
          <div className="assign-row">
            <Select
              value={pickId}
              onChange={setPickId}
              placeholder="Select unit to add..."
              options={available.map(u => ({
                value: u.id,
                label: `${u.callsign} — ${u.officer_name} (${u.department})`,
              }))}
            />
            <button type="button" className="btn secondary" disabled={!pickId} onClick={addUnit}>Add Unit</button>
          </div>
          <div className="unit-chips">
            {selectedUnits.map(u => (
              <span key={u.id} className="unit-chip">
                {u.callsign} — {u.officer_name}
                <button type="button" onClick={() => setSelectedUnits(s => s.filter(x => x.id !== u.id))}>×</button>
              </span>
            ))}
            {!selectedUnits.length && <span className="muted">No units added yet</span>}
          </div>
        </section>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Create Call</button>
        </div>
      </div>
    </div>
  );
}
