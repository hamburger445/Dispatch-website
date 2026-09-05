const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { run, get, all, logActivity, getFleetWithCalls } = require('../database');
const {
  requireAuth, requireRole, sign,
  loginAllowed, recordLoginFailure, clearLoginFailures,
} = require('../auth');
const {
  DEFAULT_RANKS, DEFAULT_UNIT_STATUSES, APPARATUS_TYPES, EMS_UNIT_TYPES, addTimeline,
  ensureLawUnitForUser, usersLinkedToUnit,
} = require('../multiAgency');

const router = express.Router();

const now = () => new Date().toISOString();

function userPublic(u) {
  if (!u) return null;
  const agency = u.agency_id ? get('SELECT * FROM agencies WHERE id = ?', [u.agency_id]) : null;
  const department = u.department_id ? get('SELECT * FROM departments WHERE id = ?', [u.department_id]) : null;
  const station = u.station_id ? get('SELECT * FROM stations WHERE id = ?', [u.station_id]) : null;
  let unit = null;
  if (u.unit_id) {
    unit = get('SELECT id, callsign, unit_number, name, type, agency_type, status, crew, call_id, station_id FROM fleet WHERE id = ?', [u.unit_id]);
    if (unit && typeof unit.crew === 'string') {
      try { unit.crew = JSON.parse(unit.crew || '[]'); } catch { unit.crew = []; }
    }
  }
  return {
    id: u.id, username: u.username, name: u.name, role: u.role,
    agency_id: u.agency_id, agency_type: agency?.type || null, agency_name: agency?.name || null,
    department_id: u.department_id, department_code: department?.code || null, department_name: department?.name || null,
    station_id: u.station_id, station_name: station?.name || null, station_number: station?.number || null,
    badge: u.badge, rank: u.rank, callsign: u.callsign, unit, must_change_password: !!u.must_change_password,
    account_status: u.account_status || 'active', status: u.status || null, last_login: u.last_login || null,
  };
}

function findUnitForUser(u) {
  if (!u) return null;
  const agency = u.agency_id ? get('SELECT * FROM agencies WHERE id = ?', [u.agency_id]) : null;
  let unit = null;
  if (agency?.type === 'law' || !u.unit_id || (u.callsign && !agency?.type)) {
    if (u.unit_id) unit = get('SELECT * FROM units WHERE id = ?', [u.unit_id]);
    if (!unit && u.callsign) unit = get('SELECT * FROM units WHERE callsign = ?', [u.callsign]);
  }
  if (!unit && u.unit_id) unit = get('SELECT * FROM fleet WHERE id = ?', [u.unit_id]);
  if (!unit && u.callsign && u.department_id && (agency?.type === 'fire' || agency?.type === 'ems')) {
    unit = get('SELECT * FROM fleet WHERE callsign = ? AND department_id = ?', [u.callsign, u.department_id]);
  }
  if (unit && typeof unit.crew === 'string') {
    try { unit.crew = JSON.parse(unit.crew || '[]'); } catch { unit.crew = []; }
  }
  if (unit && !unit.agency_type && agency?.type === 'law') {
    const call = get(`SELECT c.incident_number, c.call_type FROM calls c
      JOIN call_units cu ON cu.call_id = c.id
      WHERE cu.unit_id = ? AND c.status NOT IN ('Closed', 'Cancelled') LIMIT 1`, [unit.id]);
    unit.current_call = call?.incident_number || null;
    unit.current_call_type = call?.call_type || null;
  }
  return unit;
}

// ---------- AUTH ----------
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = `${req.ip || 'local'}:${String(username || '').trim().toLowerCase()}`;
  if (!loginAllowed(key)) {
    logActivity('Login Failed', 'user', null, `${String(username || '').trim()} (rate limited)`);
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = get('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginFailure(key);
    logActivity('Login Failed', 'user', null, String(username).trim());
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if ((user.account_status || 'active') !== 'active') {
    logActivity('Login Failed', 'user', user.id, `${user.username} (disabled)`);
    return res.status(403).json({ error: 'This account has been disabled' });
  }
  clearLoginFailures(key);
  run('UPDATE users SET last_login = ? WHERE id = ?', [now(), user.id]);
  const token = sign(user);
  logActivity('Login', 'user', user.id, user.username);
  const fresh = get('SELECT * FROM users WHERE id = ?', [user.id]);
  if (fresh?.callsign) ensureLawUnitForUser(fresh);
  res.json({ token, user: userPublic(fresh), unit: findUnitForUser(fresh) });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  logActivity('Logout', 'user', req.auth.id, req.auth.username);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', [req.auth.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if ((user.account_status || 'active') !== 'active') {
    return res.status(403).json({ error: 'This account has been disabled' });
  }
  if (user.role === 'personnel' && user.callsign) ensureLawUnitForUser(user);
  const fresh = get('SELECT * FROM users WHERE id = ?', [user.id]);
  const unit = findUnitForUser(fresh);
  res.json({ user: userPublic(fresh), unit });
});

