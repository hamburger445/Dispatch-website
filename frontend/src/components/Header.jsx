export default function Header({ connected, theme, onToggleTheme, onSearch, user, onLogout, onAdmin }) {
  return (
    <header className="cad-header">
      <div className="cad-header-title">Greenville Computer Aided Dispatch</div>
      <div className="cad-header-actions">
        <div className={`conn-pill${connected ? ' ok' : ''}`}>{connected ? '● LIVE' : '○ RECONNECTING'}</div>
        <button className="icon-btn" onClick={onSearch} title="Search (Ctrl+F)">🔍 Search</button>
        {onAdmin && <button className="icon-btn" onClick={onAdmin} title="Administration">⚙ Admin</button>}
        {onToggleTheme && <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>}
        {user && (
          <span className="header-user">
            {user.name} <span className="muted">({user.role})</span>
            <button className="btn-xs" onClick={onLogout}>Sign Out</button>
          </span>
        )}
      </div>
    </header>
  );
}
