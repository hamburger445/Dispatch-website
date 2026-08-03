import { useState } from 'react';
import { DEPARTMENTS, UNIT_STATUSES, CUSTOM_STATUS_OPTION, isPresetStatus } from '../constants';

export default function UnitModal({ unit, onClose, onSave, onDelete }) {
  const initialCustom = unit?.status && !isPresetStatus(unit.status);
  const [useCustomStatus, setUseCustomStatus] = useState(initialCustom);
  const [customStatus, setCustomStatus] = useState(initialCustom ? unit.status : '');
  const [form, setForm] = useState({
    callsign: unit?.callsign || '',
    officer_name: unit?.officer_name || '',
    department: unit?.department || 'WSP',
    vehicle: unit?.vehicle || '',
    status: initialCustom ? '10-8' : (unit?.status || '10-8'),
    notes: unit?.notes || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    const status = useCustomStatus ? customStatus.trim() : form.status;
    if (useCustomStatus && !status) return;
    onSave({ ...form, status: status || '10-8' });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{unit ? `Edit Unit ${unit.callsign}` : 'Add Unit'}</h2>
        <div className="form-grid">
          <label>Callsign<input className="input" value={form.callsign} onChange={e => set('callsign', e.target.value)} /></label>
          <label>Officer Name<input className="input" value={form.officer_name} onChange={e => set('officer_name', e.target.value)} /></label>
          <label>Department
            <select className="input" value={form.department} onChange={e => set('department', e.target.value)}>
              {Object.entries(DEPARTMENTS).map(([k, v]) => <option key={k} value={k}>{k} — {v.name}</option>)}
            </select>
          </label>
          <label>Vehicle<input className="input" value={form.vehicle} onChange={e => set('vehicle', e.target.value)} /></label>
          <label>Status
            <select
              className="input"
              value={useCustomStatus ? CUSTOM_STATUS_OPTION : form.status}
              onChange={e => {
                if (e.target.value === CUSTOM_STATUS_OPTION) {
                  setUseCustomStatus(true);
                  setCustomStatus('');
                } else {
                  setUseCustomStatus(false);
                  set('status', e.target.value);
                }
              }}
            >
              {UNIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              <option value={CUSTOM_STATUS_OPTION}>Custom...</option>
            </select>
          </label>
          {useCustomStatus && (
            <label className="full">Custom status
              <input
                className="input"
                value={customStatus}
                onChange={e => setCustomStatus(e.target.value)}
                placeholder="Enter any status text"
              />
            </label>
          )}
          <label className="full">Notes<textarea className="input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        </div>
        <div className="modal-foot">
          {onDelete && <button className="btn danger" onClick={onDelete}>Remove</button>}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save Unit</button>
        </div>
      </div>
    </div>
  );
}
