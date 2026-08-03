import { useState } from 'react';
import { PRIORITY_LABELS, CALL_STATUSES, formatDateTime } from '../constants';

export default function CallsPanel({ calls, selectedId, onSelect, filter = 'active' }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ col: 'priority', dir: 'asc' });

  let list = [...calls];
  if (filter === 'active') list = list.filter(c => !['Closed', 'Cancelled'].includes(c.status));
  else if (filter === 'closed') list = list.filter(c => ['Closed', 'Cancelled'].includes(c.status));

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(c =>
      c.incident_number.toLowerCase().includes(q) ||
      c.call_type.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    let va = a[sort.col], vb = b[sort.col];
    if (va < vb) return sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const sortBy = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

  return (
    <div className="panel calls-panel">
      <div className="panel-top">
        <h2>{filter === 'closed' ? 'Closed Calls' : 'Active Calls'}</h2>
        <input className="search-input" placeholder="Filter calls..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="table-scroll">
        <table className="cad-table">
          <thead>
            <tr>
              {[['incident_number', 'Incident'], ['call_type', 'Type'], ['priority', 'Pri'], ['status', 'Status'], ['address', 'Location'], ['created_at', 'Created']].map(([k, l]) => (
                <th key={k} onClick={() => sortBy(k)}>{l}{sort.col === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} className={`${selectedId === c.id ? 'selected' : ''} pri-row-${c.priority}`} onClick={() => onSelect(c)}>
                <td className="mono fw">{c.incident_number}</td>
                <td>{c.call_type}</td>
                <td><span className="pri-tag" style={{ background: PRIORITY_LABELS[c.priority]?.color }}>{PRIORITY_LABELS[c.priority]?.label}</span></td>
                <td><span className={`status-tag st-${c.status}`}>{c.status}</span></td>
                <td>{c.address || '—'}{c.cross_street ? ` / ${c.cross_street}` : ''}</td>
                <td className="muted">{formatDateTime(c.created_at)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="empty">No calls</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
