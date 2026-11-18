import { describe, expect, it } from 'vitest';
import { G, evaluator, gradient, randomPoints } from '../helpers';
import { SHAPES_3D } from '../../src/core/nodes/shapes3d';
import { defaultParams } from '../../src/core/nodes/registry';

const len = (...v: number[]) => Math.hypot(...v);

function single(type: string, params: Record<string, unknown> = {}) {
  const g = new G();
  g.out(g.node(type, params as never));
  return evaluator(g.doc);
}

describe('known distances (analytic)', () => {
  const pts = randomPoints(300, 3);
  it('sphere', () => {
    const e = single('sphere', { radius: 1.3 });
    for (const [x, y, z] of pts) expect(e.map(x, y, z)).toBeCloseTo(len(x, y, z) - 1.3, 5);
  });
  it('box (sharp)', () => {
    const e = single('box', { size: [2, 1, 3], rounding: 0 });
    for (const [x, y, z] of pts) {
      const q = [Math.abs(x) - 1, Math.abs(y) - 0.5, Math.abs(z) - 1.5];
      const ref = len(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
      expect(e.map(x, y, z)).toBeCloseTo(ref, 5);
    }
  });
  it('box keeps its outer size when rounded', () => {
    const e = single('box', { size: [2, 1, 3], rounding: 0.3 });
    expect(e.map(1, 0, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, 0.5, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, 0, 1.5)).toBeCloseTo(0, 5);
    // corner is rounded: corner point is outside by r*(sqrt(3)-1)
    expect(e.map(1, 0.5, 1.5)).toBeCloseTo(0.3 * (Math.sqrt(3) - 1), 5);
  });
  it('torus', () => {
    const e = single('torus', { major: 1.2, minor: 0.3 });
    for (const [x, y, z] of pts) expect(e.map(x, y, z)).toBeCloseTo(len(len(x, z) - 1.2, y) - 0.3, 5);
  });
  it('capsule', () => {
    const e = single('capsule', { length: 2, radius: 0.5 });
    for (const [x, y, z] of pts) {
      const cy = y - Math.max(-0.5, Math.min(0.5, y));
      expect(e.map(x, y, z)).toBeCloseTo(len(x, cy, z) - 0.5, 5);
    }
  });
  it('cylinder (sharp)', () => {
    const e = single('cylinder', { radius: 0.8, height: 2, rounding: 0 });
    for (const [x, y, z] of pts) {
      const dx = len(x, z) - 0.8,
        dy = Math.abs(y) - 1;
      const ref = Math.min(Math.max(dx, dy), 0) + len(Math.max(dx, 0), Math.max(dy, 0));
      expect(e.map(x, y, z)).toBeCloseTo(ref, 5);
    }
  });
  it('cone: apex, base and side', () => {
    const e = single('cone', { height: 2, bottom: 1, top: 0 });
    expect(e.map(0, 1, 0)).toBeCloseTo(0, 5); // apex
    expect(e.map(0, -1, 0)).toBeCloseTo(0, 5); // base centre
    expect(e.map(0, -2, 0)).toBeCloseTo(1, 5); // below the base
    expect(e.map(0, 0, 0)).toBeLessThan(0);
    // point on the slanted side at mid height: radius 0.5
    expect(e.map(0.5, 0, 0)).toBeCloseTo(0, 5);
  });
  it('octahedron: tips and face centre', () => {
    const e = single('octahedron', { size: 1 });
    expect(e.map(1, 0, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, 2, 0)).toBeCloseTo(1, 5);
    const c = 1 / 3;
    expect(e.map(c, c, c)).toBeCloseTo(0, 5);
    expect(e.map(1, 1, 1)).toBeCloseTo((3 - 1) / Math.sqrt(3), 5);
  });
  it('hex prism: flat side and cap', () => {
    const e = single('hexPrism', { radius: 1, height: 2 });
    expect(e.map(0, 0, 1)).toBeCloseTo(0, 5); // flat side faces +z
    expect(e.map(0, 0, 1.5)).toBeCloseTo(0.5, 5);
    expect(e.map(0, 1.25, 0)).toBeCloseTo(0.25, 5);
    expect(e.map(1 / 0.8660254, 0, 0)).toBeCloseTo(0, 4); // corner
  });
  it('link: on the ring', () => {
    const e = single('link', { length: 1, radius: 0.5, thickness: 0.1 });
    expect(e.map(0.5, 0, 0)).toBeCloseTo(-0.1, 5);
    expect(e.map(0, 1, 0)).toBeCloseTo(-0.1, 5);
  });
  it('ellipsoid: surface at the radii', () => {
    const e = single('ellipsoid', { radii: [1.5, 0.5, 1] });
    expect(e.map(1.5, 0, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, 0.5, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, 0, 1)).toBeCloseTo(0, 5);
    expect(Number.isFinite(e.map(0, 0, 0))).toBe(true);
    expect(e.map(0, 0, 0)).toBeLessThan(0);
  });
});

/**
 * Generic exactness test: for an exact SDF, (1) it is 1-Lipschitz and
 * (2) stepping from p by -d * grad lands on the surface.
 */
describe('exact primitives satisfy the distance property', () => {
  for (const def of SHAPES_3D) {
    if (def.exactness !== 'exact') continue;
    it(def.type, () => {
      const g = new G();
      g.out(
        g.node(def.type, { ...defaultParams(def.type), rotation: [20, 35, 10], position: [0.2, -0.1, 0.3] }),
      );
      const e = evaluator(g.doc);
      const pts = randomPoints(400, 2.5, 11);
      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i];
        const d = e.map(x, y, z);
        const [gx, gy, gz] = gradient(e.map, x, y, z);
        const gl = len(gx, gy, gz);
        // gradient magnitude ~1 almost everywhere (skip creases where it is undefined)
        if (Math.abs(gl - 1) > 0.02) continue;
        const sx = x - d * gx,
          sy = y - d * gy,
          sz = z - d * gz;
        expect(Math.abs(e.map(sx, sy, sz))).toBeLessThan(2e-3 + Math.abs(d) * 2e-3);
        const [qx, qy, qz] = pts[(i + 1) % pts.length];
        expect(Math.abs(d - e.map(qx, qy, qz))).toBeLessThanOrEqual(
          len(x - qx, y - qy, z - qz) * (1 + 1e-6) + 1e-6,
        );
      }
    });
  }
});

describe('transforms', () => {
  it('position, rotation and scale move the shape and keep distances exact', () => {
    const g = new G();
    g.out(
      g.node('box', { size: [2, 1, 1], rounding: 0, position: [1, 2, 3], rotation: [0, 90, 0], scale: 2 }),
    );
    const e = evaluator(g.doc);
    // after 90° about Y, the long axis (x, half 1*2=2) points along z
    expect(e.map(1, 2, 3 + 2)).toBeCloseTo(0, 5);
    expect(e.map(1 + 1, 2, 3)).toBeCloseTo(0, 5);
    expect(e.map(1, 2 + 2, 3)).toBeCloseTo(1, 5);
  });
});
