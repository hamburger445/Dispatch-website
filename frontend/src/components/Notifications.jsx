export default function Notifications({ items }) {
  return (
    <div className="toasts">
      {items.map(n => (
        <div key={n.id} className={`toast toast-${n.type || 'info'}`}>{n.message}</div>
      ))}
    </div>
  );
}
