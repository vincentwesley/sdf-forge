/**
 * Involute spur gear outline (ISO 53 basic rack: addendum 1·m, dedendum 1.25·m).
 *
 * A gear has 2z mirror symmetries, so only half a tooth is needed: the
 * outline in the wedge 0 ≤ θ ≤ π/z, from the middle of the tooth tip to the
 * middle of the gap. The shader folds any point into that wedge and measures
 * the distance to this polyline, which stays exact (DECISIONS.md 25).
 *
 * Undercut is not modelled, so gears with fewer than ~17 teeth have slightly
 * fuller roots than a hobbed gear; that is harmless for printing.
 */

export const GEAR_VERTS = 14;
const FLANK = 8;
const ROOT = 3;

export interface GearSpec {
  teeth: number;
  /** module: pitch diameter / teeth (scene units) */
  module: number;
  /** pressure angle in degrees (20 is standard) */
  pressure: number;
}

const inv = (a: number) => Math.tan(a) - a;

export function gearRadii(g: GearSpec) {
  const z = Math.max(3, Math.round(g.teeth));
  const m = Math.max(1e-4, g.module);
  const alpha = (Math.min(35, Math.max(10, g.pressure)) * Math.PI) / 180;
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + m;
  const rf = Math.max(rp - 1.25 * m, rp * 0.3);
  return { z, m, alpha, rp, rb, ra, rf };
}

/** Polar angle of the flank at radius r (≥ rb), measured from the tooth's centre line. */
export function flankAngle(g: GearSpec, r: number): number {
  const { z, alpha, rb } = gearRadii(g);
  const phi = Math.acos(Math.min(1, rb / Math.max(r, rb)));
  return Math.max(0, Math.PI / (2 * z) + inv(alpha) - inv(phi));
}

/**
 * The half-tooth outline: GEAR_VERTS points (x, y) in the wedge, from the tip
 * centre (ra, 0) to the gap centre (rf at angle π/z). Always the same count, so
 * the shader never recompiles when settings change.
 */
export function halfToothOutline(g: GearSpec): [number, number][] {
  const { z, rb, ra, rf } = gearRadii(g);
  const half = Math.PI / z;
  const pol = (r: number, t: number): [number, number] => [r * Math.cos(t), r * Math.sin(t)];
  const out: [number, number][] = [];
  const ta = flankAngle(g, ra);
  // tip land: from the centre of the tip to where the flank starts
  out.push(pol(ra, 0), pol(ra, ta / 2));
  // involute flank from the tip down to the base circle (or the root, if that is higher)
  const rLow = Math.max(rb, rf);
  for (let i = 0; i < FLANK; i++) {
    const r = ra + ((rLow - ra) * i) / (FLANK - 1);
    out.push(pol(r, Math.min(half, flankAngle(g, r))));
  }
  // straight radial part below the base circle, then the root land to the middle of the gap
  const t0 = Math.min(half, flankAngle(g, rLow));
  out.push(pol(rf, t0));
  for (let i = 1; i <= ROOT; i++) out.push(pol(rf, t0 + ((half - t0) * i) / ROOT));
  return out;
}

/** The full outline as one closed polygon (for tests and previews). */
export function gearPolygon(g: GearSpec): [number, number][] {
  const { z } = gearRadii(g);
  const half = halfToothOutline(g);
  const sector = (2 * Math.PI) / z;
  const out: [number, number][] = [];
  for (let k = 0; k < z; k++) {
    const rot = (p: [number, number], a: number): [number, number] => [
      p[0] * Math.cos(a) - p[1] * Math.sin(a),
      p[0] * Math.sin(a) + p[1] * Math.cos(a),
    ];
    // mirrored half (gap centre → tip centre), then the half itself (tip centre → gap centre)
    const mirrored = half.map(([x, y]) => [x, -y] as [number, number]).reverse();
    for (const p of [...mirrored.slice(0, -1), ...half.slice(0, -1)]) out.push(rot(p, k * sector));
  }
  return out;
}
