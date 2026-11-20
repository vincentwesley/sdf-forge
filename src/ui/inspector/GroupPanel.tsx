import { useMemo } from 'react';
import { BookmarkPlus, Copy, ChevronDown, ChevronRight, Group, Trash2, Ungroup, X } from 'lucide-react';
import { getDef, paramsOf } from '../../core/nodes/registry';
import {
  MAX_GROUP_SETTINGS,
  groupInputs,
  groupOutputs,
  groupsOf,
  isExposable,
} from '../../core/graph/groups';
import { deleteNodes, endMerge, select, setParam, useEditor } from '../../state/store';
import {
  duplicateGroup,
  exposeSetting,
  labelSetting,
  renameGroup,
  savePart,
  setGroupCollapsed,
  unexposeSetting,
  ungroupSelection,
} from '../../state/groups';
import { CommitInput, ParamField } from '../fields';
import { NodeIcon } from '../meta';

/** Properties of a selected group: name, its settings, inputs/outputs and members. */
export function GroupPanel({ id }: { id: string }) {
  const doc = useEditor((s) => s.doc);
  const g = groupsOf(doc).find((x) => x.id === id);
  const choices = useMemo(() => {
    if (!g) return [];
    const out: { value: string; label: string }[] = [];
    for (const m of g.members) {
      const n = doc.nodes.find((x) => x.id === m);
      if (!n) continue;
      const name = n.name ?? getDef(n.type)?.label ?? n.type;
      for (const p of paramsOf(n.type)) {
        if (!isExposable(doc, { node: m, param: p.key })) continue;
        if (g.exposed.some((s) => s.node === m && s.param === p.key)) continue;
        out.push({ value: `${m}|${p.key}`, label: `${name} · ${p.label}` });
      }
    }
    return out;
  }, [doc, g]);
  if (!g) return null;
  const mm = doc.settings.mmPerUnit;
  const ins = groupInputs(doc, g);
  const outs = groupOutputs(doc, g);
  const label = (nid: string) => {
    const n = doc.nodes.find((x) => x.id === nid);
    return n ? (n.name ?? getDef(n.type)?.label ?? n.type) : nid;
  };

  return (
    <div className="inspector" aria-label={`Properties of group ${g.name}`} data-testid="group-panel">
      <div className="insp-head">
        <span className="node-icon group-icon" aria-hidden="true">
          <Group size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommitInput
            className="name-input"
            label="Group name"
            value={g.name}
            onCommit={(v) => renameGroup(id, v)}
          />
          <div className="insp-type">
            Group · {g.members.length} node{g.members.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          type="button"
          className="btn icon ghost"
          aria-pressed={g.collapsed}
          title={g.collapsed ? 'Show the nodes inside' : 'Collapse into one card'}
          aria-label={g.collapsed ? 'Expand group' : 'Collapse group'}
          onClick={() => setGroupCollapsed(id, !g.collapsed)}
        >
          {g.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          type="button"
          className="btn icon ghost danger"
          title="Delete the group and its nodes (Del)"
          aria-label="Delete group and its nodes"
          onClick={() => deleteNodes(g.members)}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="insp-section">
        <h3>Settings</h3>
        {g.exposed.length === 0 && (
          <p className="explain">
            Show the settings people should change here, like a mini template. They also appear on the group’s
            card.
          </p>
        )}
        {g.exposed.map((s) => {
          const n = doc.nodes.find((x) => x.id === s.node);
          const def = n && paramsOf(n.type).find((p) => p.key === s.param);
          if (!n || !def) return null;
          return (
            <div className="group-setting" key={`${s.node}|${s.param}`}>
              <ParamField
                def={def}
                value={n.params[s.param]}
                mmPerUnit={mm}
                label={s.label ?? def.label}
                onChange={(v) => setParam(n.id, s.param, v)}
                onCommit={endMerge}
              />
              <details className="pin-detail">
                <summary>from {label(n.id)} · rename</summary>
                <CommitInput
                  className="text-input"
                  label={`Label for ${s.label ?? def.label}`}
                  value={s.label ?? def.label}
                  onCommit={(v) => labelSetting(id, s.node, s.param, v === def.label ? '' : v)}
                />
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => unexposeSetting(id, s.node, s.param)}
                  aria-label={`Remove ${s.label ?? def.label} from the group's settings`}
                >
                  <X size={13} /> Remove from group
                </button>
              </details>
            </div>
          );
        })}
        {choices.length > 0 && g.exposed.length < MAX_GROUP_SETTINGS && (
          <div className="link-row">
            <select
              className="select"
              aria-label="Show a setting on the group"
              value=""
              onChange={(e) => {
                const [node, param] = e.target.value.split('|');
                if (node && param) exposeSetting(id, node, param);
              }}
            >
              <option value="">Add a setting…</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="insp-section">
        <h3>Inside</h3>
        <ul className="group-members">
          {g.members.map((m) => {
            const n = doc.nodes.find((x) => x.id === m);
            const def = n && getDef(n.type);
            if (!n || !def) return null;
            return (
              <li key={m}>
                <button type="button" className="btn sm ghost" onClick={() => select([m])}>
                  <NodeIcon type={n.type} category={def.category} size={13} /> {label(m)}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="explain">
          {ins.length ? `Inputs: ${ins.map((i) => i.label).join(', ')}. ` : 'No open inputs. '}
          {outs.length ? `Result: ${outs.map((o) => o.label).join(', ')}.` : ''}
        </p>
      </div>

      <div className="insp-section">
        <div className="chips">
          <button type="button" className="btn" onClick={() => savePart(id)}>
            <BookmarkPlus size={14} /> Save to My parts
          </button>
          <button type="button" className="btn" onClick={() => duplicateGroup(id)} title="Ctrl+D">
            <Copy size={14} /> Duplicate
          </button>
          <button type="button" className="btn" onClick={ungroupSelection} title="Ctrl+Shift+G">
            <Ungroup size={14} /> Ungroup
          </button>
        </div>
        <p className="explain" style={{ marginTop: 8 }}>
          My parts live in this browser. Add one to any shape from the Add node menu (right-click or A in the
          graph).
        </p>
      </div>
    </div>
  );
}
