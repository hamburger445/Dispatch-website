export default function Header({ connected, theme, onToggleTheme, onSearch }) {
  return (
    <header className="cad-header">
      <div className="cad-header-title">Greenville Computer Aided Dispatch</div>
      <div className="cad-header-actions">
        <div className={`conn-pill${connected ? ' ok' : ''}`}>{connected ? '● LIVE' : '○ RECONNECTING'}</div>
        <button className="icon-btn" onClick={onSearch} title="Search (Ctrl+F)">🔍 Search</button>
        <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    </header>
  );
}
