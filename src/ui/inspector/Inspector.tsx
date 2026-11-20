import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Group,
  HelpCircle,
  Plus,
  Trash2,
  Unlink,
} from 'lucide-react';
import { getDef, paramsOf } from '../../core/nodes/registry';
import type { ParamDef } from '../../core/nodes/types';
import { canConnect, inputEdges } from '../../core/graph/doc';
import {
  actions,
  connectNodes,
  deleteNodes,
  duplicate,
  endMerge,
  insertModifier,
  removeEdges,
  rename,
  select,
  setParam,
  togglePin,
  useEditor,
} from '../../state/store';
import { getScene } from '../../state/scene';
import { CommitInput, ParamField } from '../fields';
import { NodeIcon } from '../meta';
import { DocPanel } from './DocPanel';
import { GroupPanel } from './GroupPanel';
import { groupOfNode, groupsOf } from '../../core/graph/groups';
import { groupSelection, selectGroup } from '../../state/groups';

const QUICK_MODIFIERS = [
  'twist',
  'bend',
  'repeat',
  'radial',
  'mirror',
  'shell',
  'round',
  'displace',
  'lattice',
  'cut',
  'transform',
];

export function Inspector() {
  const sel = useEditor((s) => (s.selection.length === 1 ? s.selection[0] : null));
  const multi = useEditor((s) => s.selection.length > 1);
  const group = useEditor((s) =>
    s.activeGroup && groupsOf(s.doc).some((g) => g.id === s.activeGroup) ? s.activeGroup : null,
  );
  if (group) return <GroupPanel key={group} id={group} />;
  if (multi) return <MultiPanel />;
  if (!sel) return <DocPanel />;
  return <NodePanel key={sel} id={sel} />;
}

