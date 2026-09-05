import { useState } from 'react';
import Select from './Select';

export default function NewCallModal({ units, fleet = [], callTypes = [], onClose, onSave }) {
  const [form, setForm] = useState({
    call_type: 'Other', priority: 3,
    address: '', cross_street: '', city: 'Greenville',
    description: '', dispatcher_notes: '',
  });
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [selectedFleet, setSelectedFleet] = useState([]);
  const [pickId, setPickId] = useState('');
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const available = units.filter(u => !selectedUnits.some(s => s.id === u.id));
  const availableFleet = fleet.filter(u => !selectedFleet.some(s => s.id === u.id) && !u.call_id);

  const addUnit = () => {
    const u = [...units, ...fleet].find(x => x.id === pickId);
    if (!u) return;
    if (u.agency_type && u.agency_type !== 'law') setSelectedFleet(s => [...s, u]);
    else setSelectedUnits(s => [...s, u]);
    setPickId('');
    setError('');
  };

  const submit = () => {
    onSave({
      ...form,
      unit_ids: selectedUnits.map(u => u.id),
      fleet_ids: selectedFleet.map(u => u.id),
    });
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
              options={[...new Set([...callTypes.map(c => c.name), form.call_type])].map(t => ({ value: t, label: t }))}
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
          <h3>Assign Units <span className="hint-inline">LE units are marked 10-97; Fire/EMS units are set Responding</span></h3>
          <div className="assign-row">
            <Select
              value={pickId}
              onChange={setPickId}
              placeholder="Select unit to add..."
              options={[
                ...available.map(u => ({ value: u.id, label: `LE · ${u.callsign} — ${u.officer_name} (${u.department})` })),
                ...availableFleet.map(u => ({ value: u.id, label: `${u.agency_type === 'fire' ? 'Fire' : 'EMS'} · ${u.callsign} — ${u.name || u.type}` })),
              ]}
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
            {selectedFleet.map(u => (
              <span key={u.id} className="unit-chip">
                {u.agency_type === 'fire' ? 'Fire' : 'EMS'} · {u.callsign}
                <button type="button" onClick={() => setSelectedFleet(s => s.filter(x => x.id !== u.id))}>×</button>
              </span>
            ))}
            {!selectedUnits.length && !selectedFleet.length && <span className="muted">No units added yet — you can assign later</span>}
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
