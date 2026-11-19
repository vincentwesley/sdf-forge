import type { RefObject } from 'react';
import { Ruler, X } from 'lucide-react';
import { project, type Vec3 } from '../../render/camera';
import { actions, useEditor } from '../../state/store';
import { fmt } from '../format';

/**
 * Measure tool overlay: the picked points, the line between them and the
 * distance in millimetres (plus its X/Y/Z parts) in a small panel.
 */
export function MeasureOverlay({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const pts = useEditor((s) => s.measure);
  const camera = useEditor((s) => s.camera);
  const mm = useEditor((s) => s.doc.settings.mmPerUnit);
  const canvas = canvasRef.current;
  if (!pts || !canvas) return null;
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  const sp = pts.map((p) => project(camera, p as Vec3, w, h));
  const d = pts.length === 2 ? pts[1].map((v, i) => (v - pts[0][i]) * mm) : null;
  const dist = d ? Math.hypot(d[0], d[1], d[2]) : null;
  return (
    <>
      <svg className="measure-layer" width={w} height={h} aria-hidden="true">
        {sp[0] && sp[1] && (
          <line x1={sp[0].x} y1={sp[0].y} x2={sp[1].x} y2={sp[1].y} className="measure-line" />
        )}
        {sp.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={5} className="measure-dot" />)}
        {sp[0] && sp[1] && dist !== null && (
          <text x={(sp[0].x + sp[1].x) / 2} y={(sp[0].y + sp[1].y) / 2 - 10} className="measure-label">
            {fmt(dist, 1)} mm
          </text>
        )}
      </svg>
      <div className="measure-panel" role="status" aria-live="polite" data-testid="measure-panel">
        <Ruler size={14} />
        {dist === null ? (
          <span>
            {pts.length === 0
              ? 'Click a point on the shape to start measuring.'
              : 'Now click a second point.'}
          </span>
        ) : (
          <span data-testid="measure-result">
            <b>{fmt(dist, 2)} mm</b>{' '}
            <span className="muted">
              (X {fmt(Math.abs(d![0]), 1)} · Y {fmt(Math.abs(d![1]), 1)} · Z {fmt(Math.abs(d![2]), 1)})
            </span>
          </span>
        )}
        <button
          type="button"
          className="btn icon sm ghost"
          aria-label="Close the measure tool"
          onClick={() => actions.set({ measure: null })}
        >
          <X size={14} />
        </button>
      </div>
    </>
  );
}
