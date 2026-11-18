import type { NodeDef } from './types';

const IQ = 'Inigo Quilez, iquilezles.org/articles/distfunctions (MIT)';

export const extrude: NodeDef = {
  type: 'extrude',
  label: 'Extrude',
  category: 'convert',
  summary: 'Give a 2D profile thickness, like a cookie cutter.',
  help: 'Takes a flat profile lying on the ground plane and pulls it straight up into a solid of the given height. "Rounding" softens the top and bottom edges. Coasters, tags, badges and keychains start here.',
  keywords: ['extrusion', 'thicken', 'prism', '2d to 3d', 'cookie', 'tag', 'coaster'],
  inputs: [{ key: 'profile', label: 'Profile', type: 'sdf2' }],
  output: 'sdf3',
  transform: 3,
  exactness: 'exact',
  params: [
    { key: 'height', label: 'Height', kind: 'float', unit: 'length', default: 0.4, min: 0.001, softMax: 3 },
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
    const h = pr.height as number;
    const r = Math.min(pr.rounding as number, h / 2);
    return { r, ha: h / 2 - r };
  },
  emit: ({ ir, p, input, derived, empty }) => {
    // profile Y points along world −Z so text and shapes read correctly when seen from above
    const s = input('profile', ir.vec2(ir.x(p), ir.neg(ir.z(p))));
    if (!s) return empty();
    const r = derived('r');
    const w = ir.vec2(ir.add(s.d, r), ir.sub(ir.abs(ir.y(p)), derived('ha')));
    const d = ir.sub(ir.add(ir.min(ir.maxComp(w), 0), ir.length(ir.max(w, 0))), r);
    return { d, col: s.col };
  },
  bounds: ({ input, params }) => {
    const b = input('profile');
    if (!b) return null;
    const h = (params.height as number) / 2;
    return { min: [b.min[0], -h, -b.max[1]], max: [b.max[0], h, -b.min[1]] };
  },
  credit: IQ,
};

export const revolve: NodeDef = {
  type: 'revolve',
  label: 'Revolve',
  category: 'convert',
  summary: 'Spin a 2D profile around the vertical axis, like a pottery wheel.',
  help: 'Sweeps a flat profile around the vertical axis. The profile’s X is the distance from the axis and its Y is the height. "Offset" moves the profile away from the axis first: a circle with an offset becomes a torus. Vases, bowls, rings and chess pieces start here.',
  keywords: ['lathe', 'spin', 'sweep', 'turn', 'pottery', 'vase', 'bowl', 'ring'],
  inputs: [{ key: 'profile', label: 'Profile', type: 'sdf2' }],
  output: 'sdf3',
  transform: 3,
  exactness: 'exact',
  params: [
    { key: 'offset', label: 'Offset', kind: 'float', unit: 'length', default: 0.8, softMin: -1, softMax: 3 },
  ],
  emit: ({ ir, p, input, num, empty }) => {
    const q = ir.vec2(ir.sub(ir.length(ir.sw(p, 'xz')), num('offset')), ir.y(p));
    return input('profile', q) ?? empty();
  },
  bounds: ({ input, params }) => {
    const b = input('profile');
    if (!b) return null;
    const o = params.offset as number;
    const r = Math.max(Math.abs(b.min[0] + o), Math.abs(b.max[0] + o));
    return { min: [-r, b.min[1], -r], max: [r, b.max[1], r] };
  },
  credit: IQ,
};

export const output: NodeDef = {
  type: 'output',
  label: 'Output',
  category: 'output',
  summary: 'The final shape that is drawn and exported.',
  help: 'Whatever is connected here is what you see in the viewport and what gets exported. There is always exactly one Output node.',
  keywords: ['result', 'final', 'scene'],
  inputs: [{ key: 'shape', label: 'Shape', type: 'sdf3' }],
  output: null,
  exactness: 'exact',
  params: [],
  emit: ({ input, empty }) => input('shape') ?? empty(),
  bounds: ({ input }) => input('shape'),
};

export const CONVERT = [extrude, revolve];
