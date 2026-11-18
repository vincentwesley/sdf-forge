import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Code2,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  TriangleAlert,
} from 'lucide-react';
import { Modal } from './Modal';
import { setSettings, toast, useEditor, store } from '../../state/store';
import { getScene } from '../../state/scene';
import { fmt, parseNumber } from '../format';
import { edgeForQuality } from '../../core/mesh/mesh';
import type { ExportStats, MeshFormat } from '../../core/mesh/pipeline';
import { cancelExports, downloadBlob, exportMesh, safeFilename } from '../../workers/meshClient';
import { getActiveRenderer } from '../../render/registry';
import { glslLibrary, shadertoySource } from '../../core/shadertoy';
import { VideoTab } from './VideoTab';

type Tab = 'model' | 'image' | 'video' | 'code';

const QUALITY = [
  { id: 'draft', label: 'Draft', cells: 72 },
  { id: 'standard', label: 'Standard', cells: 130 },
  { id: 'fine', label: 'Fine', cells: 200 },
  { id: 'ultra', label: 'Ultra', cells: 300 },
];

const FORMATS: { id: MeshFormat; label: string; desc: string }[] = [
  { id: 'stl', label: 'STL', desc: '3D printing (millimetres, Z up)' },
  { id: 'glb', label: 'GLB', desc: 'Games, Blender, web (glTF, colours)' },
  { id: 'obj', label: 'OBJ', desc: 'Any 3D app (millimetres, colours)' },
];

