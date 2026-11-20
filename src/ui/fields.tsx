import { useEffect, useId, useRef, useState } from 'react';
import { Pin } from 'lucide-react';
import type { ParamDef, ParamValue } from '../core/nodes/types';
import { type DisplayUnit, displayUnit, fmt, fromHex, parseNumber, toHex } from './format';
import { PALETTE } from '../state/ops';
import { beginGesture } from '../state/store';
import { PointsField } from './PointsEditor';
import { SvgField } from './SvgField';

export interface FieldProps {
  def: ParamDef;
  value: ParamValue;
  mmPerUnit: number;
  /** live change (merged into one undo step while dragging) */
  onChange: (v: ParamValue) => void;
  /** gesture finished */
  onCommit: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  label?: string;
}

function softRange(def: ParamDef): [number, number] {
  const d = def as { min?: number; max?: number; softMin?: number; softMax?: number };
  const lo = d.softMin ?? d.min ?? 0;
  const hi = d.softMax ?? d.max ?? 1;
  return [lo, Math.max(hi, lo + 1e-6)];
}

function clampHard(def: ParamDef, v: number): number {
  const d = def as { min?: number; max?: number };
  if (d.min !== undefined) v = Math.max(d.min, v);
  if (d.max !== undefined) v = Math.min(d.max, v);
  if (def.kind === 'int') v = Math.round(v);
  return v;
}

/** Drag horizontally on an element to scrub a value. */
function useScrub(
  get: () => number,
  set: (v: number) => void,
  onEnd: () => void,
  perPixel: number,
): { onPointerDown: (e: React.PointerEvent) => void } {
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      const start = get();
      const x0 = e.clientX;
      let moved = false;
      el.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 3) return;
        if (!moved) beginGesture();
        moved = true;
        const mult = ev.shiftKey ? 0.1 : ev.altKey || ev.ctrlKey ? 10 : 1;
        set(start + dx * perPixel * mult);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (moved) onEnd();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
  };
}

function PinButton({ pinned, onToggle, label }: { pinned?: boolean; onToggle?: () => void; label: string }) {
  if (!onToggle) return <span />;
  return (
    <button
      type="button"
      className="pin-btn"
      aria-pressed={!!pinned}
      title={pinned ? 'Remove from Controls' : 'Pin to Controls (shown when nothing is selected)'}
      aria-label={pinned ? `Unpin ${label} from Controls` : `Pin ${label} to Controls`}
      onClick={onToggle}
    >
      <Pin size={13} />
    </button>
  );
}

/** Text box that edits a number in display units; accepts simple arithmetic. */
function NumText({
  value,
  unit,
  onSet,
  onCommit,
  label,
  className = 'num-text',
  step,
}: {
  value: number;
  unit: DisplayUnit;
  onSet: (displayValue: number) => void;
  onCommit: () => void;
  label: string;
  className?: string;
  step: number;
}) {
  const shown = fmt(value * unit.factor, unit.decimals);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const apply = () => {
    const v = parseNumber(text);
    if (v !== null) onSet(v);
    else setText(shown);
    onCommit();
  };
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={unit.suffix ? `${label} (${unit.suffix})` : label}
      value={editing ? text : shown}
      onFocus={(e) => {
        setEditing(true);
        setText(shown);
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={() => {
        setEditing(false);
        if (text !== shown) apply();
        else onCommit();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          apply();
          (e.target as HTMLInputElement).select();
        } else if (e.key === 'Escape') {
          setText(shown);
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          const cur = parseNumber(text) ?? value * unit.factor;
          const nv = cur + (e.key === 'ArrowUp' ? 1 : -1) * step * mult;
          onSet(nv);
          setText(fmt(nv, unit.decimals));
        }
      }}
    />
  );
}

function niceStep(range: number): number {
  const raw = range / 100;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}

