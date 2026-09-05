import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { api, PRIORITY_LABELS, timeSince, formatDateTime, getStatusColor } from '../constants';
import Select from './Select';
import Timeline from './Timeline';

const AGENCY_LABEL = { law: 'Law Enforcement', fire: 'Fire/Rescue', ems: 'EMS' };

const LAW_STATUSES = ['10-8', '10-7', '10-6', '10-97', 'On Scene', 'Traffic Stop', 'Transporting', '10-15', 'Report Writing', 'Returning'];
const FIRE_STATUSES = ['Available', 'In Quarters', 'Responding', 'On Scene', 'Returning', 'Out of Service', 'Transporting', 'At Hospital'];
const EMS_STATUSES = ['Available', 'At Station', 'Responding', 'On Scene', 'Transporting', 'At Hospital', 'Returning', 'Out of Service'];

const LAW_STEPS = ['Assigned', 'En Route', 'On Scene', 'Cleared'];
const FLEET_STEPS = ['Responding', 'On Scene', 'Transporting', 'Returning', 'Available'];

function isAssignedTo(call, unit) {
  if (!call || !unit) return false;
  if (unit.agency_type) return call.assigned_fleet?.some(u => u.id === unit.id) || call.id === unit.call_id;
  return call.assigned_units?.some(u => u.id === unit.id);
}

function PriorityBadge({ priority }) {
  const p = PRIORITY_LABELS[priority] || PRIORITY_LABELS[3];
  return (
    <span className="pri-tag" style={{ background: p.color }} title={p.detail}>
      {p.label}
    </span>
  );
}

function CallCard({ call, selected, assigned, onClick }) {
  const units = [...(call.assigned_units || []), ...(call.assigned_fleet || [])];
  return (
    <button type="button" className={`call-mini${selected ? ' selected' : ''}${assigned ? ' active' : ''}`} onClick={onClick}>
      <div className="call-mini-top">
        <span className="fw mono">{call.incident_number}</span>
        <PriorityBadge priority={call.priority} />
        <span className={`status-tag st-${call.status}`}>{call.status}</span>
      </div>
      <div className="fw">{call.call_type}</div>
      <div>{call.address || 'No address'}{call.city ? `, ${call.city}` : ''}</div>
      <div className="muted">
        {units.map(u => u.callsign).join(', ') || 'No units'} · {timeSince(call.created_at)} ago
      </div>
    </button>
  );
}

