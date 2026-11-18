/**
 * A tiny typed expression IR used to describe every SDF node once and generate
 * both GLSL (for the GPU ray marcher) and scalar JavaScript (for picking,
 * meshing and tests) from the same definition.
 *
 * Expressions are hash-consed: building the same expression twice returns the
 * same node, so shared sub-expressions are emitted once by the back ends.
 */

export type Ty = 'f' | 'v2' | 'v3' | 'b';

export type Op =
  | 'const'
  | 'param' // reads P[index]
  | 'arg' // function argument (the sample point)
  | 'vec2'
  | 'vec3'
  | 'comp' // component extraction, index in `n`
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'neg'
  | 'abs'
  | 'sign'
  | 'floor'
  | 'min'
  | 'max'
  | 'sqrt'
  | 'sin'
  | 'cos'
  | 'atan2'
  | 'exp'
  | 'length'
  | 'dot'
  | 'lt'
  | 'gt'
  | 'and'
  | 'select'
  | 'noise3';

export interface Expr {
  readonly id: number;
  readonly op: Op;
  readonly ty: Ty;
  readonly args: readonly Expr[];
  /** constant value, param index or component index */
  readonly n: number;
  /** debugging / readable name hint */
  readonly name?: string;
}

const DIM: Record<Ty, number> = { f: 1, v2: 2, v3: 3, b: 1 };
export const dimOf = (t: Ty) => DIM[t];

export class IRBuilder {
  readonly nodes: Expr[] = [];
  private readonly table = new Map<string, Expr>();

  private make(op: Op, ty: Ty, args: readonly Expr[], n = 0, name?: string): Expr {
    const key = `${op}|${ty}|${n}|${args.map((a) => a.id).join(',')}`;
    const hit = this.table.get(key);
    if (hit) return hit;
    const e: Expr = { id: this.nodes.length, op, ty, args, n, name };
    this.nodes.push(e);
    this.table.set(key, e);
    return e;
  }

  // ---- leaves -------------------------------------------------------------
  c(v: number): Expr {
    if (!Number.isFinite(v)) throw new Error(`non-finite constant ${v}`);
    // normalise -0
    return this.make('const', 'f', [], v === 0 ? 0 : v);
  }
  param(index: number, name?: string): Expr {
    return this.make('param', 'f', [], index, name);
  }
  arg(ty: Ty, index: number, name: string): Expr {
    return this.make('arg', ty, [], index, name);
  }

  // ---- constructors / swizzles -------------------------------------------
  vec2(x: Expr | number, y: Expr | number): Expr {
    const a = this.f(x),
      b = this.f(y);
    return this.make('vec2', 'v2', [a, b]);
  }
  vec3(x: Expr | number, y: Expr | number, z: Expr | number): Expr {
    return this.make('vec3', 'v3', [this.f(x), this.f(y), this.f(z)]);
  }
  /** Splat a float to a vector type. */
  splat(x: Expr | number, ty: Ty): Expr {
    const s = this.f(x);
    if (ty === 'f') return s;
    if (ty === 'v2') return this.vec2(s, s);
    if (ty === 'v3') return this.vec3(s, s, s);
    throw new Error('cannot splat to bool');
  }
  comp(v: Expr, i: number): Expr {
    if (v.ty === 'f') {
      if (i !== 0) throw new Error('component of float');
      return v;
    }
    if (i >= DIM[v.ty]) throw new Error('component out of range');
    // fold constructors: vec3(a,b,c).y -> b
    if (v.op === 'vec2' || v.op === 'vec3') return v.args[i];
    return this.make('comp', 'f', [v], i);
  }
  x(v: Expr) {
    return this.comp(v, 0);
  }
  y(v: Expr) {
    return this.comp(v, 1);
  }
  z(v: Expr) {
    return this.comp(v, 2);
  }
  /** Swizzle like 'xz' or 'zyx'. */
  sw(v: Expr, s: string): Expr {
    const idx = [...s].map((ch) => 'xyz'.indexOf(ch));
    if (idx.length === 1) return this.comp(v, idx[0]);
    const parts = idx.map((i) => this.comp(v, i));
    return parts.length === 2 ? this.vec2(parts[0], parts[1]) : this.vec3(parts[0], parts[1], parts[2]);
  }

