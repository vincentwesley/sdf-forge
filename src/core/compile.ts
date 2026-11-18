import { type Expr, IRBuilder } from './ir/ir';
import { emitGlslFunction } from './ir/glsl';
import { emitJsBody } from './ir/js';
import { GLSL_NOISE, noise3 } from './ir/noise';
import { type TextGrid, glslTextureHelper, sampleGrid } from './text';
import { type GNode, type SdfDoc, findOutput, inputEdges, resolveDims } from './graph/doc';
import { getDef, paramsOf } from './nodes/registry';
import type { AABB, DeriveCtx, Dim, EmitCtx, NodeDef, ParamValue, ShapeVal } from './nodes/types';
import { eulerMatrix, mat3mul, rot2, transformBounds, transpose3, unionBounds } from './nodes/lib';

/** Distance used for "nothing here". Large but safely representable in float32. */
export const FAR = 1e5;

export interface ParamSlot {
  node: string;
  key: string;
  derived: boolean;
  offset: number;
  size: number;
}

export interface CompileIssue {
  node: string;
  level: 'error' | 'warning';
  message: string;
}

export interface Compiled {
  /** helpers + `float map(vec3)` + `vec4 mapColor(vec3)` */
  glsl: string;
  jsMap: string;
  jsColor: string;
  jsPick: string;
  slots: ParamSlot[];
  /** number of floats in the param array (multiple of 4) */
  paramCount: number;
  /** compile index for each node that produced geometry (used for selection highlight) */
  nodeIndex: Record<string, number>;
  /** primitive node ids, in the order used by the pick function */
  leaves: string[];
  issues: CompileIssue[];
  usesNoise: boolean;
  /** true when nothing is connected to the root */
  empty: boolean;
  rootId: string | null;
  rootDim: Dim | null;
  /** distance grids sampled by the scene (text), bound to uT0..uTn */
  textures: TextGrid[];
}

export const MAX_TEXTURES = 4;

export interface CompileOptions {
  /** compile this node instead of the Output node ("view this node") */
  root?: string;
}

const SEL_SLOT = 0; // P[0] holds the selected node index

function isZeroVec(v: ParamValue | undefined) {
  return Array.isArray(v) && v.every((x) => x === 0);
}

/** Values derived from transform params (shared by compile and pack). */
function transformDerived(
  def: NodeDef,
  params: Record<string, ParamValue>,
): Record<string, number | number[]> {
  if (def.transform === 3) {
    const r = (params.rotation as number[]) ?? [0, 0, 0];
    const s = (params.scale as number) || 1;
    return { __rt: transpose3(eulerMatrix(r)), __invs: 1 / s };
  }
  if (def.transform === 2) {
    const a = (((params.angle as number) ?? 0) * Math.PI) / 180;
    return { __c: Math.cos(-a), __s: Math.sin(-a) };
  }
  return {};
}

const NO_BOUNDS: DeriveCtx = { inputBounds: () => null };

export function deriveAll(node: GNode, ctx: DeriveCtx = NO_BOUNDS): Record<string, number | number[]> {
  const def = getDef(node.type);
  if (!def) return {};
  return { ...(def.derive?.(node.params, ctx) ?? {}), ...transformDerived(def, node.params) };
}