export function ExportDialog({ initialTab = 'model' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: { id: Tab; label: string; icon: typeof Box }[] = [
    { id: 'model', label: '3D model', icon: Box },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'video', label: 'Turntable', icon: Film },
    { id: 'code', label: 'Shader code', icon: Code2 },
  ];
  return (
    <Modal title="Export" testId="export-dialog" onClose={cancelExports}>
      <div
        className="segmented"
        role="tablist"
        aria-label="What to export"
        style={{ marginBottom: 14, display: 'flex' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`export-${t.id}`}
            id={`export-tab-${t.id}`}
            style={{
              flex: 1,
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`export-${tab}`} aria-labelledby={`export-tab-${tab}`}>
        {tab === 'model' && <ModelTab />}
        {tab === 'image' && <ImageTab />}
        {tab === 'video' && <VideoTab />}
        {tab === 'code' && <CodeTab />}
      </div>
    </Modal>
  );
}

function ModelTab() {
  const doc = useEditor((s) => s.doc);
  const scene = useEditor((s) => getScene(s.doc, null, null));
  const [format, setFormat] = useState<MeshFormat>('stl');
  const [quality, setQuality] = useState('standard');
  const [simplify, setSimplify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ stats: ExportStats; format: MeshFormat; bytes: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const lastFile = useRef<{ bytes: ArrayBuffer; name: string; mime: string } | null>(null);
  const b = scene.analysis.bounds;
  const mm = doc.settings.mmPerUnit;
  const size = b ? b.max.map((v, i) => (v - b.min[i]) * mm) : [0, 0, 0];
  const longest = Math.max(...size);
  const [sizeText, setSizeText] = useState(fmt(longest, 1));
  const cells = QUALITY.find((q) => q.id === quality)!.cells;
  const edge = b ? edgeForQuality(b, cells) : 0.05;

  // rough time estimate: time a few evaluations on this thread
  const estimate = useMemo(() => {
    if (!b) return null;
    const ev = scene.evaluator();
    const n = 4000;
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < n; i++)
      acc += ev.map(b.min[0] + (i % 17) * 0.01, b.min[1] + (i % 13) * 0.01, b.min[2] + (i % 7) * 0.01);
    const per = (performance.now() - t0) / n + 0 * acc;
    const dims = b.max.map((v, i) => (v - b.min[i]) / edge + 5);
    const evals = 2.2 * dims[0] * dims[1] * dims[2];
    return { seconds: (evals * per) / 1000 + 0.3 };
  }, [scene, b, edge]);

  const applySize = (text: string) => {
    const v = parseNumber(text);
    if (!v || v <= 0 || !longest) {
      setSizeText(fmt(longest, 1));
      return;
    }
    setSettings({ mmPerUnit: (mm * v) / longest });
    setSizeText(fmt(v, 1));
  };

  const run = async () => {
    if (!b) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const s = store.getState();
      const sc = getScene(s.doc, null, null);
      const out = await exportMesh(
        {
          jsMap: sc.compiled.jsMap,
          jsColor: sc.compiled.jsColor,
          jsPick: sc.compiled.jsPick,
          paramCount: sc.compiled.paramCount,
          P: sc.P,
          bounds: sc.analysis.bounds!,
          title: s.doc.title,
          mmPerUnit: s.doc.settings.mmPerUnit,
          material: s.doc.settings.material,
        },
        { format, edgeLength: edge, simplify: simplify ? edge * 0.12 : 0 },
      );
      const name = `${safeFilename(s.doc.title)}.${out.ext}`;
      lastFile.current = { bytes: out.bytes, name, mime: out.mime };
      downloadBlob(out.bytes, name, out.mime);
      setResult({ stats: out.stats, format, bytes: out.bytes.byteLength });
      toast(`Exported ${name}`, 'success');
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setError((e as Error).message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  if (!b)
    return (
      <p className="note" role="status">
        There is no shape to export yet. Connect something to the Output node first.
      </p>
    );

  const st = result?.stats;
  const watertight = st && st.status.toLowerCase().includes('noerror');
  return (
    <div>
      <div className="form-row">
        <span className="label" id="fmt-lbl">
          Format
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="fmt-lbl">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              title={f.desc}
              onClick={() => setFormat(f.id)}
              data-testid={`fmt-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ margin: '-4px 0 12px 140px', fontSize: 12 }}>
        {FORMATS.find((f) => f.id === format)!.desc}
      </p>
      <div className="form-row">
        <label htmlFor="exp-size">Longest side</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id="exp-size"
            className="text-input"
            style={{ width: 110 }}
            inputMode="decimal"
            value={sizeText}
            onChange={(e) => setSizeText(e.target.value)}
            onBlur={(e) => applySize(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySize((e.target as HTMLInputElement).value)}
          />
          <span className="muted">mm</span>
          <span className="text-2" data-testid="export-dims">
            {size.map((v) => fmt(v, 1)).join(' × ')} mm
          </span>
        </div>
      </div>
      <div className="form-row">
        <span className="label" id="q-lbl">
          Detail
        </span>
        <div>
          <div className="segmented" role="radiogroup" aria-labelledby="q-lbl">
            {QUALITY.map((q) => (
              <button
                key={q.id}
                type="button"
                role="radio"
                aria-checked={quality === q.id}
                onClick={() => setQuality(q.id)}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Triangles about {fmt(edge * mm, 2)} mm across
            {estimate
              ? ` · takes about ${estimate.seconds < 1.5 ? '1' : Math.round(estimate.seconds)} s`
              : ''}
          </div>
        </div>
      </div>
      {format !== 'stl' && (
        <div className="form-row">
          <span className="label">Triangles</span>
          <label className="toggle">
            <input type="checkbox" checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />
            Reduce where flat (smaller file, same shape)
          </label>
        </div>
      )}

      {busy && (
        <div style={{ margin: '12px 0' }} role="status" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Loader2 size={14} className="spin" /> Building a watertight mesh…
          </div>
          <div className="progress">
            <div />
          </div>
        </div>
      )}
      {error && (
        <p className="note warn" role="alert">
          <TriangleAlert size={14} style={{ verticalAlign: -2 }} /> {error}
        </p>
      )}
      {st && (
        <div className={`note ${watertight ? 'ok' : 'warn'}`} data-testid="export-result" role="status">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              marginBottom: 6,
              color: 'var(--text)',
            }}
          >
            {watertight ? <Check size={15} color="var(--success)" /> : <TriangleAlert size={15} />}
            {watertight ? 'Watertight and manifold — ready to print' : `Mesh status: ${st.status}`}
          </div>
          <dl className="stat-grid">
            <dt>Size</dt>
            <dd>{st.sizeMm.map((v) => fmt(v, 1)).join(' × ')} mm</dd>
            <dt>Triangles</dt>
            <dd>{st.triangles.toLocaleString()}</dd>
            <dt>Volume</dt>
            <dd>
              {fmt(st.volumeMm3 / 1000, 2)} cm³ · about {fmt((st.volumeMm3 / 1000) * 1.24, 0)} g of PLA if
              printed solid
            </dd>
            <dt>File</dt>
            <dd>
              {fmt(result!.bytes / 1024 / 1024, 2)} MB · built in {fmt(st.ms / 1000, 1)} s
            </dd>
          </dl>
          <button
            type="button"
            className="btn sm"
            style={{ marginTop: 8 }}
            onClick={() =>
              lastFile.current &&
              downloadBlob(lastFile.current.bytes, lastFile.current.name, lastFile.current.mime)
            }
          >
            <Download size={13} /> Download again
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        {busy && (
          <button type="button" className="btn" onClick={() => cancelExports()}>
            Cancel
          </button>
        )}
        <button type="button" className="btn primary" onClick={run} disabled={busy} data-testid="export-run">
          <Download size={15} /> Export {format.toUpperCase()}
        </button>
      </div>
    </div>
  );
}

const IMAGE_SIZES = [
  { id: 'hd', label: '1280 × 720', w: 1280, h: 720 },
  { id: 'fhd', label: '1920 × 1080', w: 1920, h: 1080 },
  { id: 'sq', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: '4k', label: '3840 × 2160', w: 3840, h: 2160 },
];

function ImageTab() {
  const [size, setSize] = useState('fhd');
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = useEditor((s) => s.doc.title);
  const run = async () => {
    const r = getActiveRenderer();
    if (!r) return;
    setBusy(true);
    try {
      const s = IMAGE_SIZES.find((x) => x.id === size)!;
      const blob = await r.capture(s.w, s.h, 24, { transparent });
      downloadBlob(blob, `${safeFilename(title)}.png`, 'image/png');
      toast('Saved PNG', 'success');
    } catch (e) {
      toast(`Could not render the image: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="form-row">
        <span className="label" id="img-size">
          Size
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="img-size" style={{ flexWrap: 'wrap' }}>
          {IMAGE_SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={size === s.id}
              onClick={() => setSize(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <span className="label">Background</span>
        <label className="toggle">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />{' '}
          Transparent (no floor)
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Uses the current camera and view. Anti-aliased with 24 samples per pixel.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn primary" onClick={run} disabled={busy} data-testid="export-png">
          {busy ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />} Save PNG
        </button>
      </div>
    </div>
  );
}

function CodeTab() {
  const doc = useEditor((s) => s.doc);
  const [kind, setKind] = useState<'shadertoy' | 'glsl'>('shadertoy');
  const code = useMemo(() => (kind === 'shadertoy' ? shadertoySource(doc) : glslLibrary(doc)), [doc, kind]);
  return (
    <div>
      <div className="form-row">
        <span className="label" id="code-kind">
          Flavour
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="code-kind">
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'shadertoy'}
            onClick={() => setKind('shadertoy')}
          >
            Shadertoy (complete)
          </button>
          <button type="button" role="radio" aria-checked={kind === 'glsl'} onClick={() => setKind('glsl')}>
            GLSL functions
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: -2 }}>
        {kind === 'shadertoy'
          ? 'Paste into a new shader on shadertoy.com — it renders and orbits your shape.'
          : 'float map(vec3 p) returns the signed distance; vec4 mapColor(vec3 p) returns the colour. Values are baked in.'}
      </p>
      <textarea
        className="code-box"
        readOnly
        value={code}
        aria-label="Generated shader code"
        rows={16}
        spellCheck={false}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => downloadBlob(code, `${safeFilename(doc.title)}.glsl`, 'text/plain')}
        >
          <Download size={15} /> Download .glsl
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            navigator.clipboard.writeText(code).then(
              () => toast('Copied shader code', 'success'),
              () => toast('Copy failed — select the text and copy it manually', 'error'),
            )
          }
        >
          <Copy size={15} /> Copy
        </button>
      </div>
    </div>
  );
}