  // ---- helpers ------------------------------------------------------------
  f(x: Expr | number): Expr {
    return typeof x === 'number' ? this.c(x) : x;
  }
  /** Resolve the result type of a component-wise binary op with float broadcasting. */
  private bin(op: Op, a0: Expr | number, b0: Expr | number): Expr {
    let a = this.f(a0),
      b = this.f(b0);
    if (a.ty === 'b' || b.ty === 'b') throw new Error(`${op} on bool`);
    if (a.ty !== b.ty) {
      if (a.ty === 'f') a = this.splat(a, b.ty);
      else if (b.ty === 'f') b = this.splat(b, a.ty);
      else throw new Error(`type mismatch ${a.ty} ${op} ${b.ty}`);
    }
    // constant folding for scalars
    if (a.op === 'const' && b.op === 'const') {
      const x = a.n,
        y = b.n;
      switch (op) {
        case 'add':
          return this.c(x + y);
        case 'sub':
          return this.c(x - y);
        case 'mul':
          return this.c(x * y);
        case 'div':
          if (y !== 0) return this.c(x / y);
          break;
        case 'min':
          return this.c(Math.min(x, y));
        case 'max':
          return this.c(Math.max(x, y));
      }
    }
    // algebraic identities (scalar constants only, safe for all types)
    if (op === 'add') {
      if (isConst(a, 0)) return b;
      if (isConst(b, 0)) return a;
    }
    if (op === 'sub' && isConst(b, 0)) return a;
    if (op === 'mul') {
      if (isConst(a, 1)) return b;
      if (isConst(b, 1)) return a;
    }
    if (op === 'div' && isConst(b, 1)) return a;
    // canonical operand order for commutative ops improves sharing
    if ((op === 'add' || op === 'mul' || op === 'min' || op === 'max') && a.id > b.id) [a, b] = [b, a];
    return this.make(op, a.ty, [a, b]);
  }
  private un(op: Op, a0: Expr | number): Expr {
    const a = this.f(a0);
    if (a.op === 'const') {
      const x = a.n;
      switch (op) {
        case 'neg':
          return this.c(-x);
        case 'abs':
          return this.c(Math.abs(x));
        case 'sqrt':
          if (x >= 0) return this.c(Math.sqrt(x));
          break;
        case 'sin':
          return this.c(Math.sin(x));
        case 'cos':
          return this.c(Math.cos(x));
        case 'floor':
          return this.c(Math.floor(x));
        case 'sign':
          return this.c(Math.sign(x));
        case 'exp':
          return this.c(Math.exp(x));
      }
    }
    if (op === 'neg' && a.op === 'neg') return a.args[0];
    if (op === 'abs' && a.op === 'abs') return a;
    return this.make(op, a.ty, [a]);
  }

