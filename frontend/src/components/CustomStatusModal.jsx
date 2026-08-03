import { useState } from 'react';
import { isPresetStatus } from '../constants';

export default function CustomStatusModal({ unit, onClose, onSave }) {
  const [text, setText] = useState(unit?.status && !isPresetStatus(unit.status) ? unit.status : '');
  const [error, setError] = useState('');

  const submit = () => {
    const value = text.trim();
    if (!value) {
      setError('Enter a status.');
      return;
    }
    onSave(value);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Custom Status</h2>
        <p className="hint">{unit?.callsign} — {unit?.officer_name}</p>
        {error && <div className="form-error">{error}</div>}
        <label className="full">Status text
          <input
            className="input"
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            placeholder="e.g. 10-12, Meal Break, Court..."
            autoFocus
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </label>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Set Status</button>
        </div>
      </div>
    </div>
  );
}