router.post('/auth/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', [req.auth.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!current || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [bcrypt.hashSync(next, 10), user.id]);
  logActivity('Password Changed', 'user', user.id, user.username);
  res.json({ ok: true });
});

// ---------- REFERENCE DATA ----------
router.get('/meta', requireAuth, (req, res) => {
  res.json({
    agencies: all('SELECT * FROM agencies ORDER BY name'),
    departments: all('SELECT * FROM departments ORDER BY code'),
    stations: all('SELECT * FROM stations ORDER BY number'),
    call_types: all('SELECT * FROM call_types ORDER BY agency_type, name'),
    ranks: DEFAULT_RANKS,
    unit_statuses: DEFAULT_UNIT_STATUSES,
    apparatus_types: APPARATUS_TYPES,
    ems_unit_types: EMS_UNIT_TYPES,
  });
});

// ---------- PERSONNEL: my status ----------
router.post('/my/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Status required' });
  const user = get('SELECT * FROM users WHERE id = ?', [req.auth.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const unit = findUnitForUser(user) || (user.callsign ? ensureLawUnitForUser(user) : null);
  if (!unit) return res.status(404).json({ error: 'No unit linked to this account' });

  if (unit.agency_type) {
    run('UPDATE fleet SET status = ? WHERE id = ?', [status, unit.id]);
  } else {
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', [status, now(), now(), unit.id]);
  }
  run('UPDATE users SET status = ? WHERE id = ?', [status, user.id]);
  logActivity('Status Changed (portal)', 'unit', unit.id, `${unit.callsign} → ${status}`);
  const io = req.app.get('io');
  const { getDashboardStats, getUnitsWithCalls, getCallsWithUnits, getTrafficStops, getFleetWithCalls } = require('../database');
  const state = {
    stats: getDashboardStats(),
    units: getUnitsWithCalls(),
    calls: getCallsWithUnits(),
    fleet: getFleetWithCalls(),
    agencies: all('SELECT * FROM agencies ORDER BY name'),
    departments: all('SELECT * FROM departments ORDER BY code'),
    stations: all('SELECT * FROM stations ORDER BY number'),
    callTypes: all('SELECT * FROM call_types ORDER BY agency_type, name'),
    trafficStops: getTrafficStops(false),
    activity: all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 150'),
    settings: Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value])),
  };
  if (io) io.emit('state:update', state);
  res.json({ ok: true, unit: findUnitForUser(get('SELECT * FROM users WHERE id = ?', [user.id])), state });
});

const CALL_STEP = {
  Assigned: '10-6',
  'En Route': '10-97',
  'On Scene': 'On Scene',
  Transporting: 'Transporting',
  Cleared: '10-8',
};

