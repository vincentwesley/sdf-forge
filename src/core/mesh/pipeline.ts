import { makeEvaluator } from '../compile';
import type { AABB } from '../nodes/types';
import { type ManifoldModule, type MeshResult, bboxOf, extractMesh, sdfNormals } from './mesh';
import { srgbToLinear, toPrintSpace, writeGLB, writeOBJ, writeSTL } from './writers';

export type MeshFormat = 'stl' | 'glb' | 'obj';

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

export function runExport(wasm: ManifoldModule, input: ExportInput, opts: ExportOptions): ExportOutput {
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
  if (opts.format === 'obj') {
    // OBJ: millimetres, Y-up (most DCC tools import Y-up OBJ); colours in sRGB as the common extension
    const pos = new Float32Array(mesh.positions.length);
    for (let i = 0; i < pos.length; i++) pos[i] = mesh.positions[i] * mm;
    const srgb = colors.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    const text = writeOBJ(pos, normals, mesh.indices, title, srgb);
    return {
      bytes: new TextEncoder().encode(text).buffer as ArrayBuffer,
      mime: 'model/obj',
      ext: 'obj',
      stats,
    };
  }
  const mat = input.material;
  const bytes = writeGLB(mesh.positions, normals, colors, mesh.indices, {
    title,
    scale: mm / 1000,
    roughness: mat === 'clay' ? 0.7 : mat === 'glossy' ? 0.25 : 0.3,
    metallic: mat === 'metal' ? 1 : 0,
  });
  return { bytes, mime: 'model/gltf-binary', ext: 'glb', stats };
}
