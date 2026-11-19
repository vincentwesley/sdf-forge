import type { NodeDef } from './types';
import { sdBox } from './lib';
import { MAX_TEXT, fontReady, textGrid } from '../text';
import { VASE_POINTS, profilePolygon, selfIntersects } from '../profile';
import { SAMPLE_OUTLINE, svgGrid } from '../svg';

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

export const text: NodeDef = {
  type: 'text',
  label: 'Text',
  category: 'profile',
  summary: '2D text profile — names, labels, signs.',
  help:
    'Flat text in a bold typeface (Inter ExtraBold). "Letter height" is the height of capital letters. Extrude it for a name tag or sign, or Subtract an extruded text from a shape to engrave it.' +
    PROFILE_NOTE,
  keywords: ['text', 'letters', 'name', 'word', 'label', 'engrave', 'emboss', 'font', 'type'],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'approx',
  params: [
    { key: 'text', label: 'Text', kind: 'text', default: 'Hello', maxLength: MAX_TEXT, structural: true },
    {
      key: 'size',
      label: 'Letter height',
      kind: 'float',
      unit: 'length',
      default: 0.8,
      min: 0.01,
      softMax: 3,
    },
  ],
  emit: ({ ir, p, value, num, texture, empty, issue }) => {
    const grid = textGrid(String(value('text') ?? ''));
    if (!grid) {
      if (!fontReady()) issue('The font is still loading.');
      return empty();
    }
    const slot = texture(grid);
    if (slot === null) return empty();
    const size = num('size');
    const g = ir.div(ir.sub(ir.div(p, size), ir.vec2(grid.x0, grid.y0)), grid.cell);
    return { d: ir.mul(ir.tex2d(slot, g), size), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const g = textGrid(String(params.text ?? ''));
    if (!g) return null;
    const s = params.size as number;
    return { min: [g.bounds[0] * s, g.bounds[1] * s, 0], max: [g.bounds[2] * s, g.bounds[3] * s, 0] };
  },
  // bilinear interpolation of an exact distance grid can slightly exceed slope 1 near the medial axis
  lipschitz: () => 1.25,
  credit: 'Glyphs: Inter by Rasmus Andersson (SIL OFL 1.1), read with opentype.js (MIT)',
};

SHAPES_2D.push(text);

export const profile: NodeDef = {
  type: 'profile',
  label: 'Profile',
  category: 'profile',
  summary: 'Draw your own 2D outline from points — vases, bottles, brackets.',
  help:
    'A flat outline you draw yourself. Drag the points in the editor, click the + on an edge to add a point, and switch any point between a sharp corner and a smooth curve. Connected to Revolve, X is the distance from the axis and Y the height, so drawing half a silhouette gives a vase, bottle or chess piece. "Rounding" softens every corner and makes the outline a little fatter.' +
    PROFILE_NOTE,
  keywords: [
    'outline',
    'draw',
    'custom',
    'polygon',
    'spline',
    'curve',
    'lathe',
    'silhouette',
    'vase',
    'bottle',
    '2d',
  ],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'exact',
  params: [
    { key: 'points', label: 'Outline', kind: 'points', default: VASE_POINTS, structural: true },
    { key: 'rounding', label: 'Rounding', kind: 'float', unit: 'length', default: 0, min: 0, softMax: 0.3 },
  ],
  derive: (pr) => {
    const poly = profilePolygon(pr.points as number[]);
    const out: Record<string, number | number[]> = { r: pr.rounding as number };
    for (let i = 0; i < poly.length / 2; i++) out[`v${i}`] = [poly[2 * i], poly[2 * i + 1]];
    return out;
  },
  emit: ({ ir, p, value, derived, empty, issue }) => {
    const poly = profilePolygon(value('points') as number[]);
    const n = poly.length / 2;
    if (n < 3) return empty();
    if (selfIntersects(poly))
      issue('The outline crosses itself, so inside and outside are ambiguous. Move a point.');
    // Inigo Quilez's exact polygon distance with an even-odd winding sign
    const v = Array.from({ length: n }, (_, i) => derived(`v${i}`));
    const py = ir.y(p);
    let d2 = ir.dot2(ir.sub(p, v[0]));
    let s: ReturnType<typeof ir.c> = ir.c(1);
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const e = ir.sub(v[j], v[i]);
      const w = ir.sub(p, v[i]);
      const h = ir.clamp(ir.div(ir.dot(w, e), ir.max(ir.dot(e, e), 1e-12)), 0, 1);
      d2 = ir.min(d2, ir.dot2(ir.sub(w, ir.mul(e, h))));
      const c1 = ir.select(ir.lt(py, ir.y(v[i])), 0, 1); // p.y >= vi.y
      const c2 = ir.select(ir.lt(py, ir.y(v[j])), 1, 0); // p.y < vj.y
      const c3 = ir.select(ir.gt(ir.mul(ir.x(e), ir.y(w)), ir.mul(ir.y(e), ir.x(w))), 1, 0);
      const all = ir.add(ir.add(c1, c2), c3); // 3 = all true, 0 = all false: crossing
      s = ir.select(ir.gt(ir.abs(ir.sub(all, 1.5)), 1), ir.neg(s), s);
    }
    return { d: ir.sub(ir.mul(s, ir.sqrt(d2)), derived('r')), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const poly = profilePolygon(params.points as number[]);
    if (poly.length < 6) return null;
    const r = Math.max(0, params.rounding as number);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]);
      x1 = Math.max(x1, poly[i]);
      y0 = Math.min(y0, poly[i + 1]);
      y1 = Math.max(y1, poly[i + 1]);
    }
    return { min: [x0 - r, y0 - r, 0], max: [x1 + r, y1 + r, 0] };
  },
  credit: 'Polygon distance after Inigo Quilez, iquilezles.org/articles/distfunctions2d (MIT)',
};

