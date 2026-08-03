const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const REQUIRED_VERSION = 2;

function check() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(res.statusCode === 200 && json.version >= REQUIRED_VERSION);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  for (let i = 0; i < 45; i++) {
    if (await check()) {
      console.log('Server ready');
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('Server did not become ready in time');
  process.exit(1);
})();
