import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Grid2x2, Layers, Minus, Plus, Scan } from 'lucide-react';
import { Renderer, type ViewMode } from '../../render/renderer';
import { type OrbitCamera, cameraRay, frameBounds } from '../../render/camera';
import { actions, addShape, select, store, toast, useEditor } from '../../state/store';
import { getScene } from '../../state/scene';
import { SCENE_THEMES, useResolvedTheme } from '../theme';
import { raycast } from './pick';
import { Gizmo } from './Gizmo';
import { NodeIcon } from '../meta';
import { getDef } from '../../core/nodes/registry';
import { Menu } from '../Menu';
import { WelcomeNudge } from '../Tour';
import { setActiveRenderer } from '../../render/registry';

let warnedInline = false;

/** Replace uniform reads with literal values. */
export function inlineParams(glsl: string, P: Float32Array): string {
  return glsl.replace(/uP\[(\d+)\]\.([xyzw])/g, (_m, i, c) => {
    const v = P[Number(i) * 4 + 'xyzw'.indexOf(c)] ?? 0;
    const t = String(v);
    const lit = /[.e]/.test(t) ? t : `${t}.0`;
    return v < 0 ? `(${lit})` : lit;
  });
}

const QUICK_SHAPES = ['sphere', 'box', 'cylinder', 'torus', 'capsule', 'cone'];
const MORE_SHAPES = ['profile', 'text', 'ellipsoid', 'octahedron', 'hexPrism', 'link'];

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'shaded', label: 'Shaded', hint: 'Lit preview with colours' },
  { id: 'print', label: 'Print check', hint: 'Thin walls in red, overhangs in orange' },
  { id: 'normals', label: 'Normals', hint: 'Surface direction as colour' },
  { id: 'cost', label: 'Cost', hint: 'How hard each pixel is to draw (bright = slow)' },
];

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [thinMm, setThinMm] = useState(1);
  const theme = useResolvedTheme();
  const viewMode = useEditor((s) => s.viewMode);
  const grid = useEditor((s) => s.grid);
  const addMode = useEditor((s) => s.addMode);
  const emptyScene = useEditor((s) => getScene(s.doc, s.viewRoot, s.selection[0] ?? null).compiled.empty);
  const hasNodes = useEditor((s) => s.doc.nodes.length > 1);
  const viewRoot = useEditor((s) => s.viewRoot);
  const viewRootLabel = useEditor((s) => {
    const n = s.viewRoot ? s.doc.nodes.find((x) => x.id === s.viewRoot) : null;
    return n ? (n.name ?? getDef(n.type)?.label ?? '') : '';
  });
  const [hintVisible, setHintVisible] = useState(true);

  // --- renderer lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    let r: Renderer;
    try {
      r = new Renderer(canvas);
    } catch {
      setFatal(
        'Your browser or device does not support WebGL 2, which SDF Forge needs to draw shapes. Try a recent Chrome, Edge, Firefox or Safari.',
      );
      return;
    }
    rendererRef.current = r;
    r.onError = (m) => {
      if (m === 'restore') location.reload();
      else setError(m);
    };
    r.onCompiled = () => setCompiling(false);
    // studio reflections (CC0 HDRI from Poly Haven, pre-filtered by scripts/make_env.py)
    void r.loadEnvironment(`${import.meta.env.BASE_URL}env/studio.bin`);
    setActiveRenderer(r);
    const ro = new ResizeObserver(() => r.requestRender());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      r.dispose();
      setActiveRenderer(null);
      rendererRef.current = null;
    };
  }, []);

  // --- push scene + frame state to the renderer ------------------------------
  const sync = useCallback(() => {
    const r = rendererRef.current;
    if (!r) return;
    const s = store.getState();
    const scene = getScene(s.doc, s.viewRoot, s.selection[0] ?? null);
    // Very large graphs can exceed the GPU's uniform budget (as low as 224 vec4 on
    // some mobile GPUs). Then bake the values into the shader instead: slower to
    // edit (each change recompiles) but it still draws.
    const budget = r.maxUniformVec4s - 40;
    if (scene.compiled.paramCount / 4 > budget) {
      r.setScene(
        inlineParams(scene.compiled.glsl, scene.P),
        4,
        scene.compiled.empty,
        scene.compiled.textures,
      );
      if (!warnedInline) {
        warnedInline = true;
        toast(
          'This graph is very large for your GPU, so changes recompile the shader and may feel slower.',
          'info',
          6000,
        );
      }
    } else
      r.setScene(
        scene.compiled.glsl,
        scene.compiled.paramCount,
        scene.compiled.empty,
        scene.compiled.textures,
      );
    setCompiling(r.compiling);
    r.setParams(scene.P);
    r.setFrame({
      camera: s.camera,
      bounds: scene.analysis.bounds,
      lipschitz: scene.analysis.lipschitz,
      mode: s.viewMode,
      material: s.doc.settings.material,
      selectionOn: s.selection.length > 0 && !!scene.compiled.nodeIndex[s.selection[0]],
      grid: s.grid,
      gridStep: 10 / s.doc.settings.mmPerUnit,
      thinLimit: thinMm / s.doc.settings.mmPerUnit,
      theme: SCENE_THEMES[theme],
    });
  }, [theme, thinMm]);

  useEffect(() => {
    sync();
    return store.subscribe((s, p) => {
      if (
        s.doc !== p.doc ||
        s.viewRoot !== p.viewRoot ||
        s.selection !== p.selection ||
        s.camera !== p.camera ||
        s.viewMode !== p.viewMode ||
        s.grid !== p.grid
      )
        sync();
    });
  }, [sync]);

  // --- framing ---------------------------------------------------------------
  const frame = useCallback(() => {
    const s = store.getState();
    const scene = getScene(s.doc, s.viewRoot, s.selection[0] ?? null);
    const c = canvasRef.current!;
    const aspect = c.clientWidth / Math.max(1, c.clientHeight);
    actions.set({ camera: frameBounds(s.camera, scene.analysis.bounds, aspect) });
  }, []);
  const frameRequest = useEditor((s) => s.frameRequest);
  useEffect(() => {
    frame();
  }, [frameRequest, frame]);

  // --- camera interaction -------------------------------------------------
  const setCamera = (c: OrbitCamera) => {
    rendererRef.current?.interact();
    actions.set({ camera: c });
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: 'orbit' | 'pan' | 'pinch' | null;
    moved: boolean;
    startDist: number;
    startCam: OrbitCamera;
  }>({
    mode: null,
    moved: false,
    startDist: 0,
    startCam: store.getState().camera,
  });

  const pan = (cam: OrbitCamera, dx: number, dy: number): OrbitCamera => {
    const h = canvasRef.current!.clientHeight;
    const scale = (2 * cam.distance * Math.tan(((cam.fov / 2) * Math.PI) / 180)) / h;
    const cy = Math.cos(cam.yaw),
      sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch),
      sp = Math.sin(cam.pitch);
    const right = [cy, 0, -sy];
    const up = [-sy * sp, cp, -cy * sp];
    return {
      ...cam,
      target: [0, 1, 2].map(
        (i) => cam.target[i] - right[i] * dx * scale + up[i] * dy * scale,
      ) as OrbitCamera['target'],
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    g.moved = false;
    g.startCam = store.getState().camera;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.mode = 'pinch';
      g.startDist = Math.hypot(a.x - b.x, a.y - b.y);
    } else g.mode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    setHintVisible(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x,
      dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (Math.abs(dx) + Math.abs(dy) > 0) g.moved = g.moved || Math.abs(dx) + Math.abs(dy) > 1;
    if (!g.moved) return;
    const cam = store.getState().camera;
    if (g.mode === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const next = { ...cam, distance: clampDist((g.startCam.distance * g.startDist) / Math.max(d, 1)) };
      setCamera(pan(next, dx / 2, dy / 2));
    } else if (g.mode === 'pan') setCamera(pan(cam, dx, dy));
    else if (g.mode === 'orbit')
      setCamera({
        ...cam,
        yaw: cam.yaw - dx * 0.008,
        pitch: Math.max(-1.45, Math.min(1.45, cam.pitch + dy * 0.008)),
      });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    const wasClick = !g.moved && pointers.current.size === 1 && e.button === 0;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) g.mode = null;
    else if (pointers.current.size === 1) g.mode = 'orbit';
    if (wasClick) pickAt(e.clientX, e.clientY);
  };

  const pickAt = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) * 2 - rect.width) / rect.height;
    const ndcY = -((clientY - rect.top) * 2 - rect.height) / rect.height;
    const s = store.getState();
    const scene = getScene(s.doc, s.viewRoot, s.selection[0] ?? null);
    const ev = scene.evaluator();
    const { ro, rd } = cameraRay(s.camera, ndcX, ndcY);
    const t = raycast(ev, ro, rd, scene.analysis.bounds, scene.analysis.lipschitz);
    if (t === null) {
      select([]);
      return;
    }
    const idx = ev.pick(ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t);
    const id = scene.compiled.leaves[idx];
    if (id) {
      select([id]);
      actions.set({ narrowTab: 'props' });
    }
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const cam = store.getState().camera;
    const k = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    rendererRef.current?.interact();
    actions.set({ camera: { ...cam, distance: clampDist(cam.distance * k) } });
    setHintVisible(false);
  }, []);
  useEffect(() => {
    const c = canvasRef.current!;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cam = store.getState().camera;
    const step = e.shiftKey ? 0.3 : 0.1;
    let next: OrbitCamera | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = { ...cam, yaw: cam.yaw + step };
        break;
      case 'ArrowRight':
        next = { ...cam, yaw: cam.yaw - step };
        break;
      case 'ArrowUp':
        next = { ...cam, pitch: Math.min(1.45, cam.pitch + step) };
        break;
      case 'ArrowDown':
        next = { ...cam, pitch: Math.max(-1.45, cam.pitch - step) };
        break;
      case '+':
      case '=':
        next = { ...cam, distance: clampDist(cam.distance * 0.85) };
        break;
      case '-':
      case '_':
        next = { ...cam, distance: clampDist(cam.distance / 0.85) };
        break;
    }
    if (next) {
      e.preventDefault();
      setCamera(next);
    }
  };

  const zoomBy = (k: number) => {
    const cam = store.getState().camera;
    setCamera({ ...cam, distance: clampDist(cam.distance * k) });
  };

  const bounds = useEditor((s) => getScene(s.doc, s.viewRoot, s.selection[0] ?? null).analysis.bounds);
  const onAdd = (type: string) => {
    addShape(type, bounds);
    requestAnimationFrame(() => frameIfOutside());
  };
  const frameIfOutside = () => {
    // keep the new shape in view
    const s = store.getState();
    const b = getScene(s.doc, s.viewRoot, null).analysis.bounds;
    if (!b) return;
    const c = canvasRef.current!;
    const aspect = c.clientWidth / Math.max(1, c.clientHeight);
    const f = frameBounds(s.camera, b, aspect);
    if (f.distance > s.camera.distance * 1.05)
      actions.set({ camera: { ...s.camera, target: f.target, distance: f.distance } });
  };

  if (fatal)
    return (
      <div className="viewport" role="alert">
        <div className="empty-state">
          <div className="empty-card">
            <h2>3D preview unavailable</h2>
            <p>{fatal}</p>
          </div>
        </div>
      </div>
    );

  return (
    <section className="viewport" aria-label="3D viewport" id="viewport">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="3D preview of the shape. Drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. With focus: arrow keys orbit, plus and minus zoom, F frames the shape. Click a shape to select it."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onDoubleClick={frame}
        data-testid="viewport-canvas"
      />
      <Gizmo canvasRef={canvasRef} onInteract={() => rendererRef.current?.interact()} />

      <div className="vp-overlay vp-tl" data-tour="add">
        <div className="toolbar" role="toolbar" aria-label="Add a shape">
          <span className="label hide-sm">Add</span>
          {QUICK_SHAPES.map((t) => {
            const d = getDef(t)!;
            return (
              <button
                key={t}
                type="button"
                className="btn icon"
                title={`${addMode === 'carve' ? 'Carve with' : 'Add'} ${d.label.toLowerCase()} — ${d.summary}`}
                aria-label={`${addMode === 'carve' ? 'Carve with' : 'Add'} ${d.label}`}
                onClick={() => onAdd(t)}
                data-testid={`add-${t}`}
              >
                <NodeIcon type={t} category="shape" size={15} />
              </button>
            );
          })}
          <Menu
            label="More shapes"
            buttonClass="btn icon"
            icon={<Plus size={16} />}
            items={MORE_SHAPES.map((t) => ({
              id: t,
              label: getDef(t)!.label,
              desc: getDef(t)!.summary,
              icon: <NodeIcon type={t} category={getDef(t)!.category} size={14} />,
              onSelect: () => onAdd(t),
            }))}
          />
          <span className="sep" aria-hidden="true" />
          <div className="segmented" role="radiogroup" aria-label="What new shapes do">
            <button
              type="button"
              role="radio"
              aria-checked={addMode === 'add'}
              onClick={() => actions.set({ addMode: 'add' })}
              title="New shapes join the model"
            >
              Add
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={addMode === 'carve'}
              onClick={() => actions.set({ addMode: 'carve' })}
              title="New shapes cut holes in the model"
            >
              Carve
            </button>
          </div>
        </div>
      </div>

      <div className="vp-overlay vp-tr">
        <div className="toolbar" role="toolbar" aria-label="View">
          <Menu
            label="View mode"
            buttonClass="btn"
            icon={<Layers size={15} />}
            text={<span className="hide-sm">{MODES.find((m) => m.id === viewMode)!.label}</span>}
            items={MODES.map((m) => ({
              id: m.id,
              label: m.label,
              desc: m.hint,
              checked: m.id === viewMode,
              onSelect: () => actions.set({ viewMode: m.id }),
            }))}
          />
          <button
            type="button"
            className="btn icon"
            aria-pressed={grid}
            title="Floor grid (lines every 10 mm)"
            aria-label="Floor grid"
            onClick={() => actions.set({ grid: !grid })}
          >
            <Grid2x2 size={15} />
          </button>
          <button
            type="button"
            className="btn icon"
            title="Frame the shape (F)"
            aria-label="Frame the shape"
            onClick={frame}
          >
            <Scan size={15} />
          </button>
        </div>
      </div>

      <div className="vp-overlay vp-bl">
        {error && (
          <span className="hint status-pill error" role="alert">
            {error}
          </span>
        )}
        {compiling && !error && <span className="hint status-pill">Updating shader…</span>}
        {viewRoot && (
          <span className="hint status-pill">
            <Crosshair size={13} /> Viewing only “{viewRootLabel}”
            <button type="button" className="btn sm" onClick={() => actions.set({ viewRoot: null })}>
              Show all
            </button>
          </span>
        )}
        {viewMode === 'print' && (
          <span className="hint status-pill" data-testid="print-legend">
            <span className="cat-dot" style={{ background: '#e5281e' }} /> walls thinner than
            <button
              type="button"
              className="btn sm icon"
              aria-label="Thinner limit"
              onClick={() => setThinMm((v) => Math.max(0.2, +(v - 0.2).toFixed(1)))}
            >
              <Minus size={12} />
            </button>
            <strong>{thinMm.toFixed(1)} mm</strong>
            <button
              type="button"
              className="btn sm icon"
              aria-label="Thicker limit"
              onClick={() => setThinMm((v) => Math.min(10, +(v + 0.2).toFixed(1)))}
            >
              <Plus size={12} />
            </button>
            <span className="cat-dot" style={{ background: '#f28c1f', marginLeft: 6 }} /> overhangs &gt; 45°
          </span>
        )}
      </div>

      <div className="vp-overlay vp-br">
        {hintVisible && !emptyScene && (
          <span className="hint hide-sm" aria-hidden="true">
            Drag to orbit · Right-drag to pan · Scroll to zoom · Click a shape to edit it
          </span>
        )}
        <div className="toolbar hide-md" role="toolbar" aria-label="Zoom">
          <button
            type="button"
            className="btn icon"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomBy(0.8)}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="btn icon"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomBy(1.25)}
          >
            <Minus size={15} />
          </button>
        </div>
      </div>

      <WelcomeNudge />
      {emptyScene && (
        <div className="empty-state">
          <div className="empty-card">
            <h2>
              {hasNodes
                ? viewRoot
                  ? 'This node has no shape yet'
                  : 'Nothing is connected to Output'
                : 'Nothing to show yet'}
            </h2>
            <p>
              {hasNodes
                ? 'Only what is wired into the Output node is drawn. Connect a node to Output in the graph, or add a shape with the buttons in the top-left.'
                : 'Add a shape with the buttons in the top-left, or open the gallery for a ready-made example.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={() => onAdd('sphere')}>
                Add a sphere
              </button>
              <button type="button" className="btn" onClick={() => actions.set({ dialog: 'gallery' })}>
                Open gallery
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function clampDist(d: number) {
  return Math.max(0.3, Math.min(200, d));
}
