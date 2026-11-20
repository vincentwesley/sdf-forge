import { createStore, useStore } from 'zustand';
import { type SdfDoc, canConnect, emptyDoc, makeNode, normalizeDoc } from '../core/graph/doc';
import { getDef } from '../core/nodes/registry';
import type { AABB, ParamValue } from '../core/nodes/types';
import { type OrbitCamera, defaultCamera } from '../render/camera';
import type { ViewMode } from '../render/renderer';
import * as ops from './ops';
import type { PinAnim } from '../core/animation';
import type { SectionState } from './section';
import { applyLayout, isTidy } from '../core/graph/layout';

export type ThemePref = 'system' | 'dark' | 'light';
export type DialogId = null | 'export' | 'share' | 'gallery' | 'shortcuts' | 'about' | 'render' | 'code';
export type NarrowTab = 'graph' | 'props';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

export interface AddMenuState {
  /** screen position for the popup */
  x: number;
  y: number;
  /** graph-space position for the new node */
  flowX: number;
  flowY: number;
  /** when opened by dropping a wire: connect the new node to this socket */
  from?: { node: string; handle: string; kind: 'source' | 'target' };
}

interface HistEntry {
  doc: SdfDoc;
  selection: string[];
}

export interface EditorState {
  doc: SdfDoc;
  past: HistEntry[];
  future: HistEntry[];
  mergeKey: string | null;
  mergeTime: number;
  selection: string[];
  /** the group whose card was selected (its members are the selection) */
  activeGroup: string | null;
  viewRoot: string | null;
  viewMode: ViewMode;
  grid: boolean;
  theme: ThemePref;
  camera: OrbitCamera;
  /** bump to request "frame the shape" */
  frameRequest: number;
  /** animated Controls are playing in the viewport */
  playing: boolean;
  /** what the 3D gizmo does to the selected shape */
  gizmoMode: 'move' | 'rotate' | 'scale';
  /** measure tool: picked points (world), or null when the tool is off */
  measure: [number, number, number][] | null;
  /** view-only section cut (null = off) */
  section: SectionState | null;
  narrowTab: NarrowTab;
  dialog: DialogId;
  palette: boolean;
  addMenu: AddMenuState | null;
  toasts: Toast[];
  tour: number | null;
  /** remembered between sessions */
  tourDone: boolean;
  addMode: ops.AddMode;
  /** set when a shared link or example replaced the user's previous work */
  restorable: SdfDoc | null;
}

const PREFS_KEY = 'sdf-forge:prefs';
const DOC_KEY = 'sdf-forge:doc';

function loadPrefs(): Partial<EditorState> {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      theme: ['system', 'dark', 'light'].includes(p.theme) ? p.theme : 'system',
      grid: p.grid !== false,
      tourDone: !!p.tourDone,
    };
  } catch {
    return {};
  }
}

export function loadSavedDoc(): SdfDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY);
    return raw ? normalizeDoc(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export const store = createStore<EditorState>(() => ({
  doc: emptyDoc(),
  past: [],
  future: [],
  mergeKey: null,
  mergeTime: 0,
  selection: [],
  activeGroup: null,
  viewRoot: null,
  viewMode: 'shaded',
  grid: true,
  theme: 'system',
  camera: defaultCamera(),
  frameRequest: 0,
  playing: false,
  gizmoMode: 'move',
  measure: null,
  section: null,
  narrowTab: 'graph',
  dialog: null,
  palette: false,
  addMenu: null,
  toasts: [],
  tour: null,
  tourDone: false,
  addMode: 'add',
  restorable: null,
  ...loadPrefs(),
}));

export function useEditor<T>(sel: (s: EditorState) => T): T {
  return useStore(store, sel);
}

const get = () => store.getState();
const set = (p: Partial<EditorState>) => store.setState(p);

// ---------------------------------------------------------------------------
// persistence

let saveTimer = 0;
store.subscribe((s, prev) => {
  if (s.doc !== prev.doc) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(DOC_KEY, JSON.stringify(s.doc));
      } catch {
        /* storage full or disabled: ignore */
      }
    }, 300);
  }
  if (s.theme !== prev.theme || s.grid !== prev.grid || s.tourDone !== prev.tourDone) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: s.theme, grid: s.grid, tourDone: s.tourDone }));
    } catch {
      /* ignore */
    }
  }
});

