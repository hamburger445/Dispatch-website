const { all, initDatabase } = require('../backend/database');
initDatabase().then(() => {
  console.log('fleet rows:', all('SELECT callsign, department_id FROM fleet').map(f => f.callsign + '@' + f.department_id).join(', '));
  console.log('users:', all('SELECT username, callsign, department_id, unit_id FROM users').map(u => `${u.username} cs=${u.callsign} dep=${u.department_id} uid=${u.unit_id}`).join(' | '));
  console.log('lookup E-1 count:', all("SELECT id FROM fleet WHERE callsign = 'E-1' AND department_id = 'dep-gvfd'").length);
  const pend = all("SELECT * FROM users WHERE unit_id IS NULL AND callsign != '' AND department_id IS NOT NULL");
  console.log('pending links:', pend.map(u => u.username).join(','));
  for (const u of pend) {
    const f = all('SELECT id FROM fleet WHERE callsign = ? AND department_id = ?', [u.callsign, u.department_id]);
    console.log('match', u.username, f.length);
    if (f.length) { run('UPDATE users SET unit_id = ? WHERE id = ?', [f[0].id, u.id]); console.log('linked', u.username); }
  }
  console.log('after:', all("SELECT username, unit_id FROM users WHERE username IN ('fire101','med203')").map(r => r.username + ':' + r.unit_id).join(' | '));
  process.exit(0);
});