export default function Portal({ state, connected, notify, officerNotes, onDismissNote }) {
  const { user, unit, logout, refresh } = useAuth();
  const [view, setView] = useState('dashboard');
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });

  const agencyType = user?.agency_type || 'law';
  const statuses = agencyType === 'fire' ? FIRE_STATUSES : agencyType === 'ems' ? EMS_STATUSES : LAW_STATUSES;
  const myUnitId = unit?.id;

  const myCalls = useMemo(() => {
    if (!unit) return [];
    return state.calls.filter(c => !['Closed', 'Cancelled'].includes(c.status) && isAssignedTo(c, unit));
  }, [state.calls, unit]);

  const availableCalls = useMemo(
    () => state.calls.filter(c => !['Closed', 'Cancelled'].includes(c.status)),
    [state.calls]
  );

  const selectedCall = state.calls.find(c => c.id === selectedCallId) || myCalls[0] || null;

  const roster = useMemo(() => {
    const law = state.units.map(u => ({ ...u, agency_type: 'law' }));
    const fleet = (state.fleet || []).map(f => ({
      ...f,
      officer_name: (f.crew || []).map(c => c.name).join(', ') || '—',
    }));
    const allUnits = [...law, ...fleet];
    if (agencyType === 'law') return allUnits;
    return allUnits.filter(u => u.agency_type === agencyType || u.agency_type === 'law');
  }, [state.units, state.fleet, agencyType]);

  const setStatus = async (status) => {
    try {
      await api('POST', '/my/status', { status });
      await refresh();
      notify({ type: 'info', message: `Status set: ${status}` });
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  const setCallStatus = async (call, status) => {
    if (!unit?.id || !call) return;
    try {
      if (unit.agency_type) await api('POST', `/fleet/${unit.id}/call-status`, { status });
      else await api('POST', '/my/call-status', { call_id: call.id, status });
      await refresh();
      notify({ type: 'info', message: `${unit.callsign} — ${status}` });
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  const changePassword = async () => {
    try {
      await api('POST', '/auth/change-password', pw);
      setPw({ current: '', next: '' });
      notify({ type: 'info', message: 'Password updated' });
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  if (!user) return null;
  const current = myCalls[0];
  const liveUnit = unit?.agency_type
    ? (state.fleet || []).find(f => f.id === myUnitId) || unit
    : (state.units || []).find(u => u.id === myUnitId) || unit;

  const nav = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'mine', label: 'My Calls' },
    { id: 'available', label: 'Available Calls' },
    { id: 'units', label: 'Active Units' },
    { id: 'profile', label: 'Profile' },
  ];

  return (
    <div className="cad-app officer-app">
      <aside className="cad-sidebar">
        <div className="cad-brand">
          <div className="cad-brand-mark">GC</div>
          <div>
            <strong>Officer Portal</strong>
            <span>{user.agency_name || AGENCY_LABEL[agencyType]}</span>
          </div>
        </div>
        <nav className="cad-nav">
          {nav.map(n => (
            <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}>
              {n.label}
              {n.id === 'mine' && myCalls.length ? <span className="nav-count">{myCalls.length}</span> : null}
            </button>
          ))}
          <button onClick={logout}>Logout</button>
        </nav>
        <div className="cad-sidebar-stats">
          <h4>{user.name}</h4>
          <div className="mini-stat"><span>Callsign</span><b className="mono">{user.callsign || '—'}</b></div>
          <div className="mini-stat"><span>Status</span><b>{liveUnit?.status || '—'}</b></div>
          <div className="mini-stat"><span>Assignment</span><b className="mono">{liveUnit?.current_call || 'None'}</b></div>
          <div className={`conn-pill${connected ? ' ok' : ''}`}>{connected ? '● LIVE' : '○ RECONNECTING'}</div>
        </div>
      </aside>

      <main className="cad-main officer-main">
        {officerNotes?.length > 0 && (
          <div className="officer-alerts">
            {officerNotes.map(n => (
              <div key={n.id} className={`officer-alert alert-${n.type || 'info'}`}>
                <div>
                  <strong>{n.title || 'Notification'}</strong>
                  <p>{n.message}</p>
                </div>
                <button className="btn-xs" onClick={() => onDismissNote(n.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        )}

        {view === 'dashboard' && (
          <div className="officer-dash">
            <section className="panel">
              <div className="panel-top"><h2>Officer Information</h2></div>
              <div className="officer-id">
                <h1>{user.name}</h1>
                <div className="portal-meta">
                  {user.badge && <span className="pill">Badge #{user.badge}</span>}
                  {user.rank && <span className="pill">{user.rank}</span>}
                  {user.callsign && <span className="pill mono">{user.callsign}</span>}
                  {user.department_name && <span className="pill">{user.department_name}</span>}
                  {user.station_name && <span className="pill">{user.station_name}</span>}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-top"><h2>Current Status</h2></div>
              {liveUnit ? (
                <div className="portal-status">
                  <div className="status-big" style={{ color: getStatusColor(liveUnit.status) }}>{liveUnit.status}</div>
                  <p className="muted">{liveUnit.current_call ? `Assigned: ${liveUnit.current_call} — ${liveUnit.current_call_type || ''}` : 'No current assignment'}</p>
                  <Select
                    value=""
                    onChange={setStatus}
                    placeholder="Change status..."
                    options={statuses.map(s => ({ value: s, label: s }))}
                  />
                </div>
              ) : (
                <p className="muted">No unit linked to this account. Contact an administrator.</p>
              )}
            </section>

            <section className="panel">
              <div className="panel-top"><h2>Current Assignment</h2></div>
              {current ? (
                <CallCard call={current} assigned onClick={() => { setSelectedCallId(current.id); setView('mine'); }} />
              ) : <p className="muted">You are not assigned to a call.</p>}
            </section>

            <section className="panel">
              <div className="panel-top"><h2>Active Calls</h2></div>
              <div className="scroll-list">
                {availableCalls.slice(0, 8).map(c => (
                  <CallCard
                    key={c.id}
                    call={c}
                    assigned={isAssignedTo(c, unit)}
                    onClick={() => { setSelectedCallId(c.id); setView('available'); }}
                  />
                ))}
                {!availableCalls.length && <p className="muted">No active calls.</p>}
              </div>
            </section>
          </div>
        )}

        {view === 'mine' && (
          <div className="officer-split">
            <section className="panel">
              <div className="panel-top"><h2>My Calls</h2></div>
              <div className="scroll-list tall">
                {myCalls.map(c => (
                  <CallCard key={c.id} call={c} assigned selected={c.id === selectedCall?.id} onClick={() => setSelectedCallId(c.id)} />
                ))}
                {!myCalls.length && <p className="muted">No calls assigned to you.</p>}
              </div>
            </section>
            <CallDetail call={selectedCall && isAssignedTo(selectedCall, unit) ? selectedCall : myCalls[0]} unit={liveUnit} agencyType={agencyType} onStatus={setCallStatus} />
          </div>
        )}

        {view === 'available' && (
          <div className="officer-split">
            <section className="panel">
              <div className="panel-top"><h2>Available Calls</h2></div>
              <div className="scroll-list tall">
                {availableCalls.map(c => (
                  <CallCard key={c.id} call={c} selected={c.id === selectedCallId} assigned={isAssignedTo(c, unit)} onClick={() => setSelectedCallId(c.id)} />
                ))}
                {!availableCalls.length && <p className="muted">No active calls.</p>}
              </div>
            </section>
            <CallDetail
              call={selectedCall}
              unit={liveUnit}
              agencyType={agencyType}
              onStatus={isAssignedTo(selectedCall, unit) ? setCallStatus : null}
              readOnly={!isAssignedTo(selectedCall, unit)}
            />
          </div>
        )}

        {view === 'units' && (
          <section className="panel officer-full">
            <div className="panel-top"><h2>Active Units</h2></div>
            <div className="table-scroll">
              <table className="cad-table">
                <thead>
                  <tr><th>Callsign</th><th>Officer</th><th>Department</th><th>Status</th><th>Current Call</th></tr>
                </thead>
                <tbody>
                  {roster.map(u => (
                    <tr key={(u.agency_type || 'law') + u.id}>
                      <td className="mono fw">{u.callsign}</td>
                      <td>{u.officer_name || u.name || '—'}</td>
                      <td>{u.department || u.department_code || AGENCY_LABEL[u.agency_type] || '—'}</td>
                      <td>
                        <span className="status-dot" style={{ background: getStatusColor(u.status) }} /> {u.status}
                      </td>
                      <td className="mono">{u.current_call || 'None'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'profile' && (
          <section className="panel officer-full">
            <div className="panel-top"><h2>Profile</h2></div>
            <div className="form-grid">
              <label>Name<input className="input" readOnly value={user.name} /></label>
              <label>Username<input className="input" readOnly value={user.username} /></label>
              <label>Badge<input className="input" readOnly value={user.badge || '—'} /></label>
              <label>Rank<input className="input" readOnly value={user.rank || '—'} /></label>
              <label>Callsign<input className="input" readOnly value={user.callsign || '—'} /></label>
              <label>Department<input className="input" readOnly value={user.department_name || '—'} /></label>
              <label>Agency<input className="input" readOnly value={user.agency_name || '—'} /></label>
              <label>Last login<input className="input" readOnly value={user.last_login ? formatDateTime(user.last_login) : '—'} /></label>
            </div>
            <h3 className="sub-head">Change password</h3>
            <div className="form-grid">
              <label>Current password<input className="input" type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></label>
              <label>New password<input className="input" type="password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></label>
            </div>
            <div className="modal-foot">
              <button className="btn primary" disabled={!pw.current || pw.next.length < 6} onClick={changePassword}>Update Password</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CallDetail({ call, unit, agencyType, onStatus, readOnly }) {
  if (!call) {
    return (
      <section className="panel call-editor empty-editor">
        <p>Select a call to view details.</p>
      </section>
    );
  }
  const units = [...(call.assigned_units || []), ...(call.assigned_fleet || [])];
  const p = PRIORITY_LABELS[call.priority] || PRIORITY_LABELS[3];
  const steps = agencyType === 'law' ? LAW_STEPS : FLEET_STEPS;

  return (
    <section className="panel call-editor">
      <div className="panel-top">
        <h2>{call.incident_number}</h2>
        <div className="btn-row">
          <PriorityBadge priority={call.priority} />
          <span className={`status-tag st-${call.status}`}>{call.status}</span>
        </div>
      </div>
      <div className="editor-grid">
        <p className="muted">{p.detail}</p>
        <div><b>{call.call_type}</b></div>
        <div>{call.address || 'No address'}{call.cross_street ? ` / ${call.cross_street}` : ''}{call.city ? `, ${call.city}` : ''}</div>
        <p>{call.description || 'No description.'}</p>
        <p>Assigned: {units.map(u => `${u.callsign}${u.officer_name ? ` (${u.officer_name})` : ''}`).join(', ') || 'None'}</p>
        <p className="muted">Created {formatDateTime(call.created_at)}</p>
        {onStatus && !readOnly && unit && (
          <div className="btn-row">
            {steps.map(s => (
              <button key={s} className="btn secondary" onClick={() => onStatus(call, s)}>{s}</button>
            ))}
          </div>
        )}
        {readOnly && <p className="muted">Call information is read-only. Status updates are available after a dispatcher assigns you.</p>}
        <h3>Incident Timeline</h3>
        <Timeline timeline={call.timeline} />
      </div>
    </section>
  );
}
