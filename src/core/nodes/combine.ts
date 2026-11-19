import type { NodeDef, ShapeVal } from './types';
import { chamferMax, chamferMin, expand, intersectBounds, sminBlend, smaxBlend, unionBounds } from './lib';

const SMIN =
  'Smooth minimum: Inigo Quilez, iquilezles.org/articles/smin (MIT); chamfer: Mercury hg_sdf (MIT)';

/** Rounded (smooth) or chamfered (flat 45° bevel) seam, when Smoothness is above 0. */
const edgeParam = {
  key: 'edge',
  label: 'Edge',
  kind: 'enum' as const,
  default: 'round',
  structural: true,
  options: [
    { value: 'round', label: 'Rounded' },
    { value: 'chamfer', label: 'Chamfered' },
  ],
  help: 'Rounded melts the shapes together like clay. Chamfered cuts a flat 45° bevel along the seam, like a machined part.',
  visibleIf: (p: Record<string, unknown>) => (p.smooth as number) > 0,
};
const chamfered = (value: (k: string) => unknown) => value('edge') === 'chamfer';
/** a 45° chamfer can make the field up to √2 steep where both inputs' gradients agree */
const chamferL = (params: Record<string, unknown>, l: number) =>
  params.edge === 'chamfer' && (params.smooth as number) > 0 ? l * Math.SQRT2 : l;

const smoothParam = {
  key: 'smooth',
  label: 'Smoothness',
  kind: 'float' as const,
  unit: 'length' as const,
  default: 0,
  min: 0,
  softMax: 1,
  help: 'How far the blend reaches. 0 gives a sharp edge; larger values melt the shapes together like clay.',
};

export const union: NodeDef = {
  type: 'union',
  label: 'Union',
  category: 'combine',
  summary: 'Join shapes together, optionally blending them smoothly.',
  help: 'Keeps everything that is inside any of the inputs. With Smoothness above 0 the shapes melt into each other (a "smooth blend"), and their colours blend too. Connect as many shapes as you like.',
  keywords: ['add', 'merge', 'combine', 'join', 'blend', 'smooth', 'or'],
  inputs: [{ key: 'shapes', label: 'Shapes', type: 'sdf', multi: true }],
  output: 'sdf',
  exactness: 'bound',
  params: [smoothParam, edgeParam],
  emit: ({ ir, inputs, num, value, empty }) => {
    const list = inputs('shapes');
    if (list.length === 0) return empty();
    const k = num('smooth');
    const sharp = (value('smooth') as number) <= 0;
    let acc: ShapeVal = list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (sharp || chamfered(value)) {
        const aLess = ir.lt(acc.d, b.d);
        const d = sharp ? ir.min(acc.d, b.d) : chamferMin(ir, acc.d, b.d, k);
        acc = { d, col: ir.select(aLess, acc.col, b.col) };
      } else {
        const [d, t] = sminBlend(ir, acc.d, b.d, k);
        acc = { d, col: ir.mix(acc.col, b.col, t) };
      }
    }
    return acc;
  },
  bounds: ({ inputs, params }) => expand(unionBounds(inputs('shapes')), params.smooth as number),
  lipschitz: ({ inputs, params }) => chamferL(params, Math.max(1, ...inputs('shapes'))),
  credit: SMIN,
};