export function NumberField({
  def,
  value,
  mmPerUnit,
  onChange,
  onCommit,
  pinned,
  onTogglePin,
  label,
}: FieldProps) {
  const id = useId();
  const unit = displayUnit(def, mmPerUnit);
  const v = value as number;
  const [lo, hi] = softRange(def);
  const dlo = lo * unit.factor,
    dhi = hi * unit.factor;
  const step = def.kind === 'int' ? 1 : ((def as { step?: number }).step ?? niceStep(dhi - dlo));
  const setDisplay = (dv: number) => onChange(clampHard(def, dv / unit.factor));
  const scrub = useScrub(() => v * unit.factor, setDisplay, onCommit, (dhi - dlo) / 220);
  const name = label ?? def.label;
  return (
    <div className="field" title={def.help}>
      <label className="field-label scrub" htmlFor={id} {...scrub}>
        {name}
      </label>
      <div className="num">
        <input
          id={id}
          type="range"
          min={dlo}
          max={dhi}
          step={step}
          value={Math.min(dhi, Math.max(dlo, v * unit.factor))}
          aria-valuetext={`${fmt(v * unit.factor, unit.decimals)} ${unit.suffix}`}
          onChange={(e) => setDisplay(parseFloat(e.target.value))}
          onPointerDown={beginGesture}
          onPointerUp={onCommit}
          onPointerCancel={onCommit}
          onKeyUp={onCommit}
        />
        <NumText value={v} unit={unit} onSet={setDisplay} onCommit={onCommit} label={name} step={step} />
        <span className="unit" aria-hidden="true">
          {unit.suffix}
        </span>
      </div>
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

const AXES = ['x', 'y', 'z'];

export function VecField({
  def,
  value,
  mmPerUnit,
  onChange,
  onCommit,
  pinned,
  onTogglePin,
  label,
}: FieldProps) {
  const unit = displayUnit(def, mmPerUnit);
  const arr = value as number[];
  const [lo, hi] = softRange(def);
  const range = (hi - lo) * unit.factor;
  const step = (def as { step?: number }).step ?? niceStep(range);
  const name = label ?? def.label;
  const setComp = (i: number, dv: number) => {
    const next = [...arr];
    next[i] = clampHard(def, dv / unit.factor);
    onChange(next);
  };
  return (
    <div className="field" title={def.help}>
      <span className="field-label">{name}</span>
      <div className={`vec ${arr.length === 2 ? 'two' : ''}`} role="group" aria-label={name}>
        {arr.map((c, i) => (
          <VecComp
            key={i}
            axis={AXES[i]}
            value={c}
            unit={unit}
            perPixel={range / 220}
            step={step}
            onSet={(dv) => setComp(i, dv)}
            onCommit={onCommit}
            label={`${name} ${AXES[i].toUpperCase()}`}
          />
        ))}
      </div>
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

function VecComp(props: {
  axis: string;
  value: number;
  unit: DisplayUnit;
  perPixel: number;
  step: number;
  onSet: (dv: number) => void;
  onCommit: () => void;
  label: string;
}) {
  const scrub = useScrub(() => props.value * props.unit.factor, props.onSet, props.onCommit, props.perPixel);
  return (
    <div className="vec-comp">
      <span className={props.axis} {...scrub} aria-hidden="true" title="Drag to change">
        {props.axis.toUpperCase()}
      </span>
      <NumText
        className=""
        value={props.value}
        unit={props.unit}
        onSet={props.onSet}
        onCommit={props.onCommit}
        label={props.label}
        step={props.step}
      />
    </div>
  );
}

export function ColorField({ def, value, onChange, onCommit, pinned, onTogglePin, label }: FieldProps) {
  const id = useId();
  const c = value as number[];
  const name = label ?? def.label;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {name}
      </label>
      <div className="color-field">
        <input
          id={id}
          type="color"
          value={toHex(c)}
          onChange={(e) => onChange(fromHex(e.target.value))}
          onBlur={onCommit}
        />
        {PALETTE.map((p, i) => (
          <button
            key={i}
            type="button"
            className="swatch"
            style={{ background: toHex(p) }}
            aria-label={`Use colour ${toHex(p)}`}
            onClick={() => {
              onChange([...p]);
              onCommit();
            }}
          />
        ))}
      </div>
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

export function EnumField({ def, value, onChange, onCommit, pinned, onTogglePin, label }: FieldProps) {
  if (def.kind !== 'enum') return null;
  const name = label ?? def.label;
  if (def.options.length > 4)
    // too many choices for a row of buttons in a narrow panel
    return (
      <div className="field" title={def.help}>
        <span className="field-label">{name}</span>
        <select
          className="select"
          aria-label={name}
          value={String(value)}
          onChange={(e) => {
            onChange(e.target.value);
            onCommit();
          }}
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
      </div>
    );
  return (
    <div className="field" title={def.help}>
      <span className="field-label" id={`${def.key}-lbl`}>
        {name}
      </span>
      <div className="segmented" role="radiogroup" aria-label={name}>
        {def.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => {
              onChange(o.value);
              onCommit();
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

export function BoolField({ def, value, onChange, onCommit, pinned, onTogglePin, label }: FieldProps) {
  const name = label ?? def.label;
  return (
    <div className="field" title={def.help}>
      <span className="field-label">{name}</span>
      <label className="toggle">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => {
            onChange(e.target.checked);
            onCommit();
          }}
        />
        <span className="text-2">{value ? 'On' : 'Off'}</span>
        <span className="sr-only">{name}</span>
      </label>
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

export function TextField({ def, value, onChange, onCommit, pinned, onTogglePin, label }: FieldProps) {
  const id = useId();
  const name = label ?? def.label;
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => setText(String(value ?? '')), [value]);
  const max = def.kind === 'text' ? def.maxLength : 32;
  return (
    <div className="field" title={def.help}>
      <label className="field-label" htmlFor={id}>
        {name}
      </label>
      <input
        id={id}
        className="text-input"
        value={text}
        maxLength={max}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && onCommit()}
      />
      <PinButton pinned={pinned} onToggle={onTogglePin} label={name} />
    </div>
  );
}

export function ParamField(props: FieldProps) {
  switch (props.def.kind) {
    case 'text':
      return props.def.ui === 'svg' ? <SvgField {...props} /> : <TextField {...props} />;
    case 'float':
    case 'int':
      return <NumberField {...props} />;
    case 'vec2':
    case 'vec3':
      return <VecField {...props} />;
    case 'color':
      return <ColorField {...props} />;
    case 'enum':
      return <EnumField {...props} />;
    case 'bool':
      return <BoolField {...props} />;
    case 'points':
      return <PointsField {...props} />;
  }
}

/** Uncontrolled text field that commits on blur/enter. */
export function CommitInput({
  value,
  onCommit,
  className,
  label,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  label: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      ref={ref}
      className={className}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ref.current?.blur();
        if (e.key === 'Escape') {
          setText(value);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
    />
  );
}
