import { defaultParams, getDef, paramsOf } from '../nodes/registry';
import type { Dim, ParamValue } from '../nodes/types';

export interface GNode {
  id: string;
  type: string;
  x: number;
  y: number;
  params: Record<string, ParamValue>;
  /** optional user-facing name */
  name?: string;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  /** input socket key on the target node */
  input: string;
}

export interface Pinned {
  node: string;
  param: string;
  /** label shown in the Controls panel (defaults to the param label) */
  label?: string;
}

export type MaterialStyle = 'clay' | 'glossy' | 'metal';

export interface DocSettings {
  /** millimetres per scene unit (used for display and STL export) */
  mmPerUnit: number;
  material: MaterialStyle;
}

export interface SdfDoc {
  version: 1;
  title: string;
  nodes: GNode[];
  edges: GEdge[];
  pinned: Pinned[];
  settings: DocSettings;
}

export const DEFAULT_SETTINGS: DocSettings = { mmPerUnit: 10, material: 'clay' };

let counter = 0;
/** Short unique id; deterministic prefix keeps ids readable in links. */
export function newId(prefix = 'n'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter.toString(36)}${Math.floor(
    Math.random() * 36 ** 2,
  )
    .toString(36)
    .padStart(2, '0')}`;
}

export function makeNode(
  type: string,
  x = 0,
  y = 0,
  params: Record<string, ParamValue> = {},
  id?: string,
): GNode {
  return { id: id ?? newId(), type, x, y, params: { ...defaultParams(type), ...clone(params) } };
}

export function emptyDoc(title = 'Untitled shape'): SdfDoc {
  return {
    version: 1,
    title,
    nodes: [makeNode('output', 400, 0, {}, 'out')],
    edges: [],
    pinned: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export function findOutput(doc: SdfDoc): GNode | undefined {
  return doc.nodes.find((n) => n.type === 'output');
}

export function nodeById(doc: SdfDoc, id: string): GNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

/** Edges feeding an input, in connection order. */
export function inputEdges(doc: SdfDoc, nodeId: string, input: string): GEdge[] {
  return doc.edges.filter((e) => e.target === nodeId && e.input === input);
}

/** Resolve the output dimension of every node (2, 3 or null for empty/unknown). */
export function resolveDims(doc: SdfDoc): Map<string, Dim | null> {
  const memo = new Map<string, Dim | null>();
  const visiting = new Set<string>();
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const dimOf = (id: string): Dim | null => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return null;
    visiting.add(id);
    const node = byId.get(id);
    const def = node && getDef(node.type);
    let out: Dim | null = null;
    if (def) {
      if (def.output === 'sdf3') out = 3;
      else if (def.output === 'sdf2') out = 2;
      else if (def.output === 'sdf') {
        for (const inp of def.inputs) {
          for (const e of inputEdges(doc, id, inp.key)) {
            const d = dimOf(e.source);
            if (d) {
              out = d;
              break;
            }
          }
          if (out) break;
        }
      }
    }
    visiting.delete(id);
    memo.set(id, out);
    return out;
  };
  for (const n of doc.nodes) dimOf(n.id);
  return memo;
}

/** Would connecting source → target create a cycle? */
export function wouldCycle(doc: SdfDoc, source: string, target: string): boolean {
  if (source === target) return true;
  // is target upstream of source?
  const stack = [source];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of doc.edges) if (e.target === id) stack.push(e.source);
  }
  return false;
}

export interface ConnectCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a prospective connection. */
export function canConnect(doc: SdfDoc, source: string, target: string, input: string): ConnectCheck {
  const s = nodeById(doc, source);
  const t = nodeById(doc, target);
  if (!s || !t) return { ok: false, reason: 'Unknown node' };
  const sd = getDef(s.type),
    td = getDef(t.type);
  if (!sd || !td) return { ok: false, reason: 'Unknown node type' };
  if (!sd.output) return { ok: false, reason: 'The Output node has no outgoing connection' };
  const inp = td.inputs.find((i) => i.key === input);
  if (!inp) return { ok: false, reason: 'Unknown input' };
  if (wouldCycle(doc, source, target)) return { ok: false, reason: 'That would create a loop' };
  const dims = resolveDims(doc);
  const sdim = dims.get(source) ?? (sd.output === 'sdf2' ? 2 : sd.output === 'sdf3' ? 3 : null);
  if (inp.type === 'sdf3' && sdim === 2)
    return {
      ok: false,
      reason: `${td.label} needs a 3D shape. Turn the profile into 3D with Extrude or Revolve first.`,
    };
  if (inp.type === 'sdf2' && sdim === 3)
    return { ok: false, reason: `${td.label} needs a flat 2D profile (Circle, Rectangle, Polygon, Star).` };
  if (inp.type === 'sdf' && sdim) {
    // polymorphic: must agree with other existing inputs
    const others = td.inputs
      .flatMap((i) => inputEdges(doc, target, i.key))
      .filter((e) => e.source !== source);
    for (const e of others) {
      const od = dims.get(e.source);
      if (od && od !== sdim)
        return { ok: false, reason: `Can’t mix 2D profiles and 3D shapes in one ${td.label}.` };
    }
    // and with what the target feeds downstream
    for (const e of doc.edges.filter((x) => x.source === target)) {
      const down = nodeById(doc, e.target);
      const dd = down && getDef(down.type)?.inputs.find((i) => i.key === e.input);
      if (dd?.type === 'sdf3' && sdim === 2)
        return { ok: false, reason: `${td.label} feeds a 3D-only input.` };
      if (dd?.type === 'sdf2' && sdim === 3)
        return { ok: false, reason: `${td.label} feeds a 2D-only input.` };
    }
  }
  return { ok: true };
}

/** Fill missing params with defaults and drop unknown nodes/edges. Used when loading docs. */
export function normalizeDoc(raw: unknown): SdfDoc {
  const d = (raw ?? {}) as Partial<SdfDoc>;
  const nodes: GNode[] = [];
  for (const n of Array.isArray(d.nodes) ? d.nodes : []) {
    if (!n || typeof n.id !== 'string' || !getDef(n.type)) continue;
    const params = defaultParams(n.type);
    for (const p of paramsOf(n.type)) {
      const v = n.params?.[p.key];
      if (v === undefined) continue;
      if (p.kind === 'vec3' || p.kind === 'color') {
        if (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x))) params[p.key] = [...v];
      } else if (p.kind === 'vec2') {
        if (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(x))) params[p.key] = [...v];
      } else if (p.kind === 'enum') {
        if (p.options.some((o) => o.value === v)) params[p.key] = v;
      } else if (p.kind === 'bool') {
        params[p.key] = !!v;
      } else if (p.kind === 'text') {
        if (typeof v === 'string')
          params[p.key] = [...v]
            .filter((ch) => ch >= ' ')
            .join('')
            .slice(0, p.maxLength);
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        params[p.key] = v;
      }
    }
    nodes.push({
      id: n.id,
      type: n.type,
      x: Number.isFinite(n.x) ? n.x : 0,
      y: Number.isFinite(n.y) ? n.y : 0,
      params,
      ...(typeof n.name === 'string' && n.name ? { name: n.name.slice(0, 60) } : {}),
    });
  }
  const outputs = nodes.filter((n) => n.type === 'output');
  if (outputs.length === 0) nodes.push(makeNode('output', 400, 0, {}, 'out'));
  else if (outputs.length > 1) for (const extra of outputs.slice(1)) nodes.splice(nodes.indexOf(extra), 1);
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = [];
  const seenInput = new Set<string>();
  for (const e of Array.isArray(d.edges) ? d.edges : []) {
    if (!e || !ids.has(e.source) || !ids.has(e.target)) continue;
    const t = nodes.find((n) => n.id === e.target)!;
    const inp = getDef(t.type)!.inputs.find((i) => i.key === e.input);
    if (!inp) continue;
    const key = `${e.target}:${e.input}`;
    if (!inp.multi && seenInput.has(key)) continue;
    seenInput.add(key);
    edges.push({
      id: typeof e.id === 'string' ? e.id : newId('e'),
      source: e.source,
      target: e.target,
      input: e.input,
    });
  }
  const pinned = (Array.isArray(d.pinned) ? d.pinned : []).filter(
    (p) =>
      p &&
      ids.has(p.node) &&
      paramsOf(nodes.find((n) => n.id === p.node)!.type).some((x) => x.key === p.param),
  );
  const s = (d.settings ?? {}) as Partial<DocSettings>;
  return {
    version: 1,
    title: typeof d.title === 'string' && d.title.trim() ? d.title.slice(0, 80) : 'Untitled shape',
    nodes,
    edges: removeCycles(nodes, edges),
    pinned: pinned.map((p) => ({
      node: p.node,
      param: p.param,
      ...(p.label ? { label: String(p.label).slice(0, 40) } : {}),
    })),
    settings: {
      mmPerUnit: Number.isFinite(s.mmPerUnit) && s.mmPerUnit! > 0 ? s.mmPerUnit! : DEFAULT_SETTINGS.mmPerUnit,
      material: s.material === 'glossy' || s.material === 'metal' ? s.material : 'clay',
    },
  };
}

function removeCycles(nodes: GNode[], edges: GEdge[]): GEdge[] {
  const kept: GEdge[] = [];
  const doc: SdfDoc = { version: 1, title: '', nodes, edges: kept, pinned: [], settings: DEFAULT_SETTINGS };
  for (const e of edges) if (!wouldCycle(doc, e.source, e.target)) kept.push(e);
  return kept;
}