// ---------------------------------------------------------------------------
// history

const MAX_HISTORY = 200;
const MERGE_MS = 1200;
/** While a pointer gesture is held, its changes merge however slowly they arrive. */
let gestureActive = false;

/**
 * Apply a new document. Changes with the same `merge` key within a short time
 * collapse into one undo step (slider drags, node drags).
 */
export function commit(doc: SdfDoc, opts: { merge?: string; selection?: string[] } = {}) {
  const s = get();
  if (doc === s.doc) return;
  const now = performance.now();
  const merging =
    !!opts.merge && opts.merge === s.mergeKey && (gestureActive || now - s.mergeTime < MERGE_MS);
  const past = merging ? s.past : [...s.past, { doc: s.doc, selection: s.selection }].slice(-MAX_HISTORY);
  // drop selection of deleted nodes
  const ids = new Set(doc.nodes.map((n) => n.id));
  const selection = (opts.selection ?? s.selection).filter((id) => ids.has(id));
  set({
    doc,
    past,
    future: [],
    mergeKey: opts.merge ?? null,
    mergeTime: now,
    selection,
    viewRoot: s.viewRoot && ids.has(s.viewRoot) ? s.viewRoot : null,
  });
}

/**
 * A pointer gesture (drag) starts: everything until endMerge() with the same
 * merge key is one undo step, even if the machine or the user is slow.
 */
export function beginGesture() {
  gestureActive = true;
}

/** End a merge group (e.g. on pointer up) so the next change is a new undo step. */
export function endMerge() {
  gestureActive = false;
  set({ mergeKey: null });
}

export function undo() {
  const s = get();
  const prev = s.past[s.past.length - 1];
  if (!prev) return;
  set({
    doc: prev.doc,
    selection: prev.selection,
    past: s.past.slice(0, -1),
    future: [{ doc: s.doc, selection: s.selection }, ...s.future],
    mergeKey: null,
  });
}

export function redo() {
  const s = get();
  const next = s.future[0];
  if (!next) return;
  set({
    doc: next.doc,
    selection: next.selection,
    future: s.future.slice(1),
    past: [...s.past, { doc: s.doc, selection: s.selection }],
    mergeKey: null,
  });
}

/** Replace the whole document (new file, open example, shared link). */
export function loadDoc(doc: SdfDoc, opts: { keepHistory?: boolean; rememberPrevious?: boolean } = {}) {
  const s = get();
  const normalized = normalizeDoc(doc);
  set({
    doc: normalized,
    past: opts.keepHistory ? [...s.past, { doc: s.doc, selection: s.selection }] : [],
    future: [],
    selection: [],
    viewRoot: null,
    mergeKey: null,
    frameRequest: s.frameRequest + 1,
    playing: false,
    section: null,
    measure: null,
    restorable: opts.rememberPrevious && s.doc.nodes.length > 1 ? s.doc : null,
  });
}

// ---------------------------------------------------------------------------
// UI helpers

let toastId = 0;
export function toast(message: string, kind: Toast['kind'] = 'info', ms = 3500) {
  const id = ++toastId;
  set({ toasts: [...get().toasts, { id, message, kind }].slice(-4) });
  window.setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms);
}

export function select(ids: string[]) {
  const s = get();
  if (ids.length === s.selection.length && ids.every((id, i) => id === s.selection[i]) && !s.activeGroup)
    return;
  set({ selection: ids, activeGroup: null });
}

// ---------------------------------------------------------------------------
// editing actions (each is one undo step unless merged)