  add(a: Expr | number, b: Expr | number) {
    return this.bin('add', a, b);
  }
  sub(a: Expr | number, b: Expr | number) {
    return this.bin('sub', a, b);
  }
  mul(a: Expr | number, b: Expr | number) {
    return this.bin('mul', a, b);
  }
  div(a: Expr | number, b: Expr | number) {
    return this.bin('div', a, b);
  }
  min(a: Expr | number, b: Expr | number) {
    return this.bin('min', a, b);
  }
  max(a: Expr | number, b: Expr | number) {
    return this.bin('max', a, b);
  }
  neg(a: Expr | number) {
    return this.un('neg', a);
  }
  abs(a: Expr | number) {
    return this.un('abs', a);
  }
  sign(a: Expr | number) {
    return this.un('sign', a);
  }
  floor(a: Expr | number) {
    return this.un('floor', a);
  }
  sqrt(a: Expr | number) {
    return this.un('sqrt', a);
  }
  sin(a: Expr | number) {
    return this.un('sin', a);
  }
  cos(a: Expr | number) {
    return this.un('cos', a);
  }
  exp(a: Expr | number) {
    return this.un('exp', a);
  }
  atan2(y: Expr | number, x: Expr | number): Expr {
    const a = this.f(y),
      b = this.f(x);
    if (a.ty !== 'f' || b.ty !== 'f') throw new Error('atan2 needs floats');
    return this.make('atan2', 'f', [a, b]);
  }
  length(v: Expr): Expr {
    if (v.ty === 'f') return this.abs(v);
    return this.make('length', 'f', [v]);
  }
  dot(a: Expr, b: Expr): Expr {
    if (a.ty !== b.ty || a.ty === 'b') throw new Error('dot type mismatch');
    if (a.ty === 'f') return this.mul(a, b);
    if (a.id > b.id) [a, b] = [b, a];
    return this.make('dot', 'f', [a, b]);
  }
  /** Round half up, identical on GPU and CPU (GLSL round() is implementation-defined at .5). */
  round(a: Expr | number) {
    return this.floor(this.add(a, 0.5));
  }
  fract(a: Expr | number) {
    const e = this.f(a);
    return this.sub(e, this.floor(e));
  }
  /** GLSL-style mod: x - y*floor(x/y) */
  mod(a: Expr | number, b: Expr | number) {
    return this.sub(a, this.mul(b, this.floor(this.div(a, b))));
  }
  clamp(a: Expr | number, lo: Expr | number, hi: Expr | number) {
    return this.min(this.max(a, lo), hi);
  }
  mix(a: Expr | number, b: Expr | number, t: Expr | number) {
    return this.add(a, this.mul(this.sub(b, a), t));
  }
  dot2(v: Expr) {
    return this.dot(v, v);
  }
  maxComp(v: Expr): Expr {
    if (v.ty === 'f') return v;
    if (v.ty === 'v2') return this.max(this.x(v), this.y(v));
    return this.max(this.x(v), this.max(this.y(v), this.z(v)));
  }
  minComp(v: Expr): Expr {
    if (v.ty === 'f') return v;
    if (v.ty === 'v2') return this.min(this.x(v), this.y(v));
    return this.min(this.x(v), this.min(this.y(v), this.z(v)));
  }

  // ---- comparisons and selection -----------------------------------------
  lt(a: Expr | number, b: Expr | number): Expr {
    const x = this.f(a),
      y = this.f(b);
    if (x.ty !== 'f' || y.ty !== 'f') throw new Error('lt needs floats');
    return this.make('lt', 'b', [x, y]);
  }
  gt(a: Expr | number, b: Expr | number): Expr {
    return this.lt(b, a);
  }
  and(a: Expr, b: Expr): Expr {
    if (a.ty !== 'b' || b.ty !== 'b') throw new Error('and needs bools');
    return this.make('and', 'b', [a, b]);
  }
  select(cond: Expr, a: Expr | number, b: Expr | number): Expr {
    if (cond.ty !== 'b') throw new Error('select needs bool condition');
    let x = this.f(a),
      y = this.f(b);
    if (x.ty !== y.ty) {
      if (x.ty === 'f') x = this.splat(x, y.ty);
      else if (y.ty === 'f') y = this.splat(y, x.ty);
      else throw new Error('select type mismatch');
    }
    if (x === y) return x;
    return this.make('select', x.ty, [cond, x, y]);
  }

  // ---- builtins -------------------------------------------------------------
  /** Value noise in [-1, 1] with an integer hash, identical on GPU and CPU. */
  noise3(p: Expr): Expr {
    if (p.ty !== 'v3') throw new Error('noise3 needs vec3');
    return this.make('noise3', 'f', [p]);
  }
}

export function isConst(e: Expr, v: number) {
  return e.op === 'const' && e.n === v;
}

/** Collect nodes reachable from roots in dependency (topological) order. */
export function schedule(roots: readonly Expr[]): Expr[] {
  const seen = new Set<number>();
  const out: Expr[] = [];
  const visit = (e: Expr) => {
    // iterative DFS to avoid deep recursion on large graphs
    const stack: [Expr, number][] = [[e, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [node, i] = top;
      if (seen.has(node.id)) {
        stack.pop();
        continue;
      }
      if (i < node.args.length) {
        top[1]++;
        const child = node.args[i];
        if (!seen.has(child.id)) stack.push([child, 0]);
      } else {
        seen.add(node.id);
        out.push(node);
        stack.pop();
      }
    }
  };
  roots.forEach(visit);
  return out;
}
