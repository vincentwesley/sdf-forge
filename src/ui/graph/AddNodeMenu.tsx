import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_NODES, CATEGORY_INFO, CATEGORY_ORDER } from '../../core/nodes/registry';
import type { NodeDef } from '../../core/nodes/types';
import { NodeIcon } from '../meta';
import { actions, addNodeAt, useEditor } from '../../state/store';
import { canConnect, makeNode } from '../../core/graph/doc';
import type { Part } from '../../core/graph/groups';
import { addPart, deletePart, loadParts } from '../../state/groups';
import { Group } from 'lucide-react';

type Item = { kind: 'node'; def: NodeDef; key: string } | { kind: 'part'; part: Part; key: string };

/** Relevance of a node for a search: 0 = no match, higher is better. */
function score(def: NodeDef, q: string): number {
  if (!q) return 1;
  const s = q.toLowerCase().trim();
  const label = def.label.toLowerCase();
  if (label === s) return 100;
  if (label.startsWith(s)) return 80;
  if (label.split(/\s+/).some((w) => w.startsWith(s))) return 60;
  if ((def.keywords ?? []).some((k) => k.startsWith(s))) return 40;
  if (label.includes(s) || (def.keywords ?? []).some((k) => k.includes(s))) return 20;
  if (def.summary.toLowerCase().includes(s)) return 10;
  return 0;
}

function partScore(name: string, q: string): number {
  if (!q) return 1;
  const n = name.toLowerCase(),
    s = q.toLowerCase().trim();
  return n === s ? 100 : n.startsWith(s) ? 80 : n.includes(s) ? 50 : 0;
}

/** Searchable "add node" popup. When opened from a dragged wire it lists only compatible nodes. */
export function AddNodeMenu() {
  const menu = useEditor((s) => s.addMenu);
  const doc = useEditor((s) => s.doc);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [parts, setParts] = useState<Part[]>([]);
  useEffect(() => {
    const load = () => setParts(loadParts());
    load();
    window.addEventListener('sdf-forge:parts', load);
    return () => window.removeEventListener('sdf-forge:parts', load);
  }, [menu]);
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
    const ranked = (cat: string) => ALL_NODES.filter((d) => d.category === cat && score(d, q) > 0);
    const compatible = CATEGORY_ORDER.flatMap((cat) =>
      ranked(cat).filter((d) => {
        if (!from) return true;
        // test compatibility against a temporary node
        const tmp = makeNode(d.type, 0, 0, {}, '__tmp');
        const trial = { ...doc, nodes: [...doc.nodes, tmp] };
        if (from.kind === 'source')
          return d.inputs.some((i) => canConnect(trial, from.node, '__tmp', i.key).ok);
        return !!d.output && canConnect(trial, '__tmp', from.node, from.handle).ok;
      }),
    );
    // with a query, best matches first (stable within equal scores)
    const scored: { it: Item; s: number }[] = compatible.map((def) => ({
      it: { kind: 'node', def, key: def.type },
      s: score(def, q),
    }));
    // saved parts (not when connecting a wire: a part has no single socket to wire),
    // ranked by name like node labels
    if (!from)
      parts.forEach((part, i) => {
        const s = partScore(part.name, q);
        if (s > 0) scored.push({ it: { kind: 'part', part, key: `part-${i}` }, s });
      });
    return (q ? [...scored].sort((a, b) => b.s - a.s) : scored).map((x) => x.it);
  }, [menu, q, doc, parts]);

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
  const pick = (it: Item) => {
    if (it.kind === 'node') addNodeAt(it.def.type, menu.flowX, menu.flowY, menu.from);
    else addPart(it.part, menu.flowX, menu.flowY);
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
        aria-activedescendant={list[active] ? `add-${list[active].key}` : undefined}
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
          } else if (e.key === 'Delete' && e.shiftKey && list[active]?.kind === 'part') {
            e.preventDefault();
            const it = list[active];
            if (it.kind === 'part') deletePart(it.part.name);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      />
      <div id="add-node-list" role="listbox" aria-label="Nodes">
        {list.length === 0 && <div className="menu-section">No matching nodes</div>}
        {list.map((it, i) => {
          const cat = it.kind === 'node' ? it.def.category : 'parts';
          const head =
            cat !== lastCat && (!q || it.kind === 'part')
              ? it.kind === 'node'
                ? CATEGORY_INFO[it.def.category].label
                : 'My parts'
              : null;
          lastCat = cat;
          return (
            <div key={it.key}>
              {head && <div className="menu-section">{head}</div>}
              <div
                id={`add-${it.key}`}
                role="option"
                aria-selected={i === active}
                className="menu-item"
                data-active={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => pick(it)}
              >
                {it.kind === 'node' ? (
                  <>
                    <NodeIcon type={it.def.type} category={it.def.category} size={14} />
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span>{it.def.label}</span>
                      <span className="desc">{it.def.summary}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Group size={14} aria-hidden="true" />
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span>{it.part.name}</span>
                      <span className="desc">
                        Saved group · {it.part.nodes.length} node{it.part.nodes.length === 1 ? '' : 's'}
                        {i === active ? ' · Shift+Del removes it' : ''}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
