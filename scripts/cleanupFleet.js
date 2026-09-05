const { all, run, initDatabase } = require('../backend/database');
initDatabase().then(() => {
  const rows = all('SELECT id, callsign, department_id, created_at FROM fleet ORDER BY created_at DESC');
  const seen = new Set();
  let removed = 0;
  for (const r of rows) {
    const key = r.callsign + '|' + r.department_id;
    if (seen.has(key)) { run('DELETE FROM fleet WHERE id = ?', [r.id]); removed++; }
    else seen.add(key);
  }
  console.log('duplicates removed:', removed, '| remaining:', all('SELECT callsign FROM fleet').map(f => f.callsign).join(','));
  process.exit(0);
});
