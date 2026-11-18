/**
 * Pure document operations used by the editor. Each takes a document and
 * returns a new one (documents are treated as immutable).
 */
import {
  type GEdge,
  type GNode,
  type SdfDoc,
  canConnect,
  findOutput,
  inputEdges,
  makeNode,
  newId,
  nodeById,
} from '../core/graph/doc';
import { getDef, paramsOf } from '../core/nodes/registry';
import type { AABB, ParamValue } from '../core/nodes/types';

export const PALETTE: [number, number, number][] = [
  [0.95, 0.52, 0.3], // coral
  [0.33, 0.6, 0.95], // blue
  [0.98, 0.8, 0.3], // yellow
  [0.45, 0.8, 0.55], // green
  [0.75, 0.5, 0.92], // violet
  [0.92, 0.42, 0.6], // pink
  [0.35, 0.8, 0.85], // teal
  [0.85, 0.85, 0.82], // stone
];

export function setParam(doc: SdfDoc, nodeId: string, key: string, value: ParamValue): SdfDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n)),
  };
}

export function renameNode(doc: SdfDoc, nodeId: string, name: string): SdfDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const copy = { ...n };
      if (name.trim()) copy.name = name.trim().slice(0, 60);
      else delete copy.name;
      return copy;
    }),
  };
}

export function moveNodes(doc: SdfDoc, moves: Record<string, { x: number; y: number }>): SdfDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (moves[n.id] ? { ...n, x: moves[n.id].x, y: moves[n.id].y } : n)),
  };
}

export function addNode(doc: SdfDoc, node: GNode): SdfDoc {
  return { ...doc, nodes: [...doc.nodes, node] };
}

/** Connect source → target.input, replacing an existing edge on single inputs. */
export function connect(doc: SdfDoc, source: string, target: string, input: string): SdfDoc {
  const check = canConnect(doc, source, target, input);
  if (!check.ok) throw new Error(check.reason);
  const tdef = getDef(nodeById(doc, target)!.type)!;
  const inp = tdef.inputs.find((i) => i.key === input)!;
  let edges = doc.edges;
  if (!inp.multi) edges = edges.filter((e) => !(e.target === target && e.input === input));
  else if (edges.some((e) => e.target === target && e.input === input && e.source === source)) return doc;
  const e: GEdge = { id: newId('e'), source, target, input };
  return { ...doc, edges: [...edges, e] };
}

export function disconnect(doc: SdfDoc, edgeIds: string[]): SdfDoc {
  const set = new Set(edgeIds);
  return { ...doc, edges: doc.edges.filter((e) => !set.has(e.id)) };
}

/** Delete nodes (never the Output). Reconnects simple pass-through chains so the shape doesn't vanish. */
export function removeNodes(doc: SdfDoc, ids: string[]): SdfDoc {
  const del = new Set(ids.filter((id) => nodeById(doc, id)?.type !== 'output'));
  if (!del.size) return doc;
  let edges = doc.edges.filter((e) => !del.has(e.source) && !del.has(e.target));
  // bridge: if a deleted node had exactly one 3D/2D input and fed something, reconnect that input downstream
  for (const id of del) {
    const n = nodeById(doc, id)!;
    const def = getDef(n.type);
    if (!def || def.inputs.length !== 1 || def.inputs[0].multi) continue;
    const ins = doc.edges.filter((e) => e.target === id && !del.has(e.source));
    const outs = doc.edges.filter((e) => e.source === id && !del.has(e.target));
    if (ins.length !== 1) continue;
    for (const o of outs) {
      const trial: SdfDoc = { ...doc, nodes: doc.nodes.filter((x) => !del.has(x.id)), edges };
      if (canConnect(trial, ins[0].source, o.target, o.input).ok)
        edges = [...edges, { id: newId('e'), source: ins[0].source, target: o.target, input: o.input }];
    }
  }
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !del.has(n.id)),
    edges,
    pinned: doc.pinned.filter((p) => !del.has(p.node)),
  };
}

