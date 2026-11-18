import type { Category, NodeDef, ParamDef, ParamValue } from './types';
import { SHAPES_3D } from './shapes3d';
import { SHAPES_2D } from './shapes2d';
import { COMBINE } from './combine';
import { MODIFY } from './modify';
import { CONVERT, output } from './convert';

/** Standard placement params appended to nodes with `transform`. */
export const TRANSFORM_3D: ParamDef[] = [
  {
    key: 'position',
    label: 'Position',
    kind: 'vec3',
    unit: 'length',
    default: [0, 0, 0],
    softMin: -3,
    softMax: 3,
    group: 'transform',
  },
  {
    key: 'rotation',
    label: 'Rotation',
    kind: 'vec3',
    unit: 'angle',
    default: [0, 0, 0],
    softMin: -180,
    softMax: 180,
    step: 1,
    group: 'transform',
  },
  {
    key: 'scale',
    label: 'Scale',
    kind: 'float',
    unit: 'none',
    default: 1,
    min: 0.01,
    softMin: 0.1,
    softMax: 4,
    group: 'transform',
  },
];
export const TRANSFORM_2D: ParamDef[] = [
  {
    key: 'offset',
    label: 'Offset',
    kind: 'vec2',
    unit: 'length',
    default: [0, 0],
    softMin: -3,
    softMax: 3,
    group: 'transform',
  },
  {
    key: 'angle',
    label: 'Angle',
    kind: 'float',
    unit: 'angle',
    default: 0,
    softMin: -180,
    softMax: 180,
    step: 1,
    group: 'transform',
  },
];
export const COLOR_PARAM: ParamDef = {
  key: 'color',
  label: 'Colour',
  kind: 'color',
  default: [0.8, 0.8, 0.8],
  group: 'look',
};

export const ALL_NODES: NodeDef[] = [...SHAPES_3D, ...SHAPES_2D, ...COMBINE, ...MODIFY, ...CONVERT, output];

const byType = new Map(ALL_NODES.map((d) => [d.type, d]));

export function getDef(type: string): NodeDef | undefined {
  return byType.get(type);
}

/** All params a node has, including the standard transform and colour params. */
export function allParams(def: NodeDef): ParamDef[] {
  const out = [...def.params];
  if (def.transform === 3) out.push(...TRANSFORM_3D);
  if (def.transform === 2) out.push(...TRANSFORM_2D);
  if (def.colored) out.push(COLOR_PARAM);
  return out;
}

const paramCache = new Map<string, ParamDef[]>();
export function paramsOf(type: string): ParamDef[] {
  let p = paramCache.get(type);
  if (!p) {
    const def = getDef(type);
    p = def ? allParams(def) : [];
    paramCache.set(type, p);
  }
  return p;
}

export function defaultParams(type: string): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of paramsOf(type)) out[p.key] = Array.isArray(p.default) ? [...p.default] : p.default;
  return out;
}

export const CATEGORY_INFO: Record<Category, { label: string; description: string }> = {
  shape: { label: 'Shapes', description: '3D building blocks' },
  profile: { label: 'Profiles', description: 'Flat 2D shapes for Extrude and Revolve' },
  combine: { label: 'Combine', description: 'Join, carve and blend shapes' },
  modify: { label: 'Modify', description: 'Bend, twist, repeat and reshape' },
  convert: { label: '2D → 3D', description: 'Turn profiles into solids' },
  output: { label: 'Output', description: 'The final shape' },
};

export const CATEGORY_ORDER: Category[] = ['shape', 'combine', 'modify', 'profile', 'convert'];
