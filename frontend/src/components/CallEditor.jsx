import { useState } from 'react';
import { CALL_TYPES, CALL_STATUSES, PRIORITY_LABELS, DEPARTMENTS, formatDateTime, timeSince } from '../constants';

export default function CallEditor({ call, units, onSave, onDelete, onClose, onCancel, onAssign, onUnassign }) {
  const [form, setForm] = useState(null);
  const [assignId, setAssignId] = useState('');

  if (!call) {
    return (
      <div className="panel call-editor empty-editor">
        <p>Select a call from the list or create a new incident.</p>
      </div>
    );
  }

  const f = form || call;
  const set = (k, v) => setForm({ ...call, ...f, [k]: v });

  const save = () => onSave(form || call);

  const available = units.filter(u => !call.assigned_units?.some(a => a.id === u.id));

  return (
    <div className="panel call-editor">
      <div className="panel-top">
        <h2>{call.incident_number}</h2>
        <div className="btn-row">
          <button className="btn primary" onClick={save}>Save</button>
          {!['Closed', 'Cancelled'].includes(f.status) && (
            <>
              <button className="btn success" onClick={() => onClose(call.id)}>Close</button>
              <button className="btn warn" onClick={() => onCancel(call.id)}>Cancel</button>
            </>
          )}
          <button className="btn danger" onClick={() => onDelete(call.id)}>Delete</button>
        </div>
      </div>

      <div className="editor-grid">
        <section className="editor-section">
          <h3>Basic Information</h3>
          <div className="field-row">
            <label>Incident #<input readOnly value={f.incident_number} className="input" /></label>
            <label>Call Type
              <select className="input" value={f.call_type} onChange={e => set('call_type', e.target.value)}>
                {CALL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Priority
              <select className="input" value={f.priority} onChange={e => set('priority', +e.target.value)}>
                {[1,2,3,4,5].map(p => <option key={p} value={p}>{PRIORITY_LABELS[p].label}</option>)}
              </select>
            </label>
            <label>Status
              <select className="input" value={f.status} onChange={e => set('status', e.target.value)}>
                {CALL_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="editor-section">
          <h3>Location</h3>
          <div className="field-row">
            <label className="wide">Address<input className="input" value={f.address} onChange={e => set('address', e.target.value)} /></label>
            <label>Cross Street<input className="input" value={f.cross_street || ''} onChange={e => set('cross_street', e.target.value)} /></label>
            <label>City<input className="input" value={f.city || 'Greenville'} onChange={e => set('city', e.target.value)} /></label>
          </div>
        </section>

        <section className="editor-section">
          <h3>Call Details</h3>
          <textarea className="input textarea-lg" value={f.description || ''} onChange={e => set('description', e.target.value)} placeholder="Enter call details..." />
        </section>

        <section className="editor-section">
          <h3>Dispatcher Notes</h3>
          <textarea className="input textarea-md" value={f.dispatcher_notes || ''} onChange={e => set('dispatcher_notes', e.target.value)} placeholder="Internal dispatcher notes..." />
        </section>

        <section className="editor-section">
          <h3>Assigned Units</h3>
          <div className="assign-row">
            <select className="input" value={assignId} onChange={e => setAssignId(e.target.value)}>
              <option value="">Add unit...</option>
              {available.map(u => <option key={u.id} value={u.id}>{u.callsign} — {u.officer_name} ({u.department})</option>)}
            </select>
            <button className="btn secondary" disabled={!assignId} onClick={() => { onAssign(call.id, assignId); setAssignId(''); }}>Assign</button>
          </div>
          <table className="cad-table compact">
            <thead><tr><th>Callsign</th><th>Officer</th><th>Dept</th><th>Status</th><th>Assigned</th><th></th></tr></thead>
            <tbody>
              {(call.assigned_units || []).map(u => (
                <tr key={u.id}>
                  <td className="mono fw">{u.callsign}</td>
                  <td>{u.officer_name}</td>
                  <td>{u.department}</td>
                  <td>{u.status}</td>
                  <td className="muted">{timeSince(u.assigned_at)} ago</td>
                  <td><button className="btn-xs" onClick={() => onUnassign(call.id, u.id)}>Remove</button></td>
                </tr>
              ))}
              {!call.assigned_units?.length && <tr><td colSpan={6} className="empty">No units assigned</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