function MultiPanel() {
  const ids = useEditor((s) => s.selection);
  return (
    <div className="inspector" aria-label="Properties">
      <div className="insp-section">
        <h3>{ids.length} nodes selected</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn" onClick={() => duplicate(ids)}>
            <Copy size={14} /> Duplicate
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => groupSelection()}
            title="Collapse these nodes into one card with its own settings (Ctrl+G)"
          >
            <Group size={14} /> Group
          </button>
          <button type="button" className="btn danger" onClick={() => deleteNodes(ids)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function NodePanel({ id }: { id: string }) {
  const node = useEditor((s) => s.doc.nodes.find((n) => n.id === id));
  const doc = useEditor((s) => s.doc);
  const viewRoot = useEditor((s) => s.viewRoot);
  const allIssues = useEditor((s) => getScene(s.doc, s.viewRoot, s.selection[0] ?? null).compiled.issues);
  const issues = useMemo(() => allIssues.filter((i) => i.node === id), [allIssues, id]);
  const [showHelp, setShowHelp] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main: true,
    transform: true,
    look: true,
  });
  const def = node ? getDef(node.type) : undefined;
  const params = useMemo(() => (node ? paramsOf(node.type) : []), [node]);
  if (!node || !def) return <DocPanel />;
  const mm = doc.settings.mmPerUnit;
  const inGroup = groupOfNode(doc, id);
  const pinned = new Set(doc.pinned.filter((p) => p.node === id).map((p) => p.param));
  const groups: { key: string; title: string; items: ParamDef[] }[] = [
    { key: 'main', title: 'Shape', items: params.filter((p) => !p.group || p.group === 'main') },
    { key: 'transform', title: 'Placement', items: params.filter((p) => p.group === 'transform') },
    { key: 'look', title: 'Look', items: params.filter((p) => p.group === 'look') },
  ].filter((g) => g.items.length);

  return (
    <div className="inspector" aria-label={`Properties of ${node.name ?? def.label}`} data-testid="inspector">
      {doc.pinned.length > 0 && (
        <button type="button" className="btn sm ghost back-link" onClick={() => select([])}>
          ← Shape overview and Controls
        </button>
      )}
      {inGroup && (
        <button type="button" className="btn sm ghost back-link" onClick={() => selectGroup(inGroup.id)}>
          <Group size={13} /> Part of group “{inGroup.name}”
        </button>
      )}
      <div className="insp-head">
        <NodeIcon type={node.type} category={def.category} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommitInput
            className="name-input"
            label="Node name"
            value={node.name ?? def.label}
            onCommit={(v) => rename(id, v === def.label ? '' : v)}
          />
          <div className="insp-type">
            {def.label}
            {def.exactness !== 'exact' ? ' · approximate distance' : ''}
          </div>
        </div>
        {def.output && (
          <button
            type="button"
            className="btn icon ghost"
            aria-pressed={viewRoot === id}
            title={viewRoot === id ? 'Show the whole shape' : 'View only this node'}
            aria-label={viewRoot === id ? 'Show the whole shape' : 'View only this node'}
            onClick={() => actions.set({ viewRoot: viewRoot === id ? null : id })}
          >
            <Eye size={16} />
          </button>
        )}
        {node.type !== 'output' && (
          <>
            <button
              type="button"
              className="btn icon ghost"
              title="Duplicate (Ctrl+D)"
              aria-label="Duplicate node"
              onClick={() => duplicate([id])}
            >
              <Copy size={16} />
            </button>
            <button
              type="button"
              className="btn icon ghost danger"
              title="Delete (Del)"
              aria-label="Delete node"
              onClick={() => deleteNodes([id])}
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      <div className="insp-section">
        {issues.map((i, k) => (
          <div className="issue" key={k} role="alert">
            <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span>{i.message}</span>
          </div>
        ))}
        <h3>
          <HelpCircle size={13} /> What it does
          <button
            type="button"
            className="btn sm ghost"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((v) => !v)}
          >
            {showHelp ? 'Hide' : 'Explain'}
          </button>
        </h3>
        <p className="explain">{def.summary}</p>
        {showHelp && (
          <>
            <p className="explain">{def.help}</p>
            {def.credit && <div className="credit">Formula: {def.credit}</div>}
          </>
        )}
      </div>

      {groups.map((g) => (
        <div className="insp-section" key={g.key}>
          <h3>
            <button
              type="button"
              className="btn sm ghost"
              style={{ marginLeft: -8 }}
              aria-expanded={openGroups[g.key] !== false}
              onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: o[g.key] === false }))}
            >
              {openGroups[g.key] !== false ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {g.title}
            </button>
          </h3>
          {openGroups[g.key] !== false &&
            g.items
              .filter((p) => !p.visibleIf || p.visibleIf(node.params))
              .map((p) => (
                <ParamField
                  key={p.key}
                  def={p}
                  value={node.params[p.key]}
                  mmPerUnit={mm}
                  onChange={(v) => setParam(id, p.key, v)}
                  onCommit={endMerge}
                  pinned={pinned.has(p.key)}
                  onTogglePin={() => togglePin(id, p.key)}
                />
              ))}
        </div>
      ))}

      <BlendSection id={id} />

      {def.inputs.length > 0 && <InputsSection id={id} />}

      {def.output === 'sdf3' || def.output === 'sdf' ? (
        <div className="insp-section">
          <h3>Modify this</h3>
          <div className="chips">
            {QUICK_MODIFIERS.filter((t) => t !== node.type)
              .slice(0, 8)
              .map((t) => {
                const d = getDef(t)!;
                return (
                  <button
                    key={t}
                    type="button"
                    className="chip"
                    onClick={() => insertModifier(id, t)}
                    title={d.summary}
                  >
                    <Plus size={12} /> {d.label}
                  </button>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const COMBINE_VERB: Record<string, string> = {
  union: 'Blend with the other shapes',
  subtract: 'Soften the carved edge',
  intersect: 'Soften the overlap edge',
};

/**
 * Beginners think "this shape should melt into the others", not "edit the
 * Union node". Show the smoothness of the combine node this shape feeds.
 */
function BlendSection({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const edge = doc.edges.find((e) => e.source === id);
  const parent = edge ? doc.nodes.find((n) => n.id === edge.target) : undefined;
  if (!parent || !COMBINE_VERB[parent.type]) return null;
  const def = paramsOf(parent.type).find((p) => p.key === 'smooth')!;
  return (
    <div className="insp-section">
      <h3>
        Blending
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => select([parent.id])}
          title="Edit the combining node"
        >
          {parent.name ?? getDef(parent.type)!.label} →
        </button>
      </h3>
      <ParamField
        def={def}
        label={COMBINE_VERB[parent.type]}
        value={parent.params.smooth}
        mmPerUnit={doc.settings.mmPerUnit}
        onChange={(v) => setParam(parent.id, 'smooth', v)}
        onCommit={endMerge}
      />
      <p className="explain" style={{ fontSize: 12 }}>
        This setting belongs to the {getDef(parent.type)!.label} node, so it affects every shape joined there.
      </p>
    </div>
  );
}

/** Keyboard-friendly wiring: pick what feeds each input from a list. */
function InputsSection({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const node = doc.nodes.find((n) => n.id === id)!;
  const def = getDef(node.type)!;
  const label = (nid: string) => {
    const n = doc.nodes.find((x) => x.id === nid);
    return n ? (n.name ?? getDef(n.type)?.label ?? nid) : nid;
  };
  return (
    <div className="insp-section">
      <h3>Inputs</h3>
      {def.inputs.map((inp) => {
        const edges = inputEdges(doc, id, inp.key);
        const candidates = doc.nodes.filter((n) => n.id !== id && canConnect(doc, n.id, id, inp.key).ok);
        return (
          <div key={inp.key} style={{ marginBottom: 8 }}>
            <div className="field-label" style={{ marginBottom: 4 }}>
              {inp.label}
              {inp.multi ? ' (any number)' : ''}
            </div>
            {edges.map((e) => (
              <div className="link-row" key={e.id}>
                <button
                  type="button"
                  className="btn sm"
                  style={{ flex: 1, justifyContent: 'flex-start' }}
                  onClick={() => select([e.source])}
                >
                  {label(e.source)}
                </button>
                <button
                  type="button"
                  className="btn sm icon"
                  aria-label={`Disconnect ${label(e.source)}`}
                  title="Disconnect"
                  onClick={() => removeEdges([e.id])}
                >
                  <Unlink size={13} />
                </button>
              </div>
            ))}
            {(inp.multi || edges.length === 0) && candidates.length > 0 && (
              <div className="link-row">
                <select
                  className="select"
                  aria-label={`Connect a node to ${inp.label}`}
                  value=""
                  onChange={(e) => e.target.value && connectNodes(e.target.value, id, inp.key)}
                >
                  <option value="">{edges.length ? 'Add another…' : 'Connect…'}</option>
                  {candidates
                    .filter((c) => !edges.some((e) => e.source === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {label(c.id)}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {edges.length === 0 && candidates.length === 0 && (
              <div className="muted">Nothing suitable to connect yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
