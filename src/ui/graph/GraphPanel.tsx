import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { LayoutGrid, Maximize, Plus } from 'lucide-react';
import { NodeView, type SdfFlowNode } from './NodeView';
import { GroupCard, GroupFrame, type GroupCardNode, type GroupFrameNode } from './GroupView';
import { groupIdOf, groupView, isGroupNodeId, realEnd } from './groupLayout';
import { moveGroupBy, selectGroup } from '../../state/groups';
import { groupsOf } from '../../core/graph/groups';
import { AddNodeMenu } from './AddNodeMenu';
import { nodeSummary } from './summary';
import {
  actions,
  connectNodes,
  deleteNodes,
  beginGesture,
  endMerge,
  moveNodes,
  removeEdges,
  select,
  store,
  tidy,
  useEditor,
} from '../../state/store';
import { canConnect, resolveDims } from '../../core/graph/doc';
import { getDef } from '../../core/nodes/registry';
import { getScene } from '../../state/scene';
import { useResolvedTheme } from '../theme';

const nodeTypes = { sdf: NodeView, groupCard: GroupCard, groupFrame: GroupFrame };
type FlowNode = SdfFlowNode | GroupCardNode | GroupFrameNode;

function Flow() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const viewRoot = useEditor((s) => s.viewRoot);
  const activeGroup = useEditor((s) => s.activeGroup);
  const frameRequest = useEditor((s) => s.frameRequest);
  const issues = useEditor((s) => getScene(s.doc, s.viewRoot, s.selection[0] ?? null).compiled.issues);
  const theme = useResolvedTheme();
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);

  const view = useMemo(() => {
    const dims = resolveDims(doc);
    const reach = new Set<string>();
    const out = doc.nodes.find((n) => n.type === 'output');
    const stack = out ? [out.id] : [];
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      for (const e of doc.edges) if (e.target === id) stack.push(e.source);
    }
    return groupView(doc, dims, reach, activeGroup);
  }, [doc, activeGroup]);

  const sdfNodes: SdfFlowNode[] = useMemo(() => {
    const dims = resolveDims(doc);
    const connected = new Set(doc.edges.flatMap((e) => [`${e.target}:${e.input}`, `${e.source}:out`]));
    const reach = new Set<string>();
    const out = doc.nodes.find((n) => n.type === 'output');
    const stack = out ? [out.id] : [];
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      for (const e of doc.edges) if (e.target === id) stack.push(e.source);
    }
    return doc.nodes
      .filter((n) => !view.hidden.has(n.id))
      .map((n) => {
        const def = getDef(n.type)!;
        const nd: Record<string, 2 | 3 | null> = { out: dims.get(n.id) ?? null };
        for (const inp of def.inputs) {
          const e = doc.edges.find((x) => x.target === n.id && x.input === inp.key);
          nd[inp.key] =
            inp.type === 'sdf2'
              ? 2
              : inp.type === 'sdf3'
                ? 3
                : e
                  ? (dims.get(e.source) ?? null)
                  : (dims.get(n.id) ?? null);
        }
        const err = issues.find((i) => i.node === n.id && i.level === 'error');
        return {
          id: n.id,
          type: 'sdf' as const,
          position: { x: n.x, y: n.y },
          selected: selection.includes(n.id),
          deletable: n.type !== 'output',
          ariaLabel: `${n.name ?? def.label} node`,
          data: {
            type: n.type,
            title: n.name ?? def.label,
            summary: nodeSummary(n, doc.settings.mmPerUnit),
            dims: nd,
            connected: Object.fromEntries([
              ...def.inputs.map((i) => [i.key, connected.has(`${n.id}:${i.key}`)]),
              ['out', connected.has(`${n.id}:out`)],
            ]),
            error: err?.message,
            viewing: viewRoot === n.id,
            dimmed: !reach.has(n.id),
          },
        };
      });
  }, [doc, selection, viewRoot, issues, view]);

  // frames first so they sit behind the nodes they enclose
  const nodes: FlowNode[] = useMemo(() => [...view.frames, ...sdfNodes, ...view.cards], [view, sdfNodes]);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  positions.current = new Map(nodes.map((n) => [n.id, n.position]));

  const edges: Edge[] = useMemo(
    () =>
      doc.edges.flatMap((e) => {
        const r = view.route(e);
        return r ? [{ id: e.id, ...r, ariaLabel: 'Connection' }] : [];
      }),
    [doc.edges, view],
  );

  // fit the graph when a document is loaded
  useEffect(() => {
    const t = setTimeout(
      () =>
        rf.fitView({
          padding: { top: 0.28, left: 0.08, right: 0.08, bottom: 0.12 },
          maxZoom: 1,
          duration: 0,
        }),
      30,
    );
    return () => clearTimeout(t);
  }, [frameRequest, rf]);

  const onNodesChange = useCallback((changes: Iterable<NodeChange<FlowNode>>) => {
    const moves: Record<string, { x: number; y: number }> = {};
    let selChanged = false;
    const st = store.getState();
    // picking a node while a group card is active replaces the group's selection
    const sel = new Set(st.activeGroup ? [] : st.selection);
    const removed: string[] = [];
    let pickedGroup: string | null = null;
    for (const c of changes) {
      if ('id' in c && isGroupNodeId(c.id)) {
        const gid = groupIdOf(c.id);
        if (c.type === 'position' && c.position) {
          const old = positions.current.get(c.id);
          if (old) moveGroupBy(gid, Math.round(c.position.x - old.x), Math.round(c.position.y - old.y));
        } else if (c.type === 'select' && c.selected) pickedGroup = gid;
        else if (c.type === 'remove')
          removed.push(...(groupsOf(store.getState().doc).find((g) => g.id === gid)?.members ?? []));
        continue;
      }
      if (c.type === 'position' && c.position)
        moves[c.id] = { x: Math.round(c.position.x), y: Math.round(c.position.y) };
      else if (c.type === 'select') {
        selChanged = true;
        if (c.selected) sel.add(c.id);
        else sel.delete(c.id);
      } else if (c.type === 'remove') removed.push(c.id);
    }
    if (Object.keys(moves).length) moveNodes(moves);
    if (pickedGroup) selectGroup(pickedGroup);
    else if (selChanged) select([...sel]);
    if (removed.length) deleteNodes(removed);
  }, []);

  const onEdgesChange = useCallback((changes: Iterable<EdgeChange>) => {
    const removed = [...changes].filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) removeEdges(removed);
  }, []);

  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (!c.source || !c.target || !c.targetHandle) return false;
    const s = realEnd(c.source, c.sourceHandle);
    const t = realEnd(c.target, c.targetHandle);
    return canConnect(store.getState().doc, s.node, t.node, t.handle).ok;
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || !c.targetHandle) return;
    const s = realEnd(c.source, c.sourceHandle);
    const t = realEnd(c.target, c.targetHandle);
    connectNodes(s.node, t.node, t.handle);
  }, []);

  const openAddMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      from?: { node: string; handle: string; kind: 'source' | 'target' },
    ) => {
      const p = rf.screenToFlowPosition({ x: clientX, y: clientY });
      actions.set({
        addMenu: { x: clientX, y: clientY, flowX: Math.round(p.x), flowY: Math.round(p.y), from },
      });
    },
    [rf],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || state.toNode || !state.fromNode || !state.fromHandle) return;
      const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
      const kind = state.fromHandle.type;
      const end = realEnd(state.fromNode.id, state.fromHandle.id);
      openAddMenu(pt.clientX, pt.clientY, { node: end.node, handle: end.handle, kind });
    },
    [openAddMenu],
  );

  // drag an edge's end away and drop it on empty space: disconnect
  const onReconnect = useCallback((old: Edge, c: Connection) => {
    const s = store.getState();
    if (!c.source || !c.target || !c.targetHandle) return;
    const src = realEnd(c.source, c.sourceHandle);
    const tgt = realEnd(c.target, c.targetHandle);
    const without = { ...s.doc, edges: s.doc.edges.filter((e) => e.id !== old.id) };
    if (!canConnect(without, src.node, tgt.node, tgt.handle).ok) return;
    removeEdges([old.id]);
    connectNodes(src.node, tgt.node, tgt.handle);
  }, []);
  const onReconnectEnd = useCallback(
    (_e: MouseEvent | TouchEvent, edge: Edge, _h: unknown, state: FinalConnectionState) => {
      if (!state.isValid && !state.toNode) removeEdges([edge.id]);
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (
      (e.key === 'a' || e.key === 'A') &&
      !e.ctrlKey &&
      !e.metaKey &&
      !(e.target as HTMLElement).matches('input,textarea,select')
    ) {
      e.preventDefault();
      const r = wrap.current!.getBoundingClientRect();
      openAddMenu(r.left + r.width / 2, r.top + r.height / 3);
    }
  };

  return (
    <div
      className="graph-panel"
      ref={wrap}
      onKeyDown={onKeyDown}
      data-tour="graph"
      aria-label="Node graph"
      role="region"
    >
      <div className="graph-toolbar">
        <div className="toolbar" role="toolbar" aria-label="Graph">
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const r = wrap.current!.getBoundingClientRect();
              openAddMenu(r.left + 60, r.top + 44);
            }}
            title="Add a node (A)"
            data-testid="graph-add"
          >
            <Plus size={14} /> Node
          </button>
          <button type="button" className="btn sm" onClick={tidy} title="Arrange nodes neatly">
            <LayoutGrid size={14} /> <span className="hide-sm">Tidy</span>
          </button>
          <button
            type="button"
            className="btn sm icon"
            onClick={() => rf.fitView({ padding: 0.18, maxZoom: 1.1, duration: 200 })}
            title="Fit graph to view"
            aria-label="Fit graph to view"
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>
      <ReactFlow<FlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        forceColorMode={theme}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        edgesReconnectable
        isValidConnection={isValidConnection}
        onNodeDragStart={() => beginGesture()}
        onNodeDragStop={() => endMerge()}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          openAddMenu(e.clientX, e.clientY);
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('react-flow__pane'))
            openAddMenu(e.clientX, e.clientY);
        }}
        onPaneClick={() => select([])}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'default' }}
        ariaLabelConfig={{
          'node.a11yDescription.default':
            'Press Enter or Space to select. Arrow keys move the node. Delete removes it.',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--grid-dot)" />
      </ReactFlow>
      <div className="graph-help hide-sm" aria-hidden="true">
        Drag from a dot to connect · Right-click or A to add · Del to delete
      </div>
      <AddNodeMenu />
    </div>
  );
}

export function GraphPanel() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
