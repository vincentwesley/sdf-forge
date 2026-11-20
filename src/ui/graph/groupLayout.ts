/**
 * How groups appear in the graph: a collapsed group hides its members behind
 * one card whose sockets stand for the members' open inputs and results; an
 * expanded group draws a frame behind its members. Wires that cross a
 * collapsed group's edge are re-routed to the card, keeping their ids, so
 * deleting or reconnecting them works as usual.
 */
import type { GEdge, SdfDoc } from '../../core/graph/doc';
import {
  GROUP_PREFIX,
  type NodeGroup,
  groupCentre,
  groupInputs,
  groupOutputs,
  groupsOf,
} from '../../core/graph/groups';
import { getDef, paramsOf } from '../../core/nodes/registry';
import type { GroupCardNode, GroupFrameNode } from './GroupView';
import { fmt } from '../format';

export const NODE_W = 196;
const FRAME_PAD = 16;
const FRAME_HEAD = 30;

export const groupNodeId = (g: NodeGroup) => `${GROUP_PREFIX}${g.id}`;
export const isGroupNodeId = (id: string) => id.startsWith(GROUP_PREFIX);
export const groupIdOf = (id: string) => id.slice(GROUP_PREFIX.length);

/** The real node and socket behind a (possibly group-card) handle. */
export function realEnd(nodeId: string, handle: string | null | undefined): { node: string; handle: string } {
  if (!isGroupNodeId(nodeId)) return { node: nodeId, handle: handle ?? 'out' };
  const h = handle ?? '';
  const bar = h.indexOf('|');
  return bar < 0 ? { node: h, handle: 'out' } : { node: h.slice(0, bar), handle: h.slice(bar + 1) };
}

/** Rough node height (the frame only needs to enclose the cards). */
function nodeHeight(type: string) {
  return 58 + (getDef(type)?.inputs.length ?? 0) * 22;
}

function settingValue(doc: SdfDoc, node: string, param: string): { label: string; value: string } | null {
  const n = doc.nodes.find((x) => x.id === node);
  const p = n && paramsOf(n.type).find((x) => x.key === param);
  if (!n || !p) return null;
  const v = n.params[param];
  const mm = doc.settings.mmPerUnit;
  let value: string;
  if (p.kind === 'float' || p.kind === 'int') {
    const unit = p.kind === 'float' ? p.unit : undefined;
    value =
      unit === 'length'
        ? `${fmt((v as number) * mm, 1)} mm`
        : unit === 'angle'
          ? `${fmt(v as number, 0)}°`
          : unit === 'percent'
            ? `${fmt((v as number) * 100, 0)} %`
            : fmt(v as number, 2);
  } else if (p.kind === 'enum') value = p.options.find((o) => o.value === v)?.label ?? String(v);
  else if (p.kind === 'bool') value = v ? 'on' : 'off';
  else if (p.kind === 'color') value = 'colour';
  else if (Array.isArray(v))
    value = v.map((x) => fmt(x * (p.kind === 'vec3' && p.unit === 'length' ? mm : 1), 1)).join(', ');
  else value = String(v);
  return { label: p.label, value };
}

export interface GroupView {
  /** members of collapsed groups (not drawn) */
  hidden: Set<string>;
  cards: GroupCardNode[];
  frames: GroupFrameNode[];
  /** where a document edge is drawn */
  route(e: GEdge): { source: string; sourceHandle: string; target: string; targetHandle: string } | null;
}

export function groupView(
  doc: SdfDoc,
  dims: Map<string, 2 | 3 | null>,
  reach: Set<string>,
  activeGroup: string | null,
): GroupView {
  const groups = groupsOf(doc);
  const hidden = new Set<string>();
  const owner = new Map<string, NodeGroup>();
  for (const g of groups)
    if (g.collapsed)
      for (const m of g.members) {
        hidden.add(m);
        owner.set(m, g);
      }
  const cards: GroupCardNode[] = [];
  const frames: GroupFrameNode[] = [];
  for (const g of groups) {
    const ns = doc.nodes.filter((n) => g.members.includes(n.id));
    if (!ns.length) continue;
    if (g.collapsed) {
      const c = groupCentre(doc, g);
      const ins = groupInputs(doc, g);
      const outs = groupOutputs(doc, g);
      cards.push({
        id: groupNodeId(g),
        type: 'groupCard',
        position: c,
        selected: activeGroup === g.id,
        ariaLabel: `Group ${g.name}, ${g.members.length} nodes`,
        data: {
          groupId: g.id,
          title: g.name,
          count: g.members.length,
          inputs: ins.map((i) => {
            const src = i.edges[0]?.source;
            const def = getDef(doc.nodes.find((n) => n.id === i.node)!.type)!;
            const t = def.inputs.find((x) => x.key === i.input)!.type;
            const dim: 2 | 3 =
              t === 'sdf2' ? 2 : t === 'sdf3' ? 3 : ((src ? dims.get(src) : null) ?? dims.get(i.node) ?? 3);
            return { id: `${i.node}|${i.input}`, label: i.label, dim, connected: i.edges.length > 0 };
          }),
          outputs: outs.map((o) => ({
            id: o.node,
            label: o.label,
            dim: dims.get(o.node) ?? 3,
            connected: o.edges.length > 0,
          })),
          settings: g.exposed
            .map((s) => {
              const v = settingValue(doc, s.node, s.param);
              return v && { label: s.label ?? v.label, value: v.value };
            })
            .filter((x): x is { label: string; value: string } => !!x),
          dimmed: !g.members.some((m) => reach.has(m)),
        },
      });
    } else {
      const x0 = Math.min(...ns.map((n) => n.x)) - FRAME_PAD;
      const y0 = Math.min(...ns.map((n) => n.y)) - FRAME_PAD - FRAME_HEAD;
      const x1 = Math.max(...ns.map((n) => n.x + NODE_W)) + FRAME_PAD;
      const y1 = Math.max(...ns.map((n) => n.y + nodeHeight(n.type))) + FRAME_PAD;
      frames.push({
        id: groupNodeId(g),
        type: 'groupFrame',
        position: { x: x0, y: y0 },
        selected: activeGroup === g.id,
        zIndex: -1,
        dragHandle: '.group-frame-head',
        style: { pointerEvents: 'none' },
        ariaLabel: `Group ${g.name}, expanded`,
        data: { groupId: g.id, title: g.name, count: g.members.length, width: x1 - x0, height: y1 - y0 },
      });
    }
  }
  const route: GroupView['route'] = (e) => {
    const gs = owner.get(e.source);
    const gt = owner.get(e.target);
    if (gs && gs === gt) return null; // inside one collapsed group
    return {
      source: gs ? groupNodeId(gs) : e.source,
      sourceHandle: gs ? e.source : 'out',
      target: gt ? groupNodeId(gt) : e.target,
      targetHandle: gt ? `${e.target}|${e.input}` : e.input,
    };
  };
  return { hidden, cards, frames, route };
}