export function setParam(nodeId: string, key: string, value: ParamValue, merge = true) {
  const cur = get().doc.nodes.find((n) => n.id === nodeId)?.params[key];
  if (JSON.stringify(cur) === JSON.stringify(value)) return;
  commit(ops.setParam(get().doc, nodeId, key, value), { merge: merge ? `p:${nodeId}:${key}` : undefined });
}

export function setParams(nodeId: string, values: Record<string, ParamValue>, merge?: string) {
  let doc = get().doc;
  for (const [k, v] of Object.entries(values)) doc = ops.setParam(doc, nodeId, k, v);
  commit(doc, { merge });
}

export function rename(nodeId: string, name: string) {
  commit(ops.renameNode(get().doc, nodeId, name));
}

export function setTitle(title: string) {
  const t = title.trim().slice(0, 80) || 'Untitled shape';
  commit({ ...get().doc, title: t }, { merge: 'title' });
}

export function setSettings(p: Partial<SdfDoc['settings']>) {
  const doc = get().doc;
  commit({ ...doc, settings: { ...doc.settings, ...p } }, { merge: 'settings' });
}

export function connectNodes(source: string, target: string, input: string): boolean {
  try {
    commit(ops.connect(get().doc, source, target, input));
    return true;
  } catch (e) {
    toast((e as Error).message, 'error');
    return false;
  }
}

export function removeEdges(ids: string[]) {
  if (ids.length) commit(ops.disconnect(get().doc, ids));
}

export function deleteNodes(ids: string[]) {
  const doc = get().doc;
  const deletable = ids.filter((id) => doc.nodes.find((n) => n.id === id)?.type !== 'output');
  if (!deletable.length) {
    if (ids.length) toast('The Output node can’t be deleted.', 'info');
    return;
  }
  commit(ops.removeNodes(doc, deletable), { selection: [] });
}

export function duplicate(ids: string[]) {
  const { doc, map } = ops.duplicateNodes(get().doc, ids);
  commit(doc, { selection: Object.values(map) });
}

export function moveNodes(moves: Record<string, { x: number; y: number }>) {
  commit(ops.moveNodes(get().doc, moves), { merge: `move:${Object.keys(moves).sort().join(',')}` });
}

export function tidy() {
  commit(applyLayout(get().doc));
}

/** Toolbar "add shape": wires the shape in and selects it. */
export function addShape(type: string, bounds: AABB | null, params?: Record<string, ParamValue>) {
  const s = get();
  const wasTidy = isTidy(s.doc);
  const r = ops.addShapeToScene(s.doc, type, { mode: s.addMode, bounds, params });
  const doc = wasTidy ? applyLayout(r.doc) : r.doc;
  commit(doc, { selection: [r.nodeId] });
  set({ narrowTab: 'props' });
  return r.nodeId;
}

