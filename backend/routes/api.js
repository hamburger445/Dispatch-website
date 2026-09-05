const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  logActivity,
  generateIncidentNumber,
  getDashboardStats,
  getUnitsWithCalls,
  getCallsWithUnits,
  getTrafficStops,
  getFleetWithCalls,
  runMigrations,
  run,
  get,
  all,
} = require('../database');
const { addTimeline, notifyUnitOfficers } = require('../multiAgency');

const router = express.Router();

const API_VERSION = 3;

function emit(io, event, data) {
  if (io) io.emit(event, data);
}

function requireDispatcher(req, res) {
  if (!req.auth || !['dispatcher', 'admin'].includes(req.auth.role)) {
    res.status(403).json({ error: 'Dispatcher or admin permission required' });
    return false;
  }
  return true;
}

router.get('/health', (_, res) => {
  res.json({ ok: true, version: API_VERSION, features: ['traffic-stops', 'calls', 'units', 'reports', 'schema-migrations'] });
});

router.use((req, res, next) => {
  runMigrations();
  next();
});

function fullState() {
  return {
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
}

router.get('/state', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  const state = fullState();
  if (req.auth.role === 'personnel') {
    state.calls = state.calls.map(({ dispatcher_notes, ...call }) => call);
  }
  res.json(state);
});
router.get('/dashboard', (_, res) => res.json({ ...getDashboardStats(), recentActivity: all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 25') }));

router.get('/units', (_, res) => res.json(getUnitsWithCalls()));

router.post('/units', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const now = new Date().toISOString();
  const id = uuidv4();
  const { callsign, officer_name, department, vehicle, status, notes } = req.body;
  run(`INSERT INTO units (id, callsign, officer_name, department, vehicle, status, notes, status_changed_at, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, callsign, officer_name, department, vehicle || '', status || '10-8', notes || '', now, now, now]);
  logActivity('Unit Added', 'unit', id, `${callsign} (${department})`);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.put('/units/:id', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const existing = get('SELECT * FROM units WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const fields = ['callsign', 'officer_name', 'department', 'vehicle', 'status', 'notes'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (updates.status && updates.status !== existing.status) {
    updates.status_changed_at = now;
    logActivity('Status Changed', 'unit', id, `${existing.callsign}: ${existing.status} → ${updates.status}`);
    if (updates.status !== 'Traffic Stop') {
      const active = get('SELECT id FROM traffic_stops WHERE unit_id = ? AND cleared_at IS NULL', [id]);
      if (active) run('UPDATE traffic_stops SET cleared_at = ? WHERE id = ?', [now, active.id]);
    }
  }
  updates.updated_at = now;
  const keys = Object.keys(updates);
  run(`UPDATE units SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), id]);
  logActivity('Unit Updated', 'unit', id, updates.callsign || existing.callsign);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.patch('/units/:id/status', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  if (!['dispatcher', 'admin'].includes(req.auth.role)) {
    return res.status(403).json({ error: 'Dispatcher or admin permission required' });
  }
  const io = req.app.get('io');
  const { id } = req.params;
  const { status } = req.body;
  const existing = get('SELECT * FROM units WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  if (status !== existing.status) {
    if (status !== 'Traffic Stop') {
      const active = get('SELECT id FROM traffic_stops WHERE unit_id = ? AND cleared_at IS NULL', [id]);
      if (active) run('UPDATE traffic_stops SET cleared_at = ? WHERE id = ?', [now, active.id]);
    }
    logActivity('Status Changed', 'unit', id, `${existing.callsign}: ${existing.status} → ${status}`);
  }
  run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?', [status, now, now, id]);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.delete('/units/:id', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const existing = get('SELECT * FROM units WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM call_units WHERE unit_id = ?', [req.params.id]);
  run('DELETE FROM units WHERE id = ?', [req.params.id]);
  logActivity('Unit Removed', 'unit', req.params.id, existing.callsign);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.get('/calls', (_, res) => res.json(getCallsWithUnits()));

router.post('/calls', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  try {
  const io = req.app.get('io');
  const now = new Date().toISOString();
  const id = uuidv4();
  const incident_number = generateIncidentNumber();
  const b = req.body;
  const unitIds = Array.isArray(b.unit_ids) ? b.unit_ids.filter(Boolean) : [];

  if (!unitIds.length && !(Array.isArray(b.fleet_ids) && b.fleet_ids.filter(Boolean).length)) {
    // A call may be created without pre-assigned units; dispatch assigns afterwards.
  }

  for (const unitId of unitIds) {
    if (!get('SELECT id FROM units WHERE id = ?', [unitId])) {
      return res.status(400).json({ error: 'One or more selected units were not found' });
    }
  }

  run(`INSERT INTO calls (id, incident_number, call_type, priority, status, address, cross_street, city, description, dispatcher_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, incident_number, b.call_type, b.priority || 3, 'Active',
      b.address || '', b.cross_street || '', b.city || 'Greenville',
      b.description || '', b.dispatcher_notes || '', now, now]);

  for (const unitId of unitIds) {
    run('INSERT INTO call_units (call_id, unit_id, assigned_at) VALUES (?, ?, ?)', [id, unitId, now]);
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
      ['10-97', now, now, unitId]);
    const unit = get('SELECT * FROM units WHERE id = ?', [unitId]);
    logActivity('Unit Assigned', 'call', id, `${unit?.callsign} → ${incident_number} (10-97)`);
    if (unit) {
      notifyUnitOfficers(io, unit, {
        type: 'assignment',
        title: 'New Assignment',
        message: `You have been assigned to Call ${incident_number}.`,
        call_id: id,
      });
    }
  }

  logActivity('Call Created', 'call', id, `${incident_number} — ${b.call_type}`);
  addTimeline(id, 'Call created', `${b.call_type} — ${b.address || 'No address'}`);
  for (const unitId of unitIds) {
    const u = get('SELECT callsign FROM units WHERE id = ?', [unitId]);
    if (u) addTimeline(id, 'Unit assigned', `${u.callsign} assigned`);
  }
  for (const fleetId of (Array.isArray(b.fleet_ids) ? b.fleet_ids.filter(Boolean) : [])) {
    const f = get('SELECT * FROM fleet WHERE id = ?', [fleetId]);
    if (f) {
      run('UPDATE fleet SET call_id = ?, status = ? WHERE id = ?', [id, 'Responding', fleetId]);
      addTimeline(id, 'Unit assigned', `${f.callsign} (${f.agency_type === 'fire' ? 'Fire' : 'EMS'}) assigned`);
      logActivity('Unit Assigned', 'call', id, `${f.callsign} → ${incident_number} (Responding)`);
      notifyUnitOfficers(io, f, {
        type: 'assignment',
        title: 'New Assignment',
        message: `You have been assigned to Call ${incident_number}.`,
        call_id: id,
      });
    }
  }
  const state = fullState();
  emit(io, 'state:update', state);
  emit(io, 'notification', { type: 'call', message: `New call ${incident_number}` });
  res.json(state);
  } catch (err) {
    console.error('Create call error:', err);
    res.status(500).json({ error: err.message || 'Failed to create call' });
  }
});

router.put('/calls/:id', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const existing = get('SELECT * FROM calls WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const fields = ['call_type', 'priority', 'status', 'address', 'cross_street', 'city', 'description', 'dispatcher_notes'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (updates.status === 'Closed' || updates.status === 'Cancelled') {
    updates.closed_at = now;
    logActivity(updates.status === 'Closed' ? 'Call Closed' : 'Call Cancelled', 'call', id, existing.incident_number);
    const assigned = all('SELECT unit_id FROM call_units WHERE call_id = ?', [id]);
    assigned.forEach(({ unit_id }) => {
      run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
        ['10-8', now, now, unit_id]);
      const u = get('SELECT * FROM units WHERE id = ?', [unit_id]);
      if (u) notifyUnitOfficers(io, u, {
        type: 'info', title: 'Call Closed', message: `${existing.incident_number} has been ${String(updates.status).toLowerCase()}.`, call_id: id,
      });
    });
    run("UPDATE fleet SET status = 'Available', call_id = NULL WHERE call_id = ?", [id]);
    run('DELETE FROM call_units WHERE call_id = ?', [id]);
    addTimeline(id, updates.status, 'Incident ' + String(updates.status).toLowerCase());
  } else {
    logActivity('Call Edited', 'call', id, existing.incident_number);
    if (updates.priority && Number(updates.priority) !== Number(existing.priority)) {
      const assignedUnits = all('SELECT unit_id FROM call_units WHERE call_id = ?', [id]);
      assignedUnits.forEach(({ unit_id }) => {
        const u = get('SELECT * FROM units WHERE id = ?', [unit_id]);
        if (u) notifyUnitOfficers(io, u, {
          type: 'warn',
          title: 'Priority Updated',
          message: `${existing.incident_number} has been changed to Priority ${updates.priority}.`,
          call_id: id,
        });
      });
    }
  }
  updates.updated_at = now;
  const keys = Object.keys(updates);
  run(`UPDATE calls SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => updates[k]), id]);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.delete('/calls/:id', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const existing = get('SELECT * FROM calls WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM call_units WHERE call_id = ?', [req.params.id]);
  run("UPDATE fleet SET status = 'Available', call_id = NULL WHERE call_id = ?", [req.params.id]);
  run('DELETE FROM calls WHERE id = ?', [req.params.id]);
  logActivity('Call Deleted', 'call', req.params.id, existing.incident_number);
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.post('/calls/:id/assign', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const { unit_id } = req.body;
  const call = get('SELECT * FROM calls WHERE id = ?', [id]);
  const unit = get('SELECT * FROM units WHERE id = ?', [unit_id]);
  if (!call || !unit) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
    if (!get('SELECT 1 FROM call_units WHERE call_id = ? AND unit_id = ?', [id, unit_id])) {
    run('INSERT INTO call_units (call_id, unit_id, assigned_at) VALUES (?, ?, ?)', [id, unit_id, now]);
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
      ['10-97', now, now, unit_id]);
    if (call.status === 'Pending') run('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?', ['Active', now, id]);
    logActivity('Unit Assigned', 'call', id, `${unit.callsign} → ${call.incident_number} (10-97)`);
    addTimeline(id, 'Unit assigned', `${unit.callsign} assigned`);
    notifyUnitOfficers(io, unit, {
      type: 'assignment',
      title: 'New Assignment',
      message: `You have been assigned to Call ${call.incident_number}.`,
      call_id: id,
    });
    emit(io, 'notification', { type: 'assignment', message: `${unit.callsign} assigned to ${call.incident_number}` });
  }
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.post('/calls/:id/unassign', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const { unit_id } = req.body;
  const call = get('SELECT * FROM calls WHERE id = ?', [id]);
  const unit = get('SELECT * FROM units WHERE id = ?', [unit_id]);
  if (!call || !unit) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  run('DELETE FROM call_units WHERE call_id = ? AND unit_id = ?', [id, unit_id]);
  run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
    ['10-8', now, now, unit_id]);
  logActivity('Unit Unassigned', 'call', id, `${unit.callsign} removed from ${call.incident_number}`);
  addTimeline(id, 'Unit removed', `${unit.callsign} removed`);
  notifyUnitOfficers(io, unit, {
    type: 'info',
    title: 'Assignment Removed',
    message: `You have been removed from Call ${call.incident_number}.`,
    call_id: id,
  });
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.post('/traffic-stops', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  try {
    const io = req.app.get('io');
    const { unit_id, location, plate_number, vehicle_description, reason, notes } = req.body;
    if (!location || !String(location).trim()) {
      return res.status(400).json({ error: 'Location is required' });
    }
    const unit = get('SELECT * FROM units WHERE id = ?', [unit_id]);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const now = new Date().toISOString();
    const id = uuidv4();
    const active = get('SELECT id FROM traffic_stops WHERE unit_id = ? AND cleared_at IS NULL', [unit_id]);
    if (active) run('UPDATE traffic_stops SET cleared_at = ? WHERE id = ?', [now, active.id]);

    run(`INSERT INTO traffic_stops (id, group_id, unit_id, location, plate_number, vehicle_description, reason, notes, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, id, unit_id, String(location).trim(), plate_number || '', vehicle_description || '', reason || '', notes || '', now]);
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
      ['Traffic Stop', now, now, unit_id]);
    logActivity('Traffic Stop', 'unit', unit_id, `${unit.callsign} — ${location} — Plate: ${plate_number || 'N/A'}`);
    const state = fullState();
    emit(io, 'state:update', state);
    emit(io, 'notification', { type: 'info', message: `Traffic stop: ${unit.callsign}` });
    res.json(state);
  } catch (err) {
    console.error('Traffic stop error:', err);
    res.status(500).json({ error: err.message || 'Failed to create traffic stop' });
  }
});

router.post('/traffic-stops/:id/clear', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const stop = get('SELECT * FROM traffic_stops WHERE id = ?', [req.params.id]);
  if (!stop) return res.status(404).json({ error: 'Not found' });

  const groupId = stop.group_id || stop.id;
  const now = new Date().toISOString();
  const newStatus = req.body.status || '10-8';
  const active = all('SELECT * FROM traffic_stops WHERE (group_id = ? OR id = ?) AND cleared_at IS NULL', [groupId, groupId]);

  active.forEach(row => {
    run('UPDATE traffic_stops SET cleared_at = ? WHERE id = ?', [now, row.id]);
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
      [newStatus, now, now, row.unit_id]);
    const unit = get('SELECT callsign FROM units WHERE id = ?', [row.unit_id]);
    logActivity('Traffic Stop Cleared', 'unit', row.unit_id, `${unit?.callsign} — ${newStatus}`);
  });

  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.post('/traffic-stops/:id/add-unit', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  try {
    const io = req.app.get('io');
    const stop = get('SELECT * FROM traffic_stops WHERE id = ?', [req.params.id]);
    if (!stop || stop.cleared_at) return res.status(404).json({ error: 'Traffic stop not found or already cleared' });

    const { unit_id } = req.body;
    const unit = get('SELECT * FROM units WHERE id = ?', [unit_id]);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const groupId = stop.group_id || stop.id;
    const inGroup = get(
      'SELECT 1 FROM traffic_stops WHERE (group_id = ? OR id = ?) AND unit_id = ? AND cleared_at IS NULL',
      [groupId, groupId, unit_id]
    );
    if (inGroup) return res.status(400).json({ error: 'Unit is already on this traffic stop' });

    const now = new Date().toISOString();
    const active = get('SELECT id FROM traffic_stops WHERE unit_id = ? AND cleared_at IS NULL', [unit_id]);
    if (active) run('UPDATE traffic_stops SET cleared_at = ? WHERE id = ?', [now, active.id]);

    const id = uuidv4();
    run(`INSERT INTO traffic_stops (id, group_id, unit_id, location, plate_number, vehicle_description, reason, notes, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, groupId, unit_id, stop.location, stop.plate_number, stop.vehicle_description, stop.reason, stop.notes, now]);
    run('UPDATE units SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?',
      ['Traffic Stop', now, now, unit_id]);
    logActivity('Traffic Stop Unit Added', 'unit', unit_id, `${unit.callsign} → ${stop.location}`);
    const state = fullState();
    emit(io, 'state:update', state);
    res.json(state);
  } catch (err) {
    console.error('Add unit to traffic stop error:', err);
    res.status(500).json({ error: err.message || 'Failed to add unit to traffic stop' });
  }
});

router.get('/traffic-stops', (_, res) => res.json(getTrafficStops(false)));

router.get('/activity', (req, res) => {
  res.json(all('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', [parseInt(req.query.limit) || 300]));
});

router.get('/search', (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  if (q === '%%') return res.json({ units: [], calls: [] });
  res.json({
    units: all(`SELECT * FROM units WHERE callsign LIKE ? OR officer_name LIKE ? OR department LIKE ? OR vehicle LIKE ? LIMIT 50`, [q, q, q, q]),
    calls: all(`SELECT * FROM calls WHERE incident_number LIKE ? OR address LIKE ? OR cross_street LIKE ? OR city LIKE ? OR description LIKE ? LIMIT 50`, [q, q, q, q, q]),
  });
});

router.put('/settings', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  const io = req.app.get('io');
  for (const [key, value] of Object.entries(req.body)) {
    if (get('SELECT key FROM settings WHERE key = ?', [key])) run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    else run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state.settings);
});

router.get('/reports/:type', (req, res) => {
  if (!req.auth || !['dispatcher', 'admin'].includes(req.auth.role)) {
    return res.status(403).json({ error: 'Dispatcher or admin permission required' });
  }
  switch (req.params.type) {
    case 'incidents': return res.json(all('SELECT * FROM calls ORDER BY created_at DESC'));
    case 'active-calls': return res.json(all("SELECT * FROM calls WHERE status NOT IN ('Closed', 'Cancelled') ORDER BY priority, created_at"));
    case 'closed-calls': return res.json(all("SELECT * FROM calls WHERE status IN ('Closed', 'Cancelled') ORDER BY closed_at DESC"));
    case 'activity-log': return res.json(all('SELECT * FROM activity_log ORDER BY id DESC'));
    default: return res.status(404).json({ error: 'Unknown report' });
  }
});

// ---------- Multi-agency fleet assignment (Fire apparatus / EMS units) ----------

router.post('/calls/:id/assign-fleet', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const { fleet_id } = req.body;
  const call = get('SELECT * FROM calls WHERE id = ?', [id]);
  const fleet = get('SELECT * FROM fleet WHERE id = ?', [fleet_id]);
  if (!call || !fleet) return res.status(404).json({ error: 'Not found' });

  const nowTs = new Date().toISOString();
  if (fleet.call_id !== id) {
    run('UPDATE fleet SET call_id = ?, status = ? WHERE id = ?', [id, 'Responding', fleet_id]);
    if (call.status === 'Pending') run('UPDATE calls SET status = ?, updated_at = ? WHERE id = ?', ['Active', nowTs, id]);
    logActivity('Unit Assigned', 'call', id, `${fleet.callsign} → ${call.incident_number} (Responding)`);
    addTimeline(id, 'Unit assigned', `${fleet.callsign} (${fleet.agency_type === 'fire' ? 'Fire' : 'EMS'}) assigned — Responding`);
    notifyUnitOfficers(io, fleet, {
      type: 'assignment',
      title: 'New Assignment',
      message: `You have been assigned to Call ${call.incident_number}.`,
      call_id: id,
    });
    emit(io, 'notification', { type: 'assignment', message: `${fleet.callsign} assigned to ${call.incident_number}` });
  }
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

router.post('/calls/:id/unassign-fleet', (req, res) => {
  if (!requireDispatcher(req, res)) return;
  const io = req.app.get('io');
  const { id } = req.params;
  const { fleet_id } = req.body;
  const call = get('SELECT * FROM calls WHERE id = ?', [id]);
  const fleet = get('SELECT * FROM fleet WHERE id = ?', [fleet_id]);
  if (!call || !fleet) return res.status(404).json({ error: 'Not found' });

  const defaultStatus = fleet.agency_type === 'fire' ? 'In Quarters' : 'Available';
  run('UPDATE fleet SET call_id = NULL, status = ? WHERE id = ?', [defaultStatus, fleet_id]);
  logActivity('Unit Unassigned', 'call', id, `${fleet.callsign} removed from ${call.incident_number}`);
  addTimeline(id, 'Unit removed', `${fleet.callsign} removed from incident`);
  notifyUnitOfficers(io, fleet, {
    type: 'info',
    title: 'Assignment Removed',
    message: `You have been removed from Call ${call.incident_number}.`,
    call_id: id,
  });
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

// Personnel update their fleet unit's assignment status on an active call (Responding / On Scene / Transporting / Returning)
router.post('/fleet/:id/call-status', (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  const io = req.app.get('io');
  const { id } = req.params;
  const { status } = req.body || {};
  const fleet = get('SELECT * FROM fleet WHERE id = ?', [id]);
  if (!fleet) return res.status(404).json({ error: 'Unit not found' });
  if (!fleet.call_id) return res.status(400).json({ error: 'Unit is not assigned to a call' });
  if (!status) return res.status(400).json({ error: 'Status required' });

  run('UPDATE fleet SET status = ? WHERE id = ?', [status, id]);
  const call = get('SELECT incident_number FROM calls WHERE id = ?', [fleet.call_id]);
  logActivity('Assignment Status', 'call', fleet.call_id, `${fleet.callsign}: ${status}`);
  addTimeline(fleet.call_id, status, `${fleet.callsign} is ${status}`);
  emit(io, 'notification', { type: 'info', message: `${fleet.callsign} — ${status}${call ? ` (${call.incident_number})` : ''}` });
  const state = fullState();
  emit(io, 'state:update', state);
  res.json(state);
});

module.exports = router;
