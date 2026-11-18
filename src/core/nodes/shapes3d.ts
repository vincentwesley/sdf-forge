import type { NodeDef } from './types';
import { sdBox, symBox } from './lib';

const IQ = 'Inigo Quilez, iquilezles.org/articles/distfunctions (MIT)';

export const sphere: NodeDef = {
  type: 'sphere',
  label: 'Sphere',
  category: 'shape',
  summary: 'A perfect ball.',
  help: 'Every point at the same distance from the centre. The distance to a sphere is simply the distance to its centre minus the radius, which makes it the "hello world" of signed distance functions.',
  keywords: ['ball', 'round', 'orb'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 1, min: 0.001, softMax: 3 },
  ],
  emit: ({ ir, p, num }) => ({ d: ir.sub(ir.length(p), num('radius')), col: ir.c(0) }),
  bounds: ({ params }) => {
    const r = params.radius as number;
    return symBox(r, r, r);
  },
  credit: IQ,
};

export const box: NodeDef = {
  type: 'box',
  label: 'Box',
  category: 'shape',
  summary: 'A box with optional rounded edges.',
  help: 'A rectangular block. Increase "Rounding" to soften the edges and corners; the outer size stays the same.',
  keywords: ['cube', 'block', 'rectangle', 'brick'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    {
      key: 'size',
      label: 'Size',
      kind: 'vec3',
      unit: 'length',
      default: [1.6, 1.6, 1.6],
      min: 0.001,
      softMax: 5,
    },
    { key: 'rounding', label: 'Rounding', kind: 'float', unit: 'length', default: 0.1, min: 0, softMax: 1 },
  ],
  derive: (pr) => {
    const s = pr.size as number[];
    const r = Math.min(pr.rounding as number, s[0] / 2, s[1] / 2, s[2] / 2);
    return { half: s.map((v) => v / 2 - r), r };
  },
  emit: ({ ir, p, derived }) => ({ d: ir.sub(sdBox(ir, p, derived('half')), derived('r')), col: ir.c(0) }),
  bounds: ({ params }) => {
    const s = params.size as number[];
    return symBox(s[0] / 2, s[1] / 2, s[2] / 2);
  },
  credit: IQ,
};

export const torus: NodeDef = {
  type: 'torus',
  label: 'Torus',
  category: 'shape',
  summary: 'A ring, like a doughnut.',
  help: 'A circle swept around another circle. "Ring radius" is the size of the ring, "Tube radius" is how thick the tube is.',
  keywords: ['donut', 'doughnut', 'ring'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'major', label: 'Ring radius', kind: 'float', unit: 'length', default: 1, min: 0, softMax: 3 },
    {
      key: 'minor',
      label: 'Tube radius',
      kind: 'float',
      unit: 'length',
      default: 0.35,
      min: 0.001,
      softMax: 1.5,
    },
  ],
  emit: ({ ir, p, num }) => {
    const q = ir.vec2(ir.sub(ir.length(ir.sw(p, 'xz')), num('major')), ir.y(p));
    return { d: ir.sub(ir.length(q), num('minor')), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const R = params.major as number,
      r = params.minor as number;
    return symBox(R + r, r, R + r);
  },
  credit: IQ,
};

export const cylinder: NodeDef = {
  type: 'cylinder',
  label: 'Cylinder',
  category: 'shape',
  summary: 'An upright cylinder with optional rounded rims.',
  help: 'A can-shaped solid standing along the vertical axis. "Rounding" softens the top and bottom rims.',
  keywords: ['can', 'tube', 'disc', 'pillar', 'rod'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 0.8, min: 0.001, softMax: 3 },
    { key: 'height', label: 'Height', kind: 'float', unit: 'length', default: 1.6, min: 0.001, softMax: 5 },
    {
      key: 'rounding',
      label: 'Rounding',
      kind: 'float',
      unit: 'length',
      default: 0.05,
      min: 0,
      softMax: 0.5,
    },
  ],
  derive: (pr) => {
    const r = pr.radius as number,
      h = pr.height as number;
    const rr = Math.min(pr.rounding as number, r, h / 2);
    return { ra: r - rr, ha: h / 2 - rr, rr };
  },
  emit: ({ ir, p, derived }) => {
    const d2 = ir.vec2(
      ir.sub(ir.length(ir.sw(p, 'xz')), derived('ra')),
      ir.sub(ir.abs(ir.y(p)), derived('ha')),
    );
    const d = ir.add(ir.min(ir.maxComp(d2), 0), ir.length(ir.max(d2, 0)));
    return { d: ir.sub(d, derived('rr')), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const r = params.radius as number,
      h = params.height as number;
    return symBox(r, h / 2, r);
  },
  credit: IQ,
};

