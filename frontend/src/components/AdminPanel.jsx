import { useEffect, useState } from 'react';
import { api } from '../constants';
import Select from './Select';

export default function AdminPanel({ state, onClose, notify }) {
  const [tab, setTab] = useState('users');
  const [meta, setMeta] = useState(null);

  const loadMeta = () => api('GET', '/meta').then(setMeta).catch(e => notify({ type: 'error', message: e.message }));
  useEffect(() => { loadMeta(); }, []);

  const tabs = [
    ['users', 'Users'], ['agencies', 'Agencies & Departments'], ['stations', 'Stations'],
    ['fleet', 'Units / Apparatus'], ['calltypes', 'Call Types'], ['audit', 'Audit Log'],
  ];

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal admin-modal" onClick={e => e.stopPropagation()}>
        <div className="panel-top">
          <h2>Administration</h2>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <div className="admin-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="admin-body">
          {tab === 'users' && <UsersTab meta={meta} fleet={state?.fleet || []} notify={notify} />}
          {tab === 'agencies' && <AgenciesTab meta={meta} reload={loadMeta} notify={notify} />}
          {tab === 'stations' && <StationsTab meta={meta} reload={loadMeta} notify={notify} />}
          {tab === 'fleet' && <FleetTab meta={meta} notify={notify} />}
          {tab === 'calltypes' && <CallTypesTab meta={meta} reload={loadMeta} notify={notify} />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ meta, fleet, notify }) {
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api('GET', '/admin/users').then(setUsers).catch(e => notify({ type: 'error', message: e.message }));
  useEffect(() => { load(); }, []);

  const agencyType = edit?.agency_id ? meta?.agencies.find(a => a.id === edit.agency_id)?.type : null;

  const save = async (data) => {
    try {
      if (edit.id) await api('PUT', `/admin/users/${edit.id}`, data);
      else await api('POST', '/admin/users', data);
      setEdit(null);
      load();
      notify({ type: 'info', message: 'User saved' });
    } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete user ${u.username}?`)) return;
    try { await api('DELETE', `/admin/users/${u.id}`); load(); } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  return (
    <div>
      <div className="panel-top"><h3>User Accounts</h3>
        <button className="btn primary" onClick={() => setEdit({})}>+ New User</button>
      </div>
      <div className="table-scroll">
        <table className="cad-table compact">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Agency</th><th>Dept</th><th>Rank</th><th>Badge/Callsign</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td>
                <td>{u.name}</td>
                <td>{u.role}</td>
                <td>{u.agency_name || '—'}</td>
                <td>{u.department_code || '—'}</td>
                <td>{u.rank || '—'}</td>
                <td className="mono">{[u.badge, u.callsign].filter(Boolean).join(' / ') || '—'}</td>
                <td>
                  <button className="btn-xs" onClick={() => setEdit(u)}>Edit</button>{' '}
                  <button className="btn-xs danger" onClick={() => remove(u)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && <UserForm edit={edit} meta={meta} fleet={fleet} agencyType={agencyType} onCancel={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function UserForm({ edit, meta, fleet, agencyType, onCancel, onSave }) {
  const [f, setF] = useState({
    username: edit.username || '', password: '', name: edit.name || '',
    role: edit.role || 'personnel', agency_id: edit.agency_id || '',
    department_id: edit.department_id || '', station_id: edit.station_id || '',
    badge: edit.badge || '', rank: edit.rank || '', callsign: edit.callsign || '',
    unit_id: edit.unit_id || '',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const departments = (meta?.departments || []).filter(d => !f.agency_id || d.agency_id === f.agency_id);
  const stations = (meta?.stations || []).filter(s => !f.department_id || s.department_id === f.department_id);
  const unitsForDept = fleet.filter(u => !f.department_id || u.department_id === f.department_id);
  const ranks = meta?.ranks?.[agencyType || 'law'] || [];

  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{edit.id ? `Edit ${edit.username}` : 'Create User'}</h3>
        <div className="form-grid">
          <label>Username<input className="input" value={f.username} disabled={!!edit.id} onChange={e => set('username', e.target.value)} /></label>
          <label>{edit.id ? 'Reset Password (optional)' : 'Password'}
            <input className="input" type="password" value={f.password} onChange={e => set('password', e.target.value)} placeholder={edit.id ? 'Leave blank to keep' : ''} />
          </label>
          <label>Full Name<input className="input" value={f.name} onChange={e => set('name', e.target.value)} /></label>
          <label>Role
            <Select value={f.role} onChange={v => set('role', v)} options={['personnel', 'dispatcher', 'admin'].map(r => ({ value: r, label: r }))} />
          </label>
          <label>Agency
            <Select value={f.agency_id} onChange={v => { set('agency_id', v); set('department_id', ''); set('station_id', ''); set('unit_id', ''); }}
              options={[{ value: '', label: '— None (Dispatch/Admin) —' }, ...(meta?.agencies || []).map(a => ({ value: a.id, label: `${a.name} (${a.type})` }))]} />
          </label>
          <label>Department
            <Select value={f.department_id} onChange={v => { set('department_id', v); set('station_id', ''); }}
              options={[{ value: '', label: '— None —' }, ...departments.map(d => ({ value: d.id, label: `${d.code} — ${d.name}` }))]} />
          </label>
          {agencyType === 'law' && (
            <>
              <label>Badge #<input className="input" value={f.badge} onChange={e => set('badge', e.target.value)} /></label>
              <label>Callsign<input className="input" value={f.callsign} onChange={e => set('callsign', e.target.value)} placeholder="e.g. WSP-101" /></label>
            </>
          )}
          {(agencyType === 'fire' || agencyType === 'ems') && (
            <>
              <label>Station
                <Select value={f.station_id} onChange={v => set('station_id', v)}
                  options={[{ value: '', label: '— None —' }, ...stations.map(s => ({ value: s.id, label: `Station ${s.number} — ${s.name}` }))]} />
              </label>
              <label>Unit
                <Select value={f.unit_id} onChange={v => set('unit_id', v)}
                  options={[{ value: '', label: '— None —' }, ...unitsForDept.map(u => ({ value: u.id, label: `${u.callsign} — ${u.name || u.type}` }))]} />
              </label>
            </>
          )}
          <label>Rank
            <Select value={f.rank} onChange={v => set('rank', v)}
              options={[{ value: '', label: '— None —' }, ...ranks.map(r => ({ value: r, label: r })), { value: '__custom__', label: 'Other...' }]} />
          </label>
          {f.rank === '__custom__' && <label className="full">Custom Rank<input className="input" onChange={e => set('rank', e.target.value)} /></label>}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(f)}>Save User</button>
        </div>
      </div>
    </div>
  );
}

function AgenciesTab({ meta, reload, notify }) {
  const [f, setF] = useState({ name: '', type: 'law', color: '#3b82f6' });
  const [dep, setDep] = useState({ code: '', name: '', agency_id: '' });

  const call = async (p, fn) => { try { await fn(); p(); } catch (e) { notify({ type: 'error', message: e.message }); } };
  const refresh = () => { reload(); setF({ name: '', type: 'law', color: '#3b82f6' }); setDep({ code: '', name: '', agency_id: '' }); };

  return (
    <div className="admin-cols">
      <section>
        <h3>Agencies</h3>
        <table className="cad-table compact">
          <thead><tr><th>Name</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {(meta?.agencies || []).map(a => (
              <tr key={a.id}>
                <td style={{ borderLeft: `3px solid ${a.color}` }}>{a.name}</td>
                <td>{a.type}</td>
                <td><button className="btn-xs danger" onClick={() => call(refresh, () => api('DELETE', `/admin/agencies/${a.id}`))}>Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-grid">
          <label>Agency Name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Type
            <Select value={f.type} onChange={v => setF({ ...f, type: v })} options={['law', 'fire', 'ems'].map(t => ({ value: t, label: t }))} />
          </label>
          <button className="btn secondary" disabled={!f.name} onClick={() => call(refresh, () => api('POST', '/admin/agencies', f))}>Add Agency</button>
        </div>
      </section>
      <section>
        <h3>Departments</h3>
        <table className="cad-table compact">
          <thead><tr><th>Code</th><th>Name</th><th>Agency</th><th></th></tr></thead>
          <tbody>
            {(meta?.departments || []).map(d => (
              <tr key={d.id}>
                <td className="mono">{d.code}</td><td>{d.name}</td>
                <td>{meta?.agencies?.find(a => a.id === d.agency_id)?.name || '—'}</td>
                <td><button className="btn-xs danger" onClick={() => call(refresh, () => api('DELETE', `/admin/departments/${d.id}`))}>Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-grid">
          <label>Code<input className="input" value={dep.code} onChange={e => setDep({ ...dep, code: e.target.value.toUpperCase() })} /></label>
          <label>Name<input className="input" value={dep.name} onChange={e => setDep({ ...dep, name: e.target.value })} /></label>
          <label>Agency
            <Select value={dep.agency_id} onChange={v => setDep({ ...dep, agency_id: v })}
              options={[{ value: '', label: 'Select...' }, ...(meta?.agencies || []).map(a => ({ value: a.id, label: a.name }))]} />
          </label>
          <button className="btn secondary" disabled={!dep.code || !dep.name || !dep.agency_id}
            onClick={() => call(refresh, () => api('POST', '/admin/departments', dep))}>Add Department</button>
        </div>
      </section>
    </div>
  );
}

function StationsTab({ meta, reload, notify }) {
  const [f, setF] = useState({ number: '', name: '', department_id: '', location: '' });
  const refresh = () => { reload(); setF({ number: '', name: '', department_id: '', location: '' }); };
  const call = async (fn) => { try { await fn(); refresh(); } catch (e) { notify({ type: 'error', message: e.message }); } };

  return (
    <div>
      <h3>Stations</h3>
      <table className="cad-table compact">
        <thead><tr><th>Number</th><th>Name</th><th>Department</th><th>Location</th><th></th></tr></thead>
        <tbody>
          {(meta?.stations || []).map(s => (
            <tr key={s.id}>
              <td className="mono">{s.number}</td><td>{s.name}</td>
              <td>{meta?.departments?.find(d => d.id === s.department_id)?.code || '—'}</td>
              <td>{s.location || '—'}</td>
              <td><button className="btn-xs danger" onClick={() => call(() => api('DELETE', `/admin/stations/${s.id}`))}>Del</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form-grid">
        <label>Station #<input className="input" value={f.number} onChange={e => setF({ ...f, number: e.target.value })} /></label>
        <label>Name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>Department
          <Select value={f.department_id} onChange={v => setF({ ...f, department_id: v })}
            options={[{ value: '', label: 'Select...' }, ...(meta?.departments || []).map(d => ({ value: d.id, label: d.code }))]} />
        </label>
        <label>Location<input className="input" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
        <button className="btn secondary" disabled={!f.name || !f.department_id}
          onClick={() => call(() => api('POST', '/admin/stations', f))}>Add Station</button>
      </div>
    </div>
  );
}

function FleetTab({ state, notify }) {
  const [f, setF] = useState({ callsign: '', unit_number: '', name: '', type: 'Engine', agency_type: 'fire', department_id: '', station_id: '' });
  const types = f.agency_type === 'fire'
    ? ['Engine', 'Ladder', 'Rescue', 'Tanker', 'Battalion', 'Brush', 'Utility', 'Chief', 'Marine', 'Other']
    : ['Ambulance', 'Rescue', 'Supervisor', 'Medic', 'Other'];

  const call = async (fn) => { try { await fn(); } catch (e) { notify({ type: 'error', message: e.message }); } };
  const fleet = state?.fleet || [];
  const deps = (state?.departments || []).filter(d => {
    const ag = (state?.agencies || []).find(a => a.id === d.agency_id);
    return ag && ag.type === f.agency_type;
  });

  return (
    <div>
      <h3>Fire Apparatus & EMS Units</h3>
      <table className="cad-table compact">
        <thead><tr><th>Callsign</th><th>Name</th><th>Type</th><th>Agency</th><th>Dept</th><th>Station</th><th>Status</th><th>Call</th><th></th></tr></thead>
        <tbody>
          {fleet.map(u => (
            <tr key={u.id}>
              <td className="mono fw">{u.callsign}</td>
              <td>{u.name || u.unit_number}</td>
              <td>{u.type}</td>
              <td>{u.agency_type === 'fire' ? 'Fire' : 'EMS'}</td>
              <td>{u.department_code}</td>
              <td>{u.station_name || '—'}</td>
              <td>{u.status}</td>
              <td className="mono">{u.current_call || '—'}</td>
              <td>
                <button className="btn-xs" onClick={() => {
                  const name = window.prompt(`Set crew for ${u.callsign} (comma-separated "Rank Name")`, (u.crew || []).map(c => `${c.rank || ''} ${c.name}`.trim()).join(', '));
                  if (name === null) return;
                  const crew = name.split(',').map(s => s.trim()).filter(Boolean).map(s => {
                    const parts = s.split(' ');
                    const known = ['Firefighter', 'Engineer', 'Lieutenant', 'Captain', 'Battalion Chief', 'Fire Chief', 'EMT', 'Paramedic', 'Supervisor', 'EMS Chief'];
                    if (parts.length > 1 && known.includes(parts[0])) return { rank: parts[0], name: parts.slice(1).join(' ') };
                    return { rank: '', name: s };
                  });
                  call(() => api('PUT', `/fleet/${u.id}`, { crew }));
                }}>Crew</button>{' '}
                <button className="btn-xs danger" onClick={() => call(() => api('DELETE', `/fleet/${u.id}`))}>Del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form-grid">
        <label>Agency Type
          <Select value={f.agency_type} onChange={v => setF({ ...f, agency_type: v, type: v === 'fire' ? 'Engine' : 'Ambulance' })}
            options={[{ value: 'fire', label: 'Fire' }, { value: 'ems', label: 'EMS' }]} />
        </label>
        <label>Callsign<input className="input" value={f.callsign} onChange={e => setF({ ...f, callsign: e.target.value })} placeholder="e.g. E-3 or A-7" /></label>
        <label>Name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Engine 3" /></label>
        <label>Type
          <Select value={f.type} onChange={v => setF({ ...f, type: v })} options={types.map(t => ({ value: t, label: t }))} />
        </label>
        <label>Department
          <Select value={f.department_id} onChange={v => setF({ ...f, department_id: v, station_id: '' })}
            options={[{ value: '', label: 'Select...' }, ...deps.map(d => ({ value: d.id, label: d.code }))]} />
        </label>
        <label>Station
          <Select value={f.station_id} onChange={v => setF({ ...f, station_id: v })}
            options={[{ value: '', label: '— None —' }, ...(state?.stations || []).filter(s => !f.department_id || s.department_id === f.department_id).map(s => ({ value: s.id, label: `Station ${s.number}` }))]} />
        </label>
        <button className="btn secondary" disabled={!f.callsign || !f.department_id}
          onClick={() => call(async () => { await api('POST', '/fleet', { ...f, unit_number: f.unit_number || f.callsign }); setF({ ...f, callsign: '', name: '', unit_number: '' }); })}>
          Add Unit
        </button>
      </div>
    </div>
  );
}

function CallTypesTab({ meta, reload, notify }) {
  const [f, setF] = useState({ name: '', agency_type: 'dispatch' });
  const call = async (fn) => { try { await fn(); reload(); } catch (e) { notify({ type: 'error', message: e.message }); } };
  const grouped = {};
  for (const ct of meta?.call_types || []) (grouped[ct.agency_type] ||= []).push(ct);

  return (
    <div>
      <h3>Call Types</h3>
      <div className="admin-cols">
        {['dispatch', 'law', 'fire', 'ems'].map(t => (
          <section key={t}>
            <h4>{t === 'dispatch' ? 'Dispatch (Master)' : t.toUpperCase()}</h4>
            <ul className="ct-list">
              {(grouped[t] || []).map(ct => (
                <li key={ct.id}>
                  {ct.name}
                  <button className="btn-xs danger" onClick={() => call(() => api('DELETE', `/admin/call-types/${ct.id}`))}>×</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="form-grid">
        <label>New Call Type<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>Applies To
          <Select value={f.agency_type} onChange={v => setF({ ...f, agency_type: v })}
            options={['dispatch', 'law', 'fire', 'ems'].map(t => ({ value: t, label: t }))} />
        </label>
        <button className="btn secondary" disabled={!f.name} onClick={() => call(async () => { await api('POST', '/admin/call-types', f); setF({ ...f, name: '' }); })}>Add</button>
      </div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('GET', '/admin/audit?limit=300').then(setRows).catch(() => {}); }, []);
  return (
    <div className="table-scroll">
      <table className="cad-table compact">
        <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="mono muted">{new Date(r.created_at).toLocaleString('en-US')}</td>
              <td>{r.action}</td>
              <td>{r.entity_type || '—'}</td>
              <td>{r.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
