import { type Expr, type Ty, schedule } from './ir';

const GLSL_TYPE: Record<Ty, string> = { f: 'float', v2: 'vec2', v3: 'vec3', b: 'bool' };

/** Format a number as a GLSL float literal (always with a decimal point or exponent). */
export function glslFloat(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`non-finite literal ${v}`);
  if (Object.is(v, -0)) v = 0;
  let s = String(v);
  if (!/[.eE]/.test(s)) s += '.0';
  else if (/e/.test(s) && !/\./.test(s)) s = s.replace('e', '.0e');
  return v < 0 ? `(${s})` : s;
}

export interface GlslFnSpec {
  name: string;
  /** GLSL return type, e.g. 'float' or 'vec4' */
  ret: string;
  /** argument names by arg index, with GLSL types */
  args: { name: string; ty: Ty }[];
  /** roots to compute; `ret` expression is built from their names */
  roots: Expr[];
  /** build the return expression from the root names */
  result: (names: string[]) => string;
}

export interface GlslOptions {
  /** name of the uniform vec4 array holding params */
  paramArray?: string;
  /** if set, params are emitted as literals from this array instead of uniform reads */
  inlineParams?: ArrayLike<number>;
}

export function paramRef(i: number, arr = 'uP') {
  return `${arr}[${i >> 2}].${'xyzw'[i & 3]}`;
}

export function emitGlslFunction(spec: GlslFnSpec, opts: GlslOptions = {}): string {
  const order = schedule(spec.roots);
  const names = new Map<number, string>();
  const lines: string[] = [];
  const arr = opts.paramArray ?? 'uP';
  const ref = (e: Expr) => {
    const n = names.get(e.id);
    if (n === undefined) throw new Error(`unscheduled expr ${e.id}`);
    return n;
  };
  for (const e of order) {
    const a = e.args.map(ref);
    let expr: string;
    switch (e.op) {
      case 'const':
        names.set(e.id, glslFloat(e.n));
        continue;
      case 'param':
        if (opts.inlineParams) names.set(e.id, glslFloat(opts.inlineParams[e.n] ?? 0));
        else names.set(e.id, paramRef(e.n, arr));
        continue;
      case 'arg':
        names.set(e.id, spec.args[e.n].name);
        continue;
      case 'vec2':
        expr = `vec2(${a[0]}, ${a[1]})`;
        break;
      case 'vec3':
        expr = `vec3(${a[0]}, ${a[1]}, ${a[2]})`;
        break;
      case 'comp':
        names.set(e.id, `${a[0]}.${'xyz'[e.n]}`);
        continue;
      case 'add':
        expr = `${a[0]} + ${a[1]}`;
        break;
      case 'sub':
        expr = `${a[0]} - ${a[1]}`;
        break;
      case 'mul':
        expr = `${a[0]} * ${a[1]}`;
        break;
      case 'div':
        expr = `${a[0]} / ${a[1]}`;
        break;
      case 'neg':
        expr = `-${a[0]}`;
        break;
      case 'abs':
      case 'sign':
      case 'floor':
      case 'sqrt':
      case 'sin':
      case 'cos':
      case 'exp':
      case 'length':
        expr = `${e.op}(${a[0]})`;
        break;
      case 'min':
      case 'max':
      case 'dot':
        expr = `${e.op}(${a[0]}, ${a[1]})`;
        break;
      case 'atan2':
        expr = `atan(${a[0]}, ${a[1]})`;
        break;
      case 'lt':
        expr = `${a[0]} < ${a[1]}`;
        break;
      case 'and':
        expr = `${a[0]} && ${a[1]}`;
        break;
      case 'select':
        expr = `${a[0]} ? ${a[1]} : ${a[2]}`;
        break;
      case 'noise3':
        expr = `sfNoise(${a[0]})`;
        break;
      case 'tex2d':
        expr = `sfTex${e.n}(${a[0]})`;
        break;
      default:
        throw new Error(`glsl: unhandled op ${(e as Expr).op}`);
    }
    const name = `t${e.id}`;
    lines.push(`  ${GLSL_TYPE[e.ty]} ${name} = ${expr};`);
    names.set(e.id, name);
  }
  const argList = spec.args.map((x) => `${GLSL_TYPE[x.ty]} ${x.name}`).join(', ');
  const ret = spec.result(spec.roots.map(ref));
  return `${spec.ret} ${spec.name}(${argList}) {\n${lines.join('\n')}\n  return ${ret};\n}\n`;
}
