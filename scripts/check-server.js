const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const REQUIRED_VERSION = 3;

function getHealth() {
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

getHealth().then((ok) => process.exit(ok ? 0 : 1));
