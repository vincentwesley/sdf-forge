import { describe, expect, it } from 'vitest';
import { G, evaluator, randomPoints, rng } from '../helpers';
import { ALL_NODES, defaultParams } from '../../src/core/nodes/registry';
import type { ParamValue } from '../../src/core/nodes/types';

const len = (...v: number[]) => Math.hypot(...v);

/** Brute-force signed distance to a closed polygon (2D). */
function polyDist(px: number, py: number, v: [number, number][]) {
  let d = Infinity;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [ax, ay] = v[j],
      [bx, by] = v[i];
    const ex = bx - ax,
      ey = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, len(px - ax - ex * t, py - ay - ey * t));
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -d : d;
}

/** Evaluate a 2D profile through Extrude with a huge height: in the mid-plane, d3 == d2 when d2 < 0... use revolve-free check */
function profile2d(type: string, params: Record<string, ParamValue>) {
  const g = new G();
  const p = g.node(type, params);
  g.out(p);
  // compile with the profile as root: preview plate is exact max(d2, |y|-0.02); sample at y=0 and d2 > -0.02
  const e = evaluator(g.doc, p);
  return (u: number, v: number) => e.map(u, 0, v);
}

describe('2D profiles', () => {
  const pts = randomPoints(400, 2.5, 3).map(([x, , z]) => [x, z] as const);
  it('circle', () => {
    const f = profile2d('circle', { radius: 0.9 });
    for (const [u, v] of pts) {
      const ref = len(u, v) - 0.9;
      if (ref > -0.02) expect(f(u, v)).toBeCloseTo(ref, 5);
    }
  });
  it('polygon matches brute force', () => {
    for (const n of [3, 5, 6, 8]) {
      const f = profile2d('polygon', { sides: n, radius: 1 });
      const verts: [number, number][] = Array.from({ length: n }, (_, i) => [
        Math.cos((Math.PI * (2 * i + 1)) / n),
        Math.sin((Math.PI * (2 * i + 1)) / n),
      ]);
      for (const [u, v] of pts) {
        const ref = polyDist(u, v, verts);
        if (ref > -0.02) expect(f(u, v)).toBeCloseTo(ref, 4);
      }
    }
  });
  it('star matches brute force', () => {
    for (const [n, inner] of [
      [5, 0.5],
      [3, 0.3],
      [8, 0.7],
    ]) {
      const f = profile2d('star', { points: n, radius: 1, inner });
      const verts: [number, number][] = [];
      for (let i = 0; i < 2 * n; i++) {
        const a = (Math.PI * i) / n;
        const r = i % 2 ? inner : 1;
        verts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      for (const [u, v] of pts) {
        const ref = polyDist(u, v, verts);
        if (ref > -0.02) expect(f(u, v)).toBeCloseTo(ref, 4);
      }
    }
  });
  it('rectangle with rounding', () => {
    const f = profile2d('rect', { size: [2, 1], rounding: 0.2 });
    expect(f(1, 0)).toBeCloseTo(0, 5);
    expect(f(0, 0.5)).toBeCloseTo(0, 5);
    expect(f(1.5, 0)).toBeCloseTo(0.5, 5);
  });
});

describe('2D to 3D', () => {
  it('revolve of an offset circle is a torus', () => {
    const g = new G();
    const c = g.node('circle', { radius: 0.3 });
    const r = g.node('revolve', { offset: 1.2 });
    g.link(c, r, 'profile').out(r);
    const e = evaluator(g.doc);
    for (const [x, y, z] of randomPoints(200, 2.5))
      expect(e.map(x, y, z)).toBeCloseTo(len(len(x, z) - 1.2, y) - 0.3, 5);
  });
  it('extrude of a circle is a cylinder', () => {
    const g = new G();
    const c = g.node('circle', { radius: 0.8 });
    const x = g.node('extrude', { height: 2, rounding: 0 });
    g.link(c, x, 'profile').out(x);
    const e = evaluator(g.doc);
    for (const [px, py, pz] of randomPoints(200, 2.5)) {
      const dx = len(px, pz) - 0.8,
        dy = Math.abs(py) - 1;
      expect(e.map(px, py, pz)).toBeCloseTo(
        Math.min(Math.max(dx, dy), 0) + len(Math.max(dx, 0), Math.max(dy, 0)),
        5,
      );
    }
  });
});

describe('combine', () => {
  const two = (type: string, params: Record<string, ParamValue> = {}) => {
    const g = new G();
    const a = g.node('sphere', { radius: 1, position: [-0.5, 0, 0] });
    const b = g.node('sphere', { radius: 1, position: [0.5, 0, 0] });
    const u = g.node(type, params);
    const inputs =
      type === 'union' ? ['shapes', 'shapes'] : type === 'subtract' ? ['base', 'cutter'] : ['a', 'b'];
    g.link(a, u, inputs[0]).link(b, u, inputs[1]).out(u);
    return evaluator(g.doc);
  };
  const da = (x: number, y: number, z: number) => len(x + 0.5, y, z) - 1;
  const db = (x: number, y: number, z: number) => len(x - 0.5, y, z) - 1;
  const pts = randomPoints(300, 3);
  it('sharp union / subtract / intersect are min / max(a,-b) / max', () => {
    const u = two('union'),
      s = two('subtract'),
      i = two('intersect');
    for (const [x, y, z] of pts) {
      expect(u.map(x, y, z)).toBeCloseTo(Math.min(da(x, y, z), db(x, y, z)), 5);
      expect(s.map(x, y, z)).toBeCloseTo(Math.max(da(x, y, z), -db(x, y, z)), 5);
      expect(i.map(x, y, z)).toBeCloseTo(Math.max(da(x, y, z), db(x, y, z)), 5);
    }
  });
  it('smooth union deviates from min by at most k', () => {
    const k = 0.3;
    const u = two('union', { smooth: k });
    let maxDev = 0;
    for (const [x, y, z] of pts) {
      const m = Math.min(da(x, y, z), db(x, y, z));
      const d = u.map(x, y, z);
      expect(d).toBeLessThanOrEqual(m + 1e-6);
      maxDev = Math.max(maxDev, m - d);
    }
    expect(maxDev).toBeLessThanOrEqual(k + 1e-6);
    // exactly k where both distances are equal
    expect(Math.min(da(0, 2, 0), db(0, 2, 0)) - u.map(0, 2, 0)).toBeCloseTo(k, 5);
  });
  it('morph interpolates distances', () => {
    const m = two('morph', { amount: 0.25 });
    for (const [x, y, z] of pts)
      expect(m.map(x, y, z)).toBeCloseTo(0.75 * da(x, y, z) + 0.25 * db(x, y, z), 5);
  });
  it('blends colours with the shape', () => {
    const g = new G();
    const a = g.node('sphere', { radius: 1, position: [-1, 0, 0], color: [1, 0, 0] });
    const b = g.node('sphere', { radius: 1, position: [1, 0, 0], color: [0, 0, 1] });
    const u = g.node('union', { smooth: 0.5 });
    g.link(a, u, 'shapes').link(b, u, 'shapes').out(u);
    const e = evaluator(g.doc);
    const out = [0, 0, 0];
    e.color(-2, 0, 0, out);
    expect(out).toEqual([1, 0, 0]);
    e.color(0, 0, 0, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(0.5, 5);
  });
});

describe('modifiers', () => {
  it('repeat makes N copies centred on the origin', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 0.4 });
    const r = g.node('repeat', { countX: 3, countY: 1, countZ: 2, spacing: [1.5, 1, 2] });
    g.link(s, r, 'shape').out(r);
    const e = evaluator(g.doc);
    for (const x of [-1.5, 0, 1.5]) for (const z of [-1, 1]) expect(e.map(x, 0, z)).toBeCloseTo(-0.4, 5);
    expect(e.map(3, 0, 1)).toBeCloseTo(1.5 - 0.4, 5);
    expect(e.map(0, 0, 0)).toBeGreaterThan(0);
  });
  it('radial repeat places copies around Y', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 0.3, position: [1, 0, 0] });
    const r = g.node('radial', { count: 4 });
    g.link(s, r, 'shape').out(r);
    const e = evaluator(g.doc);
    for (const [x, z] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ])
      expect(e.map(x, 0, z)).toBeCloseTo(-0.3, 5);
  });
  it('mirror reflects +X onto -X', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 0.5, position: [1, 0, 0] });
    const m = g.node('mirror', { x: true });
    g.link(s, m, 'shape').out(m);
    const e = evaluator(g.doc);
    expect(e.map(-1, 0, 0)).toBeCloseTo(-0.5, 5);
    expect(e.map(1, 0, 0)).toBeCloseTo(-0.5, 5);
  });
  it('shell inside keeps the outer surface', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 1 });
    const sh = g.node('shell', { thickness: 0.2, side: 'inside' });
    g.link(s, sh, 'shape').out(sh);
    const e = evaluator(g.doc);
    expect(e.map(1, 0, 0)).toBeCloseTo(0, 5);
    expect(e.map(0.8, 0, 0)).toBeCloseTo(0, 5);
    expect(e.map(0.9, 0, 0)).toBeCloseTo(-0.1, 5);
    expect(e.map(0, 0, 0)).toBeCloseTo(0.8, 5);
  });
  it('cut keeps one side of a plane', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 1 });
    const c = g.node('cut', { axis: 'y', offset: 0.5, keep: 'below' });
    g.link(s, c, 'shape').out(c);
    const e = evaluator(g.doc);
    expect(e.map(0, 0.5, 0)).toBeCloseTo(0, 5);
    expect(e.map(0, -1, 0)).toBeCloseTo(0, 5);
  });
  it('elongate turns a sphere into a capsule-like shape', () => {
    const g = new G();
    const s = g.node('sphere', { radius: 0.5 });
    const el = g.node('elongate', { amount: [0, 2, 0] });
    g.link(s, el, 'shape').out(el);
    const e = evaluator(g.doc);
    for (const [x, y, z] of randomPoints(200, 2.5)) {
      const cy = y - Math.max(-1, Math.min(1, y));
      expect(e.map(x, y, z)).toBeCloseTo(len(x, cy, z) - 0.5, 5);
    }
  });
  it('twist by 90°/unit rotates a slab', () => {
    const g = new G();
    const b = g.node('box', { size: [2, 3, 0.2], rounding: 0 });
    const t = g.node('twist', { amount: 90 });
    g.link(b, t, 'shape').out(t);
    const e = evaluator(g.doc);
    // at y = 1 the slab is rotated 90° around Y: its long X extent now lies along Z
    expect(e.map(0, 1, 0.9)).toBeLessThan(0);
    expect(e.map(0.9, 1, 0)).toBeGreaterThan(0);
    expect(e.map(0.9, 0, 0)).toBeLessThan(0);
  });
});

