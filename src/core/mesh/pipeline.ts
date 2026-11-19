import { makeEvaluator } from '../compile';
import type { AABB } from '../nodes/types';
import type { SdfDoc } from '../graph/doc';
import { type ManifoldModule, type MeshResult, bboxOf, extractMesh, sdfNormals } from './mesh';
import { srgbToLinear, toPrintSpace, writeGLB, writeOBJ, writeSTL } from './writers';
import { write3MF } from './threemf';
import { writeUSDZ } from './usdz';

export type MeshFormat = 'stl' | '3mf' | 'glb' | 'obj' | 'usdz';

export interface ExportInput {
  jsMap: string;
  jsColor: string;
  jsPick: string;
  paramCount: number;
  P: Float32Array;
  bounds: AABB;
  title: string;
  /** millimetres per scene unit (after any resize) */
  mmPerUnit: number;
  material: 'clay' | 'glossy' | 'metal';
  /** distance grids used by text nodes */
  textures?: { data: Float32Array; w: number; h: number; cell: number }[];
  /** PNG preview embedded in 3MF files */
  thumbnail?: Uint8Array | null;
  /** the shapes' own colours (sRGB), used as the 3MF filament palette */
  palette?: [number, number, number][] | null;
}

/** Distinct colours set on the shapes that feed the output (sRGB 0..1). */
export function shapeColors(doc: SdfDoc, leaves: string[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const id of leaves) {
    const c = doc.nodes.find((n) => n.id === id)?.params.color;
    if (!Array.isArray(c) || c.length !== 3) continue;
    const rgb = c.map(Number) as [number, number, number];
    if (!out.some((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]) < 1e-3)) out.push(rgb);
  }
  return out;
}

export interface ExportOptions {
  format: MeshFormat;
  edgeLength: number;
  simplify?: number;
}

export interface ExportStats {
  triangles: number;
  vertices: number;
  volumeMm3: number;
  areaMm2: number;
  sizeMm: [number, number, number];
  genus: number;
  status: string;
  ms: number;
}

export interface ExportOutput {
  bytes: ArrayBuffer;
  mime: string;
  ext: string;
  stats: ExportStats;
}

export async function runExport(
  wasm: ManifoldModule,
  input: ExportInput,
  opts: ExportOptions,
): Promise<ExportOutput> {
  const ev = makeEvaluator(input, new Float32Array(input.P));
  const mesh: MeshResult = extractMesh(wasm, ev.map, input.bounds, {
    edgeLength: opts.edgeLength,
    simplify: opts.simplify,
  });
  const mm = input.mmPerUnit;
  const bb = bboxOf(mesh.positions);
  const stats: ExportStats = {
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    volumeMm3: mesh.volume * mm ** 3,
    areaMm2: mesh.area * mm ** 2,
    sizeMm: [0, 1, 2].map((i) => (bb.max[i] - bb.min[i]) * mm) as [number, number, number],
    genus: mesh.genus,
    status: mesh.status,
    ms: mesh.ms,
  };
  const title = input.title || 'shape';
  if (opts.format === 'stl') {
    const out = toPrintSpace(mesh.positions, mm);
    return { bytes: writeSTL(out, mesh.indices, title), mime: 'model/stl', ext: 'stl', stats };
  }
  const normals = sdfNormals(ev.map, mesh.positions, opts.edgeLength * 0.25);
  const colors = new Float32Array(mesh.positions.length);
  const c = [0, 0, 0];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    ev.color(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2], c);
    colors[i] = srgbToLinear(c[0]);
    colors[i + 1] = srgbToLinear(c[1]);
    colors[i + 2] = srgbToLinear(c[2]);
  }
  const srgb = colors.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  if (opts.format === '3mf') {
    // 3MF: millimetres, Z up like STL, plus a colour palette, credit and thumbnail
    const out = toPrintSpace(mesh.positions, mm);
    const bytes = await write3MF(out, mesh.indices, {
      title,
      colors: srgb,
      thumbnail: input.thumbnail,
      palette: input.palette,
    });
    return { bytes, mime: 'model/3mf', ext: '3mf', stats };
  }
  const mat = input.material;
  const roughness = mat === 'clay' ? 0.7 : mat === 'glossy' ? 0.25 : 0.3;
  const metallic = mat === 'metal' ? 1 : 0;
  if (opts.format === 'usdz') {
    // USDZ: millimetres (metersPerUnit 0.001, so AR shows true size), Y up, a material per colour
    const pos = new Float32Array(mesh.positions.length);
    for (let i = 0; i < pos.length; i++) pos[i] = mesh.positions[i] * mm;
    const bytes = await writeUSDZ(pos, normals, mesh.indices, {
      title,
      colors: srgb,
      palette: input.palette,
      roughness,
      metallic,
    });
    return { bytes, mime: 'model/vnd.usdz+zip', ext: 'usdz', stats };
  }
  if (opts.format === 'obj') {
    // OBJ: millimetres, Y-up (most DCC tools import Y-up OBJ); colours in sRGB as the common extension
    const pos = new Float32Array(mesh.positions.length);
    for (let i = 0; i < pos.length; i++) pos[i] = mesh.positions[i] * mm;
    const text = writeOBJ(pos, normals, mesh.indices, title, srgb);
    return {
      bytes: new TextEncoder().encode(text).buffer as ArrayBuffer,
      mime: 'model/obj',
      ext: 'obj',
      stats,
    };
  }
  const bytes = writeGLB(mesh.positions, normals, colors, mesh.indices, {
    title,
    scale: mm / 1000,
    roughness,
    metallic,
  });
  return { bytes, mime: 'model/gltf-binary', ext: 'glb', stats };
}
