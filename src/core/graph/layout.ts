import { type SdfDoc, findOutput, inputEdges } from './doc';
import { getDef } from '../nodes/registry';

export const NODE_W = 196;
const COL_GAP = 64;
const ROW_GAP = 22;

/** Approximate rendered height of a node card (kept in sync with NodeView). */
export function nodeHeight(doc: SdfDoc, id: string): number {
  const n = doc.nodes.find((x) => x.id === id);
  const def = n && getDef(n.type);
  if (!def) return 60;
  const rows = def.inputs.length;
  return 58 + rows * 22;
}

/**
 * Tidy left-to-right layout: the Output sits on the right, each node one
 * column left of its furthest consumer, children stacked in input order and
 * parents centred on their children. Unconnected nodes go underneath.
 */
export function autoLayout(doc: SdfDoc): Record<string, { x: number; y: number }> {
  const out = findOutput(doc);
  const pos: Record<string, { x: number; y: number }> = {};
  if (!out) return pos;
  // longest-path depth from the output
  const depth = new Map<string, number>();
  const visit = (id: string, d: number, stack: Set<string>) => {
    if (stack.has(id)) return;
    if ((depth.get(id) ?? -1) >= d) return;
    depth.set(id, d);
    stack.add(id);
    const def = getDef(doc.nodes.find((n) => n.id === id)?.type ?? '');
    for (const inp of def?.inputs ?? [])
      for (const e of inputEdges(doc, id, inp.key)) visit(e.source, d + 1, stack);
    stack.delete(id);
  };
  visit(out.id, 0, new Set());

  let cursor = 0;
  const placed = new Set<string>();
  const place = (id: string): number => {
    if (placed.has(id)) return pos[id].y + nodeHeight(doc, id) / 2;
    placed.add(id);
    const def = getDef(doc.nodes.find((n) => n.id === id)?.type ?? '');
    const kids: number[] = [];
    for (const inp of def?.inputs ?? [])
      for (const e of inputEdges(doc, id, inp.key)) if (!placed.has(e.source)) kids.push(place(e.source));
    const h = nodeHeight(doc, id);
    const x = -(depth.get(id) ?? 0) * (NODE_W + COL_GAP);
    let cy: number;
    if (kids.length) cy = (kids[0] + kids[kids.length - 1]) / 2;
    else {
      cy = cursor + h / 2;
      cursor += h + ROW_GAP;
    }
    pos[id] = { x, y: Math.round(cy - h / 2) };
    return cy;
  };
  place(out.id);
  // stray nodes in a row underneath
  let sx = -(Math.max(0, ...depth.values()) * (NODE_W + COL_GAP));
  const sy = cursor + 60;
  for (const n of doc.nodes) {
    if (placed.has(n.id)) continue;
    pos[n.id] = { x: sx, y: sy };
    sx += NODE_W + 24;
  }
  return pos;
}

/** Is the document already laid out the way autoLayout would do it (ignoring a global offset)? */
export function isTidy(doc: SdfDoc): boolean {
  const p = autoLayout(doc);
  const ids = doc.nodes.map((n) => n.id);
  if (!ids.length) return true;
  const n0 = doc.nodes[0];
  const dx = n0.x - p[n0.id].x,
    dy = n0.y - p[n0.id].y;
  return doc.nodes.every((n) => Math.abs(n.x - p[n.id].x - dx) < 2 && Math.abs(n.y - p[n.id].y - dy) < 2);
}

export function applyLayout(doc: SdfDoc): SdfDoc {
  const p = autoLayout(doc);
  return { ...doc, nodes: doc.nodes.map((n) => (p[n.id] ? { ...n, ...p[n.id] } : n)) };
}
