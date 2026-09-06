// Multi-agency CAD schema: users, agencies, departments, stations,
// apparatus/EMS units (fleet), call types, and call timeline.
// Uses the SAME central sql.js database as the rest of the CAD.

const bcrypt = require('bcryptjs');
const { run, get, all, logActivity } = require('./database');

const AGENCY_TYPES = ['law', 'fire', 'ems'];

const DEFAULT_RANKS = {
  law: ['Trooper', 'Corporal', 'Sergeant', 'Lieutenant', 'Captain', 'Major'],
  fire: ['Firefighter', 'Engineer', 'Lieutenant', 'Captain', 'Battalion Chief', 'Fire Chief'],
  ems: ['EMT', 'Paramedic', 'Supervisor', 'EMS Chief'],
};

const DEFAULT_UNIT_STATUSES = {
  law: ['10-8', '10-6', '10-7', '10-97', 'On Scene', 'Traffic Stop', 'Transporting'],
  fire: ['Available', 'In Quarters', 'Responding', 'On Scene', 'Returning', 'Out of Service', 'Transporting', 'At Hospital'],
  ems: ['Available', 'At Station', 'Responding', 'On Scene', 'Transporting', 'At Hospital', 'Returning', 'Out of Service'],
};

const DEFAULT_CALL_TYPES = {
  law: ['Traffic Stop', 'Motor Vehicle Accident', 'Suspicious Person', 'Domestic', 'Assault', 'Theft', 'Alarm', 'Officer Assistance', 'Other'],
  fire: ['Structure Fire', 'Vehicle Fire', 'Brush Fire', 'Fire Alarm', 'Gas Leak', 'Hazmat', 'Rescue', 'Public Service', 'Other'],
  ems: ['Medical Emergency', 'Chest Pain', 'Difficulty Breathing', 'Injury', 'Overdose', 'MVC Injury', 'Sick Person', 'Cardiac Arrest', 'Other'],
  dispatch: ['Traffic Stop', 'Motor Vehicle Accident', 'Structure Fire', 'Fire Alarm', 'Medical Emergency', 'MVC Injury', 'Alarm', 'Theft', 'Domestic', 'Other'],
};

const APPARATUS_TYPES = ['Engine', 'Ladder', 'Rescue', 'Tanker', 'Battalion', 'Brush', 'Utility', 'Chief', 'Marine', 'Other'];
const EMS_UNIT_TYPES = ['Ambulance', 'Rescue', 'Supervisor', 'Medic', 'Other'];

function uid() {
  return require('crypto').randomUUID();
}

function ensureFleetNameColumn() {
  const cols = all('PRAGMA table_info(fleet)');
  if (cols.length && !cols.some(c => c.name === 'name')) {
    run('ALTER TABLE fleet ADD COLUMN name TEXT DEFAULT ""');
  }
}

function tableHasColumn(table, column) {
  return all(`PRAGMA table_info(${table})`).some(c => c.name === column);
}

function ensureUsersTable() {
  const exists = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").length > 0;
  if (!exists) {
    run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'personnel',
      agency_id TEXT,
      department_id TEXT,
      station_id TEXT,
      badge TEXT DEFAULT '',
      rank TEXT DEFAULT '',
      callsign TEXT DEFAULT '',
      unit_id TEXT,
      must_change_password INTEGER DEFAULT 0,
      account_status TEXT DEFAULT 'active',
      status TEXT DEFAULT '10-7',
      last_login TEXT,
      created_at TEXT NOT NULL
    )`);
  }
}

function ensureUserColumns() {
  ensureUsersTable();
  const cols = [
    ['account_status', "TEXT DEFAULT 'active'"],
    ['status', "TEXT DEFAULT '10-7'"],
    ['last_login', 'TEXT'],
  ];
  for (const [name, def] of cols) {
    if (!tableHasColumn('users', name)) {
      run(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
    }
  }
  run(`CREATE TABLE IF NOT EXISTS officer_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    title TEXT DEFAULT '',
    message TEXT NOT NULL,
    call_id TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
}

