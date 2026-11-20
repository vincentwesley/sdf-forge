/**
 * Surface groups for exports: each triangle gets one (colour, material) pair
 * taken from the shapes themselves, so a model with a clay body and a metal
 * handle exports as two clean parts instead of a gradient of near-identical
 * materials. 3MF turns groups into filament colours (with PBR display hints),
 * USDZ into GeomSubsets with a UsdPreviewSurface each, GLB into primitives with
 * a glTF material each.
 */
import type { SdfDoc } from '../graph/doc';
import { materialValues } from '../material';
import { trianglePalette } from './threemf';

export interface Surface {
  /** sRGB 0..1 */
  color: [number, number, number];
  /** viewport roughness (see src/core/material.ts) */
  rough: number;
  metal: number;
  glow: number;
}

export interface SurfaceGroups {
  groups: Surface[];
  /** group index per triangle */
  tri: Uint16Array;
}

const same = (a: Surface, b: Surface) =>
  Math.hypot(a.color[0] - b.color[0], a.color[1] - b.color[1], a.color[2] - b.color[2]) < 1e-3 &&
  Math.abs(a.rough - b.rough) < 1e-3 &&
  Math.abs(a.metal - b.metal) < 1e-3 &&
  Math.abs(a.glow - b.glow) < 1e-3;

/** Distinct (colour, material) pairs set on the shapes that feed the output. */
export function shapeSurfaces(doc: SdfDoc, leaves: string[]): Surface[] {
  const out: Surface[] = [];
  for (const id of leaves) {
    const n = doc.nodes.find((x) => x.id === id);
    const c = n?.params.color;
    if (!n || !Array.isArray(c) || c.length !== 3) continue;
    const [rough, metal, glow] = materialValues(n.params.material, doc.settings.material);
    const s: Surface = { color: c.map(Number) as Surface['color'], rough, metal, glow };
    if (!out.some((o) => same(o, s))) out.push(s);
  }
  return out;
}

/** Material differences weigh as much as clearly different colours. */
const MAT_WEIGHT = 2;

function triAverage(data: Float32Array, indices: Uint32Array, t: number, out: number[]) {
  for (let k = 0; k < 3; k++) {
    const a = indices[t * 3] * 3 + k,
      b = indices[t * 3 + 1] * 3 + k,
      c = indices[t * 3 + 2] * 3 + k;
    out[k] = (data[a] + data[b] + data[c]) / 3;
  }
}

/**
 * Assign every triangle to a surface group.
 * @param colors per-vertex sRGB colours
 * @param mats per-vertex materials (roughness, metallic, glow), or null for `fallback`
 * @param fixed the shapes' own surfaces (from shapeSurfaces); triangles snap to the nearest
 */
export function surfaceGroups(
  colors: Float32Array,
  mats: Float32Array | null,
  indices: Uint32Array,
  fixed: Surface[] | null | undefined,
  fallback: [number, number, number] = materialValues('scene', 'clay'),
  max = 16,
): SurfaceGroups {
  const nt = indices.length / 3;
  const c = [0, 0, 0],
    m = [...fallback];
  if (fixed && fixed.length) {
    const list = fixed.slice(0, Math.max(1, max));
    const raw = new Uint16Array(nt);
    const used = new Array<boolean>(list.length).fill(false);
    for (let t = 0; t < nt; t++) {
      triAverage(colors, indices, t, c);
      if (mats) triAverage(mats, indices, t, m);
      let best = 0,
        bd = Infinity;
      list.forEach((s, i) => {
        const d =
          (s.color[0] - c[0]) ** 2 +
          (s.color[1] - c[1]) ** 2 +
          (s.color[2] - c[2]) ** 2 +
          MAT_WEIGHT * ((s.rough - m[0]) ** 2 + (s.metal - m[1]) ** 2 + (s.glow - m[2]) ** 2);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      raw[t] = best;
      used[best] = true;
    }
    const renum = new Array<number>(list.length).fill(0);
    const groups: Surface[] = [];
    list.forEach((s, i) => {
      if (used[i]) {
        renum[i] = groups.length;
        groups.push(s);
      }
    });
    const tri = new Uint16Array(nt);
    for (let t = 0; t < nt; t++) tri[t] = renum[raw[t]];
    return { groups, tri };
  }
  // no shape list: cluster the colours, and give each cluster its average material
  const pal = trianglePalette(colors, indices, max);
  const sums = pal.palette.map(() => ({ n: 0, r: 0, me: 0, g: 0 }));
  for (let t = 0; t < nt; t++) {
    if (mats) triAverage(mats, indices, t, m);
    const s = sums[pal.tri[t]];
    s.n++;
    s.r += m[0];
    s.me += m[1];
    s.g += m[2];
  }
  return {
    groups: pal.palette.map((col, i) => {
      const s = sums[i];
      const n = Math.max(1, s.n);
      return { color: col, rough: s.r / n, metal: s.me / n, glow: s.g / n };
    }),
    tri: pal.tri,
  };
}
