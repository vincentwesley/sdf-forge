import { describe, expect, it } from 'vitest';
import { G, evaluator, rng } from '../helpers';
import { flankAngle, gearPolygon, gearRadii, halfToothOutline } from '../../src/core/gear';

/** brute-force signed distance to a closed polygon */
function polyDist(px: number, py: number, v: [number, number][]) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [ax, ay] = v[j],
      [bx, by] = v[i];
    const ex = bx - ax,
      ey = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(px - ax - ex * t, py - ay - ey * t));
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

/** the gear profile evaluated through the 2D preview (exact in the mid-plane) */
function gear2d(params: Record<string, number>) {
  const g = new G();
  const id = g.node('gear', params);
  g.out(id);
  const e = evaluator(g.doc, id);
  return (u: number, v: number) => e.map(u, 0, -v);
}

describe('gear', () => {
  it('flanks are true involutes of the base circle', () => {
    const spec = { teeth: 24, module: 0.1, pressure: 20 };
    const { rb, rp, z } = gearRadii(spec);
    // at the pitch circle the tooth is exactly half a pitch thick
    expect(2 * flankAngle(spec, rp) * rp).toBeCloseTo((Math.PI * rp) / z, 9);
    // involute: the unwound string length equals the arc length on the base circle
    for (const r of [rb * 1.01, rp, rp * 1.04]) {
      const phi = Math.acos(rb / r);
      const roll = Math.tan(phi); // string length / rb
      const polar = flankAngle(spec, rb) - flankAngle(spec, r); // angle the flank turned
      expect(polar).toBeCloseTo(roll - phi, 9);
    }
  });

  for (const params of [
    { teeth: 20, module: 0.1, pressure: 20, bore: 0 },
    { teeth: 9, module: 0.2, pressure: 25, bore: 0.3 },
    { teeth: 57, module: 0.03, pressure: 14.5, bore: 0.5 },
  ])
    it(`matches the brute-force polygon distance: ${params.teeth} teeth`, () => {
      const f = gear2d(params);
      const poly = gearPolygon(params);
      const { ra } = gearRadii(params);
      const r = rng(params.teeth);
      for (let i = 0; i < 1500; i++) {
        const x = (r() * 2 - 1) * ra * 1.3,
          y = (r() * 2 - 1) * ra * 1.3;
        let ref = polyDist(x, y, poly);
        if (params.bore > 0) ref = Math.max(ref, params.bore - Math.hypot(x, y));
        // the preview plate is max(d2, |y| - 0.02): compare where the profile distance shows through
        if (ref > -0.02) expect(f(x, y)).toBeCloseTo(ref, 5);
      }
    });

  it('two gears with the same module mesh at (z1 + z2)·m/2 without overlapping', () => {
    const a = { teeth: 20, module: 0.1, pressure: 20 },
      b = { teeth: 12, module: 0.1, pressure: 20 };
    const c = ((a.teeth + b.teeth) * a.module) / 2;
    // gear b turned by half a tooth so a tooth meets a gap on the line of centres
    const pa = gearPolygon(a);
    const turn = Math.PI / b.teeth;
    const pb = gearPolygon(b).map(([x, y]) => [
      c + x * Math.cos(turn) - y * Math.sin(turn),
      x * Math.sin(turn) + y * Math.cos(turn),
    ]) as [number, number][];
    // no point of one is deeper than a hair inside the other
    let worst = 0;
    for (const [x, y] of pb) worst = Math.min(worst, polyDist(x, y, pa));
    expect(worst).toBeGreaterThan(-0.002);
    // and they really engage: some point is within a tenth of a module
    let nearest = Infinity;
    for (const [x, y] of pb) nearest = Math.min(nearest, Math.abs(polyDist(x, y, pa)));
    expect(nearest).toBeLessThan(0.01);
  });

  it('has a fixed number of outline points, so settings never recompile', () => {
    expect(halfToothOutline({ teeth: 7, module: 1, pressure: 20 })).toHaveLength(
      halfToothOutline({ teeth: 90, module: 0.01, pressure: 28 }).length,
    );
  });
});