/** Add a node at a graph position, optionally connected to a dragged socket. */
export function addNodeAt(type: string, x: number, y: number, from?: AddMenuState['from']) {
  let doc = get().doc;
  const node = ops.addNode(doc, makeNodeOfType(type, x, y));
  const id = node.nodes[node.nodes.length - 1].id;
  doc = node;
  if (from) {
    try {
      if (from.kind === 'source') {
        const inp = firstCompatibleInput(doc, from.node, id);
        if (inp) doc = ops.connect(doc, from.node, id, inp);
      } else {
        doc = ops.connect(doc, id, from.node, from.handle);
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  commit(doc, { selection: [id] });
  return id;
}

function makeNodeOfType(type: string, x: number, y: number) {
  const n = makeNode(type, x, y);
  const def = getDef(type);
  if (def?.colored) n.params.color = ops.nextColor(get().doc);
  return n;
}

function firstCompatibleInput(doc: SdfDoc, source: string, target: string): string | null {
  const def = getDef(doc.nodes.find((n) => n.id === target)!.type);
  for (const inp of def?.inputs ?? []) if (canConnect(doc, source, target, inp.key).ok) return inp.key;
  return null;
}

export function insertModifier(nodeId: string, type: string) {
  const r = ops.insertAfter(get().doc, nodeId, type);
  if (!r) {
    toast(`Can’t add ${getDef(type)?.label ?? type} here.`, 'error');
    return;
  }
  const doc = isTidy(get().doc) ? applyLayout(r.doc) : r.doc;
  commit(doc, { selection: [r.nodeId] });
}

export function togglePin(node: string, param: string) {
  commit(ops.togglePin(get().doc, node, param));
}

export function setPinLabel(node: string, param: string, label: string) {
  const doc = get().doc;
  commit(
    {
      ...doc,
      pinned: doc.pinned.map((p) =>
        p.node === node && p.param === param ? { ...p, label: label.trim() || undefined } : p,
      ),
    },
    { merge: `pinlabel:${node}:${param}` },
  );
}

/** Set or clear the animation of a pinned Control (one undo step per change). */
export function setPinAnim(node: string, param: string, anim: PinAnim | null, merge?: string) {
  const doc = get().doc;
  const pinned: SdfDoc['pinned'] = doc.pinned.map((p) => {
    if (p.node !== node || p.param !== param) return p;
    const next = { ...p };
    if (anim) next.anim = anim;
    else delete next.anim;
    return next;
  });
  commit({ ...doc, pinned }, { merge });
  if (!pinned.some((p) => p.anim)) set({ playing: false });
}

export function setPlaying(playing: boolean) {
  set({ playing: playing && get().doc.pinned.some((p) => p.anim) });
}

export function newDocument() {
  loadDoc(emptyDoc(), { keepHistory: true });
}

export const actions = { set, get };

// ---------------------------------------------------------------------------
// copy / paste (internal clipboard, mirrored to the system clipboard as JSON)

interface Clip {
  kind: 'sdf-forge-nodes';
  nodes: SdfDoc['nodes'];
  edges: SdfDoc['edges'];
}
let clip: Clip | null = null;

export function copyNodes(ids: string[]): boolean {
  const doc = get().doc;
  const set = new Set(ids);
  const nodes = doc.nodes.filter((n) => set.has(n.id) && n.type !== 'output');
  if (!nodes.length) return false;
  const keep = new Set(nodes.map((n) => n.id));
  clip = {
    kind: 'sdf-forge-nodes',
    nodes: structuredClone(nodes),
    edges: doc.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
  navigator.clipboard?.writeText(JSON.stringify(clip)).catch(() => {});
  toast(`Copied ${nodes.length} node${nodes.length > 1 ? 's' : ''}`, 'info', 1500);
  return true;
}

export async function pasteNodes() {
  let c = clip;
  try {
    const text = await navigator.clipboard?.readText();
    const parsed = text ? JSON.parse(text) : null;
    if (parsed?.kind === 'sdf-forge-nodes') c = parsed;
  } catch {
    /* clipboard unavailable or not ours: use the internal copy */
  }
  if (!c) return;
  const tmp = normalizeDoc({ ...emptyDoc(), nodes: [...emptyDoc().nodes, ...c.nodes], edges: c.edges });
  const pasted = tmp.nodes.filter((n) => n.type !== 'output');
  const map: Record<string, string> = {};
  const doc = get().doc;
  const nodes = pasted.map((n) => {
    const id = makeNode(n.type).id;
    map[n.id] = id;
    return { ...n, id, x: n.x + 60, y: n.y + 80 };
  });
  const edges = tmp.edges
    .filter((e) => map[e.source] && map[e.target])
    .map((e, i) => ({
      ...e,
      id: `p${Date.now().toString(36)}${i}`,
      source: map[e.source],
      target: map[e.target],
    }));
  commit(
    { ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...edges] },
    { selection: nodes.map((n) => n.id) },
  );
}
