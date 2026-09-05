export const DEPARTMENTS = {
  WSP: { name: 'Wisconsin State Patrol', color: '#3b82f6' },
  OCSO: { name: "Outagamie County Sheriff's Office", color: '#eab308' },
  GVFD: { name: 'Greenville Fire Department', color: '#ef4444' },
  WISDOT: { name: 'Wisconsin DOT', color: '#f97316' },
};

export const UNIT_STATUSES = [
  '10-8', '10-6', '10-7', '10-15', '10-97', '10-23', 'On Scene', 'Traffic Stop', 'Transporting', 'Report Writing', 'Returning', 'Signal 11',
];

export const CUSTOM_STATUS_OPTION = '__custom__';

export const STATUS_COLORS = {
  '10-8': '#22c55e',
  '10-6': '#f59e0b',
  '10-7': '#6b7280',
  '10-15': '#d97706',
  '10-97': '#ef4444',
  '10-23': '#3b82f6',
  'On Scene': '#ef4444',
  'Traffic Stop': '#a855f7',
  'Transporting': '#0ea5e9',
  'Report Writing': '#6366f1',
  'Returning': '#14b8a6',
  'Signal 11': '#ec4899',
};

export function getStatusColor(status) {
  return STATUS_COLORS[status] || '#64748b';
}

export function isPresetStatus(status) {
  return UNIT_STATUSES.includes(status);
}

export const CALL_STATUSES = ['Pending', 'Active', 'Closed', 'Cancelled'];

export const CALL_TYPES = [
  'Traffic Stop', 'Vehicle Crash', 'Disabled Vehicle', 'Reckless Driver', 'Road Hazard',
  'Road Closure', 'Medical Call', 'Structure Fire', 'Brush Fire', 'Vehicle Fire', 'Alarm',
  'Theft', 'Burglary', 'Welfare Check', 'Domestic', 'Fight', 'Suspicious Person',
  'Public Assist', 'Wanted Person', 'Other',
];

export const PRIORITY_LABELS = {
  1: { label: 'P1', color: '#ef4444', detail: 'Emergency / immediate response' },
  2: { label: 'P2', color: '#f97316', detail: 'Urgent' },
  3: { label: 'P3', color: '#eab308', detail: 'Routine' },
  4: { label: 'P4', color: '#22c55e', detail: 'Low' },
  5: { label: 'P5', color: '#6b7280', detail: 'Information' },
};

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US');
}

export function timeSince(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = localStorage.getItem('cad_token');
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).error || msg; } catch {}
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}
