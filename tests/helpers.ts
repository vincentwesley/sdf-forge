import { analyze, compile, makeEvaluator, packParams, type Evaluator } from '../src/core/compile';
import { type GEdge, type GNode, type SdfDoc, emptyDoc, makeNode } from '../src/core/graph/doc';
import type { ParamValue } from '../src/core/nodes/types';

/** Tiny builder for test graphs: chain-friendly. */
export class G {
  doc: SdfDoc = emptyDoc('test');
  private n = 0;
  node(type: string, params: Record<string, ParamValue> = {}): string {
    const id = `${type}${this.n++}`;
    this.doc.nodes.push(makeNode(type, 0, 0, params, id));
    return id;
  }
  link(source: string, target: string, input: string): this {
    const e: GEdge = { id: `e${this.doc.edges.length}`, source, target, input };
    this.doc.edges.push(e);
    return this;
  }
  out(source: string): this {
    return this.link(source, 'out', 'shape');
  }
  set(id: string, key: string, v: ParamValue) {
    (this.doc.nodes.find((n) => n.id === id) as GNode).params[key] = v;
    return this;
  }
}

export function evaluator(doc: SdfDoc, root?: string): Evaluator & { bounds: ReturnType<typeof analyze> } {
  const c = compile(doc, { root });
  if (c.issues.some((i) => i.level === 'error')) throw new Error(JSON.stringify(c.issues));
  const P = new Float32Array(c.paramCount);
  packParams(doc, c, P);
  const ev = makeEvaluator(c, P);
  return Object.assign(ev, { bounds: analyze(doc, c.rootId) });
}

/** Seeded PRNG for reproducible tests. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomPoints(n: number, extent: number, seed = 7): [number, number, number][] {
  const r = rng(seed);
  return Array.from({ length: n }, () => [
    (r() * 2 - 1) * extent,
    (r() * 2 - 1) * extent,
    (r() * 2 - 1) * extent,
  ]);
}

export function gradient(
  f: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  h = 1e-4,
) {
  return [
    (f(x + h, y, z) - f(x - h, y, z)) / (2 * h),
    (f(x, y + h, z) - f(x, y - h, z)) / (2 * h),
    (f(x, y, z + h) - f(x, y, z - h)) / (2 * h),
  ];
}
