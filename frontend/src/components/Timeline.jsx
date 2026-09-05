import { formatDateTime } from '../constants';

export default function Timeline({ timeline }) {
  if (!timeline?.length) return <p className="muted">No timeline events yet.</p>;
  return (
    <ul className="timeline">
      {timeline.map(t => (
        <li key={t.id}>
          <span className="tl-time">{new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="tl-event">{t.event}</span>
          {t.details && <span className="tl-details muted">{t.details}</span>}
        </li>
      ))}
    </ul>
  );
}
