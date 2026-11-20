/**
 * Editor actions for node groups (src/core/graph/groups.ts) and the "My parts"
 * library. Each action is one undo step.
 */
import { newId, normalizeDoc } from '../core/graph/doc';
import {
  MAX_GROUP_SETTINGS,
  type Part,
  extractPart,
  groupCentre,
  groupsOf,
  insertPart,
  isExposable,
  makeGroup,
  sanitizeParts,
  ungroup,
  updateGroup,
} from '../core/graph/groups';
import { actions, commit, store, toast } from './store';
import { duplicateNodes } from './ops';

const get = () => store.getState();
const PARTS_KEY = 'sdf-forge:parts';

/** Select a group's card: its members become the selection. */
export function selectGroup(id: string) {
  const g = groupsOf(get().doc).find((x) => x.id === id);
  if (g) actions.set({ selection: [...g.members], activeGroup: id });
}

/** Group the selected nodes (Ctrl+G). */
export function groupSelection(name?: string): string | null {
  const s = get();
  const { doc, group } = makeGroup(s.doc, s.selection, name ?? nextName());
  if (!group) {
    toast('Select one or more nodes (not the Output) to group them.', 'info');
    return null;
  }
  commit(doc, { selection: group.members });
  actions.set({ activeGroup: group.id });
  toast(
    `Grouped ${group.members.length} node${group.members.length > 1 ? 's' : ''} as “${group.name}”`,
    'info',
    2000,
  );
  return group.id;
}

function nextName() {
  const used = new Set(groupsOf(get().doc).map((g) => g.name));
  for (let i = 1; ; i++) if (!used.has(`Group ${i}`)) return `Group ${i}`;
}

/** Ungroup (Ctrl+Shift+G): the active group, or the group of the selected node. */
export function ungroupSelection() {
  const s = get();
  const id = s.activeGroup ?? groupsOf(s.doc).find((g) => s.selection.some((m) => g.members.includes(m)))?.id;
  if (!id) return;
  const g = groupsOf(s.doc).find((x) => x.id === id)!;
  commit(ungroup(s.doc, id), { selection: g.members });
}

export function setGroupCollapsed(id: string, collapsed: boolean) {
  commit(updateGroup(get().doc, id, { collapsed }), { merge: `gcol:${id}` });
}

export function renameGroup(id: string, name: string) {
  commit(updateGroup(get().doc, id, { name: name.trim().slice(0, 40) || 'Group' }), { merge: `gname:${id}` });
}

/** Move a group card: all members move by the same amount. */
export function moveGroup(id: string, to: { x: number; y: number }) {
  const doc = get().doc;
  const g = groupsOf(doc).find((x) => x.id === id);
  if (!g) return;
  const c = groupCentre(doc, g);
  const dx = Math.round(to.x - c.x),
    dy = Math.round(to.y - c.y);
  if (!dx && !dy) return;
  const set = new Set(g.members);
  commit(
    { ...doc, nodes: doc.nodes.map((n) => (set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) },
    { merge: `gmove:${id}` },
  );
}

export function exposeSetting(id: string, node: string, param: string) {
  const doc = get().doc;
  const g = groupsOf(doc).find((x) => x.id === id);
  if (!g || !g.members.includes(node) || !isExposable(doc, { node, param })) return;
  if (g.exposed.some((s) => s.node === node && s.param === param)) return;
  if (g.exposed.length >= MAX_GROUP_SETTINGS) {
    toast(`A group shows at most ${MAX_GROUP_SETTINGS} settings.`, 'info');
    return;
  }
  commit(updateGroup(doc, id, { exposed: [...g.exposed, { node, param }] }));
}

export function unexposeSetting(id: string, node: string, param: string) {
  const doc = get().doc;
  const g = groupsOf(doc).find((x) => x.id === id);
  if (!g) return;
  commit(updateGroup(doc, id, { exposed: g.exposed.filter((s) => !(s.node === node && s.param === param)) }));
}

export function labelSetting(id: string, node: string, param: string, label: string) {
  const doc = get().doc;
  const g = groupsOf(doc).find((x) => x.id === id);
  if (!g) return;
  const l = label.trim().slice(0, 40);
  commit(
    updateGroup(doc, id, {
      exposed: g.exposed.map((s) =>
        s.node === node && s.param === param ? { node, param, ...(l ? { label: l } : {}) } : s,
      ),
    }),
    { merge: `glabel:${id}` },
  );
}

// ------------------------------------------------------------- My parts ----

export function loadParts(): Part[] {
  try {
    return sanitizeParts(JSON.parse(localStorage.getItem(PARTS_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function storeParts(parts: Part[]) {
  try {
    localStorage.setItem(PARTS_KEY, JSON.stringify(parts));
    window.dispatchEvent(new Event('sdf-forge:parts'));
    return true;
  } catch {
    toast('Couldn’t save: this browser’s storage is full or turned off.', 'error');
    return false;
  }
}

/** Save a group to "My parts" in this browser (replaces a part with the same name). */
export function savePart(groupId: string) {
  const part = extractPart(get().doc, groupId);
  if (!part) return;
  const parts = loadParts().filter((p) => p.name !== part.name);
  if (storeParts([part, ...parts].slice(0, 50)))
    toast(`Saved “${part.name}” to My parts. Add it from the Add node menu.`, 'success', 2600);
}

export function deletePart(name: string) {
  storeParts(loadParts().filter((p) => p.name !== name));
}

/** Insert a saved part as a new collapsed group at a graph position. */
export function addPart(part: Part, x: number, y: number) {
  const { doc, groupId, nodeIds } = insertPart(get().doc, part, x, y, newId);
  if (!groupId) return;
  // parts come from storage: normalise their params like any loaded document
  const clean = normalizeDoc(doc);
  commit(clean, { selection: nodeIds });
  actions.set({ activeGroup: groupId });
}

/** Move a group's members by (dx, dy): dragging a group card or frame. */
export function moveGroupBy(id: string, dx: number, dy: number) {
  const doc = get().doc;
  const g = groupsOf(doc).find((x) => x.id === id);
  if (!g || (!dx && !dy)) return;
  const set = new Set(g.members);
  commit(
    { ...doc, nodes: doc.nodes.map((n) => (set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) },
    { merge: `gmove:${id}` },
  );
}

/** Duplicate a group: copies of its nodes, wired the same inside, as a new group with the same settings. */
export function duplicateGroup(id: string) {
  const s = get();
  const g = groupsOf(s.doc).find((x) => x.id === id);
  if (!g) return;
  const { doc, map } = duplicateNodes(s.doc, g.members);
  const { doc: grouped, group } = makeGroup(doc, Object.values(map), `${g.name} copy`.slice(0, 40));
  if (!group) return;
  const next = updateGroup(grouped, group.id, {
    collapsed: g.collapsed,
    exposed: g.exposed.filter((e) => map[e.node]).map((e) => ({ ...e, node: map[e.node] })),
  });
  commit(next, { selection: group.members });
  actions.set({ activeGroup: group.id });
}