/** Duplicate nodes (and the edges between them). Returns the new doc and the id map. */
export function duplicateNodes(
  doc: SdfDoc,
  ids: string[],
  offset = { x: 40, y: 60 },
): { doc: SdfDoc; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const nodes: GNode[] = [];
  for (const id of ids) {
    const n = nodeById(doc, id);
    if (!n || n.type === 'output') continue;
    const copy: GNode = { ...structuredClone(n), id: newId(), x: n.x + offset.x, y: n.y + offset.y };
    map[id] = copy.id;
    nodes.push(copy);
  }
  const edges: GEdge[] = [];
  for (const e of doc.edges) {
    if (map[e.source] && map[e.target])
      edges.push({ ...e, id: newId('e'), source: map[e.source], target: map[e.target] });
    // keep inputs coming from outside the selection
    else if (!map[e.source] && map[e.target]) edges.push({ ...e, id: newId('e'), target: map[e.target] });
  }
  return { doc: { ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...edges] }, map };
}

export function nextColor(doc: SdfDoc): [number, number, number] {
  const used = doc.nodes.filter((n) => getDef(n.type)?.colored).length;
  return [...PALETTE[used % PALETTE.length]];
}

/** Size of a freshly added primitive, used to place it next to the existing shape. */
function approxRadius(type: string): number {
  const d = getDef(type);
  if (!d) return 1;
  const params: Record<string, ParamValue> = {};
  for (const p of paramsOf(type)) params[p.key] = p.default;
  const b = d.bounds({ params, dim: 3, input: () => null, inputs: () => [] });
  if (!b) return 1;
  return Math.max(...b.max.map((v, i) => (v - b.min[i]) / 2));
}

export type AddMode = 'add' | 'carve';

/**
 * Add a primitive to the scene and wire it in, so beginners never need to
 * touch the graph:
 *  - add: joins the shape into the main Union feeding the Output (creating one if needed)
 *  - carve: wraps the current result in a Subtract with the new shape as the cutter
 */
export function addShapeToScene(
  doc: SdfDoc,
  type: string,
  opts: { mode?: AddMode; bounds?: AABB | null; params?: Record<string, ParamValue> } = {},
): { doc: SdfDoc; nodeId: string } {
  if (type.startsWith('__existing__')) return wireIntoScene(doc, type.slice(12), opts.mode ?? 'add');
  const out = findOutput(doc)!;
  const mode = opts.mode ?? 'add';
  const r = approxRadius(type);
  const b = opts.bounds;
  // place it so it overlaps the right side of what exists (or centred on an empty scene)
  let pos: [number, number, number] = [0, 0, 0];
  if (b) {
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    pos = mode === 'carve' ? [b.max[0], b.max[1], cz] : [b.max[0] + r * 0.35, cy, cz];
  }
  pos = pos.map((v) => Math.round(v * 100) / 100) as [number, number, number];
  const def = getDef(type)!;
  const params: Record<string, ParamValue> = { ...(opts.params ?? {}) };
  if (def.transform === 3) params.position = pos;
  if (def.colored) params.color = mode === 'carve' ? [0.85, 0.85, 0.82] : nextColor(doc);
  if (def.output === 'sdf2') {
    // a flat profile from the toolbar: stand it up as an extruded plate facing the camera
    const ys = doc.nodes.map((n) => n.y);
    const xs = doc.nodes.map((n) => n.x);
    const profile = makeNode(type, Math.min(...xs) - 260, Math.max(...ys) + 120, params);
    const ex = makeNode('extrude', Math.min(...xs), Math.max(...ys) + 120, {
      height: 0.3,
      rounding: 0.04,
      position: pos,
      rotation: [90, 0, 0],
    });
    const withProfile = connect(addNode(addNode(doc, profile), ex), profile.id, ex.id, 'profile');
    const r = addShapeToScene(withProfile, '__existing__' + ex.id, { ...opts });
    return { doc: r.doc, nodeId: profile.id };
  }
  // graph placement: left of the output, below existing inputs
  const sources = doc.nodes.filter((n) => n.type !== 'output');
  const minX = sources.length ? Math.min(...sources.map((n) => n.x)) : out.x - 300;
  const maxY = sources.length ? Math.max(...sources.map((n) => n.y)) : out.y - 60;
  const shape = makeNode(type, minX, maxY + 120, params);
  return wireIntoScene(addNode(doc, shape), shape.id, mode);
}

