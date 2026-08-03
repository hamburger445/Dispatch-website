import { useState } from 'react';
import { DEPARTMENTS, UNIT_STATUSES, CUSTOM_STATUS_OPTION, getStatusColor, isPresetStatus, timeSince } from '../constants';
import CustomStatusModal from './CustomStatusModal';
import Select from './Select';

export default function UnitsPanel({ units, onEdit, onStatusChange, onTrafficStop, compact }) {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [sort, setSort] = useState({ col: 'callsign', dir: 'asc' });
  const [customUnit, setCustomUnit] = useState(null);

  const statusOptions = (unit) => {
    const opts = UNIT_STATUSES.map(s => ({ value: s, label: s, color: getStatusColor(s) }));
    if (unit.status && !isPresetStatus(unit.status)) {
      opts.push({ value: unit.status, label: unit.status, color: getStatusColor(unit.status) });
    }
    opts.push({ value: CUSTOM_STATUS_OPTION, label: 'Custom...' });
    return opts;
  };

  const handleStatusSelect = (unit, value) => {
    if (value === CUSTOM_STATUS_OPTION) {
      setCustomUnit(unit);
      return;
    }
    if (value === 'Traffic Stop') {
      onTrafficStop?.(unit);
      return;
    }
    onStatusChange(unit.id, value);
  };

  let list = [...units];
  if (dept) list = list.filter(u => u.department === dept);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(u => u.callsign.toLowerCase().includes(q) || u.officer_name.toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    const va = a[sort.col] || '', vb = b[sort.col] || '';
    return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const deptOptions = [
    { value: '', label: 'All Depts' },
    ...Object.keys(DEPARTMENTS).map(d => ({ value: d, label: d })),
  ];

  return (
    <div className={`panel units-panel${compact ? ' compact' : ''}`}>
      <div className="panel-top">
        <h2>Unit Status</h2>
        {!compact && (
          <div className="filters">
            <input className="search-input" placeholder="Search units..." value={search} onChange={e => setSearch(e.target.value)} />
            <Select className="filter-select" size="sm" value={dept} onChange={setDept} options={deptOptions} />
          </div>
        )}
      </div>
      <div className="table-scroll">
        <table className="cad-table">
          <thead>
            <tr>
              <th onClick={() => setSort({ col: 'callsign', dir: 'asc' })}>Callsign</th>
              <th>Officer</th>
              <th>Dept</th>
              <th>Vehicle</th>
              <th>Status</th>
              <th>Call</th>
              <th>Time</th>
              {!compact && <th></th>}
            </tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} onDoubleClick={() => onEdit(u)}>
                <td className="mono fw">{u.callsign}</td>
                <td>{u.officer_name}</td>
                <td><span className="dept-tag" style={{ background: DEPARTMENTS[u.department]?.color }}>{u.department}</span></td>
                <td className="truncate">{u.vehicle || '—'}</td>
                <td className="status-cell">
                  <Select
                    variant="status"
                    className="table-status-select"
                    size="sm"
                    portal
                    value={u.status}
                    onChange={(v) => handleStatusSelect(u, v)}
                    options={statusOptions(u)}
                    style={{ '--c': getStatusColor(u.status) }}
                  />
                </td>
                <td className="mono">{u.current_call || '—'}</td>
                <td className="muted">{timeSince(u.status_changed_at)}</td>
                {!compact && (
                  <td><button className="btn-xs" onClick={() => onEdit(u)}>Edit</button></td>
                )}
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} className="empty">No units — add a unit to begin</td></tr>}
          </tbody>
        </table>
      </div>

      {customUnit && (
        <CustomStatusModal
          unit={customUnit}
          onClose={() => setCustomUnit(null)}
          onSave={(status) => {
            onStatusChange(customUnit.id, status);
            setCustomUnit(null);
          }}
        />
      )}
    </div>
  );
}
