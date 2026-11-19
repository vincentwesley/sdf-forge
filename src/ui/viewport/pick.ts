import type { Evaluator } from '../../core/compile';
import type { AABB } from '../../core/nodes/types';
import type { Vec3 } from '../../render/camera';

/** CPU sphere tracing against the compiled scene. Returns the hit distance or null. */
export function raycast(
  ev: Evaluator,
  ro: Vec3,
  rd: Vec3,
  bounds: AABB | null,
  lipschitz: number,
  /** optional section plane [nx, ny, nz, offset]: only dot(p, n) <= offset is solid */
  clip?: [number, number, number, number] | null,
): number | null {
  if (!bounds) return null;
  let t0 = -Infinity,
    t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / rd[i];
    let a = (bounds.min[i] - 1e-3 - ro[i]) * inv,
      b = (bounds.max[i] + 1e-3 - ro[i]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  if (t1 < Math.max(t0, 0)) return null;
  let t = Math.max(t0, 0);
  const k = 1 / Math.max(1, lipschitz);
  for (let i = 0; i < 400; i++) {
    const x = ro[0] + rd[0] * t,
      y = ro[1] + rd[1] * t,
      z = ro[2] + rd[2] * t;
    let d = ev.map(x, y, z);
    if (clip) d = Math.max(d, x * clip[0] + y * clip[1] + z * clip[2] - clip[3]);
    d *= k;
    if (Math.abs(d) < 1e-4 * Math.max(1, t)) return t;
    t += d;
    if (t > t1) return null;
  }
  return null;
}