/** Wire an existing (unconnected) 3D node into the scene: join the main Union, or carve with it. */
function wireIntoScene(doc: SdfDoc, shapeId: string, mode: AddMode): { doc: SdfDoc; nodeId: string } {
  const out = findOutput(doc)!;
  const shape = nodeById(doc, shapeId)!;
  const current = inputEdges(doc, out.id, 'shape')[0];
  const currentNode = current ? nodeById(doc, current.source) : undefined;
  let next = doc;

  if (!currentNode) {
    next = moveNodes(next, { [shape.id]: { x: out.x - 280, y: out.y } });
    next = connect(next, shape.id, out.id, 'shape');
    return { doc: next, nodeId: shape.id };
  }
  if (mode === 'add') {
    if (currentNode.type === 'union') {
      next = connect(next, shape.id, currentNode.id, 'shapes');
      return { doc: next, nodeId: shape.id };
    }
    const u = makeNode('union', out.x - 220, out.y, { smooth: 0.1 });
    next = addNode(next, u);
    next = { ...next, edges: next.edges.filter((e) => e.id !== current.id) };
    next = connect(next, currentNode.id, u.id, 'shapes');
    next = connect(next, shape.id, u.id, 'shapes');
    next = connect(next, u.id, out.id, 'shape');
    return { doc: shiftLeftOf(next, u.id, currentNode.id), nodeId: shape.id };
  }
  const s = makeNode('subtract', out.x - 220, out.y, { smooth: 0.05 });
  next = addNode(next, s);
  next = { ...next, edges: next.edges.filter((e) => e.id !== current.id) };
  next = connect(next, currentNode.id, s.id, 'base');
  next = connect(next, shape.id, s.id, 'cutter');
  next = connect(next, s.id, out.id, 'shape');
  return { doc: shiftLeftOf(next, s.id, currentNode.id), nodeId: shape.id };
}

/** Make room: move the output right so the inserted node sits between. */
function shiftLeftOf(doc: SdfDoc, inserted: string, _upstream: string): SdfDoc {
  const out = findOutput(doc)!;
  const ins = nodeById(doc, inserted)!;
  return moveNodes(doc, { [out.id]: { x: ins.x + 240, y: out.y } });
}

/**
 * Insert a modifier (e.g. Twist) after a node: node → modifier → (what node fed).
 */
export function insertAfter(
  doc: SdfDoc,
  nodeId: string,
  type: string,
): { doc: SdfDoc; nodeId: string } | null {
  const n = nodeById(doc, nodeId);
  const def = getDef(type);
  if (!n || !def || !def.inputs.length) return null;
  const mod = makeNode(type, n.x + 60, n.y + 90);
  let next = addNode(doc, mod);
  const outs = doc.edges.filter((e) => e.source === nodeId);
  next = { ...next, edges: next.edges.filter((e) => e.source !== nodeId) };
  const inKey = def.inputs[0].key;
  if (!canConnect(next, nodeId, mod.id, inKey).ok) return null;
  next = connect(next, nodeId, mod.id, inKey);
  for (const e of outs) {
    if (canConnect(next, mod.id, e.target, e.input).ok) next = connect(next, mod.id, e.target, e.input);
  }
  return { doc: next, nodeId: mod.id };
}

export function togglePin(doc: SdfDoc, node: string, param: string): SdfDoc {
  const has = doc.pinned.some((p) => p.node === node && p.param === param);
  return {
    ...doc,
    pinned: has
      ? doc.pinned.filter((p) => !(p.node === node && p.param === param))
      : [...doc.pinned, { node, param }],
  };
}
