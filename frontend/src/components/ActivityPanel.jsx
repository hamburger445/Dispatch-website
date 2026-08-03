import { formatDateTime } from '../constants';

export default function ActivityPanel({ entries, full }) {
  const list = full ? entries : (entries || []).slice(0, 20);
  return (
    <div className={`panel activity-panel${full ? ' full' : ''}`}>
      <div className="panel-top"><h2>{full ? 'Activity Log' : 'Recent Activity'}</h2></div>
      <div className="activity-list">
        {list.map(e => (
          <div key={e.id} className="activity-row">
            <time>{formatDateTime(e.created_at)}</time>
            <strong>{e.action}</strong>
            <span>{e.details}</span>
          </div>
        ))}
        {!list.length && <p className="empty">No activity yet</p>}
      </div>
    </div>
  );
}
