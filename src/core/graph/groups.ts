/**
 * Node groups: a named set of nodes that the graph can collapse into one card
 * with its own inputs, outputs and exposed settings, and that can be saved as
 * a reusable part (see DECISIONS.md 23).
 *
 * A group is an organising layer over the ordinary graph. Its members stay
 * ordinary nodes, so compiling, picking, the gizmo, undo, animation, exports
 * and share links work inside groups unchanged; collapsing a group changes
 * only how the graph is drawn.
 */
import type { GEdge, GNode, SdfDoc } from './doc';
import { getDef, paramsOf } from '../nodes/registry';
import type { ParamValue } from '../nodes/types';

export interface GroupSetting {
  node: string;
  param: string;
  label?: string;
}

export interface NodeGroup {
  id: string;
  name: string;
  /** member node ids (never the Output; a node is in at most one group) */
  members: string[];
  collapsed: boolean;
  /** settings shown on the group card and in its panel */
  exposed: GroupSetting[];
}

/** An input socket of a group: a member's input that is open or fed from outside. */
export interface GroupInput {
  node: string;
  input: string;
  label: string;
  /** edges from outside the group into this socket */
  edges: GEdge[];
}

/** An output of a group: a member whose result leaves the group or isn't used inside it. */
export interface GroupOutput {
  node: string;
  label: string;
  edges: GEdge[];
}

export const MAX_GROUP_SETTINGS = 8;
export const GROUP_PREFIX = 'grp:';

export const groupsOf = (doc: SdfDoc): NodeGroup[] => doc.groups ?? [];

export function groupOfNode(doc: SdfDoc, nodeId: string): NodeGroup | undefined {
  return groupsOf(doc).find((g) => g.members.includes(nodeId));
}

const nodeLabel = (n: GNode) => n.name ?? getDef(n.type)?.label ?? n.type;

export function groupInputs(doc: SdfDoc, g: NodeGroup): GroupInput[] {
  const inside = new Set(g.members);
  const out: GroupInput[] = [];
  for (const id of g.members) {
    const n = doc.nodes.find((x) => x.id === id);
    const def = n && getDef(n.type);
    if (!n || !def) continue;
    for (const inp of def.inputs) {
      const edges = doc.edges.filter((e) => e.target === id && e.input === inp.key);
      const fromOutside = edges.filter((e) => !inside.has(e.source));
      const fedInside = edges.length > fromOutside.length;
      // a socket fed only from inside is internal plumbing; multi inputs can still take more
      if (fedInside && !inp.multi) continue;
      if (fedInside && inp.multi && fromOutside.length === 0) continue;
      const label = def.inputs.length > 1 ? `${nodeLabel(n)} · ${inp.label}` : nodeLabel(n);
      out.push({ node: id, input: inp.key, label, edges: fromOutside });
    }
  }
  return out;
}

export function groupOutputs(doc: SdfDoc, g: NodeGroup): GroupOutput[] {
  const inside = new Set(g.members);
  const out: GroupOutput[] = [];
  for (const id of g.members) {
    const n = doc.nodes.find((x) => x.id === id);
    if (!n || !getDef(n.type)?.output) continue;
    const edges = doc.edges.filter((e) => e.source === id);
    const leaving = edges.filter((e) => !inside.has(e.target));
    if (leaving.length || edges.length === 0) out.push({ node: id, label: nodeLabel(n), edges: leaving });
  }
  return out;
}

/** Centre of the members' positions (where a collapsed card is drawn). */
export function groupCentre(doc: SdfDoc, g: NodeGroup): { x: number; y: number } {
  const ns = doc.nodes.filter((n) => g.members.includes(n.id));
  if (!ns.length) return { x: 0, y: 0 };
  return {
    x: Math.round(ns.reduce((a, n) => a + n.x, 0) / ns.length),
    y: Math.round(ns.reduce((a, n) => a + n.y, 0) / ns.length),
  };
}

let gc = 0;
export function newGroupId(): string {
  return `g${Date.now().toString(36).slice(-4)}${(gc++).toString(36)}`;
}

