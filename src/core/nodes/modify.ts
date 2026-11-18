import type { AABB, NodeDef, ParamValue } from './types';
import type { Expr } from '../ir/ir';
import { expand, maxRadius, maxRadiusXZ, rot2 } from './lib';
import { NOISE_LIPSCHITZ } from '../ir/noise';

const IQ = 'Inigo Quilez, iquilezles.org/articles/distfunctions (MIT)';
const DEG = Math.PI / 180;

export const transform: NodeDef = {
  type: 'transform',
  label: 'Transform',
  category: 'modify',
  summary: 'Move, rotate or scale everything connected to it.',
  help: 'Places its input somewhere else: move it, turn it, or resize it evenly. Every shape already has its own position, so use Transform to move a whole group at once.',
  keywords: ['move', 'translate', 'rotate', 'scale', 'position', 'group'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  transform: 3,
  exactness: 'exact',
  params: [],
  emit: ({ input, empty }) => input('shape') ?? empty(),
  bounds: ({ input }) => input('shape'),
};

export const twist: NodeDef = {
  type: 'twist',
  label: 'Twist',
  category: 'modify',
  summary: 'Twist a shape around the vertical axis.',
  help: 'Rotates each horizontal slice of the input by an angle that grows with height, like wringing a towel. "Amount" is the rotation in degrees per unit of height. Strong twists bend space a lot, so the renderer takes smaller steps.',
  keywords: ['spiral', 'screw', 'helix', 'wring', 'torsion'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [
    {
      key: 'amount',
      label: 'Amount',
      kind: 'float',
      unit: 'angle',
      default: 45,
      softMin: -360,
      softMax: 360,
    },
  ],
  derive: (pr) => ({ k: (pr.amount as number) * DEG }),
  emit: ({ ir, p, input, derived, empty }) => {
    const a = ir.mul(derived('k'), ir.y(p));
    // rotate the xz plane by -a so the shape turns by +a as y grows
    const xz = rot2(ir, ir.sw(p, 'xz'), ir.cos(a), ir.neg(ir.sin(a)));
    return input('shape', ir.vec3(ir.x(xz), ir.y(p), ir.y(xz))) ?? empty();
  },
  bounds: ({ input }) => {
    const b = input('shape');
    if (!b) return null;
    const r = maxRadiusXZ(b);
    return { min: [-r, b.min[1], -r], max: [r, b.max[1], r] };
  },
  lipschitz: ({ input, inputBounds, params }) => {
    const b = inputBounds('shape');
    const r = b ? maxRadiusXZ(b) : 0;
    const k = Math.abs(params.amount as number) * DEG;
    return input('shape') * Math.sqrt(1 + (k * r) ** 2);
  },
  credit: IQ,
};

export const bend: NodeDef = {
  type: 'bend',
  label: 'Bend',
  category: 'modify',
  summary: 'Bend a shape into an arc.',
  help: 'Curves the input sideways: the further a point is along the X axis, the more it is rotated around the Z axis. Use it on long shapes (boxes, capsules) to make arches, horns or bananas.',
  keywords: ['curve', 'arc', 'arch', 'warp', 'banana'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [
    {
      key: 'amount',
      label: 'Amount',
      kind: 'float',
      unit: 'angle',
      default: 30,
      softMin: -180,
      softMax: 180,
    },
  ],
  derive: (pr) => ({ k: (pr.amount as number) * DEG }),
  emit: ({ ir, p, input, derived, empty }) => {
    const a = ir.mul(derived('k'), ir.x(p));
    const xy = rot2(ir, ir.sw(p, 'xy'), ir.cos(a), ir.sin(a));
    return input('shape', ir.vec3(ir.x(xy), ir.y(xy), ir.z(p))) ?? empty();
  },
  bounds: ({ input }) => {
    const b = input('shape');
    if (!b) return null;
    // rotation about the origin preserves distance from the Z axis
    const r = Math.sqrt(Math.max(b.min[0] ** 2, b.max[0] ** 2) + Math.max(b.min[1] ** 2, b.max[1] ** 2));
    return { min: [-r, -r, b.min[2]], max: [r, r, b.max[2]] };
  },
  lipschitz: ({ input, inputBounds, params }) => {
    const b = inputBounds('shape');
    const r = b ? maxRadius(b) : 0;
    const k = Math.abs(params.amount as number) * DEG;
    return input('shape') * Math.sqrt(1 + (k * r) ** 2);
  },
  credit: IQ,
};

const axisCount = (key: string, label: string) => ({
  key,
  label,
  kind: 'int' as const,
  default: key === 'countX' ? 3 : 1,
  min: 1,
  max: 50,
  softMax: 10,
});

export const repeat: NodeDef = {
  type: 'repeat',
  label: 'Repeat',
  category: 'modify',
  summary: 'Make a grid of copies.',
  help: 'Copies the input along each axis. It costs nothing extra to draw many copies, because space itself is folded so every copy is the same shape. Copies may overlap their neighbours, but each extra axis with more than one copy makes the shape slower to draw.',
  keywords: ['array', 'grid', 'copy', 'duplicate', 'pattern', 'tile'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [
    axisCount('countX', 'Copies X'),
    axisCount('countY', 'Copies Y'),
    axisCount('countZ', 'Copies Z'),
    {
      key: 'spacing',
      label: 'Spacing',
      kind: 'vec3',
      unit: 'length',
      default: [2, 2, 2],
      min: 0.01,
      softMax: 5,
    },
  ],
  derive: (pr) => {
    const n = [pr.countX, pr.countY, pr.countZ].map((v) => Math.max(1, Math.round(v as number)));
    const s = (pr.spacing as number[]).map((v) => Math.max(v, 0.01));
    return {
      s,
      invS: s.map((v) => 1 / v),
      halfN: n.map((v) => v / 2),
      nm1: n.map((v) => v - 1),
      off: n.map((v) => (v - 1) / 2),
    };
  },
  emit: ({ ir, p, inputs, derived, value, empty }) => {
    // Nearest cell: c = clamp(floor(p/s + N/2), 0, N-1); local q = p - s*(c - (N-1)/2).
    // To stay correct when copies overlap their cells, we also evaluate the
    // neighbouring cell on each axis that has more than one copy and take the min.
    const u = ir.add(ir.mul(p, derived('invS')), derived('halfN'));
    const nm1 = derived('nm1');
    const c = ir.clamp(ir.floor(u), ir.c(0), nm1);
    const o = ir.sub(ir.sub(u, c), 0.5);
    const active = [value('countX'), value('countY'), value('countZ')].map(
      (v) => Math.round(v as number) > 1,
    );
    const cells: Expr[] = [c];
    for (let axis = 0; axis < 3; axis++) {
      if (!active[axis]) continue;
      const n = cells.length;
      for (let i = 0; i < n; i++) {
        const cc = cells[i];
        const comps = [ir.x(cc), ir.y(cc), ir.z(cc)];
        const step = ir.select(ir.lt(ir.comp(o, axis), 0), -1, 1);
        comps[axis] = ir.clamp(ir.add(comps[axis], step), 0, ir.comp(nm1, axis));
        cells.push(ir.vec3(comps[0], comps[1], comps[2]));
      }
    }
    const results = cells.map((cc) => ir.sub(p, ir.mul(derived('s'), ir.sub(cc, derived('off')))));
    const shapes = results.map((q) => inputs('shape', q)[0]).filter(Boolean);
    if (!shapes.length) return empty();
    return shapes.reduce((a, b) => ({ d: ir.min(a.d, b.d), col: ir.select(ir.lt(a.d, b.d), a.col, b.col) }));
  },
  bounds: ({ input, params }) => {
    const b = input('shape');
    if (!b) return null;
    const n = [params.countX, params.countY, params.countZ].map((v) => Math.max(1, Math.round(v as number)));
    const s = params.spacing as number[];
    const e = n.map((v, i) => (s[i] * (v - 1)) / 2);
    return {
      min: b.min.map((v, i) => v - e[i]) as AABB['min'],
      max: b.max.map((v, i) => v + e[i]) as AABB['max'],
    };
  },
  credit: 'Limited repetition: Inigo Quilez, iquilezles.org/articles/sdfrepetition (MIT)',
};

export const radial: NodeDef = {
  type: 'radial',
  label: 'Radial repeat',
  category: 'modify',
  summary: 'Copies arranged in a circle.',
  help: 'Makes copies of the input around the vertical axis, like petals or spokes. Move the input away from the centre (along X) first, otherwise all copies overlap in the middle.',
  keywords: ['polar', 'circular array', 'petals', 'spokes', 'rotate copies', 'kaleidoscope'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [{ key: 'count', label: 'Copies', kind: 'int', default: 6, min: 1, max: 64, softMax: 24 }],
  derive: (pr) => {
    const n = Math.max(1, Math.round(pr.count as number));
    const sec = (2 * Math.PI) / n;
    return { sec, half: sec / 2 };
  },
  emit: ({ ir, p, inputs, derived, value, empty }) => {
    const half = derived('half');
    const a = ir.sub(ir.mod(ir.add(ir.atan2(ir.z(p), ir.x(p)), half), derived('sec')), half);
    // also evaluate the neighbouring sector so copies may overlap
    const a2 = ir.sub(a, ir.mul(ir.select(ir.lt(a, 0), -1, 1), derived('sec')));
    const r = ir.length(ir.sw(p, 'xz'));
    const at = (ang: Expr) =>
      inputs('shape', ir.vec3(ir.mul(r, ir.cos(ang)), ir.y(p), ir.mul(r, ir.sin(ang))))[0];
    const s1 = at(a);
    if (!s1) return empty();
    if ((value('count') as number) <= 1) return s1;
    const s2 = at(a2);
    return { d: ir.min(s1.d, s2.d), col: ir.select(ir.lt(s1.d, s2.d), s1.col, s2.col) };
  },
  bounds: ({ input }) => {
    const b = input('shape');
    if (!b) return null;
    const r = maxRadiusXZ(b);
    return { min: [-r, b.min[1], -r], max: [r, b.max[1], r] };
  },
  credit: 'Polar repetition: Mercury hg_sdf pModPolar (MIT)',
};

export const mirror: NodeDef = {
  type: 'mirror',
  label: 'Mirror',
  category: 'modify',
  summary: 'Make a shape symmetric.',
  help: 'Reflects the positive side of the input onto the negative side, so the result is symmetric across the chosen axes. Model one half, get both. Whatever was on the negative side is replaced by the reflection.',
  keywords: ['symmetry', 'symmetric', 'reflect', 'flip'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [
    { key: 'x', label: 'Mirror X', kind: 'bool', default: true, structural: true },
    { key: 'y', label: 'Mirror Y', kind: 'bool', default: false, structural: true },
    { key: 'z', label: 'Mirror Z', kind: 'bool', default: false, structural: true },
    {
      key: 'smooth',
      label: 'Smooth seam',
      kind: 'float',
      unit: 'length',
      default: 0,
      min: 0,
      softMax: 0.5,
      help: 'Rounds the crease where the two halves meet.',
    },
  ],
  emit: ({ ir, p, input, value, num, empty }) => {
    const smooth = (value('smooth') as number) > 0;
    const k = num('smooth');
    const fold = (v: ReturnType<typeof ir.x>) =>
      smooth ? ir.sqrt(ir.add(ir.mul(v, v), ir.mul(k, k))) : ir.abs(v);
    const q = ir.vec3(
      value('x') ? fold(ir.x(p)) : ir.x(p),
      value('y') ? fold(ir.y(p)) : ir.y(p),
      value('z') ? fold(ir.z(p)) : ir.z(p),
    );
    return input('shape', q) ?? empty();
  },
  bounds: ({ input, params }) => {
    const b = input('shape');
    if (!b) return null;
    const out: AABB = { min: [...b.min], max: [...b.max] };
    (['x', 'y', 'z'] as const).forEach((ax, i) => {
      if (params[ax]) {
        const m = Math.max(b.max[i], 0);
        out.min[i] = -m;
        out.max[i] = m;
      }
    });
    return out;
  },
};

export const elongate: NodeDef = {
  type: 'elongate',
  label: 'Elongate',
  category: 'modify',
  summary: 'Stretch a shape by inserting a straight middle section.',
  help: 'Cuts the input through its centre and pulls the halves apart, filling the gap with straight sides. Unlike scaling, rounded parts stay perfectly round — a sphere becomes a capsule or a rounded box.',
  keywords: ['stretch', 'extend', 'lengthen', 'widen'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'exact',
  params: [
    {
      key: 'amount',
      label: 'Amount',
      kind: 'vec3',
      unit: 'length',
      default: [0.5, 0, 0],
      min: 0,
      softMax: 3,
    },
  ],
  derive: (pr) => ({ h: (pr.amount as number[]).map((v) => Math.max(v, 0) / 2) }),
  emit: ({ ir, p, input, derived, empty }) => {
    const h = derived('h');
    const q = ir.sub(p, ir.clamp(p, ir.neg(h), h));
    return input('shape', q) ?? empty();
  },
  bounds: ({ input, params }) => {
    const b = input('shape');
    if (!b) return null;
    const h = (params.amount as number[]).map((v) => Math.max(v, 0) / 2);
    return {
      min: b.min.map((v, i) => v - h[i]) as AABB['min'],
      max: b.max.map((v, i) => v + h[i]) as AABB['max'],
    };
  },
  credit: IQ,
};

export const shell: NodeDef = {
  type: 'shell',
  label: 'Shell',
  category: 'modify',
  summary: 'Hollow a shape out, leaving a thin wall.',
  help: 'Turns a solid into a hollow skin of the given thickness ("onion" in SDF terms). Combine with Cut or Subtract to open it up — this is how you make a cup, vase or planter. For 3D printing keep walls at least 1–2 mm thick.',
  keywords: ['hollow', 'onion', 'wall', 'thickness', 'cup', 'vase'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf' }],
  output: 'sdf',
  exactness: 'bound',
  params: [
    {
      key: 'thickness',
      label: 'Wall thickness',
      kind: 'float',
      unit: 'length',
      default: 0.1,
      min: 0.001,
      softMax: 0.5,
    },
    {
      key: 'side',
      label: 'Wall position',
      kind: 'enum',
      default: 'inside',
      options: [
        { value: 'inside', label: 'Inside' },
        { value: 'center', label: 'Centred' },
        { value: 'outside', label: 'Outside' },
      ],
      help: 'Inside keeps the outer size unchanged.',
    },
    {
      key: 'open',
      label: 'Opening',
      kind: 'enum',
      default: 'none',
      structural: true,
      options: [
        { value: 'none', label: 'Closed' },
        { value: 'top', label: 'Open top' },
        { value: 'bottom', label: 'Open bottom' },
      ],
      help: 'Removes the lid (or floor) so you get a cup, vase or pot. Follows the shape when you resize it.',
    },
  ],
  derive: (pr, ctx) => {
    const t = pr.thickness as number;
    const side = pr.side as string;
    const b = ctx.inputBounds('shape');
    const outer = side === 'outside' ? t : side === 'center' ? t / 2 : 0;
    // cut a little deeper than the wall so no film is left behind
    const top = b ? b.max[1] + outer - t * 1.3 - outer * 2 : 0;
    const bottom = b ? b.min[1] - outer + t * 1.3 + outer * 2 : 0;
    return { half: t / 2, off: side === 'inside' ? t / 2 : side === 'outside' ? -t / 2 : 0, top, bottom };
  },
  emit: ({ ir, p, input, derived, value, empty }) => {
    const s = input('shape');
    if (!s) return empty();
    let d = ir.sub(ir.abs(ir.add(s.d, derived('off'))), derived('half'));
    if (value('open') === 'top' && p.ty === 'v3') d = ir.max(d, ir.sub(ir.y(p), derived('top')));
    if (value('open') === 'bottom' && p.ty === 'v3') d = ir.max(d, ir.sub(derived('bottom'), ir.y(p)));
    return { d, col: s.col };
  },
  bounds: ({ input, params }) => {
    const t = params.thickness as number;
    return expand(input('shape'), params.side === 'outside' ? t : params.side === 'center' ? t / 2 : 0);
  },
  credit: 'Onion: ' + IQ,
};

export const round: NodeDef = {
  type: 'round',
  label: 'Inflate',
  category: 'modify',
  summary: 'Grow or shrink a shape evenly; rounds sharp edges.',
  help: 'Pushes the surface outward by "Amount" in every direction (or inward if negative). Growing a shape rounds its sharp corners, which is a quick way to soften anything.',
  keywords: ['round', 'offset', 'dilate', 'erode', 'grow', 'shrink', 'thicken'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf' }],
  output: 'sdf',
  exactness: 'bound',
  params: [
    {
      key: 'amount',
      label: 'Amount',
      kind: 'float',
      unit: 'length',
      default: 0.1,
      softMin: -0.5,
      softMax: 0.5,
    },
  ],
  emit: ({ ir, input, num, empty }) => {
    const s = input('shape');
    if (!s) return empty();
    return { d: ir.sub(s.d, num('amount')), col: s.col };
  },
  bounds: ({ input, params }) => expand(input('shape'), Math.max(params.amount as number, 0)),
  credit: IQ,
};

function fbmLipschitz(params: Record<string, ParamValue>): number {
  const amp = Math.abs(params.amount as number);
  const scale = Math.max(params.scale as number, 1e-3);
  if (params.pattern === 'waves') return (amp * 2 * Math.PI * Math.sqrt(3)) / scale;
  const oct = Math.max(1, Math.round(params.octaves as number));
  let norm = 0;
  for (let i = 0; i < oct; i++) norm += 0.5 ** i;
  // The worst-case bound is very pessimistic for value noise; real gradients
  // stay well under half of it, so we use 0.6x to keep marching fast but safe.
  return (amp * NOISE_LIPSCHITZ * 0.6 * oct) / norm / scale;
}

export const displace: NodeDef = {
  type: 'displace',
  label: 'Displace',
  category: 'modify',
  summary: 'Add organic bumps (noise) or ripples to a surface.',
  help: 'Pushes the surface in and out by a pattern. "Noise" gives natural, rocky lumps; "Waves" gives regular ripples. "Feature size" sets how big the bumps are and "Amount" how tall. Large amounts make the field less accurate, so the renderer slows down to stay correct.',
  keywords: ['noise', 'bumps', 'rock', 'organic', 'ripple', 'texture', 'perlin', 'fbm'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'approx',
  params: [
    {
      key: 'pattern',
      label: 'Pattern',
      kind: 'enum',
      default: 'noise',
      structural: true,
      options: [
        { value: 'noise', label: 'Noise' },
        { value: 'waves', label: 'Waves' },
      ],
    },
    {
      key: 'amount',
      label: 'Amount',
      kind: 'float',
      unit: 'length',
      default: 0.1,
      softMin: -0.5,
      softMax: 0.5,
    },
    {
      key: 'scale',
      label: 'Feature size',
      kind: 'float',
      unit: 'length',
      default: 0.6,
      min: 0.02,
      softMax: 3,
    },
    {
      key: 'octaves',
      label: 'Detail',
      kind: 'int',
      default: 3,
      min: 1,
      max: 6,
      structural: true,
      visibleIf: (p) => p.pattern === 'noise',
      help: 'Layers of finer noise added on top.',
    },
    {
      key: 'seed',
      label: 'Seed',
      kind: 'float',
      default: 0,
      softMin: 0,
      softMax: 100,
      step: 1,
      visibleIf: (p) => p.pattern === 'noise',
    },
  ],
  derive: (pr) => {
    const s = Math.max(pr.scale as number, 0.02);
    const oct = Math.max(1, Math.round(pr.octaves as number));
    let norm = 0;
    for (let i = 0; i < oct; i++) norm += 0.5 ** i;
    return { inv: 1 / s, freq: (2 * Math.PI) / s, ampN: (pr.amount as number) / norm };
  },
  emit: ({ ir, p, input, num, value, derived, empty }) => {
    const s = input('shape');
    if (!s) return empty();
    let n;
    if (value('pattern') === 'waves') {
      const q = ir.mul(p, derived('freq'));
      n = ir.mul(ir.mul(ir.mul(ir.sin(ir.x(q)), ir.sin(ir.y(q))), ir.sin(ir.z(q))), num('amount'));
    } else {
      const oct = Math.max(1, Math.round(value('octaves') as number));
      const seed = num('seed');
      let sum = ir.c(0);
      let q = ir.add(
        ir.mul(p, derived('inv')),
        ir.vec3(ir.mul(seed, 1.7), ir.mul(seed, 3.1), ir.mul(seed, 5.3)),
      );
      for (let i = 0; i < oct; i++) {
        sum = ir.add(sum, ir.mul(ir.noise3(q), 0.5 ** i));
        // rotate-ish and double frequency between octaves to hide grid alignment
        q = ir.vec3(
          ir.add(ir.mul(ir.x(q), 1.6), ir.mul(ir.z(q), 1.2)),
          ir.add(ir.mul(ir.y(q), 2.0), 0.37),
          ir.sub(ir.mul(ir.z(q), 1.6), ir.mul(ir.x(q), 1.2)),
        );
      }
      n = ir.mul(sum, derived('ampN'));
    }
    return { d: ir.add(s.d, n), col: s.col };
  },
  bounds: ({ input, params }) => expand(input('shape'), Math.abs(params.amount as number)),
  lipschitz: ({ input, params }) => input('shape') + fbmLipschitz(params),
};

const LATTICE_NORM: Record<string, number> = { gyroid: 1.5, schwarz: 1.7, diamond: 1.6 };

export const lattice: NodeDef = {
  type: 'lattice',
  label: 'Lattice',
  category: 'modify',
  summary: 'Fill a shape with a light, porous lattice (gyroid and friends).',
  help: 'Replaces the inside of the input with a triply periodic minimal surface — the curvy, sponge-like lattice used for 3D-print infill and in nature. "Cell size" is the size of one repeat, "Strut thickness" the thickness of the lattice walls, and "Skin" keeps a solid outer wall if above 0.',
  keywords: ['gyroid', 'tpms', 'infill', 'sponge', 'porous', 'schwarz', 'diamond', 'mesh'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'approx',
  params: [
    {
      key: 'pattern',
      label: 'Pattern',
      kind: 'enum',
      default: 'gyroid',
      structural: true,
      options: [
        { value: 'gyroid', label: 'Gyroid' },
        { value: 'schwarz', label: 'Schwarz P' },
        { value: 'diamond', label: 'Diamond' },
      ],
    },
    { key: 'cell', label: 'Cell size', kind: 'float', unit: 'length', default: 0.8, min: 0.05, softMax: 3 },
    {
      key: 'thickness',
      label: 'Strut thickness',
      kind: 'float',
      unit: 'length',
      default: 0.12,
      min: 0.005,
      softMax: 0.6,
    },
    { key: 'skin', label: 'Skin', kind: 'float', unit: 'length', default: 0, min: 0, softMax: 0.5 },
  ],
  derive: (pr) => {
    const cell = Math.max(pr.cell as number, 0.05);
    const norm = LATTICE_NORM[pr.pattern as string] ?? 1.5;
    return { f: (2 * Math.PI) / cell, back: cell / (2 * Math.PI) / norm, half: (pr.thickness as number) / 2 };
  },
  emit: ({ ir, p, input, num, value, derived, empty }) => {
    const s = input('shape');
    if (!s) return empty();
    const q = ir.mul(p, derived('f'));
    const sx = ir.sin(ir.x(q)),
      sy = ir.sin(ir.y(q)),
      sz = ir.sin(ir.z(q));
    const cx = ir.cos(ir.x(q)),
      cy = ir.cos(ir.y(q)),
      cz = ir.cos(ir.z(q));
    let g;
    switch (value('pattern')) {
      case 'schwarz':
        g = ir.add(ir.add(cx, cy), cz);
        break;
      case 'diamond':
        g = ir.add(
          ir.add(ir.mul(ir.mul(sx, sy), sz), ir.mul(ir.mul(sx, cy), cz)),
          ir.add(ir.mul(ir.mul(cx, sy), cz), ir.mul(ir.mul(cx, cy), sz)),
        );
        break;
      default:
        g = ir.add(ir.add(ir.mul(sx, cy), ir.mul(sy, cz)), ir.mul(sz, cx));
    }
    const lat = ir.sub(ir.abs(ir.mul(g, derived('back'))), derived('half'));
    let d = ir.max(s.d, lat);
    if ((value('skin') as number) > 0) {
      const skin = ir.max(s.d, ir.neg(ir.add(s.d, num('skin'))));
      d = ir.min(d, skin);
    }
    return { d, col: s.col };
  },
  bounds: ({ input }) => input('shape'),
  lipschitz: ({ input }) => Math.max(input('shape'), 1.6),
  credit: 'TPMS lattice formulas (gyroid, Schwarz P, diamond) are standard implicit surfaces',
};

export const cut: NodeDef = {
  type: 'cut',
  label: 'Cut',
  category: 'modify',
  summary: 'Slice a shape flat with a plane.',
  help: 'Cuts the input with a flat plane and keeps one side. Use it to give a print a flat base, open the top of a hollow shell, or show a cross-section. Measure the position from the top or bottom of the shape and the cut follows when the shape changes size.',
  keywords: ['slice', 'plane', 'flat', 'section', 'trim', 'base', 'open top'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: 'sdf3',
  exactness: 'bound',
  params: [
    {
      key: 'axis',
      label: 'Axis',
      kind: 'enum',
      default: 'y',
      structural: true,
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z' },
      ],
    },
    {
      key: 'from',
      label: 'Measured from',
      kind: 'enum',
      default: 'origin',
      options: [
        { value: 'origin', label: 'Origin' },
        { value: 'max', label: 'Top' },
        { value: 'min', label: 'Bottom' },
      ],
      help: 'Top and Bottom measure inward from the shape\u2019s extent along the axis, so the cut moves with the shape.',
    },
    { key: 'offset', label: 'Position', kind: 'float', unit: 'length', default: 0, softMin: -3, softMax: 3 },
    {
      key: 'keep',
      label: 'Keep',
      kind: 'enum',
      default: 'below',
      options: [
        { value: 'below', label: 'Below / −' },
        { value: 'above', label: 'Above / +' },
      ],
    },
  ],
  derive: (pr, ctx) => ({ sgn: pr.keep === 'above' ? -1 : 1, at: cutPosition(pr, ctx.inputBounds('shape')) }),
  emit: ({ ir, p, input, value, derived, empty }) => {
    const s = input('shape');
    if (!s) return empty();
    const c = ir.comp(p, 'xyz'.indexOf(value('axis') as string));
    const plane = ir.mul(ir.sub(c, derived('at')), derived('sgn'));
    return { d: ir.max(s.d, plane), col: s.col };
  },
  bounds: ({ input, params }) => {
    const b = input('shape');
    if (!b) return null;
    const i = 'xyz'.indexOf(params.axis as string);
    const out: AABB = { min: [...b.min], max: [...b.max] };
    const o = cutPosition(params, b);
    if (params.keep === 'above') out.min[i] = Math.max(out.min[i], o);
    else out.max[i] = Math.min(out.max[i], o);
    if (out.min[i] > out.max[i]) return null;
    return out;
  },
};

/** Absolute plane position along the cut axis. */
function cutPosition(pr: Record<string, ParamValue>, b: AABB | null): number {
  const o = pr.offset as number;
  const i = 'xyz'.indexOf(pr.axis as string);
  if (!b || pr.from === 'origin' || !pr.from) return o;
  return pr.from === 'max' ? b.max[i] - o : b.min[i] + o;
}

export const MODIFY = [
  transform,
  twist,
  bend,
  repeat,
  radial,
  mirror,
  elongate,
  shell,
  round,
  displace,
  lattice,
  cut,
];