export function compile(doc: SdfDoc, opts: CompileOptions = {}): Compiled {
  const ir = new IRBuilder();
  const issues: CompileIssue[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const dims = resolveDims(doc);
  const slots: ParamSlot[] = [];
  const slotMap = new Map<string, Expr[]>();
  let nextSlot = 4; // vec4 #0 reserved: x = selection
  const memo = new Map<string, ShapeVal>();
  const instances = new Map<string, Expr[]>();
  const stack = new Set<string>();
  const leaves: string[] = [];
  const issueSet = new Set<string>();
  const textures: TextGrid[] = [];
  const addIssue = (node: string, level: CompileIssue['level'], message: string) => {
    const k = `${node}|${message}`;
    if (issueSet.has(k)) return;
    issueSet.add(k);
    issues.push({ node, level, message });
  };

  const slot = (node: string, key: string, size: number, derived: boolean): Expr[] => {
    const k = `${node}|${key}|${derived ? 'd' : 'p'}`;
    let s = slotMap.get(k);
    if (!s) {
      // keep vectors inside one vec4 for readability (not required)
      if (size > 1 && size <= 4 && (nextSlot & 3) + size > 4) nextSlot = (nextSlot + 3) & ~3;
      const offset = nextSlot;
      nextSlot += size;
      slots.push({ node, key, derived, offset, size });
      s = Array.from({ length: size }, (_, i) => ir.param(offset + i, `${key}`));
      slotMap.set(k, s);
    }
    return s;
  };
  const asVec = (parts: Expr[]): Expr =>
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? ir.vec2(parts[0], parts[1])
        : ir.vec3(parts[0], parts[1], parts[2]);

  const emptyShape = (): ShapeVal => ({ d: ir.c(FAR), col: ir.vec3(0.5, 0.5, 0.5) });

  const compileNode = (id: string, p: Expr): ShapeVal | null => {
    const key = `${id}|${p.id}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const node = byId.get(id);
    const def = node && getDef(node.type);
    if (!node || !def) return null;
    if (stack.has(id)) {
      addIssue(id, 'error', 'This node is part of a loop.');
      return null;
    }
    stack.add(id);
    const myDim = dims.get(id) ?? null;

    const derivedCache = new Map<string, Expr>();
    const derivedValues = deriveAll(node);
    const derived = (name: string): Expr => {
      let e = derivedCache.get(name);
      if (!e) {
        const v = derivedValues[name];
        if (v === undefined) throw new Error(`${node.type}: unknown derived value ${name}`);
        e = asVec(slot(id, name, Array.isArray(v) ? v.length : 1, true));
        derivedCache.set(name, e);
      }
      return e;
    };
    const paramDef = (k: string) => paramsOf(node.type).find((x) => x.key === k);

    // --- placement (standard transform params) ---------------------------
    let local = p;
    let scaleOut: Expr | null = null;
    if (def.transform === 3) {
      if (!isZeroVec(node.params.position)) local = ir.sub(local, asVec(slot(id, 'position', 3, false)));
      if (!isZeroVec(node.params.rotation)) local = mat3mul(ir, slot(id, '__rt', 9, true), local);
      if ((node.params.scale ?? 1) !== 1) {
        local = ir.mul(local, derived('__invs'));
        scaleOut = slot(id, 'scale', 1, false)[0];
      }
    } else if (def.transform === 2) {
      if (!isZeroVec(node.params.offset)) local = ir.sub(local, asVec(slot(id, 'offset', 2, false)));
      if ((node.params.angle ?? 0) !== 0) local = rot2(ir, local, derived('__c'), derived('__s'));
    }

    const ctx: EmitCtx = {
      ir,
      p: local,
      dim: (myDim ?? 3) as Dim,
      num: (k) => {
        const pd = paramDef(k);
        if (!pd) throw new Error(`${node.type}: unknown param ${k}`);
        return slot(id, k, 1, false)[0];
      },
      vec: (k) => {
        const v = node.params[k];
        const n = Array.isArray(v) ? v.length : 1;
        return asVec(slot(id, k, n, false));
      },
      value: (k) => node.params[k],
      derived,
      empty: emptyShape,
      texture: (grid) => {
        let i = textures.indexOf(grid);
        if (i < 0) {
          if (textures.length >= MAX_TEXTURES) {
            addIssue(id, 'error', `At most ${MAX_TEXTURES} different texts can be used in one shape.`);
            return null;
          }
          textures.push(grid);
          i = textures.length - 1;
        }
        return i;
      },
      issue: (m) => addIssue(id, 'warning', m),
      input: (k, q) => {
        const edges = inputEdges(doc, id, k);
        for (const e of edges) {
          const r = checkedInput(e.source, k, q ?? local);
          if (r) return r;
        }
        return null;
      },
      inputs: (k, q) => {
        const out: ShapeVal[] = [];
        for (const e of inputEdges(doc, id, k)) {
          const r = checkedInput(e.source, k, q ?? local);
          if (r) out.push(r);
        }
        return out;
      },
    };

    function checkedInput(src: string, k: string, q: Expr): ShapeVal | null {
      const inp = def!.inputs.find((i) => i.key === k)!;
      const sdim = dims.get(src) ?? null;
      if (sdim === null) return null; // empty upstream
      const want = inp.type === 'sdf3' ? 3 : inp.type === 'sdf2' ? 2 : myDim;
      if (want !== sdim) {
        addIssue(id, 'error', `Input "${inp.label}" got a ${sdim}D shape but needs ${want}D.`);
        return null;
      }
      if ((q.ty === 'v3' ? 3 : 2) !== sdim) {
        addIssue(id, 'error', 'Dimension mismatch.');
        return null;
      }
      return compileNode(src, q);
    }

    let result: ShapeVal;
    try {
      result = def.emit(ctx);
    } catch (err) {
      addIssue(id, 'error', `Internal error: ${(err as Error).message}`);
      result = emptyShape();
    }
    if (def.colored) result = { d: result.d, col: ctx.vec('color') };
    if (scaleOut) result = { d: ir.mul(result.d, scaleOut), col: result.col };
    stack.delete(id);

    if (result.d.op !== 'const' || result.d.n !== FAR) {
      const list = instances.get(id) ?? [];
      if (!list.includes(result.d)) list.push(result.d);
      instances.set(id, list);
      if (def.inputs.length === 0 && !leaves.includes(id)) leaves.push(id);
    }
    memo.set(key, result);
    return result;
  };

  // --- root ---------------------------------------------------------------
  const out = findOutput(doc);
  let rootId: string | null = opts.root && byId.has(opts.root) ? opts.root : (out?.id ?? null);
  if (rootId && byId.get(rootId)?.type === 'output' && opts.root) rootId = out?.id ?? null;
  const rootDim = rootId ? (dims.get(rootId) ?? null) : null;
  const p3 = ir.arg('v3', 0, 'p');
  let root: ShapeVal = emptyShape();
  if (rootId) {
    if (rootDim === 2) {
      // preview a 2D profile as a thin plate on the ground plane
      const s = compileNode(rootId, ir.vec2(ir.x(p3), ir.neg(ir.z(p3))));
      if (s) {
        const w = ir.vec2(s.d, ir.sub(ir.abs(ir.y(p3)), 0.02));
        root = { d: ir.add(ir.min(ir.maxComp(w), 0), ir.length(ir.max(w, 0))), col: s.col };
      }
    } else {
      root = compileNode(rootId, p3) ?? emptyShape();
    }
  }
  const empty = root.d.op === 'const';

  // --- selection distance chain --------------------------------------------
  const nodeIndex: Record<string, number> = {};
  let idx = 1;
  let sel: Expr = ir.c(FAR);
  const selP = ir.param(SEL_SLOT, 'selected');
  for (const [id, list] of instances) {
    nodeIndex[id] = idx;
    let dmin = list[0];
    for (let i = 1; i < list.length; i++) dmin = ir.min(dmin, list[i]);
    sel = ir.select(ir.lt(ir.abs(ir.sub(selP, idx)), 0.5), dmin, sel);
    idx++;
  }

  const usesNoise = ir.nodes.some((n) => n.op === 'noise3');
  const mapFn = emitGlslFunction({
    name: 'map',
    ret: 'float',
    args: [{ name: 'p', ty: 'v3' }],
    roots: [root.d],
    result: ([d]) => d,
  });
  const colFn = emitGlslFunction({
    name: 'mapColor',
    ret: 'vec4',
    args: [{ name: 'p', ty: 'v3' }],
    roots: [root.col, sel],
    result: ([c, s]) => `vec4(${c}, ${s})`,
  });
  const texGlsl = textures.map((t, i) => glslTextureHelper(i, t)).join('\n');
  const glsl = `${usesNoise ? GLSL_NOISE : ''}\n${texGlsl}\n${mapFn}\n${colFn}`;

  const xyz = [['x', 'y', 'z']];
  const jsMap = emitJsBody({ args: xyz, roots: [root.d], result: ([d]) => `return ${d[0]};` });
  const jsColor = emitJsBody({
    args: xyz,
    roots: [root.col],
    result: ([c]) => `out[0] = ${c[0]}; out[1] = ${c[1]}; out[2] = ${c[2]};`,
  });
  const leafExprs = leaves.map((id) => {
    const list = instances.get(id)!;
    let m = ir.abs(list[0]);
    for (let i = 1; i < list.length; i++) m = ir.min(m, ir.abs(list[i]));
    return m;
  });
  const jsPick = emitJsBody({
    args: xyz,
    roots: leafExprs.length ? leafExprs : [ir.c(0)],
    result: (ds) =>
      leafExprs.length
        ? `let bi = 0, bd = ${ds[0][0]};\n` +
          ds
            .slice(1)
            .map((d, i) => `if (${d[0]} < bd) { bd = ${d[0]}; bi = ${i + 1}; }`)
            .join('\n') +
          '\nreturn bi;'
        : 'return -1;',
  });

  return {
    glsl,
    jsMap,
    jsColor,
    jsPick,
    slots,
    paramCount: (nextSlot + 3) & ~3,
    nodeIndex,
    leaves,
    issues,
    usesNoise,
    empty,
    rootId,
    rootDim,
    textures,
  };
}

/** Fill the param array from current node values. */
export function packParams(
  doc: SdfDoc,
  c: Compiled,
  P: Float32Array,
  selected: string | null = null,
  analysis?: Analysis,
) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  let an = analysis;
  const ctxFor = (nodeId: string): DeriveCtx => ({
    inputBounds: (key) => {
      an ??= analyze(doc, c.rootId);
      for (const e of inputEdges(doc, nodeId, key)) {
        const b = an.nodeBounds.get(e.source);
        if (b) return b;
      }
      return null;
    },
  });
  const derivedCache = new Map<string, Record<string, number | number[]>>();
  P[SEL_SLOT] = selected && c.nodeIndex[selected] ? c.nodeIndex[selected] : -1;
  for (const s of c.slots) {
    const node = byId.get(s.node);
    if (!node) continue;
    let v: ParamValue | number[] | undefined;
    if (s.derived) {
      let d = derivedCache.get(s.node);
      if (!d) {
        d = deriveAll(node, ctxFor(s.node));
        derivedCache.set(s.node, d);
      }
      v = d[s.key];
    } else v = node.params[s.key];
    if (Array.isArray(v)) for (let i = 0; i < s.size; i++) P[s.offset + i] = v[i] ?? 0;
    else P[s.offset] = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : 0;
  }
}

export interface Analysis {
  bounds: AABB | null;
  lipschitz: number;
  nodeBounds: Map<string, AABB | null>;
}

/** Conservative bounds and Lipschitz estimate of the root (CPU, cheap). */
export function analyze(doc: SdfDoc, rootId: string | null): Analysis {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const dims = resolveDims(doc);
  const bmemo = new Map<string, AABB | null>();
  const lmemo = new Map<string, number>();
  const visiting = new Set<string>();

  const inputsOf = (id: string, key: string) => {
    const node = byId.get(id)!;
    const def = getDef(node.type)!;
    const inp = def.inputs.find((i) => i.key === key);
    const myDim = dims.get(id);
    return inputEdges(doc, id, key).filter((e) => {
      const sd = dims.get(e.source);
      if (!sd || !inp) return false;
      const want = inp.type === 'sdf3' ? 3 : inp.type === 'sdf2' ? 2 : myDim;
      return want === sd;
    });
  };

  const bounds = (id: string): AABB | null => {
    if (bmemo.has(id)) return bmemo.get(id)!;
    if (visiting.has(id)) return null;
    visiting.add(id);
    const node = byId.get(id);
    const def = node && getDef(node.type);
    let b: AABB | null = null;
    if (node && def) {
      try {
        b = def.bounds({
          params: node.params,
          dim: (dims.get(id) ?? 3) as Dim,
          input: (k) => {
            for (const e of inputsOf(id, k)) {
              const r = bounds(e.source);
              if (r) return r;
            }
            return null;
          },
          inputs: (k) =>
            inputsOf(id, k)
              .map((e) => bounds(e.source))
              .filter((x): x is AABB => !!x),
        });
      } catch {
        b = null;
      }
      if (b && def.transform === 3) {
        const s = (node.params.scale as number) ?? 1;
        const m = eulerMatrix(node.params.rotation as number[]).map((v) => v * s);
        b = transformBounds(b, m, node.params.position as [number, number, number]);
      } else if (b && def.transform === 2) {
        const a = (((node.params.angle as number) ?? 0) * Math.PI) / 180;
        const c = Math.cos(a),
          s = Math.sin(a);
        const o = node.params.offset as number[];
        b = transformBounds(b, [c, -s, 0, s, c, 0, 0, 0, 1], [o[0], o[1], 0]);
      }
    }
    visiting.delete(id);
    bmemo.set(id, b);
    return b;
  };

  const lip = (id: string): number => {
    if (lmemo.has(id)) return lmemo.get(id)!;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    const node = byId.get(id);
    const def = node && getDef(node.type);
    let l = 1;
    if (node && def) {
      const ctx = {
        params: node.params,
        input: (k: string) => Math.max(1, ...inputsOf(id, k).map((e) => lip(e.source))),
        inputs: (k: string) => inputsOf(id, k).map((e) => lip(e.source)),
        inputBounds: (k: string) => unionBounds(inputsOf(id, k).map((e) => bounds(e.source))),
      };
      if (def.lipschitz) l = def.lipschitz(ctx);
      else l = Math.max(1, ...def.inputs.flatMap((i) => ctx.inputs(i.key)));
    }
    visiting.delete(id);
    lmemo.set(id, Number.isFinite(l) ? l : 1);
    return lmemo.get(id)!;
  };

  let b = rootId ? bounds(rootId) : null;
  if (b && rootId && dims.get(rootId) === 2)
    b = { min: [b.min[0], -0.02, b.min[1]], max: [b.max[0], 0.02, b.max[1]] };
  return { bounds: b, lipschitz: rootId ? lip(rootId) : 1, nodeBounds: bmemo };
}

export interface Evaluator {
  map(x: number, y: number, z: number): number;
  color(x: number, y: number, z: number, out: number[] | Float32Array): void;
  pick(x: number, y: number, z: number): number;
  P: Float32Array;
}

/** Build CPU evaluators from compiled code (works in workers too). */
export interface GridLike {
  data: Float32Array;
  w: number;
  h: number;
  cell: number;
}

export function makeEvaluator(
  c: Pick<Compiled, 'jsMap' | 'jsColor' | 'jsPick' | 'paramCount'> & { textures?: GridLike[] },
  P?: Float32Array,
): Evaluator {
  const params = P ?? new Float32Array(c.paramCount);
  const grids = c.textures ?? [];
  const tex = (slot: number, gx: number, gy: number) => sampleGrid(grids[slot], gx, gy);
  const mk = (body: string, args: string) =>
    new Function('P', 'noise3', 'tex', `"use strict"; return function(${args}) {\n${body}\n};`)(
      params,
      noise3,
      tex,
    );
  return {
    map: mk(c.jsMap, 'x, y, z'),
    color: mk(c.jsColor, 'x, y, z, out'),
    pick: mk(c.jsPick, 'x, y, z'),
    P: params,
  };
}
