import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_NODES, CATEGORY_INFO, CATEGORY_ORDER } from '../../core/nodes/registry';
import type { NodeDef } from '../../core/nodes/types';
import { NodeIcon } from '../meta';
import { actions, addNodeAt, useEditor } from '../../state/store';
import { canConnect, makeNode } from '../../core/graph/doc';

function matches(def: NodeDef, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    def.label.toLowerCase().includes(s) ||
    def.type.toLowerCase().includes(s) ||
    (def.keywords ?? []).some((k) => k.includes(s)) ||
    def.summary.toLowerCase().includes(s)
  );
}

/** Searchable "add node" popup. When opened from a dragged wire it lists only compatible nodes. */
export function AddNodeMenu() {
  const menu = useEditor((s) => s.addMenu);
  const doc = useEditor((s) => s.doc);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [menu]);

  const list = useMemo(() => {
    if (!menu) return [];
    const from = menu.from;
    return CATEGORY_ORDER.flatMap((cat) =>
      ALL_NODES.filter((d) => d.category === cat && matches(d, q)).filter((d) => {
        if (!from) return true;
        // test compatibility against a temporary node
        const tmp = makeNode(d.type, 0, 0, {}, '__tmp');
        const trial = { ...doc, nodes: [...doc.nodes, tmp] };
        if (from.kind === 'source')
          return d.inputs.some((i) => canConnect(trial, from.node, '__tmp', i.key).ok);
        return !!d.output && canConnect(trial, '__tmp', from.node, from.handle).ok;
      }),
    );
  }, [menu, q, doc]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) actions.set({ addMenu: null });
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menu]);

  if (!menu) return null;
  const close = () => actions.set({ addMenu: null });
  const pick = (d: NodeDef) => {
    addNodeAt(d.type, menu.flowX, menu.flowY, menu.from);
    actions.set({ narrowTab: 'props' });
    close();
  };
  const left = Math.max(8, Math.min(menu.x, innerWidth - 300));
  const top = Math.max(8, Math.min(menu.y, innerHeight - 420));
  let lastCat = '';
  return createPortal(
    <div
      ref={box}
      className="menu"
      style={{ left, top, width: 290 }}
      role="dialog"
      aria-label="Add a node"
      data-testid="add-node-menu"
    >
      <input
        ref={input}
        className="menu-search"
        placeholder="Search nodes…"
        aria-label="Search nodes"
        role="combobox"
        aria-expanded="true"
        aria-controls="add-node-list"
        aria-activedescendant={list[active] ? `add-${list[active].type}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(list.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (list[active]) pick(list[active]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      />
      <div id="add-node-list" role="listbox" aria-label="Nodes">
        {list.length === 0 && <div className="menu-section">No matching nodes</div>}
        {list.map((d, i) => {
          const head = d.category !== lastCat ? CATEGORY_INFO[d.category].label : null;
          lastCat = d.category;
          return (
            <div key={d.type}>
              {head && <div className="menu-section">{head}</div>}
              <div
                id={`add-${d.type}`}
                role="option"
                aria-selected={i === active}
                className="menu-item"
                data-active={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(d)}
              >
                <NodeIcon type={d.type} category={d.category} size={14} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{d.label}</span>
                  <span className="desc">{d.summary}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