router.post('/my/call-status', requireAuth, (req, res) => {
  const { call_id, status } = req.body || {};
  if (!call_id || !status) return res.status(400).json({ error: 'call_id and status are required' });
  const user = get('SELECT * FROM users WHERE id = ?', [req.auth.id]);
  const unit = findUnitForUser(user);
  if (!unit) return res.status(404).json({ error: 'No unit linked to this account' });
  const call = get('SELECT * FROM calls WHERE id = ?', [call_id]);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  const assigned = unit.agency_type
    ? unit.call_id === call_id
    : get('SELECT 1 FROM call_units WHERE call_id = ? AND unit_id = ?', [call_id, unit.id]);
  if (!assigned) return res.status(403).json({ error: 'You are not assigned to this call' });

  const mapped = CALL_STEP[status] || status;
  if (status === 'Cleared') {
    if (unit.agency_type) {
      const def = unit.agency_type === 'fire' ? 'In Quarters' : 'Available';
      run('UPDATE fleet SET call_id = NULL, status = ? WHERE id = ?', [def, unit.id]);
    } else {
      run('DELETE FROM call_units WHERE call_id = ? AND unit_id = ?', [call_id, unit.id]);
      run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', ['10-8', now(), now(), unit.id]);
    }
    run("UPDATE users SET status = '10-8' WHERE id = ?", [user.id]);
    addTimeline(call_id, 'Cleared', `${unit.callsign} cleared the call`);
    logActivity('Officer Cleared', 'call', call_id, `${unit.callsign} cleared ${call.incident_number}`);
  } else {
    if (unit.agency_type) run('UPDATE fleet SET status = ? WHERE id = ?', [mapped, unit.id]);
    else run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', [mapped, now(), now(), unit.id]);
    run('UPDATE users SET status = ? WHERE id = ?', [mapped, user.id]);
    addTimeline(call_id, status, `${unit.callsign} is ${status}`);
    logActivity('Assignment Status', 'call', call_id, `${unit.callsign}: ${status}`);
  }

  const io = req.app.get('io');
  const { getDashboardStats, getUnitsWithCalls, getCallsWithUnits, getTrafficStops, getFleetWithCalls } = require('../database');
  const state = {
    stats: getDashboardStats(),
    units: getUnitsWithCalls(),
    calls: getCallsWithUnits(),
    fleet: getFleetWithCalls(),
    agencies: all('SELECT * FROM agencies ORDER BY name'),
    departments: all('SELECT * FROM departments ORDER BY code'),
    stations: all('SELECT * FROM stations ORDER BY number'),
    callTypes: all('SELECT * FROM call_types ORDER BY agency_type, name'),
    trafficStops: getTrafficStops(false),
    activity: all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 150'),
    settings: Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value])),
  };
  if (io) {
    io.emit('state:update', state);
    io.emit('notification', { type: 'info', message: `${unit.callsign} — ${status} (${call.incident_number})` });
  }
  res.json({ ok: true, state });
});

router.get('/my/notifications', requireAuth, (req, res) => {
  res.json(all('SELECT * FROM officer_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.auth.id]));
});

router.post('/my/notifications/:id/read', requireAuth, (req, res) => {
  run('UPDATE officer_notifications SET read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.auth.id]);
  res.json({ ok: true });
});

router.post('/my/notifications/read-all', requireAuth, (req, res) => {
  run('UPDATE officer_notifications SET read = 1 WHERE user_id = ?', [req.auth.id]);
  res.json({ ok: true });
});

// ---------- FLEET (fire apparatus / EMS units) ----------
router.get('/fleet', requireAuth, (_, res) => res.json(getFleetWithCalls()));

router.post('/fleet', requireRole('admin', 'dispatcher'), (req, res) => {
  const b = req.body || {};
  if (!b.callsign || !b.department_id || !b.agency_type) {
    return res.status(400).json({ error: 'callsign, department_id and agency_type are required' });
  }
  const id = uuidv4();
  run(`INSERT INTO fleet (id, unit_number, callsign, type, agency_type, department_id, station_id, status, crew, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
    [id, b.unit_number || b.callsign, b.callsign, b.type || 'Other', b.agency_type,
      b.department_id, b.station_id || null, b.status || 'Available', now()]);
  logActivity('Fleet Unit Added', 'unit', id, `${b.callsign} (${b.agency_type})`);
  res.json(getFleetWithCalls());
});

router.put('/fleet/:id', requireRole('admin', 'dispatcher'), (req, res) => {
  const fleet = get('SELECT * FROM fleet WHERE id = ?', [req.params.id]);
  if (!fleet) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const fields = ['unit_number', 'callsign', 'type', 'agency_type', 'department_id', 'station_id', 'status', 'crew', 'call_id'];
  const updates = {};
  fields.forEach(f => {
    if (b[f] !== undefined) updates[f] = f === 'crew' ? JSON.stringify(b[f]) : b[f];
  });
  const keys = Object.keys(updates);
  if (keys.length) {
    run(`UPDATE fleet SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), fleet.id]);
  }
  logActivity('Fleet Unit Updated', 'unit', fleet.id, fleet.callsign);
  res.json(getFleetWithCalls());
});

