const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'greenville-cad-secret-change-me';
const TOKEN_TTL = '12h';

const loginAttempts = new Map();

function loginAllowed(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) return true;
  return rec.count < 8;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  rec.count += 1;
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verify(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Express middleware: attaches req.user when a valid bearer token is present.
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verify(token) : null;
  req.auth = payload || null;
  next();
}

// Require an authenticated user; 401 otherwise.
function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  next();
}

// Require one of the given roles ('admin' implicitly allowed when role==='admin').
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (req.auth.role !== 'admin' && !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  sign, verify, optionalAuth, requireAuth, requireRole, JWT_SECRET,
  loginAllowed, recordLoginFailure, clearLoginFailures,
};
