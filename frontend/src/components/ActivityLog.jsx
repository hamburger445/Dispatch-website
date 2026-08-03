import { formatDateTime } from '../constants';

export default function ActivityLog({ entries }) {
  return (
    <div className="activity-log panel">
      <h2 className="panel-title">Activity Log</h2>
      <div className="log-scroll">
        {(entries || []).map(entry => (
          <div key={entry.id} className="log-entry fade-in">
            <time>{formatDateTime(entry.created_at)}</time>
            <strong>{entry.action}</strong>
            <span>{entry.details}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