SHAPES_2D.push(profile);

export const svg: NodeDef = {
  type: 'svg',
  label: 'SVG shape',
  category: 'profile',
  summary: 'Import a logo or drawing from an SVG file.',
  help:
    'Turns the filled shapes of an SVG file (a logo, icon or drawing from Inkscape, Illustrator, Figma…) into a flat profile. "Size" is the length of its longer side. Extrude it for a sign, badge or cookie cutter, or Subtract it to engrave or stamp. Only filled areas count; strokes are ignored, so convert strokes to paths before exporting the SVG.' +
    PROFILE_NOTE,
  keywords: [
    'svg',
    'import',
    'logo',
    'icon',
    'vector',
    'drawing',
    'illustrator',
    'inkscape',
    'figma',
    'stamp',
    'cookie cutter',
  ],
  inputs: [],
  output: 'sdf2',
  transform: 2,
  colored: true,
  exactness: 'approx',
  params: [
    {
      key: 'svg',
      label: 'Drawing',
      kind: 'text',
      default: SAMPLE_OUTLINE,
      maxLength: 60000,
      structural: true,
      ui: 'svg',
    },
    { key: 'size', label: 'Size', kind: 'float', unit: 'length', default: 1.6, min: 0.01, softMax: 5 },
  ],
  emit: ({ ir, p, value, num, texture, empty, issue }) => {
    const grid = svgGrid(String(value('svg') ?? ''));
    if (!grid) {
      issue('This SVG shape has no outline yet. Import an SVG file.');
      return empty();
    }
    const slot = texture(grid);
    if (slot === null) return empty();
    const size = num('size');
    const g = ir.div(ir.sub(ir.div(p, size), ir.vec2(grid.x0, grid.y0)), grid.cell);
    return { d: ir.mul(ir.tex2d(slot, g), size), col: ir.c(0) };
  },
  bounds: ({ params }) => {
    const g = svgGrid(String(params.svg ?? ''));
    if (!g) return null;
    const s = params.size as number;
    return { min: [g.bounds[0] * s, g.bounds[1] * s, 0], max: [g.bounds[2] * s, g.bounds[3] * s, 0] };
  },
  // bilinear interpolation of an exact distance grid can slightly exceed slope 1 near the medial axis
  lipschitz: () => 1.25,
};

SHAPES_2D.push(svg);
