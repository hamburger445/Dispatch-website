const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDatabase, getDashboardStats, getUnitsWithCalls, getCallsWithUnits, getTrafficStops, all } = require('./database');
const apiRouter = require('./routes/api');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const ROOT = path.join(__dirname, '..');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const MAPS_DIR = path.join(ROOT, 'maps');
const ASSETS_DIR = path.join(ROOT, 'assets');
const LOGS_DIR = path.join(ROOT, 'logs');

[MAPS_DIR, ASSETS_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function fullState() {
  return {
    stats: getDashboardStats(),
    units: getUnitsWithCalls(),
    calls: getCallsWithUnits(),
    trafficStops: getTrafficStops(false),
    activity: all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 150'),
    settings: Object.fromEntries(
      all('SELECT key, value FROM settings').map(r => [r.key, r.value])
    ),
  };
}

async function start() {
  await initDatabase();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  });

  app.set('io', io);
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.use('/api', apiRouter);
  app.use('/maps', express.static(MAPS_DIR));
  app.use('/assets', express.static(ASSETS_DIR));

  io.on('connection', (socket) => {
    socket.emit('state:update', fullState());
    socket.on('ping', () => socket.emit('pong'));
  });

  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.send(`
        <html><body style="font-family:sans-serif;background:#0f1419;color:#e7e9ea;padding:40px;">
          <h1>Greenville CAD</h1>
          <p>Frontend not built. Run: <code>cd frontend && npm install && npm run build</code></p>
          <p>API is available at <a href="/api/state" style="color:#1d9bf0">/api/state</a></p>
        </body></html>
      `);
    });
  }

  server.listen(PORT, HOST, () => {
    const msg = `Greenville CAD running at http://${HOST}:${PORT}`;
    console.log(msg);
    fs.appendFileSync(
      path.join(LOGS_DIR, 'startup.log'),
      `[${new Date().toISOString()}] ${msg}\n`
    );
  });

  server.on('error', (err) => {
    console.error('Server failed to start:', err.message);
    fs.appendFileSync(
      path.join(LOGS_DIR, 'startup.log'),
      `[${new Date().toISOString()}] ERROR: ${err.message}\n`
    );
    process.exit(1);
  });
}

start().catch(err => {
  console.error('Failed to initialize:', err);
  process.exit(1);
});

module.exports = { start };
