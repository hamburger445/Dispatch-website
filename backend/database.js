const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'database');
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'cad.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db = null;
let SQL = null;

function saveDb() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function tableHasColumn(table, column) {
  return all(`PRAGMA table_info(${table})`).some(c => c.name === column);
}

function runMigrations() {
  if (runMigrations.done) return;
  const added = [];
  if (!tableHasColumn('calls', 'cross_street')) {
    run(`ALTER TABLE calls ADD COLUMN cross_street TEXT DEFAULT ''`);
    added.push('calls.cross_street');
  }
  if (!tableHasColumn('calls', 'city')) {
    run(`ALTER TABLE calls ADD COLUMN city TEXT DEFAULT 'Greenville'`);
    added.push('calls.city');
  }
  if (!tableHasColumn('traffic_stops', 'group_id')) {
    run('ALTER TABLE traffic_stops ADD COLUMN group_id TEXT');
    added.push('traffic_stops.group_id');
  }
  run('UPDATE traffic_stops SET group_id = id WHERE group_id IS NULL OR group_id = ""');
  if (added.length) console.log('[CAD] Database migrated:', added.join(', '));
  runMigrations.done = true;
}

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    callsign TEXT NOT NULL,
    officer_name TEXT NOT NULL,
    department TEXT NOT NULL,
    vehicle TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT '10-8',
    notes TEXT DEFAULT '',
    status_changed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    incident_number TEXT NOT NULL UNIQUE,
    call_type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'Pending',
    address TEXT DEFAULT '',
    cross_street TEXT DEFAULT '',
    city TEXT DEFAULT 'Greenville',
    description TEXT DEFAULT '',
    dispatcher_notes TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS call_units (
    call_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (call_id, unit_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS traffic_stops (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    unit_id TEXT NOT NULL,
    location TEXT NOT NULL,
    plate_number TEXT DEFAULT '',
    vehicle_description TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    started_at TEXT NOT NULL,
    cleared_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS incident_counter (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL DEFAULT 0
  )`);
  saveDb();
}

function logActivity(action, entityType, entityId, details) {
  run(
    `INSERT INTO activity_log (action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?)`,
    [action, entityType, entityId, details, new Date().toISOString()]
  );
}

function generateIncidentNumber() {
  const year = new Date().getFullYear();
  const row = get('SELECT counter FROM incident_counter WHERE year = ?', [year]);
  const counter = row ? row.counter + 1 : 1;
  if (row) run('UPDATE incident_counter SET counter = ? WHERE year = ?', [counter, year]);
  else run('INSERT INTO incident_counter (year, counter) VALUES (?, ?)', [year, counter]);
  return `${year}-${String(counter).padStart(4, '0')}`;
}

function getDashboardStats() {
  return {
    activeCalls: get("SELECT COUNT(*) as c FROM calls WHERE status NOT IN ('Closed', 'Cancelled')")?.c || 0,
    pendingCalls: get("SELECT COUNT(*) as c FROM calls WHERE status = 'Pending'")?.c || 0,
    closedCalls: get("SELECT COUNT(*) as c FROM calls WHERE status IN ('Closed', 'Cancelled')")?.c || 0,
    onlineUnits: get("SELECT COUNT(*) as c FROM units WHERE status != '10-7'")?.c || 0,
    availableUnits: get("SELECT COUNT(*) as c FROM units WHERE status = '10-8'")?.c || 0,
    busyUnits: get("SELECT COUNT(*) as c FROM units WHERE status IN ('10-6', '10-15', '10-97', '10-23', 'Traffic Stop', 'Report Writing', 'Signal 11')")?.c || 0,
  };
}

function getUnitsWithCalls() {
  return all(`
    SELECT u.*,
      (SELECT c.incident_number FROM calls c
       JOIN call_units cu ON cu.call_id = c.id
       WHERE cu.unit_id = u.id AND c.status NOT IN ('Closed', 'Cancelled')
       LIMIT 1) as current_call
    FROM units u ORDER BY u.department, u.callsign
  `);
}

function getCallsWithUnits() {
  return all(`
    SELECT * FROM calls ORDER BY
      CASE WHEN status IN ('Closed', 'Cancelled') THEN 1 ELSE 0 END,
      priority ASC, created_at DESC
  `).map(call => ({
    ...call,
    assigned_units: all(`
      SELECT u.id, u.callsign, u.officer_name, u.department, u.status, cu.assigned_at
      FROM units u JOIN call_units cu ON cu.unit_id = u.id
      WHERE cu.call_id = ? ORDER BY cu.assigned_at
    `, [call.id]),
  }));
}

function getTrafficStops(activeOnly = false) {
  const rows = all(`
    SELECT ts.*, u.callsign, u.officer_name, u.department
    FROM traffic_stops ts
    JOIN units u ON u.id = ts.unit_id
    ${activeOnly ? 'WHERE ts.cleared_at IS NULL' : ''}
    ORDER BY ts.started_at DESC
    ${activeOnly ? '' : 'LIMIT 400'}
  `);

  const groups = new Map();
  for (const row of rows) {
    const gid = row.group_id || row.id;
    if (!groups.has(gid)) {
      groups.set(gid, {
        id: gid,
        group_id: gid,
        location: row.location,
        plate_number: row.plate_number,
        vehicle_description: row.vehicle_description,
        notes: row.notes,
        started_at: row.started_at,
        cleared_at: row.cleared_at,
        units: [],
      });
    }
    const group = groups.get(gid);
    group.units.push({
      stop_id: row.id,
      id: row.unit_id,
      callsign: row.callsign,
      officer_name: row.officer_name,
      department: row.department,
    });
    if (row.started_at < group.started_at) group.started_at = row.started_at;
    if (!row.cleared_at) group.cleared_at = null;
    else if (group.cleared_at && row.cleared_at > group.cleared_at) group.cleared_at = row.cleared_at;
  }

  let result = Array.from(groups.values());
  if (activeOnly) result = result.filter(g => !g.cleared_at);
  return result.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, activeOnly ? undefined : 200);
}

async function initDatabase() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  initSchema();
  runMigrations();

  run("UPDATE units SET status = '10-23' WHERE status = 'En Route'");
  run("UPDATE units SET status = '10-7' WHERE status = 'Off Duty'");

  if (!get('SELECT COUNT(*) as c FROM settings')?.c) {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', ['theme', 'dark']);
    logActivity('System', null, null, 'Greenville CAD initialized');
  }
}

module.exports = {
  initDatabase,
  logActivity,
  generateIncidentNumber,
  getDashboardStats,
  getUnitsWithCalls,
  getCallsWithUnits,
  getTrafficStops,
  runMigrations,

  run,
  get,
  all,
};
