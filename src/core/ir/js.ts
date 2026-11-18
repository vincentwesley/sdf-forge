import { type Expr, dimOf, schedule } from './ir';

/**
 * Scalarising JavaScript back end. Vectors become separate local variables so
 * the generated code allocates nothing and runs fast in a JIT.
 */

export interface JsFnSpec {
  /** names for the scalar components of each argument, e.g. [['x','y','z']] */
  args: string[][];
  roots: Expr[];
  /** build the body tail (must `return`) from root component names */
  result: (comps: string[][]) => string;
}

function jsNum(v: number): string {
  if (Object.is(v, -0)) return '0';
  const s = String(v);
  return v < 0 ? `(${s})` : s;
}

/** Returns the function body; free variables: P (Float32Array/number[]), noise3. */
export function emitJsBody(spec: JsFnSpec, opts: { inlineParams?: ArrayLike<number> } = {}): string {
  const order = schedule(spec.roots);
  const comps = new Map<number, string[]>();
  const lines: string[] = [];
  const get = (e: Expr) => {
    const c = comps.get(e.id);
    if (!c) throw new Error(`unscheduled expr ${e.id}`);
    return c;
  };
  for (const e of order) {
    const a = e.args.map(get);
    const dim = dimOf(e.ty);
    let out: string[];
    switch (e.op) {
      case 'const':
        comps.set(e.id, [jsNum(e.n)]);
        continue;
      case 'param':
        if (opts.inlineParams) {
          comps.set(e.id, [jsNum(opts.inlineParams[e.n] ?? 0)]);
          continue;
        }
        out = [`P[${e.n}]`];
        break;
      case 'arg':
        comps.set(e.id, spec.args[e.n]);
        continue;
      case 'vec2':
        comps.set(e.id, [a[0][0], a[1][0]]);
        continue;
      case 'vec3':
        comps.set(e.id, [a[0][0], a[1][0], a[2][0]]);
        continue;
      case 'comp':
        comps.set(e.id, [a[0][e.n]]);
        continue;
      case 'add':
        out = a[0].map((x, i) => `${x} + ${a[1][i]}`);
        break;
      case 'sub':
        out = a[0].map((x, i) => `${x} - ${a[1][i]}`);
        break;
      case 'mul':
        out = a[0].map((x, i) => `${x} * ${a[1][i]}`);
        break;
      case 'div':
        out = a[0].map((x, i) => `${x} / ${a[1][i]}`);
        break;
      case 'neg':
        out = a[0].map((x) => `-${x}`);
        break;
      case 'abs':
      case 'sign':
      case 'floor':
      case 'sqrt':
      case 'sin':
      case 'cos':
      case 'exp':
        out = a[0].map((x) => `Math.${e.op}(${x})`);
        break;
      case 'min':
      case 'max':
        out = a[0].map((x, i) => `Math.${e.op}(${x}, ${a[1][i]})`);
        break;
      case 'atan2':
        out = [`Math.atan2(${a[0][0]}, ${a[1][0]})`];
        break;
      case 'length':
        out = [`Math.sqrt(${a[0].map((x) => `${x} * ${x}`).join(' + ')})`];
        break;
      case 'dot':
        out = [a[0].map((x, i) => `${x} * ${a[1][i]}`).join(' + ')];
        break;
      case 'lt':
        out = [`${a[0][0]} < ${a[1][0]}`];
        break;
      case 'and':
        out = [`${a[0][0]} && ${a[1][0]}`];
        break;
      case 'select':
        out = a[1].map((x, i) => `${a[0][0]} ? ${x} : ${a[2][i]}`);
        break;
      case 'noise3':
        out = [`noise3(${a[0].join(', ')})`];
        break;
      default:
        throw new Error(`js: unhandled op ${(e as Expr).op}`);
    }
    if (out.length !== dim) throw new Error(`js: dim mismatch for ${e.op}`);
    const names = out.map((_, i) => (dim === 1 ? `t${e.id}` : `t${e.id}_${'xyz'[i]}`));
    lines.push(`const ${names.map((n, i) => `${n} = ${out[i]}`).join(', ')};`);
    out = names;
    comps.set(e.id, out);
  }
  return `${lines.join('\n')}\n${spec.result(spec.roots.map(get))}`;
}
