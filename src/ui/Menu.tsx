import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export interface MenuItem {
  id: string;
  label: string;
  desc?: string;
  icon?: ReactNode;
  checked?: boolean;
  /** a standalone on/off item (menuitemcheckbox) rather than one choice of a group */
  toggle?: boolean;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Accessible dropdown menu button (WAI-ARIA menu button pattern). */
export function Menu({
  label,
  icon,
  text,
  items,
  buttonClass = 'btn',
  align = 'start',
  testId,
}: {
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  items: MenuItem[];
  buttonClass?: string;
  align?: 'start' | 'end';
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const mw = menu.current?.offsetWidth ?? 220;
    const mh = menu.current?.offsetHeight ?? 200;
    let left = align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    setPos({ left, top });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node))
        setOpen(false);
    };
    // Escape closes the menu even if focus has not moved into it yet
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onEsc, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onEsc, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = Math.max(
        0,
        items.findIndex((i) => i.checked),
      );
      setActive(enabled.includes(idx) ? idx : (enabled[0] ?? 0));
      requestAnimationFrame(() => menu.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (i: number) => {
    const it = items[i];
    if (!it || it.disabled) return;
    setOpen(false);
    btn.current?.focus();
    it.onSelect();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const at = enabled.indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(enabled[(at + 1) % enabled.length]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(enabled[(at - 1 + enabled.length) % enabled.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(enabled[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(enabled[enabled.length - 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };

  const hasRadios = items.some((it) => it.checked !== undefined && !it.toggle);
  const hasMarks = items.some((it) => it.checked !== undefined);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={buttonClass}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={text ? undefined : label}
        title={label}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {text}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="menu"
            role="menu"
            aria-label={label}
            tabIndex={-1}
            style={{ left: pos.left, top: pos.top }}
            onKeyDown={onKey}
            aria-activedescendant={`${id}-${active}`}
          >
            {items.map((it, i) => (
              <div
                key={it.id}
                id={`${id}-${i}`}
                role={
                  it.toggle
                    ? 'menuitemcheckbox'
                    : hasRadios && it.checked !== undefined
                      ? 'menuitemradio'
                      : 'menuitem'
                }
                aria-checked={it.checked !== undefined ? !!it.checked : undefined}
                aria-disabled={it.disabled || undefined}
                className="menu-item"
                data-active={i === active}
                style={it.disabled ? { opacity: 0.45 } : undefined}
                onPointerMove={() => !it.disabled && setActive(i)}
                onClick={() => choose(i)}
              >
                {hasMarks && <span style={{ width: 14 }}>{it.checked && <Check size={14} />}</span>}
                {it.icon}
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{it.label}</span>
                  {it.desc && <span className="desc">{it.desc}</span>}
                </span>
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