export const subtract: NodeDef = {
  type: 'subtract',
  label: 'Subtract',
  category: 'combine',
  summary: 'Carve one shape out of another.',
  help: 'Removes the "Cutter" from the "Base", like drilling or carving. Smoothness rounds off the carved edge.',
  keywords: ['carve', 'cut', 'difference', 'minus', 'hole', 'drill', 'remove'],
  inputs: [
    { key: 'base', label: 'Base', type: 'sdf' },
    { key: 'cutter', label: 'Cutter', type: 'sdf' },
  ],
  output: 'sdf',
  exactness: 'bound',
  params: [
    smoothParam,
    edgeParam,
    {
      key: 'paintCut',
      label: 'Colour cut with cutter',
      kind: 'bool',
      default: false,
      structural: true,
      help: 'Paint the carved surface with the cutter’s colour instead of the base’s.',
    },
  ],
  emit: ({ ir, input, num, value, empty }) => {
    const a = input('base');
    const b = input('cutter');
    if (!a) return empty();
    if (!b) return a;
    const sharp = (value('smooth') as number) <= 0;
    const paint = value('paintCut') === true;
    if (sharp) {
      const nb = ir.neg(b.d);
      const cutWins = ir.lt(a.d, nb);
      return { d: ir.max(a.d, nb), col: paint ? ir.select(cutWins, b.col, a.col) : a.col };
    }
    if (chamfered(value)) {
      const nb = ir.neg(b.d);
      return {
        d: chamferMax(ir, a.d, nb, num('smooth')),
        col: paint ? ir.select(ir.lt(a.d, nb), b.col, a.col) : a.col,
      };
    }
    const [d, t] = smaxBlend(ir, a.d, ir.neg(b.d), num('smooth'));
    return { d, col: paint ? ir.mix(a.col, b.col, t) : a.col };
  },
  bounds: ({ input, params }) => expand(input('base'), params.smooth as number),
  lipschitz: ({ input, params }) => chamferL(params, Math.max(1, input('base'), input('cutter'))),
  credit: SMIN,
};

export const intersect: NodeDef = {
  type: 'intersect',
  label: 'Intersect',
  category: 'combine',
  summary: 'Keep only where shapes overlap.',
  help: 'Keeps the region that is inside both A and B. Useful for trimming a shape to a boundary, or for making lens and gem shapes from spheres.',
  keywords: ['overlap', 'and', 'common', 'trim', 'mask'],
  inputs: [
    { key: 'a', label: 'A', type: 'sdf' },
    { key: 'b', label: 'B', type: 'sdf' },
  ],
  output: 'sdf',
  exactness: 'bound',
  params: [smoothParam, edgeParam],
  emit: ({ ir, input, num, value, empty }) => {
    const a = input('a');
    const b = input('b');
    if (!a || !b) return empty();
    if (chamfered(value) && (value('smooth') as number) > 0) {
      const aWins = ir.lt(b.d, a.d);
      return { d: chamferMax(ir, a.d, b.d, num('smooth')), col: ir.select(aWins, a.col, b.col) };
    }
    if ((value('smooth') as number) <= 0) {
      const aWins = ir.lt(b.d, a.d);
      return { d: ir.max(a.d, b.d), col: ir.select(aWins, a.col, b.col) };
    }
    const [d, t] = smaxBlend(ir, a.d, b.d, num('smooth'));
    return { d, col: ir.mix(a.col, b.col, t) };
  },
  bounds: ({ input, params }) => expand(intersectBounds([input('a'), input('b')]), params.smooth as number),
  lipschitz: ({ input, params }) => chamferL(params, Math.max(1, input('a'), input('b'))),
  credit: SMIN,
};

export const morph: NodeDef = {
  type: 'morph',
  label: 'Morph',
  category: 'combine',
  summary: 'Blend gradually from one shape into another.',
  help: 'Mixes the two distance fields: at 0% you see A, at 100% you see B, and in between a shape that is part of each. Fun to combine with very different shapes.',
  keywords: ['lerp', 'interpolate', 'mix', 'tween', 'transition'],
  inputs: [
    { key: 'a', label: 'A', type: 'sdf' },
    { key: 'b', label: 'B', type: 'sdf' },
  ],
  output: 'sdf',
  exactness: 'bound',
  params: [{ key: 'amount', label: 'Amount', kind: 'float', unit: 'percent', default: 0.5, min: 0, max: 1 }],
  emit: ({ ir, input, num, empty }) => {
    const a = input('a');
    const b = input('b');
    if (!a && !b) return empty();
    if (!a) return b!;
    if (!b) return a;
    const t = num('amount');
    return { d: ir.mix(a.d, b.d, t), col: ir.mix(a.col, b.col, t) };
  },
  bounds: ({ input }) => unionBounds([input('a'), input('b')]),
  lipschitz: ({ input }) => Math.max(1, input('a'), input('b')),
};

export const COMBINE = [union, subtract, intersect, morph];
