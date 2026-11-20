import { describe, expect, it } from 'vitest';
import { G } from '../helpers';
import { compile } from '../../src/core/compile';
import { newId, normalizeDoc, type SdfDoc } from '../../src/core/graph/doc';
import {
  extractPart,
  groupCentre,
  groupInputs,
  groupOutputs,
  insertPart,
  makeGroup,
  sanitizeGroups,
  sanitizeParts,
  ungroup,
  updateGroup,
} from '../../src/core/graph/groups';
import { removeNodes } from '../../src/state/ops';
import { decodeDoc, encodeDoc } from '../../src/core/share';
import { exampleById } from '../../src/gallery/examples';

/** sphere and box → union → shell → output; plus a lone twist with nothing plugged in */
function doc() {
  const g = new G();
  const s = g.node('sphere', { radius: 1 });
  const b = g.node('box', { position: [1, 0, 0] });
  const u = g.node('union', { smooth: 0.2 });
  const sh = g.node('shell', { thickness: 0.1 });
  const tw = g.node('twist', {});
  g.link(s, u, 'shapes').link(b, u, 'shapes').link(u, sh, 'shape').out(sh);
  return { d: g.doc, s, b, u, sh, tw };
}

describe('node groups', () => {
  it('a group changes nothing about the shape: same code, same export input', () => {
    const { d, s, b, u } = doc();
    const { doc: grouped } = makeGroup(d, [s, b, u], 'Body');
    expect(compile(grouped).glsl).toBe(compile(d).glsl);
    expect(compile(grouped).jsMap).toBe(compile(d).jsMap);
  });

  it('never contains the Output, and a node is in one group at most', () => {
    const { d, s, b, u } = doc();
    const out = d.nodes.find((n) => n.type === 'output')!.id;
    const a = makeGroup(d, [s, b, out], 'A');
    expect(a.group!.members).toEqual([s, b]);
    const c = makeGroup(a.doc, [b, u], 'B');
    expect(c.doc.groups!.map((g) => [g.name, g.members])).toEqual([
      ['A', [s]],
      ['B', [b, u]],
    ]);
    // moving the last member out removes the empty group
    const e = makeGroup(c.doc, [s], 'C');
    expect(e.doc.groups!.map((g) => g.name)).toEqual(['B', 'C']);
    expect(makeGroup(d, [out], 'X').group).toBeNull();
  });

  it('inputs are open or outside-fed sockets; outputs are results that leave the group', () => {
    const { d, s, b, u, sh, tw } = doc();
    // group union + shell: the union's multi input takes sphere and box from outside
    const g1 = makeGroup(d, [u, sh], 'Cap').group!;
    const ins = groupInputs(makeGroup(d, [u, sh]).doc, g1);
    expect(ins.map((i) => [i.node, i.input, i.edges.map((e) => e.source).sort()])).toEqual([
      [u, 'shapes', [b, s].sort()],
    ]);
    const outs = groupOutputs(makeGroup(d, [u, sh]).doc, g1);
    expect(outs.map((o) => o.node)).toEqual([sh]);
    // a group with an unplugged twist exposes its empty input, and its result
    const { doc: d2, group: g2 } = makeGroup(d, [tw], 'Twister');
    expect(groupInputs(d2, g2!).map((i) => [i.node, i.input, i.edges.length])).toEqual([[tw, 'shape', 0]]);
    expect(groupOutputs(d2, g2!).map((o) => o.node)).toEqual([tw]);
    // internal plumbing is not an input: shell's input is fed by the union inside the group
    expect(ins.some((i) => i.node === sh)).toBe(false);
  });

  it('ungroup keeps the nodes; deleting members prunes the group and its settings', () => {
    const { d, s, b, u } = doc();
    const { doc: g, group } = makeGroup(d, [s, b, u], 'Body');
    const exposed = updateGroup(g, group!.id, {
      exposed: [
        { node: s, param: 'radius' },
        { node: b, param: 'size', label: 'Box' },
      ],
    });
    expect(ungroup(exposed, group!.id).groups).toBeUndefined();
    expect(ungroup(exposed, group!.id).nodes).toHaveLength(d.nodes.length);
    const less = removeNodes(exposed, [s]);
    expect(less.groups![0].members).toEqual([b, u]);
    expect(less.groups![0].exposed).toEqual([{ node: b, param: 'size', label: 'Box' }]);
    expect(removeNodes(less, [b, u]).groups).toBeUndefined();
  });

  it('survives share links, including collapsed state and setting labels', async () => {
    const { d, s, b, u } = doc();
    const { doc: g, group } = makeGroup(d, [s, b, u], 'Body');
    const withSettings = updateGroup(g, group!.id, {
      collapsed: false,
      exposed: [{ node: u, param: 'smooth', label: 'Blend' }],
    });
    const back = await decodeDoc(await encodeDoc(withSettings));
    expect(back.groups).toHaveLength(1);
    const bg = back.groups![0];
    expect(bg.name).toBe('Body');
    expect(bg.collapsed).toBe(false);
    expect(bg.members).toHaveLength(3);
    expect(bg.exposed).toHaveLength(1);
    expect(bg.exposed[0].label).toBe('Blend');
    expect(back.nodes.find((n) => n.id === bg.exposed[0].node)!.type).toBe('union');
  });

  it('cleans untrusted groups: unknown members, Output, duplicates, bad settings', () => {
    const { d, s, b, u } = doc();
    const out = d.nodes.find((n) => n.type === 'output')!.id;
    const raw = [
      { id: 'a', name: 'A', members: [s, 'ghost', out, s], exposed: [{ node: s, param: 'nope' }] },
      {
        id: 'a',
        name: '',
        members: [s, b],
        exposed: [
          { node: b, param: 'size' },
          { node: u, param: 'smooth' },
        ],
      },
      { id: 'c', name: 'C', members: ['ghost'] },
      'junk',
      { id: 'd', name: 'D', members: [u], exposed: [{ node: u, param: 'smooth', label: 'x'.repeat(99) }] },
    ];
    const gs = sanitizeGroups(raw, d.nodes);
    expect(gs.map((g) => g.members)).toEqual([[s], [b], [u]]);
    expect(gs[0].exposed).toEqual([]);
    expect(gs[1].name).toBe('Group');
    expect(gs[1].id).not.toBe('a'); // duplicate id replaced
    expect(gs[1].exposed).toEqual([{ node: b, param: 'size' }]); // u is not a member
    expect(gs[2].exposed[0].label).toHaveLength(40);
    expect(normalizeDoc({ ...d, groups: raw } as unknown as SdfDoc).groups).toHaveLength(3);
    expect(sanitizeGroups('nope', d.nodes)).toEqual([]);
  });

  it('a group saved as a part comes back as a fresh copy with new ids, wired inside, centred where asked', () => {
    const { d, s, b, u } = doc();
    const { doc: g, group } = makeGroup(d, [s, b, u], 'Body');
    const part = extractPart(
      updateGroup(g, group!.id, { exposed: [{ node: u, param: 'smooth' }] }),
      group!.id,
    )!;
    expect(part.nodes).toHaveLength(3);
    expect(part.edges).toHaveLength(2); // sphere→union, box→union; union→shell left the group
    // the part survives a JSON round trip through untrusted storage
    const [clean] = sanitizeParts(JSON.parse(JSON.stringify([part, { name: 1 }, null])));
    const { doc: d2, groupId, nodeIds } = insertPart(d, clean, 500, 300, newId);
    expect(nodeIds).toHaveLength(3);
    expect(nodeIds.some((id) => [s, b, u].includes(id))).toBe(false);
    const ng = d2.groups!.find((x) => x.id === groupId)!;
    expect(ng.name).toBe('Body');
    expect(ng.exposed).toHaveLength(1);
    expect(nodeIds).toContain(ng.exposed[0].node);
    expect(groupCentre(d2, ng)).toEqual({ x: 500, y: 300 });
    expect(d2.edges.filter((e) => nodeIds.includes(e.source) && nodeIds.includes(e.target))).toHaveLength(2);
    // nothing outside is touched
    expect(d2.edges.length).toBe(d.edges.length + 2);
  });

  it('parts from storage drop unknown node types and broken wires', () => {
    const parts = sanitizeParts([
      {
        name: 'p',
        nodes: [
          { id: 'a', type: 'sphere', x: 0, y: 0, params: {} },
          { id: 'b', type: 'virus', x: 0, y: 0, params: {} },
          { id: 'c', type: 'output', x: 0, y: 0, params: {} },
        ],
        edges: [{ source: 'b', target: 'a', input: 'x' }],
        exposed: [{ node: 'b', param: 'radius' }],
      },
    ]);
    expect(parts[0].nodes.map((n) => n.id)).toEqual(['a']);
    expect(parts[0].edges).toEqual([]);
    expect(parts[0].exposed).toEqual([]);
  });

  it('the Desk lamp example ships its shade as a collapsed group with three settings', () => {
    const lamp = exampleById('lamp')!.build();
    expect(lamp.groups).toHaveLength(1);
    expect(lamp.groups![0]).toMatchObject({ name: 'Lampshade', collapsed: true });
    expect(lamp.groups![0].exposed.map((s) => s.label)).toEqual(['Width', 'Wall', 'Finish']);
    expect(normalizeDoc(lamp).groups).toEqual(lamp.groups);
  });
});
