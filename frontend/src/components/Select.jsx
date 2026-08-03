import { useState, useRef, useEffect } from 'react';

export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  className = '',
  size = '',
  disabled = false,
  style = {},
  variant = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find(o => String(o.value) === String(value));
  const label = selected?.label ?? placeholder;

  return (
    <div
      className={`cad-select ${size} ${variant} ${className} ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
      ref={ref}
      style={style}
    >
      <button
        type="button"
        className="cad-select-trigger"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
      >
        <span className="cad-select-label">{label}</span>
        <span className="cad-select-chevron" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="cad-select-menu" role="listbox">
          {options.map(opt => (
            <li key={String(opt.value)}>
              <button
                type="button"
                role="option"
                aria-selected={String(opt.value) === String(value)}
                className={String(opt.value) === String(value) ? 'active' : ''}
                style={opt.color ? { borderLeftColor: opt.color } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
