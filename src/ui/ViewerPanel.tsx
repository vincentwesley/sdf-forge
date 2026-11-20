import { useEffect, useState } from 'react';
import { ExternalLink, Pin, SlidersHorizontal } from 'lucide-react';
import { paramsOf } from '../core/nodes/registry';
import { encodeDoc } from '../core/share';
import { endMerge, setParam, useEditor } from '../state/store';
import { ParamField } from './fields';
import { SITE_URL } from './guide';

/**
 * The view-only player's overlay: the shape's name, its Controls (visitors can
 * try them; nothing is saved), and a link that opens an editable copy.
 */
export function ViewerPanel() {
  const doc = useEditor((s) => s.doc);
  // on small screens the Controls start folded so the shape stays visible
  const [open, setOpen] = useState(() => innerWidth > 600);
  const [editUrl, setEditUrl] = useState('');
  // the original link, so "Open in SDF Forge" always gives the shape as shared
  const [original] = useState(doc);
  useEffect(() => {
    let alive = true;
    encodeDoc(original).then((code) => alive && setEditUrl(`${location.href.split('#')[0]}#g=${code}`));
    return () => {
      alive = false;
    };
  }, [original]);
  const mm = doc.settings.mmPerUnit;
  return (
    <aside className="viewer-panel" aria-label="About this shape" data-testid="viewer-panel">
      <div className="viewer-head">
        <h1>{doc.title}</h1>
        {doc.pinned.length > 0 && (
          <button
            type="button"
            className="btn icon ghost sm"
            aria-expanded={open}
            aria-controls="viewer-controls"
            aria-label={open ? 'Hide Controls' : 'Show Controls'}
            title={open ? 'Hide Controls' : 'Show Controls'}
            onClick={() => setOpen((o) => !o)}
          >
            <SlidersHorizontal size={14} />
          </button>
        )}
      </div>
      {open && doc.pinned.length > 0 && (
        <div id="viewer-controls" role="group" aria-label="Controls">
          <p className="muted viewer-note">
            <Pin size={11} aria-hidden="true" /> Try the Controls: changes stay in this page.
          </p>
          {doc.pinned.map((p) => {
            const node = doc.nodes.find((n) => n.id === p.node);
            const def = node && paramsOf(node.type).find((x) => x.key === p.param);
            if (!node || !def) return null;
            return (
              <ParamField
                key={`${p.node}:${p.param}`}
                def={def}
                label={p.label ?? def.label}
                value={node.params[p.param]}
                mmPerUnit={mm}
                onChange={(v) => setParam(node.id, p.param, v)}
                onCommit={endMerge}
              />
            );
          })}
        </div>
      )}
      <div className="viewer-foot">
        <a
          className="btn sm primary"
          href={editUrl || SITE_URL}
          target="_blank"
          rel="noopener"
          data-testid="viewer-open"
        >
          <ExternalLink size={13} /> Open in SDF Forge
        </a>
        <a className="viewer-credit" href={SITE_URL} target="_blank" rel="noopener">
          Made with SDF Forge · Vin’s Atelier
        </a>
      </div>
    </aside>
  );
}
