const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;

try {
  const lines = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  const pids = new Set();
  for (const line of lines) {
    const pid = line.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`Stopped process ${pid} on port ${PORT}`);
    } catch {}
  }
} catch {
  // Nothing listening
}