router.delete('/fleet/:id', requireRole('admin'), (req, res) => {
  const fleet = get('SELECT * FROM fleet WHERE id = ?', [req.params.id]);
  if (!fleet) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM fleet WHERE id = ?', [fleet.id]);
  logActivity('Fleet Unit Removed', 'unit', fleet.id, fleet.callsign);
  res.json(getFleetWithCalls());
});

// ---------- ADMIN: users ----------
router.get('/admin/users', requireRole('admin'), (_, res) => {
  res.json(all('SELECT * FROM users ORDER BY username').map(u => {
    const { password_hash, ...rest } = u;
    return { ...userPublic(rest), agency_type: userPublic(rest).agency_type };
  }));
});

router.post('/admin/users', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.password || !b.name) {
    return res.status(400).json({ error: 'username, password and name are required' });
  }
  if (get('SELECT id FROM users WHERE username = ?', [b.username])) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const id = uuidv4();
  run(`INSERT INTO users (id, username, password_hash, name, role, agency_id, department_id, station_id, badge, rank, callsign, unit_id, must_change_password, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, String(b.username).trim(), bcrypt.hashSync(b.password, 10), b.name,
      b.role || 'personnel', b.agency_id || null, b.department_id || null, b.station_id || null,
      b.badge || '', b.rank || '', b.callsign || '', b.unit_id || null, now()]);
  if (b.account_status) run('UPDATE users SET account_status = ? WHERE id = ?', [b.account_status, id]);
  logActivity('User Created', 'user', id, `${b.username} (${b.role || 'personnel'})`);
  const created = get('SELECT * FROM users WHERE id = ?', [id]);
  if (created?.role === 'personnel') ensureLawUnitForUser(created);
  const refreshed = get('SELECT * FROM users WHERE id = ?', [id]);
  const { password_hash, ...rest } = refreshed;
  res.json(userPublic(rest));
});

router.put('/admin/users/:id', requireRole('admin'), (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  const fields = ['name', 'role', 'agency_id', 'department_id', 'station_id', 'badge', 'rank', 'callsign', 'unit_id', 'must_change_password', 'account_status'];
  const updates = {};
  fields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f]; });
  if (b.password) {
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    updates.password_hash = bcrypt.hashSync(b.password, 10);
  }
  const keys = Object.keys(updates);
  if (keys.length) {
    run(`UPDATE users SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), user.id]);
  }
  logActivity('User Updated', 'user', user.id, user.username);
  const updated = get('SELECT * FROM users WHERE id = ?', [user.id]);
  if (updated?.role === 'personnel' && updated.callsign) ensureLawUnitForUser(updated);
  const refreshed = get('SELECT * FROM users WHERE id = ?', [user.id]);
  const { password_hash, ...rest } = refreshed;
  res.json(userPublic(rest));
});

router.delete('/admin/users/:id', requireRole('admin'), (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin' && (all("SELECT id FROM users WHERE role = 'admin'").length <= 1)) {
    return res.status(400).json({ error: 'Cannot remove the last administrator' });
  }
  run('DELETE FROM users WHERE id = ?', [user.id]);
  logActivity('User Deleted', 'user', user.id, user.username);
  res.json({ ok: true });
});

// ---------- ADMIN: agencies / departments / stations / call types ----------
router.post('/admin/agencies', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !['law', 'fire', 'ems'].includes(b.type)) {
    return res.status(400).json({ error: 'name and type (law|fire|ems) are required' });
  }
  const id = uuidv4();
  run('INSERT INTO agencies (id, name, type, color, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, b.name, b.type, b.color || '#3b82f6', now()]);
  logActivity('Agency Created', 'agency', id, b.name);
  res.json({ ok: true, id });
});

