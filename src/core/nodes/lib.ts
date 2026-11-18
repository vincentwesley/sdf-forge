import type { Expr, IRBuilder } from '../ir/ir';
import type { AABB } from './types';

/**
 * Shared SDF building blocks, written in the IR.
 * Formulas follow Inigo Quilez's articles (MIT): https://iquilezles.org/articles/
 */

/**
 * Quadratic polynomial smooth minimum, normalised so `k` is the maximum
 * deviation from min(a, b). Returns [distance, blend] where blend is 0 when the
 * result comes from `a` and 1 when it comes from `b`.
 * https://iquilezles.org/articles/smin/
 */
export function sminBlend(ir: IRBuilder, a: Expr, b: Expr, k: Expr): [Expr, Expr] {
  // k4 = max(k, eps) * 4
  const k4 = ir.mul(ir.max(k, 1e-6), 4);
  const h = ir.div(ir.max(ir.sub(k4, ir.abs(ir.sub(a, b))), 0), k4);
  const m = ir.mul(ir.mul(h, h), 0.5);
  const s = ir.mul(ir.mul(m, k4), 0.5);
  const aLess = ir.lt(a, b);
  const d = ir.sub(ir.min(a, b), s);
  const blend = ir.select(aLess, m, ir.sub(1, m));
  return [d, blend];
}

export function smin(ir: IRBuilder, a: Expr, b: Expr, k: Expr): Expr {
  return sminBlend(ir, a, b, k)[0];
}

/** smooth maximum: -smin(-a, -b) */
export function smaxBlend(ir: IRBuilder, a: Expr, b: Expr, k: Expr): [Expr, Expr] {
  const [d, t] = sminBlend(ir, ir.neg(a), ir.neg(b), k);
  return [ir.neg(d), t];
}

/** Rotate a 2D vector by angle (radians) given as cos/sin expressions. */
export function rot2(ir: IRBuilder, v: Expr, c: Expr, s: Expr): Expr {
  const x = ir.x(v),
    y = ir.y(v);
  return ir.vec2(ir.sub(ir.mul(c, x), ir.mul(s, y)), ir.add(ir.mul(s, x), ir.mul(c, y)));
}

/** Multiply a vec3 by a 3x3 matrix given as 9 row-major expressions (m[r*3+c]). */
export function mat3mul(ir: IRBuilder, m: Expr[], v: Expr): Expr {
  const x = ir.x(v),
    y = ir.y(v),
    z = ir.z(v);
  const row = (r: number) =>
    ir.add(ir.add(ir.mul(m[r * 3], x), ir.mul(m[r * 3 + 1], y)), ir.mul(m[r * 3 + 2], z));
  return ir.vec3(row(0), row(1), row(2));
}

/** Exact distance for an axis-aligned box with half extents b, centred at origin (2D or 3D). */
export function sdBox(ir: IRBuilder, p: Expr, b: Expr): Expr {
  const q = ir.sub(ir.abs(p), b);
  return ir.add(ir.length(ir.max(q, 0)), ir.min(ir.maxComp(q), 0));
}

// ---------------------------------------------------------------------------
// Bounds helpers (plain TypeScript)

export const EMPTY_BOUNDS = null;

export function box(min: [number, number, number], max: [number, number, number]): AABB {
  return { min, max };
}
export function symBox(x: number, y: number, z: number): AABB {
  return { min: [-x, -y, -z], max: [x, y, z] };
}
export function unionBounds(list: (AABB | null)[]): AABB | null {
  let out: AABB | null = null;
  for (const b of list) {
    if (!b) continue;
    if (!out) out = { min: [...b.min], max: [...b.max] };
    else
      for (let i = 0; i < 3; i++) {
        out.min[i] = Math.min(out.min[i], b.min[i]);
        out.max[i] = Math.max(out.max[i], b.max[i]);
      }
  }
  return out;
}
export function intersectBounds(list: (AABB | null)[]): AABB | null {
  let out: AABB | null = null;
  for (const b of list) {
    if (!b) return null;
    if (!out) out = { min: [...b.min], max: [...b.max] };
    else
      for (let i = 0; i < 3; i++) {
        out.min[i] = Math.max(out.min[i], b.min[i]);
        out.max[i] = Math.min(out.max[i], b.max[i]);
      }
  }
  if (out && out.min.some((v, i) => v > out!.max[i])) return null;
  return out;
}
export function expand(b: AABB | null, r: number): AABB | null {
  if (!b) return null;
  return { min: b.min.map((v) => v - r) as AABB['min'], max: b.max.map((v) => v + r) as AABB['max'] };
}
/** largest distance from the origin to any point of the box */
export function maxRadius(b: AABB): number {
  let s = 0;
  for (let i = 0; i < 3; i++) s += Math.max(b.min[i] ** 2, b.max[i] ** 2);
  return Math.sqrt(s);
}
/** largest distance from the Y axis */
export function maxRadiusXZ(b: AABB): number {
  return Math.sqrt(Math.max(b.min[0] ** 2, b.max[0] ** 2) + Math.max(b.min[2] ** 2, b.max[2] ** 2));
}
/** AABB of a box after a 3x3 linear map (row-major) and translation. */
export function transformBounds(b: AABB, m: number[], t: [number, number, number]): AABB {
  const min: [number, number, number] = [t[0], t[1], t[2]];
  const max: [number, number, number] = [t[0], t[1], t[2]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const a = m[r * 3 + c] * b.min[c];
      const bb = m[r * 3 + c] * b.max[c];
      min[r] += Math.min(a, bb);
      max[r] += Math.max(a, bb);
    }
  }
  return { min, max };
}

/** Rotation matrix (row-major) for Euler angles in degrees, applied X then Y then Z. */
export function eulerMatrix(deg: number[]): number[] {
  const [ax, ay, az] = deg.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(ax),
    sx = Math.sin(ax),
    cy = Math.cos(ay),
    sy = Math.sin(ay),
    cz = Math.cos(az),
    sz = Math.sin(az);
  // R = Rz * Ry * Rx
  return [
    cz * cy,
    cz * sy * sx - sz * cx,
    cz * sy * cx + sz * sx,
    sz * cy,
    sz * sy * sx + cz * cx,
    sz * sy * cx - cz * sx,
    -sy,
    cy * sx,
    cy * cx,
  ];
}
export function transpose3(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
