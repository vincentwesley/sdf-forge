/**
 * Mesh extraction with Manifold's levelSet (marching tetrahedra on a
 * body-centred cubic grid), which guarantees a watertight, manifold result.
 * https://github.com/elalish/manifold (Apache-2.0)
 *
 * This module is environment-agnostic: the caller passes the initialised
 * Manifold wasm module, so it runs in a Web Worker and in Node (CI scripts).
 */
import type { AABB } from '../nodes/types';

// minimal structural types for the parts of manifold-3d we use
interface ManifoldObj {
  getMesh(): { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array };
  volume(): number;
  surfaceArea(): number;
  genus(): number;
  status(): unknown;
  numTri(): number;
  isEmpty(): boolean;
  simplify(tol?: number): ManifoldObj;
  delete(): void;
}
export interface ManifoldModule {
  Manifold: {
    levelSet(
      sdf: (p: [number, number, number]) => number,
      bounds: { min: number[]; max: number[] },
      edge: number,
      level?: number,
      tol?: number,
    ): ManifoldObj;
  };
}

export interface MeshResult {
  positions: Float32Array; // xyz, scene units, Y-up
  indices: Uint32Array;
  volume: number; // cubic units
  area: number;
  genus: number;
  status: string;
  edgeLength: number;
  ms: number;
}

export interface MeshOptions {
  /** target triangle edge length in scene units */
  edgeLength: number;
  /** collapse edges below this deviation (scene units); 0 = off */
  simplify?: number;
}

export function meshBounds(b: AABB, edge: number): { min: number[]; max: number[] } {
  const m = edge * 2.5;
  return { min: b.min.map((v) => v - m), max: b.max.map((v) => v + m) };
}

/** Suggested edge length for a quality level (number of cells across the largest side). */
export function edgeForQuality(b: AABB, cells: number): number {
  const ext = Math.max(...b.max.map((v, i) => v - b.min[i]));
  return Math.max(ext / cells, 1e-3);
}

export function extractMesh(
  wasm: ManifoldModule,
  map: (x: number, y: number, z: number) => number,
  bounds: AABB,
  opts: MeshOptions,
): MeshResult {
  const t0 = performance.now();
  const edge = opts.edgeLength;
  // Manifold wants positive inside; our SDFs are negative inside.
  const sdf = (p: [number, number, number]) => {
    const d = -map(p[0], p[1], p[2]);
    return Number.isFinite(d) ? d : -1;
  };
  let m = wasm.Manifold.levelSet(sdf, meshBounds(bounds, edge), edge, 0, edge * 0.02);
  if (opts.simplify && opts.simplify > 0) {
    const s = m.simplify(opts.simplify);
    m.delete();
    m = s;
  }
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  const res: MeshResult = {
    positions,
    indices: new Uint32Array(mesh.triVerts),
    volume: m.volume(),
    area: m.surfaceArea(),
    genus: m.genus(),
    status: String((m.status() as { value?: unknown })?.value ?? m.status()),
    edgeLength: edge,
    ms: 0,
  };
  m.delete();
  res.ms = performance.now() - t0;
  return res;
}

/** Vertex normals from the SDF gradient (smoother than face normals). */
export function sdfNormals(
  map: (x: number, y: number, z: number) => number,
  positions: Float32Array,
  h: number,
): Float32Array {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i],
      y = positions[i + 1],
      z = positions[i + 2];
    let gx = map(x + h, y, z) - map(x - h, y, z);
    let gy = map(x, y + h, z) - map(x, y - h, z);
    let gz = map(x, y, z + h) - map(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    n[i] = gx;
    n[i + 1] = gy;
    n[i + 2] = gz;
  }
  return n;
}

export function bboxOf(positions: Float32Array): AABB {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  return { min, max };
}
