import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api, formatDateTime } from '../constants';

const REPORTS = [
  { id: 'incidents', name: 'Incident Reports' },
  { id: 'active-calls', name: 'Active Calls' },
  { id: 'closed-calls', name: 'Closed Calls' },
  { id: 'activity-log', name: 'Activity Log' },
];

export default function ReportsPanel({ onClose }) {
  const [sel, setSel] = useState(null);
  const [data, setData] = useState(null);

  const load = async (id) => {
    setSel(id);
    setData(await api('GET', `/reports/${id}`));
  };

  const toCSV = () => {
    if (!data?.length && !Array.isArray(data)) return;
    const rows = Array.isArray(data) ? data : [];
    const keys = Object.keys(rows[0] || {});
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `greenville-${sel}-${Date.now()}.csv`;
    a.click();
  };

  const toPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Greenville CAD — ${REPORTS.find(r => r.id === sel)?.name}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, 14, 22);
    const rows = (Array.isArray(data) ? data : []).slice(0, 60);
    let head = [], body = [];
    if (sel === 'activity-log') {
      head = ['Time', 'Action', 'Details'];
      body = rows.map(r => [formatDateTime(r.created_at), r.action, r.details]);
    } else {
      head = ['Incident', 'Type', 'Pri', 'Status', 'Address'];
      body = rows.map(r => [r.incident_number, r.call_type, `P${r.priority}`, r.status, r.address]);
    }
    autoTable(doc, { startY: 28, head: [head], body, styles: { fontSize: 7 } });
    doc.save(`greenville-${sel}.pdf`);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <h2>Reports</h2>
        <div className="reports-grid">
          <div className="report-btns">
            {REPORTS.map(r => (
              <button key={r.id} className={sel === r.id ? 'active' : ''} onClick={() => load(r.id)}>{r.name}</button>
            ))}
          </div>
          <div className="report-preview">
            {data ? (
              <>
                <pre>{JSON.stringify(data, null, 2).slice(0, 4000)}</pre>
                <div className="btn-row">
                  <button className="btn secondary" onClick={toCSV}>Export CSV</button>
                  <button className="btn primary" onClick={toPDF}>Export PDF</button>
                </div>
              </>
            ) : <p className="empty">Select a report type</p>}
          </div>
        </div>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