/** Build a representative graph for any node type. */
function graphFor(type: string, seed: number) {
  const r = rng(seed);
  const g = new G();
  const def = ALL_NODES.find((d) => d.type === type)!;
  const params: Record<string, ParamValue> = defaultParams(type);
  if (def.transform === 3)
    Object.assign(params, { position: [r() - 0.5, r() - 0.5, r() - 0.5], rotation: [r() * 90, r() * 90, 0] });
  const id = g.node(type, params);
  def.inputs.forEach((inp, k) => {
    if (inp.type === 'sdf2') g.link(g.node('star', { points: 5, radius: 0.8 }), id, inp.key);
    else if (k > 0) g.link(g.node('sphere', { radius: 0.6, position: [0.6, 0.3, 0.2] }), id, inp.key);
    else {
      // radial repeat expects its input away from the axis (see its help text)
      const px = type === 'radial' ? 1.4 : 0.3;
      g.link(
        g.node('box', { size: [1.2, 0.8, 1], position: [px, 0.1, 0], rotation: [10, 20, 30] }),
        id,
        inp.key,
      );
      if (inp.multi)
        g.link(g.node('torus', { major: 0.8, minor: 0.2, position: [-0.4, 0.3, 0] }), id, inp.key);
    }
  });
  if (type === 'output') return { g, root: undefined };
  if (def.output === 'sdf2') return { g, root: id };
  g.out(id);
  return { g, root: undefined };
}

