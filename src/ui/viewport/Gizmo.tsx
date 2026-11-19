import { useRef } from 'react';
import { type RefObject } from 'react';
import { cameraBasis, orthoHalfHeight, project, type Vec3 } from '../../render/camera';
import { beginGesture, endMerge, setParam, useEditor, store } from '../../state/store';
import { placementOf, rotateParam, worldDeltaToParam } from './gizmoMath';

const AXES: { key: 'x' | 'y' | 'z'; dir: Vec3; color: string }[] = [
  { key: 'x', dir: [1, 0, 0], color: '#ef5b5b' },
  { key: 'y', dir: [0, 1, 0], color: '#5bc46a' },
  { key: 'z', dir: [0, 0, 1], color: '#5b8def' },
];

/**
 * Screen-space move gizmo for the selected node: drag an arrow to move along
 * that world axis, drag the centre to move in the view plane. Arrow keys move
 * by 1 mm (Shift: 10 mm) when a handle has focus.
 */
export function Gizmo({
  canvasRef,
  onInteract,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onInteract: () => void;
}) {
  const sel = useEditor((s) => s.selection[0] ?? null);
  const mode = useEditor((s) => s.gizmoMode);
  const doc = useEditor((s) => s.doc);
  const camera = useEditor((s) => s.camera);
  const viewMode = useEditor((s) => s.viewMode);
  const dragging = useRef(false);
  const canvas = canvasRef.current;
  if (!sel || !canvas || viewMode === 'cost') return null;
  const pl = placementOf(doc, sel);
  if (!pl) return null;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  const o = project(camera, pl.origin, w, h);
  if (!o) return null;
  // pixels per world unit at the origin's depth (constant in orthographic views)
  const unitPx = camera.ortho
    ? h / (2 * orthoHalfHeight(camera))
    : h / (2 * o.depth * Math.tan(((camera.fov / 2) * Math.PI) / 180));
  const len = 72 / unitPx;
  const mm = doc.settings.mmPerUnit;
  const node = doc.nodes.find((n) => n.id === sel)!;

  const moveBy = (world: number[], merge = true) => {
    const cur = store.getState().doc.nodes.find((n) => n.id === sel);
    if (!cur) return;
    const d = worldDeltaToParam(pl, world);
    const p = cur.params.position as number[];
    const next = p.map((v, i) => Math.round((v + d[i]) * 1e4) / 1e4);
    setParam(sel, 'position', next, merge);
    onInteract();
  };

  const startDrag = (e: React.PointerEvent, axis: Vec3 | null) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    dragging.current = true;
    let last = { x: e.clientX, y: e.clientY };
    beginGesture();
    const startPos = [...(node.params.position as number[])];
    const total = [0, 0, 0];
    // screen direction of the axis
    let sdir = [0, 0];
    if (axis) {
      const tip = project(
        camera,
        [pl.origin[0] + axis[0], pl.origin[1] + axis[1], pl.origin[2] + axis[2]],
        w,
        h,
      );
      if (tip) sdir = [tip.x - o.x, tip.y - o.y];
    }
    const cy = Math.cos(camera.yaw),
      sy = Math.sin(camera.yaw),
      cp = Math.cos(camera.pitch),
      sp = Math.sin(camera.pitch);
    const right = [cy, 0, -sy];
    const up = [-sy * sp, cp, -cy * sp];
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.x,
        dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      const fine = ev.shiftKey ? 0.2 : 1;
      let world: number[];
      if (axis) {
        const l2 = sdir[0] ** 2 + sdir[1] ** 2;
        if (l2 < 4) return;
        const t = ((dx * sdir[0] + dy * sdir[1]) / l2) * fine;
        world = axis.map((a) => a * t);
      } else {
        world = [0, 1, 2].map((i) => ((right[i] * dx - up[i] * dy) / unitPx) * fine);
      }
      for (let i = 0; i < 3; i++) total[i] += world[i];
      // snap the param to 1 mm steps with Ctrl/Cmd
      const d = worldDeltaToParam(pl, total);
      let next = startPos.map((v, i) => v + d[i]);
      if (ev.ctrlKey || ev.metaKey) next = next.map((v) => Math.round((v * mm) / 1) / mm);
      setParam(
        sel,
        'position',
        next.map((v) => Math.round(v * 1e4) / 1e4),
      );
      onInteract();
    };
    const up2 = () => {
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up2);
      el.removeEventListener('pointercancel', up2);
      dragging.current = false;
      endMerge();
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up2);
    el.addEventListener('pointercancel', up2);
  };

  const onKey = (e: React.KeyboardEvent, axis: Vec3 | null) => {
    const step = (e.shiftKey ? 10 : 1) / mm;
    let world: number[] | null = null;
    if (axis) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') world = axis.map((a) => a * step);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') world = axis.map((a) => -a * step);
    } else {
      if (e.key === 'ArrowRight') world = [step, 0, 0];
      if (e.key === 'ArrowLeft') world = [-step, 0, 0];
      if (e.key === 'ArrowUp') world = [0, step, 0];
      if (e.key === 'ArrowDown') world = [0, -step, 0];
    }
    if (world) {
      e.preventDefault();
      moveBy(world);
    }
  };

  // ---- rotate: one ring per world axis -------------------------------------
  if (mode === 'rotate') {
    const back = cameraBasis(camera).back;
    const turn = (axis: Vec3, angle: number, merge = true) => {
      const cur = store.getState().doc.nodes.find((n) => n.id === sel);
      if (!cur) return;
      setParam(sel, 'rotation', rotateParam(pl, cur.params.rotation as number[], axis, angle), merge);
      onInteract();
    };
    const startTurn = (e: React.PointerEvent, axis: Vec3) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as Element;
      el.setPointerCapture(e.pointerId);
      beginGesture();
      const r = (el.closest('svg') as SVGSVGElement).getBoundingClientRect();
      const ang = (ev: { clientX: number; clientY: number }) =>
        Math.atan2(ev.clientY - r.top - o.y, ev.clientX - r.left - o.x);
      const a0 = ang(e);
      const startRot = [...(node.params.rotation as number[])];
      // screen angles grow clockwise (y down): a ring facing the camera turns the other way
      const sign = axis[0] * back[0] + axis[1] * back[1] + axis[2] * back[2] > 0 ? -1 : 1;
      const move = (ev: PointerEvent) => {
        let delta = ang(ev) - a0;
        if (ev.ctrlKey || ev.metaKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12); // 15° steps
        setParam(sel, 'rotation', rotateParam(pl, startRot, axis, sign * delta));
        onInteract();
      };
      const up = () => {
        el.removeEventListener('pointermove', move as EventListener);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        endMerge();
      };
      el.addEventListener('pointermove', move as EventListener);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    const radius = 78 / unitPx;
    return (
      <svg className="gizmo" width={w} height={h} role="group" aria-label="Rotate gizmo">
        {AXES.map((a, ai) => {
          // two unit vectors perpendicular to the axis
          const u: Vec3 = ai === 0 ? [0, 1, 0] : [1, 0, 0];
          const v: Vec3 = [
            a.dir[1] * u[2] - a.dir[2] * u[1],
            a.dir[2] * u[0] - a.dir[0] * u[2],
            a.dir[0] * u[1] - a.dir[1] * u[0],
          ];
          const pts: string[] = [];
          for (let k = 0; k <= 64; k++) {
            const t = (k / 64) * Math.PI * 2;
            const p = project(
              camera,
              [0, 1, 2].map((i) => pl.origin[i] + radius * (u[i] * Math.cos(t) + v[i] * Math.sin(t))) as Vec3,
              w,
              h,
            );
            if (p) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          }
          const d = `M${pts.join('L')}`;
          return (
            <g
              key={a.key}
              className="handle"
              tabIndex={0}
              role="slider"
              aria-label={`Rotate around ${a.key.toUpperCase()}`}
              aria-valuetext="Arrow keys turn by 5 degrees, Shift by 15"
              aria-valuenow={(node.params.rotation as number[])[ai]}
              onPointerDown={(e) => startTurn(e, a.dir)}
              onKeyDown={(e) => {
                const step = ((e.shiftKey ? 15 : 5) * Math.PI) / 180;
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') turn(a.dir, step);
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') turn(a.dir, -step);
                else return;
                e.preventDefault();
                endMerge();
              }}
              data-testid={`gizmo-rot-${a.key}`}
            >
              <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={d} fill="none" stroke={a.color} strokeWidth={2.5} />
            </g>
          );
        })}
        <circle cx={o.x} cy={o.y} r={4} fill="rgba(255,255,255,0.9)" stroke="rgba(0,0,0,0.5)" />
      </svg>
    );
  }

  // ---- scale: drag any handle away from or toward the centre ----------------
  if (mode === 'scale') {
    const scale = (node.params.scale as number) ?? 1;
    const setScale = (v: number, merge = true) => {
      setParam(sel, 'scale', Math.max(0.01, Math.round(v * 1e4) / 1e4), merge);
      onInteract();
    };
    const startScale = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as Element;
      el.setPointerCapture(e.pointerId);
      beginGesture();
      const r = (el.closest('svg') as SVGSVGElement).getBoundingClientRect();
      const dist = (ev: { clientX: number; clientY: number }) =>
        Math.max(4, Math.hypot(ev.clientX - r.left - o.x, ev.clientY - r.top - o.y));
      const d0 = dist(e);
      const s0 = scale;
      const move = (ev: PointerEvent) => {
        let s = s0 * (dist(ev) / d0);
        if (ev.ctrlKey || ev.metaKey) s = Math.round(s * 10) / 10;
        setScale(s);
      };
      const up = () => {
        el.removeEventListener('pointermove', move as EventListener);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        endMerge();
      };
      el.addEventListener('pointermove', move as EventListener);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    const onScaleKey = (e: React.KeyboardEvent) => {
      const f = e.shiftKey ? 1.2 : 1.05;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setScale(scale * f);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setScale(scale / f);
      else return;
      e.preventDefault();
      endMerge();
    };
    return (
      <svg className="gizmo" width={w} height={h} role="group" aria-label="Scale gizmo">
        {AXES.map((a) => {
          const tip = project(camera, [0, 1, 2].map((i) => pl.origin[i] + a.dir[i] * len) as Vec3, w, h);
          if (!tip || Math.hypot(tip.x - o.x, tip.y - o.y) < 12) return null;
          return (
            <g key={a.key} className="handle" onPointerDown={startScale} aria-hidden="true">
              <line x1={o.x} y1={o.y} x2={tip.x} y2={tip.y} stroke="transparent" strokeWidth={16} />
              <line x1={o.x} y1={o.y} x2={tip.x} y2={tip.y} stroke={a.color} strokeWidth={2.5} />
              <rect x={tip.x - 6} y={tip.y - 6} width={12} height={12} fill={a.color} rx={2} />
            </g>
          );
        })}
        <g
          className="handle"
          tabIndex={0}
          role="slider"
          aria-label="Scale"
          aria-valuenow={scale}
          aria-valuetext={`${Math.round(scale * 100)} percent`}
          onPointerDown={startScale}
          onKeyDown={onScaleKey}
          data-testid="gizmo-scale"
        >
          <rect x={o.x - 9} y={o.y - 9} width={18} height={18} fill="transparent" />
          <rect
            x={o.x - 6}
            y={o.y - 6}
            width={12}
            height={12}
            rx={2}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={1.5}
          />
        </g>
      </svg>
    );
  }

  return (
    <svg className="gizmo" width={w} height={h} aria-hidden={false} role="group" aria-label="Move gizmo">
      {AXES.map((a) => {
        const tip = project(
          camera,
          [pl.origin[0] + a.dir[0] * len, pl.origin[1] + a.dir[1] * len, pl.origin[2] + a.dir[2] * len],
          w,
          h,
        );
        if (!tip) return null;
        const vx = tip.x - o.x,
          vy = tip.y - o.y;
        const L = Math.hypot(vx, vy);
        if (L < 12) return null; // axis points at the camera
        const ux = vx / L,
          uy = vy / L;
        const head = `M${tip.x + ux * 10},${tip.y + uy * 10} L${tip.x - uy * 6},${tip.y + ux * 6} L${tip.x + uy * 6},${tip.y - ux * 6} Z`;
        return (
          <g
            key={a.key}
            className="handle"
            tabIndex={0}
            role="slider"
            aria-label={`Move along ${a.key.toUpperCase()}`}
            aria-valuenow={
              Math.round(((node.params.position as number[])['xyz'.indexOf(a.key)] ?? 0) * mm * 10) / 10
            }
            aria-valuetext={`${a.key.toUpperCase()} position, millimetres`}
            onPointerDown={(e) => startDrag(e, a.dir)}
            onKeyDown={(e) => onKey(e, a.dir)}
            data-testid={`gizmo-${a.key}`}
          >
            <line x1={o.x} y1={o.y} x2={tip.x} y2={tip.y} stroke="transparent" strokeWidth={16} />
            <line
              x1={o.x + ux * 12}
              y1={o.y + uy * 12}
              x2={tip.x}
              y2={tip.y}
              stroke={a.color}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <path d={head} fill={a.color} stroke={a.color} strokeWidth={2} strokeLinejoin="round" />
          </g>
        );
      })}
      <g
        className="handle"
        tabIndex={0}
        role="button"
        aria-label="Move in the view plane (arrow keys move along X and Y)"
        onPointerDown={(e) => startDrag(e, null)}
        onKeyDown={(e) => onKey(e, null)}
        data-testid="gizmo-center"
      >
        <circle cx={o.x} cy={o.y} r={14} fill="transparent" />
        <circle
          cx={o.x}
          cy={o.y}
          r={7}
          fill="rgba(255,255,255,0.9)"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={1.5}
        />
      </g>
    </svg>
  );
}