function ensureLawUnitForUser(user) {
  if (!user || !user.callsign) return null;
  const agency = user.agency_id ? get('SELECT * FROM agencies WHERE id = ?', [user.agency_id]) : null;
  if (agency && agency.type && agency.type !== 'law') return null;

  let unit = user.unit_id ? get('SELECT * FROM units WHERE id = ?', [user.unit_id]) : null;
  if (!unit && user.callsign) unit = get('SELECT * FROM units WHERE callsign = ?', [user.callsign]);

  const dept = user.department_id
    ? (get('SELECT code FROM departments WHERE id = ?', [user.department_id])?.code || 'WSP')
    : 'WSP';
  const now = new Date().toISOString();

  if (unit) {
    const changed = [];
    if ((unit.officer_name || '') !== (user.name || '')) changed.push('officer_name');
    if ((unit.department || '') !== dept) changed.push('department');
    if ((unit.status || '') === '') changed.push('status');
    if (changed.length) {
      run(`UPDATE units SET ${changed.map(f => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [
          ...changed.map(f => f === 'officer_name' ? (user.name || '') : f === 'department' ? dept : (user.status || '10-7')),
          now,
          unit.id,
        ]);
    }
  }

  if (unit && user.unit_id !== unit.id) {
    run('UPDATE users SET unit_id = ? WHERE id = ?', [unit.id, user.id]);
  }
  return unit;
}

function usersLinkedToUnit(unit) {
  if (!unit) return [];
  return all(
    `SELECT * FROM users WHERE (unit_id = ? OR (callsign != '' AND callsign = ?)) AND role = 'personnel'`,
    [unit.id, unit.callsign]
  );
}

function notifyOfficer(io, userId, payload) {
  const id = uid();
  const created = new Date().toISOString();
  run(`INSERT INTO officer_notifications (id, user_id, type, title, message, call_id, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [id, userId, payload.type || 'info', payload.title || '', payload.message, payload.call_id || null, created]);
  const note = { id, ...payload, created_at: created };
  if (io) io.to(`user:${userId}`).emit('officer:notification', note);
  return note;
}

function notifyUnitOfficers(io, unit, payload) {
  usersLinkedToUnit(unit).forEach(u => notifyOfficer(io, u.id, payload));
}

function initMultiAgencySchema() {
  ensureFleetNameColumn();
  ensureUsersTable();
  ensureUserColumns();
  run(`CREATE TABLE IF NOT EXISTS agencies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('law','fire','ems')),
    color TEXT DEFAULT '#3b82f6',
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    agency_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    name TEXT NOT NULL,
    department_id TEXT NOT NULL,
    location TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'personnel',
    agency_id TEXT,
    department_id TEXT,
    station_id TEXT,
    badge TEXT DEFAULT '',
    rank TEXT DEFAULT '',
    callsign TEXT DEFAULT '',
    unit_id TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  // Fire apparatus / EMS units. LE personnel keep using existing `units` table.
  run(`CREATE TABLE IF NOT EXISTS fleet (
    id TEXT PRIMARY KEY,
    unit_number TEXT NOT NULL,
    callsign TEXT NOT NULL,
    name TEXT DEFAULT '',
    type TEXT NOT NULL,
    agency_type TEXT NOT NULL CHECK (agency_type IN ('fire','ems')),
    department_id TEXT NOT NULL,
    station_id TEXT,
    status TEXT NOT NULL DEFAULT 'Available',
    crew TEXT DEFAULT '[]',
    call_id TEXT,
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS call_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agency_type TEXT NOT NULL DEFAULT 'dispatch',
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS call_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    event TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`);

  clearInitialUnits();
  seedDefaults();
}

function clearInitialUnits() {
  if (get("SELECT value FROM settings WHERE key = 'empty_units_migration_v1'")) return;

  run('DELETE FROM call_units');
  run('DELETE FROM traffic_stops');
  run('DELETE FROM units');
  run('DELETE FROM fleet');
  run('UPDATE users SET unit_id = NULL');
  run("INSERT INTO settings (key, value) VALUES ('empty_units_migration_v1', '1')");
}

function seedDefaults() {
  const now = new Date().toISOString();

  const agencies = [
    ['ag-wisconsin-state', 'Wisconsin State Patrol', 'law', '#3b82f6'],
    ['ag-outagamie-sheriff', "Outagamie County Sheriff's Office", 'law', '#eab308'],
    ['ag-greenville-fire', 'Greenville Fire Department', 'fire', '#ef4444'],
    ['ag-gold-cross-ems', 'Gold Cross EMS', 'ems', '#22c55e'],
  ];
  for (const [id, name, type, color] of agencies) {
    if (!get('SELECT id FROM agencies WHERE id = ?', [id])) {
      run('INSERT INTO agencies (id, name, type, color, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, type, color, now]);
    }
  }

  const departments = [
    ['dep-wsp', 'WSP', 'Wisconsin State Patrol', 'ag-wisconsin-state'],
    ['dep-ocso', 'OCSO', "Outagamie County Sheriff's Office", 'ag-outagamie-sheriff'],
    ['dep-gvfd', 'GVFD', 'Greenville Fire Department', 'ag-greenville-fire'],
    ['dep-gcem', 'GCEMS', 'Gold Cross EMS', 'ag-gold-cross-ems'],
  ];
  for (const [id, code, name, agencyId] of departments) {
    if (!get('SELECT id FROM departments WHERE id = ?', [id])) {
      run('INSERT INTO departments (id, code, name, agency_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, code, name, agencyId, now]);
    }
  }

  const stations = [
    ['st-wsp-1', '1', 'WSP Station 1', 'dep-wsp', '1200 W Main St'],
    ['st-ocso-1', '1', 'OCSO Station 1', 'dep-ocso', '450 Broadway'],
    ['st-gvfd-1', '1', 'GVFD Station 1', 'dep-gvfd', '1200 W Main St'],
    ['st-gcem-1', '1', 'EMS Station 1', 'dep-gcem', '1202 W Main St'],
  ];
  for (const [id, number, name, depId, loc] of stations) {
    if (!get('SELECT id FROM stations WHERE id = ?', [id])) {
      run('INSERT INTO stations (id, number, name, department_id, location, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, number, name, depId, loc, now]);
    }
  }

  const typeCount = get('SELECT COUNT(*) as c FROM call_types')?.c || 0;
  if (!typeCount) {
    for (const [agencyType, names] of Object.entries(DEFAULT_CALL_TYPES)) {
      for (const name of names) {
        run('INSERT INTO call_types (id, name, agency_type, created_at) VALUES (?, ?, ?, ?)', [uid(), name, agencyType, now]);
      }
    }
  }

  const mkUser = (username, password, name, role, opts = {}) => {
    if (get('SELECT id FROM users WHERE username = ?', [username])) return;
    const hash = bcrypt.hashSync(password, 10);
    run(`INSERT INTO users (id, username, password_hash, name, role, agency_id, department_id, station_id, badge, rank, callsign, unit_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid(), username, hash, name, role,
        opts.agency_id || null, opts.department_id || null, opts.station_id || null,
        opts.badge || '', opts.rank || '', opts.callsign || '', opts.unit_id || null, now]);
  };

  mkUser('admin', 'admin123', 'System Administrator', 'admin');
  mkUser('dispatch01', 'dispatch123', 'Lead Dispatcher', 'dispatcher');
  mkUser('jdoe', 'officer123', 'John Doe', 'personnel', {
    agency_id: 'ag-wisconsin-state', department_id: 'dep-wsp',
    badge: '101', rank: 'Trooper', callsign: 'WSP-101',
  });
  mkUser('msmith', 'officer123', 'Mike Smith', 'personnel', {
    agency_id: 'ag-outagamie-sheriff', department_id: 'dep-ocso',
    badge: '204', rank: 'Deputy', callsign: 'PD-204',
  });
  mkUser('fire101', 'fire123', 'Dan Baker', 'personnel', {
    agency_id: 'ag-greenville-fire', department_id: 'dep-gvfd', station_id: 'st-gvfd-1',
    rank: 'Captain', callsign: 'E-1',
  });
  mkUser('med203', 'ems123', 'Sarah Reyes', 'personnel', {
    agency_id: 'ag-gold-cross-ems', department_id: 'dep-gcem', station_id: 'st-gcem-1',
    rank: 'Paramedic', callsign: 'A-4',
  });

  // Self-healing link: users to fleet units (re-links when unit_id is missing or stale)
  for (const u of all("SELECT * FROM users WHERE callsign != '' AND department_id IS NOT NULL AND (unit_id IS NULL OR unit_id = '' OR unit_id NOT IN (SELECT id FROM fleet))")) {
    const fleetUnit = get('SELECT id FROM fleet WHERE callsign = ? AND department_id = ?', [u.callsign, u.department_id]);
    if (fleetUnit) run('UPDATE users SET unit_id = ? WHERE id = ?', [fleetUnit.id, u.id]);
  }

  logActivity('System', null, null, 'Multi-agency schema initialized');
}

function timeline(callId) {
  return all('SELECT * FROM call_timeline WHERE call_id = ? ORDER BY created_at, id', [callId]);
}

function addTimeline(callId, event, details = '') {
  run('INSERT INTO call_timeline (call_id, event, details, created_at) VALUES (?, ?, ?, ?)',
    [callId, event, details, new Date().toISOString()]);
}

module.exports = {
  initMultiAgencySchema,
  AGENCY_TYPES,
  DEFAULT_RANKS,
  DEFAULT_UNIT_STATUSES,
  APPARATUS_TYPES,
  EMS_UNIT_TYPES,
  timeline,
  addTimeline,
  ensureLawUnitForUser,
  usersLinkedToUnit,
  notifyOfficer,
  notifyUnitOfficers,
};
