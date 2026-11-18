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
  // Collapse degenerate edges: where the surface passes exactly through grid
  // samples (flat cuts aligned with the grid), level-set vertices can coincide.
  // They are distinct topologically but merge in tools that weld by position
  // (slicers, trimesh), producing zero-area and non-manifold faces.
  const tol = Math.max(opts.simplify ?? 0, edge * 1e-3);
  const s = m.simplify(tol);
  m.delete();
  m = s;
  const mesh = m.getMesh();
  const np = mesh.numProp;
  const nv = mesh.vertProperties.length / np;
  const positions = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    positions[i * 3] = mesh.vertProperties[i * np];
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
  }
  separateCoincident(positions, new Uint32Array(mesh.triVerts), edge * 2e-3, edge * 6e-3);
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

/**
 * Level-set meshes are manifold by topology, but where two parts of the
 * surface touch (a pinch) distinct vertices can sit at the same position.
 * Tools that weld vertices by position (slicers, trimesh) would then see
 * non-manifold edges. Nudge every vertex of such a cluster slightly inward
 * along its own normal so the sheets separate. Mutates `positions`.
 * Returns the number of vertices moved.
 */
export function separateCoincident(
  positions: Float32Array,
  indices: Uint32Array,
  radius: number,
  eps: number,
): number {
  const n = positions.length / 3;
  // area-weighted vertex normals
  const nrm = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      nrm[v] += nx;
      nrm[v + 1] += ny;
      nrm[v + 2] += nz;
    }
  }
  // spatial hash
  const inv = 1 / radius;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, number[]>();
  const cell = (i: number) => [
    Math.floor(positions[i * 3] * inv),
    Math.floor(positions[i * 3 + 1] * inv),
    Math.floor(positions[i * 3 + 2] * inv),
  ];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = cell(i);
    const k = key(x, y, z);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  }
  const r2 = radius * radius;
  const close = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = cell(i);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = grid.get(key(x + dx, y + dy, z + dz));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const ddx = positions[i * 3] - positions[j * 3],
              ddy = positions[i * 3 + 1] - positions[j * 3 + 1],
              ddz = positions[i * 3 + 2] - positions[j * 3 + 2];
            if (ddx * ddx + ddy * ddy + ddz * ddz <= r2) close[i] = close[j] = 1;
          }
        }
  }
  let moved = 0;
  for (let i = 0; i < n; i++) {
    if (!close[i]) continue;
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    positions[i * 3] -= (nrm[i * 3] / l) * eps;
    positions[i * 3 + 1] -= (nrm[i * 3 + 1] / l) * eps;
    positions[i * 3 + 2] -= (nrm[i * 3 + 2] / l) * eps;
    moved++;
  }
  return moved;
}
