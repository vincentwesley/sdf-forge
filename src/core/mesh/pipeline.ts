import { makeEvaluator } from '../compile';
import type { AABB } from '../nodes/types';
import { type ManifoldModule, type MeshResult, bboxOf, extractMesh, sdfNormals } from './mesh';
import { srgbToLinear, toPrintSpace, writeGLB, writeOBJ, writeSTL } from './writers';
import { write3MF } from './threemf';
import { writeUSDZ } from './usdz';
import { type Surface, surfaceGroups } from './surfaces';
import { type MaterialStyle, exportRoughness, materialValues } from '../material';

export { shapeSurfaces, type Surface } from './surfaces';

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
  /** the document's default material (for shapes set to "Same as scene") */
  material: MaterialStyle;
  /** distance grids used by text nodes */
  textures?: { data: Float32Array; w: number; h: number; cell: number }[];
  /** PNG preview embedded in 3MF files */
  thumbnail?: Uint8Array | null;
  /** the shapes' own colours and materials (from shapeSurfaces): 3MF filaments, USDZ/GLB materials */
  surfaces?: Surface[] | null;
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
  const srgb = new Float32Array(mesh.positions.length);
  const mats = new Float32Array(mesh.positions.length);
  const c = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    ev.color(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2], c);
    for (let k = 0; k < 3; k++) {
      srgb[i + k] = Math.max(0, Math.min(1, c[k]));
      colors[i + k] = srgbToLinear(srgb[i + k]);
      mats[i + k] = c[3 + k];
    }
  }
  const sceneMat = materialValues('scene', input.material);
  const groups = surfaceGroups(srgb, mats, mesh.indices, input.surfaces, sceneMat);
  if (opts.format === '3mf') {
    // 3MF: millimetres, Z up like STL, plus a colour palette, credit and thumbnail
    const out = toPrintSpace(mesh.positions, mm);
    const bytes = await write3MF(out, mesh.indices, { title, groups, thumbnail: input.thumbnail });
    return { bytes, mime: 'model/3mf', ext: '3mf', stats };
  }
  const roughness = exportRoughness(sceneMat[0]);
  const metallic = sceneMat[1];
  if (opts.format === 'usdz') {
    // USDZ: millimetres (metersPerUnit 0.001, so AR shows true size), Y up, a material per colour
    const pos = new Float32Array(mesh.positions.length);
    for (let i = 0; i < pos.length; i++) pos[i] = mesh.positions[i] * mm;
    const bytes = await writeUSDZ(pos, normals, mesh.indices, { title, groups });
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
    groups,
  });
  return { bytes, mime: 'model/gltf-binary', ext: 'glb', stats };
}
