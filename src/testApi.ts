/**
 * A small API on window for automated tests and tooling (Playwright, the
 * thumbnail generator). Not used by the UI itself.
 */
import { compile, packParams, makeEvaluator, analyze } from './core/compile';
import { normalizeDoc, type SdfDoc } from './core/graph/doc';
import { gpuEvaluate } from './render/probe';
import { getActiveRenderer } from './render/registry';
import { EXAMPLES, exampleById } from './gallery/examples';
import { commit, loadDoc, store } from './state/store';

const loadDocKeep = (d: SdfDoc) => commit(d);
import { encodeDoc, decodeDoc } from './core/share';
import { exportMesh } from './workers/meshClient';
import type { MeshFormat } from './core/mesh/pipeline';
import { shadertoySource } from './core/shadertoy';

function sceneFor(doc: SdfDoc) {
  const c = compile(doc);
  const P = new Float32Array(c.paramCount);
  packParams(doc, c, P);
  return { c, P, a: analyze(doc, c.rootId) };
}

export const testApi = {
  version: 1,
  examples: () => EXAMPLES.map((e) => e.id),
  exampleDoc: (id: string) => exampleById(id)!.build(),
  getDoc: () => store.getState().doc,
  setDoc: (d: unknown) => loadDoc(normalizeDoc(d)),
  loadExample: (id: string) => loadDoc(exampleById(id)!.build()),
  state: () => {
    const s = store.getState();
    return {
      selection: s.selection,
      past: s.past.length,
      future: s.future.length,
      title: s.doc.title,
      nodes: s.doc.nodes.length,
      dialog: s.dialog,
    };
  },
  /** Number of distinct colours in a small render of the current view (0 = blank). */
  pixelVariety: () => {
    const r = getActiveRenderer();
    if (!r) return 0;
    const c = r.renderOffline(96, 64, { frames: 1 });
    const tmp = document.createElement('canvas');
    tmp.width = 96;
    tmp.height = 64;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    r.endOffline();
    const d = ctx.getImageData(0, 0, 96, 64).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4)
      set.add((d[i] >> 3) * 1024 + (d[i + 1] >> 3) * 32 + (d[i + 2] >> 3));
    return set.size;
  },
  /** Render the current view to a WebP data URL (used to make gallery thumbnails). */
  snapshot: (w: number, h: number, type = 'image/webp') => {
    const r = getActiveRenderer();
    if (!r) return '';
    const c = r.renderOffline(w, h, { frames: 32 });
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d')!.drawImage(c, 0, 0);
    r.endOffline();
    return tmp.toDataURL(type, 0.86);
  },
  rendererStats: () => getActiveRenderer()?.stats ?? null,
  compiling: () => getActiveRenderer()?.compiling ?? true,
  setContinuous: (on: boolean) => {
    const r = getActiveRenderer();
    if (r) {
      r.continuous = on;
      r.requestRender();
    }
  },
  /** Evaluate the shader and the CPU evaluator at the same points; returns both. */
  agreement: (doc: SdfDoc, points: number[]) => {
    const { c, P } = sceneFor(normalizeDoc(doc));
    const pts = new Float32Array(points);
    const gpu = gpuEvaluate(c.glsl, c.paramCount, P, pts);
    const ev = makeEvaluator(c, P);
    const cpu: number[] = [];
    const cpuColor: number[] = [];
    const out = [0, 0, 0];
    for (let i = 0; i < pts.length; i += 3) {
      cpu.push(ev.map(pts[i], pts[i + 1], pts[i + 2]));
      ev.color(pts[i], pts[i + 1], pts[i + 2], out);
      cpuColor.push(...out);
    }
    return {
      gpu: [...gpu.d],
      cpu,
      gpuColor: [...gpu.color],
      cpuColor,
      bounds: sceneFor(normalizeDoc(doc)).a.bounds,
    };
  },
  setCamera: (c: Partial<ReturnType<typeof store.getState>['camera']>) =>
    store.setState({ camera: { ...store.getState().camera, ...c } }),
  camera: () => store.getState().camera,
  setParam: (node: string, key: string, value: number | number[]) => {
    const s = store.getState();
    loadDocKeep({
      ...s.doc,
      nodes: s.doc.nodes.map((n) => (n.id === node ? { ...n, params: { ...n.params, [key]: value } } : n)),
    });
  },
  shadertoy: () => shadertoySource(store.getState().doc),
  encode: (d: SdfDoc) => encodeDoc(d),
  decode: (s: string) => decodeDoc(s),
  exportMesh: async (format: MeshFormat, cells = 100) => {
    const s = store.getState();
    const { c, P, a } = sceneFor(s.doc);
    const b = a.bounds!;
    const ext = Math.max(...b.max.map((v, i) => v - b.min[i]));
    const out = await exportMesh(
      {
        jsMap: c.jsMap,
        jsColor: c.jsColor,
        jsPick: c.jsPick,
        paramCount: c.paramCount,
        P,
        bounds: b,
        title: s.doc.title,
        mmPerUnit: s.doc.settings.mmPerUnit,
        material: s.doc.settings.material,
      },
      { format, edgeLength: ext / cells },
    );
    return { stats: out.stats, size: out.bytes.byteLength };
  },
};

declare global {
  interface Window {
    sdfForge: typeof testApi;
  }
}
