import type { NodeDef } from './types';
import { sdBox } from './lib';

const IQ2 = 'Inigo Quilez, iquilezles.org/articles/distfunctions2d (MIT)';
const flat = (x: number, y: number) => ({
  min: [-x, -y, 0] as [number, number, number],
  max: [x, y, 0] as [number, number, number],
});

const PROFILE_NOTE =
  ' Profiles are flat 2D shapes: connect them to Extrude (to give them thickness) or Revolve (to spin them into a vase-like solid).';

export const circle: NodeDef = {
  type: 'circle',
  label: 'Circle',
  category: 'profile',
  summary: '2D circle profile.',
  help: 'A flat circle.' + PROFILE_NOTE,
  keywords: ['disc', 'round', '2d'],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 0.8, min: 0.001, softMax: 3 },
  ],
  emit: ({ ir, p, num }) => ({ d: ir.sub(ir.length(p), num('radius')), col: ir.c(0) }),
  bounds: ({ params }) => flat(params.radius as number, params.radius as number),
  credit: IQ2,
};

export const rect: NodeDef = {
  type: 'rect',
  label: 'Rectangle',
  category: 'profile',
  summary: '2D rectangle with rounded corners.',
  help: 'A flat rectangle; "Rounding" softens the corners.' + PROFILE_NOTE,
  keywords: ['square', 'rectangle', '2d'],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'size', label: 'Size', kind: 'vec2', unit: 'length', default: [1.6, 1], softMax: 5 },
    { key: 'rounding', label: 'Rounding', kind: 'float', unit: 'length', default: 0.1, min: 0, softMax: 1 },
  ],
  derive: (pr) => {
    const s = (pr.size as number[]).map((v) => Math.max(v, 0.001));
    const r = Math.min(pr.rounding as number, s[0] / 2, s[1] / 2);
    return { half: [s[0] / 2 - r, s[1] / 2 - r], r };
  },
  emit: ({ ir, p, derived }) => ({ d: ir.sub(sdBox(ir, p, derived('half')), derived('r')), col: ir.c(0) }),
  bounds: ({ params }) => {
    const s = params.size as number[];
    return flat(Math.abs(s[0]) / 2, Math.abs(s[1]) / 2);
  },
  credit: IQ2,
};

export const polygon: NodeDef = {
  type: 'polygon',
  label: 'Polygon',
  category: 'profile',
  summary: '2D regular polygon (triangle, hexagon, …).',
  help:
    'A flat regular polygon with any number of equal sides. "Radius" is the distance from the centre to each corner.' +
    PROFILE_NOTE,
  keywords: ['triangle', 'pentagon', 'hexagon', 'octagon', 'ngon', '2d'],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'sides', label: 'Sides', kind: 'int', default: 6, min: 3, max: 64, softMax: 12 },
    { key: 'radius', label: 'Radius', kind: 'float', unit: 'length', default: 0.9, min: 0.001, softMax: 3 },
  ],
  derive: (pr) => {
    const n = Math.max(3, Math.round(pr.sides as number));
    const r = pr.radius as number;
    const an = Math.PI / n;
    return { an, an2: 2 * an, he: r * Math.cos(an), hs: r * Math.sin(an) };
  },
  emit: ({ ir, p, derived }) => {
    const an = derived('an');
    const a = ir.sub(ir.mod(ir.add(ir.atan2(ir.y(p), ir.x(p)), an), derived('an2')), an);
    const len = ir.length(p);
    const q = ir.vec2(ir.mul(len, ir.cos(a)), ir.mul(len, ir.sin(a)));
    const he = derived('he'),
      hs = derived('hs');
    const e = ir.sub(q, ir.vec2(he, ir.clamp(ir.y(q), ir.neg(hs), hs)));
    return { d: ir.mul(ir.length(e), ir.sign(ir.sub(ir.x(q), he))), col: ir.c(0) };
  },
  bounds: ({ params }) => flat(params.radius as number, params.radius as number),
  credit: IQ2,
};

export const star: NodeDef = {
  type: 'star',
  label: 'Star',
  category: 'profile',
  summary: '2D star with any number of points.',
  help:
    'A flat star. "Inner radius" sets how deep the notches between the points go (as a fraction of the outer radius).' +
    PROFILE_NOTE,
  keywords: ['star', 'spiky', 'flower', '2d'],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'points', label: 'Points', kind: 'int', default: 5, min: 2, max: 64, softMax: 16 },
    {
      key: 'radius',
      label: 'Outer radius',
      kind: 'float',
      unit: 'length',
      default: 1,
      min: 0.001,
      softMax: 3,
    },
    { key: 'inner', label: 'Inner radius', kind: 'float', unit: 'percent', default: 0.5, min: 0.05, max: 1 },
  ],
  derive: (pr) => {
    const n = Math.max(2, Math.round(pr.points as number));
    const r = pr.radius as number;
    const an = Math.PI / n;
    const ri = r * (pr.inner as number);
    const bx = ri * Math.cos(an),
      by = ri * Math.sin(an);
    const ba = [bx - r, by];
    return { an, an2: 2 * an, r, ba, baInv: 1 / (ba[0] * ba[0] + ba[1] * ba[1]) };
  },
  emit: ({ ir, p, derived }) => {
    const an = derived('an');
    const a = ir.abs(ir.sub(ir.mod(ir.add(ir.atan2(ir.y(p), ir.x(p)), an), derived('an2')), an));
    const len = ir.length(p);
    const q = ir.vec2(ir.mul(len, ir.cos(a)), ir.mul(len, ir.sin(a)));
    const pa = ir.sub(q, ir.vec2(derived('r'), 0));
    const ba = derived('ba');
    const h = ir.clamp(ir.mul(ir.dot(pa, ba), derived('baInv')), 0, 1);
    const dist = ir.length(ir.sub(pa, ir.mul(ba, h)));
    const cross = ir.sub(ir.mul(ir.x(ba), ir.y(pa)), ir.mul(ir.y(ba), ir.x(pa)));
    return { d: ir.mul(dist, ir.neg(ir.sign(cross))), col: ir.c(0) };
  },
  bounds: ({ params }) => flat(params.radius as number, params.radius as number),
  credit: IQ2,
};

export const SHAPES_2D = [circle, rect, polygon, star];