describe('every node: bounds are conservative and the step bound is safe', () => {
  for (const def of ALL_NODES.filter((d) => d.type !== 'output')) {
    it(def.type, () => {
      const { g, root } = graphFor(def.type, 5);
      const flat = def.output === 'sdf2';
      const e = evaluator(g.doc, root);
      const b = e.bounds.bounds!;
      expect(b).toBeTruthy();
      const L = e.bounds.lipschitz;
      expect(L).toBeGreaterThanOrEqual(1);
      const pts = randomPoints(3000, 4, 9);
      const tol = 1e-3;
      let insideCount = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, y0, z] = pts[i];
        const y = flat ? y0 * 0.004 : y0;
        const d = e.map(x, y, z);
        expect(Number.isFinite(d)).toBe(true);
        if (d < 0) {
          insideCount++;
          expect(x).toBeGreaterThanOrEqual(b.min[0] - tol);
          expect(x).toBeLessThanOrEqual(b.max[0] + tol);
          expect(y).toBeGreaterThanOrEqual(b.min[1] - tol);
          expect(y).toBeLessThanOrEqual(b.max[1] + tol);
          expect(z).toBeGreaterThanOrEqual(b.min[2] - tol);
          expect(z).toBeLessThanOrEqual(b.max[2] + tol);
        }
        // local Lipschitz check on nearby pairs (what the ray marcher relies on)
        const h = 0.05;
        const hy = flat ? 0 : h * 0.5;
        const d2 = e.map(x + h, y + hy, z - h * 0.3);
        expect(Math.abs(d2 - d)).toBeLessThanOrEqual(L * Math.hypot(h, hy, h * 0.3) * 1.02 + 1e-5);
      }
      expect(insideCount).toBeGreaterThan(0);
    });
  }
});
