import { useState, useEffect, useRef } from 'react';
import { api } from '../constants';

export default function SearchModal({ onClose, onSelectUnit, onSelectCall }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ units: [], calls: [] });
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim()) { setResults({ units: [], calls: [] }); return; }
    const t = setTimeout(() => api('GET', `/search?q=${encodeURIComponent(q)}`).then(setResults), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <h2>Search</h2>
        <input ref={ref} className="input lg" placeholder="Incident #, callsign, officer, department, address..." value={q} onChange={e => setQ(e.target.value)} />
        <div className="search-results">
          {results.units.length > 0 && (
            <section>
              <h4>Units</h4>
              {results.units.map(u => (
                <button key={u.id} className="search-hit" onClick={() => { onSelectUnit(u); onClose(); }}>
                  <b>{u.callsign}</b> {u.officer_name} · {u.department}
                </button>
              ))}
            </section>
          )}
          {results.calls.length > 0 && (
            <section>
              <h4>Calls</h4>
              {results.calls.map(c => (
                <button key={c.id} className="search-hit" onClick={() => { onSelectCall(c); onClose(); }}>
                  <b>{c.incident_number}</b> {c.call_type} · {c.address}
                </button>
              ))}
            </section>
          )}
        </div>
        <button className="btn ghost" onClick={onClose}>Close (Esc)</button>
      </div>
    </div>
  );
}
