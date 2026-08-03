import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  portal = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState(null);
  const ref = useRef(null);

  const updateMenuRect = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const menuMaxH = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuMaxH && rect.top > spaceBelow;
    setMenuRect({
      left: rect.left,
      width: rect.width,
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    const close = (e) => {
      if (!ref.current?.contains(e.target) && !e.target.closest?.('.cad-select-menu-portal')) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => updateMenuRect();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const selected = options.find(o => String(o.value) === String(value));
  const label = selected?.label ?? placeholder;

  const menu = open && (
    <ul
      className={`cad-select-menu ${portal ? 'cad-select-menu-portal' : ''}`}
      role="listbox"
      style={portal && menuRect ? {
        position: 'fixed',
        left: menuRect.left,
        width: menuRect.width,
        top: menuRect.openUp ? undefined : menuRect.top,
        bottom: menuRect.openUp ? menuRect.bottom : undefined,
        zIndex: 9999,
      } : undefined}
    >
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
  );

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
      {portal ? createPortal(menu, document.body) : menu}
    </div>
  );
}
