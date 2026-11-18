import { Pin, Sparkles } from 'lucide-react';
import { getDef, paramsOf } from '../../core/nodes/registry';
import {
  actions,
  endMerge,
  setParam,
  setPinLabel,
  setSettings,
  setTitle,
  togglePin,
  useEditor,
} from '../../state/store';
import { getScene } from '../../state/scene';
import { CommitInput, ParamField } from '../fields';
import { fmt } from '../format';
import type { MaterialStyle } from '../../core/graph/doc';
import { surpriseMe } from '../../state/surprise';

export function DocPanel() {
  const doc = useEditor((s) => s.doc);
  const bounds = useEditor((s) => getScene(s.doc, s.viewRoot, null).analysis.bounds);
  const mm = doc.settings.mmPerUnit;
  const size = bounds ? bounds.max.map((v, i) => (v - bounds.min[i]) * mm) : null;
  return (
    <div className="inspector" aria-label="Document" data-testid="doc-panel">
      <div className="insp-section">
        <h3>Shape</h3>
        <CommitInput className="text-input" label="Shape name" value={doc.title} onCommit={setTitle} />
        <p className="explain" style={{ marginTop: 8 }}>
          Click a shape in the 3D view or a node in the graph to edit it.
        </p>
      </div>

      <div className="insp-section" data-testid="controls">
        <h3>
          <Pin size={13} /> Controls
        </h3>
        {doc.pinned.length === 0 ? (
          <p className="explain">
            Pin any setting with the <Pin size={11} style={{ verticalAlign: -1 }} /> button next to it and it
            appears here, so you (or anyone you share with) can tweak the shape without opening the graph.
          </p>
        ) : (
          doc.pinned.map((p) => {
            const node = doc.nodes.find((n) => n.id === p.node);
            const def = node && paramsOf(node.type).find((x) => x.key === p.param);
            if (!node || !def) return null;
            const label = p.label ?? `${def.label}`;
            return (
              <div key={`${p.node}:${p.param}`}>
                <ParamField
                  def={def}
                  label={label}
                  value={node.params[p.param]}
                  mmPerUnit={mm}
                  onChange={(v) => setParam(node.id, p.param, v)}
                  onCommit={endMerge}
                  pinned
                  onTogglePin={() => togglePin(node.id, p.param)}
                />
                <details style={{ margin: '-2px 0 6px 0' }}>
                  <summary className="muted" style={{ fontSize: 11, cursor: 'pointer' }}>
                    from {node.name ?? getDef(node.type)?.label} · rename
                  </summary>
                  <CommitInput
                    className="text-input"
                    label={`Label for ${label}`}
                    value={label}
                    onCommit={(v) => setPinLabel(node.id, p.param, v)}
                  />
                </details>
              </div>
            );
          })
        )}
      </div>

      <div className="insp-section">
        <h3>Material</h3>
        <div className="segmented" role="radiogroup" aria-label="Material">
          {(['clay', 'glossy', 'metal'] as MaterialStyle[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={doc.settings.material === m}
              onClick={() => setSettings({ material: m })}
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="insp-section">
        <h3>Size</h3>
        <dl className="stat-grid">
          <dt>Width × height × depth</dt>
          <dd data-testid="doc-size">{size ? `${size.map((v) => fmt(v, 1)).join(' × ')} mm` : '—'}</dd>
          <dt>Scale</dt>
          <dd>1 unit = {fmt(mm, 2)} mm</dd>
          <dt>Nodes</dt>
          <dd>{doc.nodes.length}</dd>
        </dl>
        <p className="explain" style={{ marginTop: 8 }}>
          Change the real-world size when exporting.
        </p>
      </div>

      <div className="insp-section">
        <h3>Play</h3>
        <button
          type="button"
          className="btn"
          onClick={() => surpriseMe()}
          title="Randomly vary every setting a little"
        >
          <Sparkles size={14} /> Surprise me
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginLeft: 6 }}
          onClick={() => actions.set({ dialog: 'gallery' })}
        >
          Browse examples
        </button>
      </div>
    </div>
  );
}
