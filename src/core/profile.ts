/**
 * Geometry of the Profile node: a closed outline through user points. Each
 * point is a sharp corner or a smooth point. Runs through smooth points become
 * Catmull-Rom curves (cubic Hermite, tangent = half the neighbour chord), which
 * are sampled into a polygon on the CPU. The polygon's vertices are uniforms,
 * so dragging points never recompiles; only adding/removing points or switching
 * corner types changes the code.
 *
 * Stored as a flat number list [x, y, sharp, x, y, sharp, ...] (sharp = 1 or 0)
 * so it fits the document's plain ParamValue type and share links.
 */

export const MIN_POINTS = 3;
export const MAX_POINTS = 16;
/** polygon edges per curved segment */
export const CURVE_SEGMENTS = 8;

export interface ProfilePoint {
  x: number;
  y: number;
  sharp: boolean;
}

export function readPoints(flat: readonly number[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i + 2 < flat.length && out.length < MAX_POINTS; i += 3)
    out.push({ x: flat[i], y: flat[i + 1], sharp: flat[i + 2] !== 0 });
  return out;
}

export function writePoints(pts: readonly ProfilePoint[]): number[] {
  return pts.flatMap((p) => [p.x, p.y, p.sharp ? 1 : 0]);
}

/** Clean untrusted input: finite numbers, 0/1 flags, 3..16 points. Null if unusable. */
export function sanitizePoints(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length % 3 !== 0) return null;
  if (!v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const pts = readPoints(v as number[]);
  if (pts.length < MIN_POINTS) return null;
  return writePoints(pts);
}

/**
 * The polygon actually drawn: flat [x0, y0, x1, y1, ...]. A segment between two
 * sharp points is a straight edge (one vertex); any other segment is a curve
 * sampled with CURVE_SEGMENTS edges.
 */
export function profilePolygon(flat: readonly number[]): number[] {
  const pts = readPoints(flat);
  const n = pts.length;
  if (n < MIN_POINTS) return [];
  const out: number[] = [];
  const tangent = (i: number) => {
    const p = pts[i];
    if (p.sharp) return [0, 0];
    const a = pts[(i - 1 + n) % n],
      b = pts[(i + 1) % n];
    return [(b.x - a.x) * 0.5, (b.y - a.y) * 0.5];
  };
  for (let i = 0; i < n; i++) {
    const p0 = pts[i],
      p1 = pts[(i + 1) % n];
    out.push(p0.x, p0.y);
    if (p0.sharp && p1.sharp) continue;
    const m0 = tangent(i),
      m1 = tangent((i + 1) % n);
    for (let k = 1; k < CURVE_SEGMENTS; k++) {
      const t = k / CURVE_SEGMENTS,
        t2 = t * t,
        t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1,
        h10 = t3 - 2 * t2 + t,
        h01 = -2 * t3 + 3 * t2,
        h11 = t3 - t2;
      out.push(
        h00 * p0.x + h10 * m0[0] + h01 * p1.x + h11 * m1[0],
        h00 * p0.y + h10 * m0[1] + h01 * p1.y + h11 * m1[1],
      );
    }
  }
  return out;
}

/** Signed distance to the polygon (CPU reference, same maths as the node). */
export function polygonDistance(poly: readonly number[], x: number, y: number): number {
  const n = poly.length / 2;
  let d = (x - poly[0]) ** 2 + (y - poly[1]) ** 2;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vix = poly[2 * i],
      viy = poly[2 * i + 1],
      vjx = poly[2 * j],
      vjy = poly[2 * j + 1];
    const ex = vjx - vix,
      ey = vjy - viy,
      wx = x - vix,
      wy = y - viy;
    const h = Math.min(1, Math.max(0, (wx * ex + wy * ey) / Math.max(ex * ex + ey * ey, 1e-12)));
    const bx = wx - ex * h,
      by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = y >= viy,
      c2 = y < vjy,
      c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/** True if any two non-adjacent edges cross (the outline would be ambiguous). */
export function selfIntersects(poly: readonly number[]): boolean {
  const n = poly.length / 2;
  const P = (i: number) => [poly[2 * (i % n)], poly[2 * (i % n) + 1]];
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = P(i),
        b = P(i + 1),
        c = P(j),
        d = P(j + 1);
      const d1 = cross(c, d, a),
        d2 = cross(c, d, b),
        d3 = cross(a, b, c),
        d4 = cross(a, b, d);
      if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    }
  return false;
}

/** Default outline: a vase half-silhouette for Revolve (x = distance from axis, y = height). */
export const VASE_POINTS: number[] = writePoints([
  { x: 0, y: -1, sharp: true },
  { x: 0.55, y: -1, sharp: true },
  { x: 0.8, y: -0.4, sharp: false },
  { x: 0.45, y: 0.45, sharp: false },
  { x: 0.5, y: 1, sharp: true },
  { x: 0, y: 1, sharp: true },
]);
