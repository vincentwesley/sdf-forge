import type { Expr, IRBuilder } from '../ir/ir';

export type Dim = 2 | 3;
/** 'sdf' is polymorphic: accepts 2D or 3D, but all inputs must agree. */
export type SocketType = 'sdf3' | 'sdf2' | 'sdf';

export type Unit = 'length' | 'angle' | 'none' | 'percent';

export type ParamValue = number | number[] | string | boolean;

interface ParamBase {
  key: string;
  label: string;
  help?: string;
  /** Changing this param changes the generated code (recompile). */
  structural?: boolean;
  /** UI grouping: main params first, then transform, then appearance */
  group?: 'main' | 'transform' | 'look';
  /** Hide this param from the inspector unless the predicate passes */
  visibleIf?: (params: Record<string, ParamValue>) => boolean;
}
export interface FloatParam extends ParamBase {
  kind: 'float';
  unit?: Unit;
  default: number;
  min?: number;
  max?: number;
  /** slider range when it differs from the hard limits */
  softMin?: number;
  softMax?: number;
  step?: number;
}
export interface IntParam extends ParamBase {
  kind: 'int';
  default: number;
  min: number;
  max: number;
  softMax?: number;
}
export interface Vec3Param extends ParamBase {
  kind: 'vec3';
  unit?: Unit;
  default: [number, number, number];
  min?: number;
  max?: number;
  softMin?: number;
  softMax?: number;
  step?: number;
}
export interface Vec2Param extends ParamBase {
  kind: 'vec2';
  unit?: Unit;
  default: [number, number];
  softMin?: number;
  softMax?: number;
  step?: number;
}
export interface ColorParam extends ParamBase {
  kind: 'color';
  default: [number, number, number];
}
export interface EnumParam extends ParamBase {
  kind: 'enum';
  default: string;
  options: { value: string; label: string }[];
}
export interface BoolParam extends ParamBase {
  kind: 'bool';
  default: boolean;
}
export interface TextParam extends ParamBase {
  kind: 'text';
  default: string;
  maxLength: number;
}
export type ParamDef =
  FloatParam | IntParam | Vec3Param | Vec2Param | ColorParam | EnumParam | BoolParam | TextParam;

export interface InputDef {
  key: string;
  label: string;
  type: SocketType;
  /** accepts any number of connections (Union) */
  multi?: boolean;
}

export interface ShapeVal {
  /** signed distance (float) */
  d: Expr;
  /** linear RGB colour (vec3) */
  col: Expr;
}

export interface EmitCtx {
  ir: IRBuilder;
  /** sample point in the node's local space (vec3 for 3D nodes, vec2 for 2D nodes) */
  p: Expr;
  dim: Dim;
  /** read a numeric param as an expression (uniform) */
  num(key: string): Expr;
  /** read a vec param as an expression */
  vec(key: string): Expr;
  /** structural param value (compile-time) */
  value(key: string): ParamValue;
  /** compile an input at a (possibly warped) point; null if unconnected */
  input(key: string, p?: Expr): ShapeVal | null;
  inputs(key: string, p?: Expr): ShapeVal[];
  /** a derived uniform value (computed on the CPU from params) */
  derived(name: string): Expr;
  /** a value that means "no shape here" */
  empty(): ShapeVal;
  /** register a distance grid (text) and return its texture slot, or null if too many */
  texture(grid: import('../text').TextGrid): number | null;
  /** report a problem on this node */
  issue(message: string): void;
}

/** Extra information available when deriving uniforms on the CPU. */
export interface DeriveCtx {
  /** bounds of the shape connected to an input (null while compiling or if empty) */
  inputBounds(key: string): AABB | null;
}

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

export interface BoundsCtx {
  params: Record<string, ParamValue>;
  /** bounds of connected inputs (null = unconnected/empty) */
  input(key: string): AABB | null;
  inputs(key: string): AABB[];
  dim: Dim;
}

export interface LipschitzCtx {
  params: Record<string, ParamValue>;
  /** Lipschitz estimate of each connected input (1 = exact distance) */
  input(key: string): number;
  inputs(key: string): number[];
  inputBounds(key: string): AABB | null;
}

export type Category = 'shape' | 'profile' | 'combine' | 'modify' | 'convert' | 'output';

export interface NodeDef {
  type: string;
  label: string;
  category: Category;
  /** short one-liner shown in menus */
  summary: string;
  /** plain-language explanation for the "explain" panel */
  help: string;
  /** keywords for search */
  keywords?: string[];
  inputs: InputDef[];
  output: SocketType | null;
  params: ParamDef[];
  /** standard placement params: 3D (position/rotation/scale) or 2D (offset/angle) */
  transform?: Dim;
  /** has a colour param */
  colored?: boolean;
  /** Is the distance exact (true SDF) or a lower bound? Used by tests and docs. */
  exactness: 'exact' | 'bound' | 'approx';
  /** Derived uniforms computed from params on the CPU. */
  derive?: (params: Record<string, ParamValue>, ctx: DeriveCtx) => Record<string, number | number[]>;
  emit(ctx: EmitCtx): ShapeVal;
  /** conservative bounds in the node's local space (before its own transform) */
  bounds(ctx: BoundsCtx): AABB | null;
  /** Lipschitz constant of the node's output; default = max of inputs, 1 for leaves */
  lipschitz?(ctx: LipschitzCtx): number;
  /** credit for the formula */
  credit?: string;
}