export const capsule: NodeDef = {
  type: 'capsule',
  label: 'Capsule',
  category: 'shape',
  summary: 'A pill: a cylinder with round ends.',
  help: 'The set of points within "Radius" of a vertical line segment. Great for limbs, handles and smooth struts.',
  keywords: ['pill', 'stick', 'limb', 'segment'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'length', label: 'Length', kind: 'float', unit: 'length', default: 2, min: 0.001, softMax: 5 },
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 0.4, min: 0.001, softMax: 1.5 },
  ],
  derive: (pr) => ({ hs: Math.max((pr.length as number) / 2 - (pr.radius as number), 0) }),
  emit: ({ ir, p, num, derived }) => {
    const hs = derived('hs');
    const y = ir.sub(ir.y(p), ir.clamp(ir.y(p), ir.neg(hs), hs));
    return { d: ir.sub(ir.length(ir.vec3(ir.x(p), y, ir.z(p))), num('radius')), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const r = params.radius as number;
    const hs = Math.max((params.length as number) / 2 - r, 0);
    return symBox(r, hs + r, r);
  },
  credit: IQ,
};

export const cone: NodeDef = {
  type: 'cone',
  label: 'Cone',
  category: 'shape',
  summary: 'A cone or truncated cone.',
  help: 'A solid that narrows from the bottom radius to the top radius. Set the top radius to 0 for a pointed cone, or make it larger than the bottom for a funnel.',
  keywords: ['frustum', 'funnel', 'spike', 'taper'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'height', label: 'Height', kind: 'float', unit: 'length', default: 1.8, min: 0.001, softMax: 5 },
    {
      key: 'bottom',
      label: 'Bottom radius',
      kind: 'float',
      unit: 'length',
      default: 0.9,
      min: 0,
      softMax: 3,
    },
    { key: 'top', label: 'Top radius', kind: 'float', unit: 'length', default: 0.2, min: 0, softMax: 3 },
  ],
  emit: ({ ir, p, num }) => {
    // sdCappedCone (exact), h = half height
    const h = ir.mul(num('height'), 0.5),
      r1 = num('bottom'),
      r2 = num('top');
    const q = ir.vec2(ir.length(ir.sw(p, 'xz')), ir.y(p));
    const qx = ir.x(q),
      qy = ir.y(q);
    const k1 = ir.vec2(r2, h);
    const k2 = ir.vec2(ir.sub(r2, r1), ir.mul(h, 2));
    const ca = ir.vec2(ir.sub(qx, ir.min(qx, ir.select(ir.lt(qy, 0), r1, r2))), ir.sub(ir.abs(qy), h));
    const t = ir.clamp(ir.div(ir.dot(ir.sub(k1, q), k2), ir.dot2(k2)), 0, 1);
    const cb = ir.add(ir.sub(q, k1), ir.mul(k2, t));
    const inside = ir.and(ir.lt(ir.x(cb), 0), ir.lt(ir.y(ca), 0));
    const s = ir.select(inside, -1, 1);
    return { d: ir.mul(s, ir.sqrt(ir.min(ir.dot2(ca), ir.dot2(cb)))), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const r = Math.max(params.bottom as number, params.top as number);
    return symBox(r, (params.height as number) / 2, r);
  },
  credit: IQ,
};