/** Group the given nodes (the Output is skipped; members leave any group they were in). */
export function makeGroup(
  doc: SdfDoc,
  ids: string[],
  name = 'Group',
  id = newGroupId(),
): { doc: SdfDoc; group: NodeGroup | null } {
  const valid = new Set(doc.nodes.filter((n) => n.type !== 'output').map((n) => n.id));
  const members = [...new Set(ids)].filter((x) => valid.has(x));
  if (!members.length) return { doc, group: null };
  const group: NodeGroup = { id, name: name.slice(0, 40) || 'Group', members, collapsed: true, exposed: [] };
  const rest = groupsOf(doc)
    .map((g) => ({
      ...g,
      members: g.members.filter((m) => !members.includes(m)),
      exposed: g.exposed.filter((s) => !members.includes(s.node)),
    }))
    .filter((g) => g.members.length);
  return { doc: { ...doc, groups: [...rest, group] }, group };
}

export function ungroup(doc: SdfDoc, groupId: string): SdfDoc {
  const groups = groupsOf(doc).filter((g) => g.id !== groupId);
  return withGroups(doc, groups);
}

export function updateGroup(doc: SdfDoc, groupId: string, patch: Partial<Omit<NodeGroup, 'id'>>): SdfDoc {
  return withGroups(
    doc,
    groupsOf(doc).map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
  );
}

function withGroups(doc: SdfDoc, groups: NodeGroup[]): SdfDoc {
  const out: SdfDoc = { ...doc, groups };
  if (!groups.length) delete out.groups;
  return out;
}

/** Can this setting be exposed on a group card (a number, vector, colour, choice or switch)? */
export function isExposable(doc: SdfDoc, s: GroupSetting): boolean {
  const n = doc.nodes.find((x) => x.id === s.node);
  const p = n && paramsOf(n.type).find((x) => x.key === s.param);
  return !!p && p.kind !== 'points' && p.kind !== 'text';
}

/** Drop members and settings of nodes that no longer exist, empty groups, and duplicates. */
export function sanitizeGroups(raw: unknown, nodes: GNode[]): NodeGroup[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(nodes.filter((n) => n.type !== 'output').map((n) => n.id));
  const taken = new Set<string>();
  const seen = new Set<string>();
  const out: NodeGroup[] = [];
  for (const g of raw as Partial<NodeGroup>[]) {
    if (!g || typeof g !== 'object') continue;
    const id = typeof g.id === 'string' && g.id && !seen.has(g.id) ? g.id : newGroupId();
    const members: string[] = [];
    for (const m of Array.isArray(g.members) ? g.members : [])
      if (typeof m === 'string' && ids.has(m) && !taken.has(m)) {
        taken.add(m);
        members.push(m);
      }
    if (!members.length) continue;
    seen.add(id);
    const exposed: GroupSetting[] = [];
    for (const s of Array.isArray(g.exposed) ? g.exposed : []) {
      if (!s || typeof s.node !== 'string' || typeof s.param !== 'string' || !members.includes(s.node))
        continue;
      const n = nodes.find((x) => x.id === s.node)!;
      const p = paramsOf(n.type).find((x) => x.key === s.param);
      if (!p || p.kind === 'points' || p.kind === 'text') continue;
      if (exposed.some((e) => e.node === s.node && e.param === s.param)) continue;
      exposed.push({
        node: s.node,
        param: s.param,
        ...(typeof s.label === 'string' && s.label ? { label: s.label.slice(0, 40) } : {}),
      });
    }
    out.push({
      id,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.slice(0, 40) : 'Group',
      members,
      collapsed: g.collapsed !== false,
      exposed: exposed.slice(0, MAX_GROUP_SETTINGS),
    });
  }
  return out;
}

// ---------------------------------------------------------------- parts ----

/** A group saved for reuse: its nodes, the wires between them and its settings. */
export interface Part {
  name: string;
  nodes: {
    id: string;
    type: string;
    x: number;
    y: number;
    params: Record<string, ParamValue>;
    name?: string;
  }[];
  edges: { source: string; target: string; input: string }[];
  exposed: GroupSetting[];
}

