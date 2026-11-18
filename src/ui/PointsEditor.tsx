import { useId, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { FieldProps } from './fields';
import { VecField } from './fields';
import type { Vec2Param } from '../core/nodes/types';
import {
  MAX_POINTS,
  MIN_POINTS,
  type ProfilePoint,
  profilePolygon,
  readPoints,
  selfIntersects,
  writePoints,
} from '../core/profile';
import { fmt } from './format';
import { beginGesture } from '../state/store';

const SIZE = 240;
const PAD = 22;

/**
 * Point editor for the Profile node. Drag points, click "+" on an edge to add
 * one, toggle sharp/smooth, delete. Fully keyboard-usable: points are buttons;
 * arrows move (Shift = fine), S toggles the corner type, Delete removes.
 */
export function PointsField({ def, value, mmPerUnit, onChange, onCommit, label }: FieldProps) {
  const pts = readPoints(value as number[]);
  const [sel, setSel] = useState(0);
  const selected = Math.min(sel, pts.length - 1);
  const svgRef = useRef<SVGSVGElement>(null);
  // the view is frozen while dragging so the shape doesn't slide under the pointer
  const frozen = useRef<View | null>(null);
  const live = useMemo(() => viewFor(pts), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = frozen.current ?? live;
  const poly = profilePolygon(value as number[]);
  const crossing = selfIntersects(poly);
  const name = label ?? def.label;
  const uid = useId();
  const lblId = `${uid}-lbl`,
    helpId = `${uid}-help`,
    gridId = `${uid}-grid`;

  const set = (next: ProfilePoint[]) => onChange(writePoints(next));
  const toSvg = (x: number, y: number) => [view.ox + x * view.k, view.oy - y * view.k];
  const fromClient = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = ((cx - r.left) / r.width) * SIZE,
      sy = ((cy - r.top) / r.height) * SIZE;
    return [(sx - view.ox) / view.k, (view.oy - sy) / view.k];
  };
  const snap = (v: number, fine: boolean) => {
    const s = fine ? 0.005 : 0.025;
    return Math.round(v / s) * s;
  };

  const startDrag = (i: number) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSel(i);
    beginGesture();
    frozen.current = view;
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const [x, y] = fromClient(ev.clientX, ev.clientY);
      const next = readPoints(valueRef.current);
      next[i] = { ...next[i], x: snap(x, ev.shiftKey), y: snap(y, ev.shiftKey) };
      set(next);
    };
    const up = () => {
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      frozen.current = null;
      onCommit();
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  // pointer handlers read the latest value, not the one captured at drag start
  const valueRef = useRef(value as number[]);
  valueRef.current = value as number[];

  const insertAfter = (i: number) => {
    if (pts.length >= MAX_POINTS) return;
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const next = [...pts];
    next.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, sharp: a.sharp && b.sharp });
    set(next);
    onCommit();
    setSel(i + 1);
  };
  const remove = (i: number) => {
    if (pts.length <= MIN_POINTS) return;
    set(pts.filter((_, k) => k !== i));
    onCommit();
    setSel(Math.max(0, i - 1));
  };
  const toggle = (i: number) => {
    set(pts.map((p, k) => (k === i ? { ...p, sharp: !p.sharp } : p)));
    onCommit();
  };
  const onKey = (i: number) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.005 : 0.05;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (d[e.key]) {
      e.preventDefault();
      set(pts.map((p, k) => (k === i ? { ...p, x: p.x + d[e.key][0], y: p.y + d[e.key][1] } : p)));
      onCommit();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(i);
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      toggle(i);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      insertAfter(i);
    }
  };

  const mm = (v: number) => `${fmt(v * mmPerUnit, mmPerUnit >= 10 ? 1 : 2)} mm`;
  const path =
    poly.length >= 6
      ? 'M' +
        chunk(poly)
          .map(([x, y]) => toSvg(x, y).join(','))
          .join('L') +
        'Z'
      : '';
  const axisX = toSvg(0, 0)[0];
  const sp = pts[selected];
  const coordDef: Vec2Param = {
    key: 'pt',
    label: `Point ${selected + 1}`,
    kind: 'vec2',
    unit: 'length',
    default: [0, 0],
    softMin: -2,
    softMax: 2,
  };

  return (
    <div className="points-field nokey" data-testid="points-editor">
      <div className="field-label" id={lblId}>
        {name}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="points-canvas"
        role="group"
        aria-labelledby={lblId}
        aria-describedby={helpId}
      >
        <defs>
          <pattern
            id={gridId}
            width={view.grid}
            height={view.grid}
            patternUnits="userSpaceOnUse"
            x={view.ox}
            y={view.oy}
          >
            <path d={`M ${view.grid} 0 L 0 0 0 ${view.grid}`} className="pts-gridline" />
          </pattern>
        </defs>
        <rect width={SIZE} height={SIZE} fill={`url(#${gridId})`} />
        {axisX > 0 && axisX < SIZE && (
          <>
            <line x1={axisX} x2={axisX} y1={0} y2={SIZE} className="pts-axis" />
            <text x={axisX + 4} y={12} className="pts-axis-label">
              axis
            </text>
          </>
        )}
        <path d={path} className={`pts-shape ${crossing ? 'bad' : ''}`} />
        {pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const [mx, my] = toSvg((p.x + q.x) / 2, (p.y + q.y) / 2);
          return pts.length < MAX_POINTS ? (
            <g
              key={`m${i}`}
              className="pts-add"
              onPointerDown={(e) => {
                e.preventDefault();
                insertAfter(i);
              }}
              aria-hidden="true"
            >
              <circle cx={mx} cy={my} r={7} />
              <path d={`M${mx - 3.5},${my}h7M${mx},${my - 3.5}v7`} />
            </g>
          ) : null;
        })}
        {pts.map((p, i) => {
          const [x, y] = toSvg(p.x, p.y);
          const label = `Point ${i + 1}: ${mm(p.x)} across, ${mm(p.y)} up, ${p.sharp ? 'sharp corner' : 'smooth'}`;
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={i === selected}
              className={`pts-handle ${i === selected ? 'sel' : ''}`}
              onPointerDown={startDrag(i)}
              onFocus={() => setSel(i)}
              onKeyDown={onKey(i)}
              onDoubleClick={() => toggle(i)}
              data-testid={`point-${i}`}
            >
              <title>{label}</title>
              <circle cx={x} cy={y} r={14} className="hit" />
              {p.sharp ? (
                <rect x={x - 5} y={y - 5} width={10} height={10} />
              ) : (
                <circle cx={x} cy={y} r={5.5} />
              )}
            </g>
          );
        })}
      </svg>
      <p className="muted" id={helpId} style={{ fontSize: 11.5, margin: '4px 0 8px' }}>
        Drag points (Shift for fine steps) · + on an edge adds one · double-click or S switches sharp/smooth ·
        Delete removes · arrows nudge.
      </p>
      {crossing && (
        <p className="note warn" role="alert" style={{ fontSize: 12 }}>
          The outline crosses itself, so inside and outside are ambiguous. Move a point to untangle it.
        </p>
      )}
      {sp && (
        <>
          <VecField
            def={coordDef}
            value={[sp.x, sp.y]}
            mmPerUnit={mmPerUnit}
            onChange={(v) => {
              const [x, y] = v as number[];
              set(pts.map((p, k) => (k === selected ? { ...p, x, y } : p)));
            }}
            onCommit={onCommit}
          />
          <div className="points-actions">
            <div className="segmented" role="radiogroup" aria-label={`Point ${selected + 1} corner`}>
              <button
                type="button"
                role="radio"
                aria-checked={sp.sharp}
                onClick={() => !sp.sharp && toggle(selected)}
              >
                Sharp
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!sp.sharp}
                onClick={() => sp.sharp && toggle(selected)}
              >
                Smooth
              </button>
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={() => insertAfter(selected)}
              disabled={pts.length >= MAX_POINTS}
              title="Add a point after this one"
            >
              <Plus size={13} /> Add
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => remove(selected)}
              disabled={pts.length <= MIN_POINTS}
              title="Remove this point"
            >
              <Minus size={13} /> Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface View {
  ox: number;
  oy: number;
  k: number;
  grid: number;
}

/** Fit the points (and the axis) into the square with padding; grid of 0.1 units, or 0.5 when zoomed out. */
function viewFor(pts: ProfilePoint[]): View {
  let x0 = 0,
    x1 = 0,
    y0 = 0,
    y1 = 0;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const span = Math.max(x1 - x0, y1 - y0, 0.5);
  const k = (SIZE - 2 * PAD) / span;
  const ox = (SIZE - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (SIZE + (y1 - y0) * k) / 2 + y0 * k;
  const unit = span > 4 ? 0.5 : 0.1;
  return { ox, oy, k, grid: unit * k };
}

function chunk(flat: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