router.put('/admin/agencies/:id', requireRole('admin'), (req, res) => {
  const agency = get('SELECT * FROM agencies WHERE id = ?', [req.params.id]);
  if (!agency) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const fields = ['name', 'type', 'color'];
  const updates = {};
  fields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f]; });
  const keys = Object.keys(updates);
  if (keys.length) run(`UPDATE agencies SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), agency.id]);
  logActivity('Agency Updated', 'agency', agency.id, agency.name);
  res.json({ ok: true });
});

router.delete('/admin/agencies/:id', requireRole('admin'), (req, res) => {
  const agency = get('SELECT * FROM agencies WHERE id = ?', [req.params.id]);
  if (!agency) return res.status(404).json({ error: 'Not found' });
  const used = get('SELECT 1 as x FROM users WHERE agency_id = ? LIMIT 1', [agency.id])
    || get('SELECT 1 as x FROM departments WHERE agency_id = ? LIMIT 1', [agency.id]);
  if (used) return res.status(400).json({ error: 'Agency still has departments or users' });
  run('DELETE FROM agencies WHERE id = ?', [agency.id]);
  logActivity('Agency Deleted', 'agency', agency.id, agency.name);
  res.json({ ok: true });
});

router.post('/admin/departments', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name || !b.agency_id) return res.status(400).json({ error: 'code, name and agency_id are required' });
  if (get('SELECT id FROM departments WHERE code = ?', [b.code])) return res.status(400).json({ error: 'Department code already exists' });
  const id = uuidv4();
  run('INSERT INTO departments (id, code, name, agency_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, b.code, b.name, b.agency_id, now()]);
  logActivity('Department Created', 'department', id, b.name);
  res.json({ ok: true, id });
});

router.delete('/admin/departments/:id', requireRole('admin'), (req, res) => {
  const dep = get('SELECT * FROM departments WHERE id = ?', [req.params.id]);
  if (!dep) return res.status(404).json({ error: 'Not found' });
  const used = get('SELECT 1 as x FROM users WHERE department_id = ? LIMIT 1', [dep.id])
    || get('SELECT 1 as x FROM fleet WHERE department_id = ? LIMIT 1', [dep.id])
    || get('SELECT 1 as x FROM stations WHERE department_id = ? LIMIT 1', [dep.id]);
  if (used) return res.status(400).json({ error: 'Department still has users, stations or units' });
  run('DELETE FROM departments WHERE id = ?', [dep.id]);
  logActivity('Department Deleted', 'department', dep.id, dep.name);
  res.json({ ok: true });
});

router.post('/admin/stations', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.department_id) return res.status(400).json({ error: 'name and department_id are required' });
  const id = uuidv4();
  run('INSERT INTO stations (id, number, name, department_id, location, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, b.number || '', b.name, b.department_id, b.location || '', now()]);
  logActivity('Station Created', 'station', id, b.name);
  res.json({ ok: true, id });
});

router.put('/admin/stations/:id', requireRole('admin'), (req, res) => {
  const station = get('SELECT * FROM stations WHERE id = ?', [req.params.id]);
  if (!station) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const fields = ['number', 'name', 'department_id', 'location'];
  const updates = {};
  fields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f]; });
  const keys = Object.keys(updates);
  if (keys.length) run(`UPDATE stations SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), station.id]);
  logActivity('Station Updated', 'station', station.id, station.name);
  res.json({ ok: true });
});

router.delete('/admin/stations/:id', requireRole('admin'), (req, res) => {
  const station = get('SELECT * FROM stations WHERE id = ?', [req.params.id]);
  if (!station) return res.status(404).json({ error: 'Not found' });
  const used = get('SELECT 1 as x FROM fleet WHERE station_id = ? LIMIT 1', [station.id])
    || get('SELECT 1 as x FROM users WHERE station_id = ? LIMIT 1', [station.id]);
  if (used) return res.status(400).json({ error: 'Station still has units or personnel' });
  run('DELETE FROM stations WHERE id = ?', [station.id]);
  logActivity('Station Deleted', 'station', station.id, station.name);
  res.json({ ok: true });
});

router.post('/admin/call-types', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  const id = uuidv4();
  run('INSERT INTO call_types (id, name, agency_type, created_at) VALUES (?, ?, ?, ?)',
    [id, b.name, b.agency_type || 'dispatch', now()]);
  logActivity('Call Type Created', 'call_type', id, b.name);
  res.json({ ok: true, id });
});

router.delete('/admin/call-types/:id', requireRole('admin'), (req, res) => {
  const ct = get('SELECT * FROM call_types WHERE id = ?', [req.params.id]);
  if (!ct) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM call_types WHERE id = ?', [ct.id]);
  logActivity('Call Type Deleted', 'call_type', ct.id, ct.name);
  res.json({ ok: true });
});

// ---------- ADMIN: audit log ----------
router.get('/admin/audit', requireRole('admin'), (req, res) => {
  res.json(all('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', [parseInt(req.query.limit) || 500]));
});

module.exports = router;