export function extractPart(doc: SdfDoc, groupId: string): Part | null {
  const g = groupsOf(doc).find((x) => x.id === groupId);
  if (!g) return null;
  const inside = new Set(g.members);
  const nodes = doc.nodes.filter((n) => inside.has(n.id));
  const c = groupCentre(doc, g);
  return {
    name: g.name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      x: n.x - c.x,
      y: n.y - c.y,
      params: JSON.parse(JSON.stringify(n.params)),
      ...(n.name ? { name: n.name } : {}),
    })),
    edges: doc.edges
      .filter((e) => inside.has(e.source) && inside.has(e.target))
      .map(({ source, target, input }) => ({ source, target, input })),
    exposed: g.exposed.map((s) => ({ ...s })),
  };
}

/**
 * Insert a copy of a part centred at (x, y) as a new collapsed group. Returns
 * the new document and the new group's id. Unknown node types are skipped.
 */
export function insertPart(
  doc: SdfDoc,
  part: Part,
  x: number,
  y: number,
  newId: (prefix: string) => string,
): { doc: SdfDoc; groupId: string | null; nodeIds: string[] } {
  const map = new Map<string, string>();
  const nodes: GNode[] = [];
  for (const n of part.nodes) {
    if (!getDef(n.type) || n.type === 'output') continue;
    const id = newId(n.type.slice(0, 3));
    map.set(n.id, id);
    nodes.push({
      id,
      type: n.type,
      x: Math.round(x + n.x),
      y: Math.round(y + n.y),
      params: JSON.parse(JSON.stringify(n.params)),
      ...(n.name ? { name: n.name } : {}),
    });
  }
  if (!nodes.length) return { doc, groupId: null, nodeIds: [] };
  const edges: GEdge[] = part.edges
    .filter((e) => map.has(e.source) && map.has(e.target))
    .map((e) => ({ id: newId('e'), source: map.get(e.source)!, target: map.get(e.target)!, input: e.input }));
  const next: SdfDoc = { ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...edges] };
  const { doc: grouped, group } = makeGroup(next, [...map.values()], part.name);
  if (!group) return { doc: next, groupId: null, nodeIds: nodes.map((n) => n.id) };
  const exposed = part.exposed
    .filter((s) => map.has(s.node))
    .map((s) => ({ ...s, node: map.get(s.node)! }))
    .filter((s) => isExposable(grouped, s));
  return {
    doc: updateGroup(grouped, group.id, { exposed: exposed.slice(0, MAX_GROUP_SETTINGS) }),
    groupId: group.id,
    nodeIds: nodes.map((n) => n.id),
  };
}

/** Parse saved parts from untrusted JSON (localStorage): drops anything malformed. */
export function sanitizeParts(raw: unknown): Part[] {
  if (!Array.isArray(raw)) return [];
  const out: Part[] = [];
  for (const p of raw.slice(0, 50) as Partial<Part>[]) {
    if (!p || typeof p.name !== 'string' || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) continue;
    const nodes = p.nodes.filter(
      (n) =>
        n &&
        typeof n.id === 'string' &&
        typeof n.type === 'string' &&
        !!getDef(n.type) &&
        n.type !== 'output' &&
        Number.isFinite(n.x) &&
        Number.isFinite(n.y) &&
        n.params &&
        typeof n.params === 'object',
    );
    if (!nodes.length || nodes.length > 200) continue;
    const ids = new Set(nodes.map((n) => n.id));
    out.push({
      name: p.name.slice(0, 40) || 'Part',
      nodes,
      edges: p.edges.filter(
        (e) => e && ids.has(e.source) && ids.has(e.target) && typeof e.input === 'string',
      ),
      exposed: (Array.isArray(p.exposed) ? p.exposed : []).filter(
        (s) => s && ids.has(s.node) && typeof s.param === 'string',
      ),
    });
  }
  return out;
}