export const ellipsoid: NodeDef = {
  type: 'ellipsoid',
  label: 'Ellipsoid',
  category: 'shape',
  summary: 'A stretched sphere with separate radii.',
  help: 'A sphere squashed or stretched along each axis. There is no exact closed-form distance to an ellipsoid, so this uses a close approximation (fine for modelling and export).',
  keywords: ['egg', 'oval', 'blob', 'stretched sphere'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'approx',
  params: [
    {
      key: 'radii',
      label: 'Radii',
      kind: 'vec3',
      unit: 'length',
      default: [1.2, 0.7, 0.8],
      min: 0.001,
      softMax: 3,
    },
  ],
  emit: ({ ir, p, vec }) => {
    const r = vec('radii');
    const k0 = ir.length(ir.div(p, r));
    const k1raw = ir.length(ir.div(p, ir.mul(r, r)));
    const k1 = ir.max(k1raw, 1e-9);
    // the formula is 0/0 at the exact centre; use the smallest radius there
    const d = ir.select(ir.lt(k1raw, 1e-6), ir.neg(ir.minComp(r)), ir.div(ir.mul(k0, ir.sub(k0, 1)), k1));
    return { d, col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const r = params.radii as number[];
    return symBox(r[0], r[1], r[2]);
  },
  credit: IQ,
};

export const octahedron: NodeDef = {
  type: 'octahedron',
  label: 'Octahedron',
  category: 'shape',
  summary: 'Two pyramids base to base, like a gem.',
  help: 'A diamond-like solid with eight triangular faces. "Size" is the distance from the centre to each tip.',
  keywords: ['diamond', 'gem', 'crystal', 'platonic'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'size', label: 'Size', kind: 'float', unit: 'length', default: 1.2, min: 0.001, softMax: 3 },
  ],
  emit: ({ ir, p, num }) => {
    const s = num('size');
    const a = ir.abs(p);
    const x = ir.x(a),
      y = ir.y(a),
      z = ir.z(a);
    const m = ir.sub(ir.add(ir.add(x, y), z), s);
    const cx = ir.lt(ir.mul(x, 3), m),
      cy = ir.lt(ir.mul(y, 3), m),
      cz = ir.lt(ir.mul(z, 3), m);
    // q = p.xyz | p.yzx | p.zxy
    const q = ir.select(cx, a, ir.select(cy, ir.vec3(y, z, x), ir.vec3(z, x, y)));
    const k = ir.clamp(ir.mul(ir.add(ir.sub(ir.z(q), ir.y(q)), s), 0.5), 0, s);
    const exact = ir.length(ir.vec3(ir.x(q), ir.add(ir.sub(ir.y(q), s), k), ir.sub(ir.z(q), k)));
    const any = ir.select(cx, 1, ir.select(cy, 1, ir.select(cz, 1, 0)));
    const d = ir.select(ir.gt(any, 0.5), exact, ir.mul(m, 0.57735027));
    return { d, col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const s = params.size as number;
    return symBox(s, s, s);
  },
  credit: IQ,
};

export const hexPrism: NodeDef = {
  type: 'hexPrism',
  label: 'Hex prism',
  category: 'shape',
  summary: 'A six-sided column, like a pencil or a nut.',
  help: 'A hexagonal column standing upright. "Radius" is measured from the centre to the middle of a flat side.',
  keywords: ['hexagon', 'nut', 'bolt', 'pencil', 'column'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 0.8, min: 0.001, softMax: 3 },
    { key: 'height', label: 'Height', kind: 'float', unit: 'length', default: 1.6, min: 0.001, softMax: 5 },
  ],
  emit: ({ ir, p, num }) => {
    // IQ sdHexPrism with the prism axis along Y
    const hx = num('radius'),
      hy = ir.mul(num('height'), 0.5);
    const kx = -0.8660254,
      ky = 0.5,
      kz = 0.57735;
    const a = ir.abs(ir.vec3(ir.x(p), ir.z(p), ir.y(p)));
    const kk = ir.vec2(kx, ky);
    const dt = ir.min(ir.dot(kk, ir.sw(a, 'xy')), 0);
    const xy = ir.sub(ir.sw(a, 'xy'), ir.mul(kk, ir.mul(dt, 2)));
    const lim = ir.mul(hx, kz);
    const e = ir.sub(xy, ir.vec2(ir.clamp(ir.x(xy), ir.neg(lim), lim), hx));
    const d = ir.vec2(ir.mul(ir.length(e), ir.sign(ir.sub(ir.y(xy), hx))), ir.sub(ir.z(a), hy));
    return { d: ir.add(ir.min(ir.maxComp(d), 0), ir.length(ir.max(d, 0))), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const r = (params.radius as number) / 0.8660254;
    return symBox(r, (params.height as number) / 2, r);
  },
  credit: IQ,
};

export const link: NodeDef = {
  type: 'link',
  label: 'Chain link',
  category: 'shape',
  summary: 'An oval ring, like one link of a chain.',
  help: 'A torus stretched along the vertical axis. Combine several with Repeat or Transform to build chains.',
  keywords: ['chain', 'loop', 'oval ring'],
  inputs: [],
  output: 'sdf3',
  transform: 3,
  colored: true,
  exactness: 'exact',
  params: [
    {
      key: 'length',
      label: 'Straight length',
      kind: 'float',
      unit: 'length',
      default: 0.6,
      min: 0,
      softMax: 3,
    },
    {
      key: 'radius',
      label: 'Ring radius',
      kind: 'float',
      unit: 'length',
      default: 0.6,
      min: 0.001,
      softMax: 2,
    },
    {
      key: 'thickness',
      label: 'Thickness',
      kind: 'float',
      unit: 'length',
      default: 0.2,
      min: 0.001,
      softMax: 1,
    },
  ],
  emit: ({ ir, p, num }) => {
    const le = ir.mul(num('length'), 0.5);
    const q = ir.vec3(ir.x(p), ir.max(ir.sub(ir.abs(ir.y(p)), le), 0), ir.z(p));
    const v = ir.vec2(ir.sub(ir.length(ir.sw(q, 'xy')), num('radius')), ir.z(q));
    return { d: ir.sub(ir.length(v), num('thickness')), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const le = (params.length as number) / 2,
      r = params.radius as number,
      t = params.thickness as number;
    return symBox(r + t, le + r + t, t);
  },
  credit: IQ,
};

export const SHAPES_3D = [sphere, box, torus, cylinder, capsule, cone, ellipsoid, octahedron, hexPrism, link];
