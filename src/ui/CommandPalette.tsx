import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_NODES } from '../core/nodes/registry';
import { EXAMPLES } from '../gallery/examples';
import {
  actions,
  addNodeAt,
  addShape,
  deleteNodes,
  duplicate,
  newDocument,
  redo,
  store,
  tidy,
  undo,
  useEditor,
} from '../state/store';
import { getScene } from '../state/scene';
import { surpriseMe } from '../state/surprise';
import { startTour } from './Tour';
import { openExample } from './dialogs/GalleryDialog';

interface Cmd {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

function commands(): Cmd[] {
  const s = store.getState();
  const sel = s.selection;
  const bounds = getScene(s.doc, s.viewRoot, null).analysis.bounds;
  const list: Cmd[] = [
    { id: 'undo', label: 'Undo', group: 'Edit', run: undo },
    { id: 'redo', label: 'Redo', group: 'Edit', run: redo },
    {
      id: 'export',
      label: 'Export 3D model, image, video or code…',
      group: 'File',
      run: () => actions.set({ dialog: 'export' }),
    },
    { id: 'share', label: 'Share a link…', group: 'File', run: () => actions.set({ dialog: 'share' }) },
    {
      id: 'gallery',
      label: 'Open the gallery…',
      group: 'File',
      run: () => actions.set({ dialog: 'gallery' }),
    },
    { id: 'new', label: 'New empty shape', group: 'File', run: newDocument },
    { id: 'surprise', label: 'Surprise me (shuffle settings)', group: 'Edit', run: () => surpriseMe() },
    { id: 'tidy', label: 'Tidy the graph', group: 'Graph', run: tidy },
    {
      id: 'frame',
      label: 'Frame the shape',
      group: 'View',
      run: () => actions.set({ frameRequest: s.frameRequest + 1 }),
    },
    { id: 'grid', label: 'Toggle floor grid', group: 'View', run: () => actions.set({ grid: !s.grid }) },
    { id: 'm-shaded', label: 'View: shaded', group: 'View', run: () => actions.set({ viewMode: 'shaded' }) },
    {
      id: 'm-print',
      label: 'View: print check (thin walls, overhangs)',
      group: 'View',
      run: () => actions.set({ viewMode: 'print' }),
    },
    {
      id: 'm-normals',
      label: 'View: normals',
      group: 'View',
      run: () => actions.set({ viewMode: 'normals' }),
    },
    {
      id: 'm-cost',
      label: 'View: rendering cost',
      group: 'View',
      run: () => actions.set({ viewMode: 'cost' }),
    },
    { id: 'theme-dark', label: 'Theme: dark', group: 'View', run: () => actions.set({ theme: 'dark' }) },
    { id: 'theme-light', label: 'Theme: light', group: 'View', run: () => actions.set({ theme: 'light' }) },
    {
      id: 'theme-sys',
      label: 'Theme: match system',
      group: 'View',
      run: () => actions.set({ theme: 'system' }),
    },
    { id: 'tour', label: 'Take the tour', group: 'Help', run: startTour },
    {
      id: 'keys',
      label: 'Keyboard shortcuts',
      group: 'Help',
      run: () => actions.set({ dialog: 'shortcuts' }),
    },
    { id: 'about', label: 'About SDF Forge', group: 'Help', run: () => actions.set({ dialog: 'about' }) },
  ];
  if (sel.length) {
    list.push({ id: 'dup', label: 'Duplicate selection', group: 'Edit', run: () => duplicate(sel) });
    list.push({ id: 'del', label: 'Delete selection', group: 'Edit', run: () => deleteNodes(sel) });
  }
  for (const d of ALL_NODES) {
    if (d.category === 'shape')
      list.push({
        id: `add-${d.type}`,
        label: `Add ${d.label} to the shape`,
        group: 'Add',
        run: () => addShape(d.type, bounds),
      });
    if (d.type !== 'output')
      list.push({
        id: `node-${d.type}`,
        label: `Add ${d.label} node to the graph`,
        group: 'Graph',
        run: () => {
          const xs = s.doc.nodes.map((n) => n.x);
          addNodeAt(d.type, Math.min(...xs) - 240, Math.max(...s.doc.nodes.map((n) => n.y)) + 100);
        },
      });
  }
  for (const ex of EXAMPLES)
    list.push({
      id: `ex-${ex.id}`,
      label: `Open example: ${ex.title}`,
      group: 'Gallery',
      run: () => openExample(ex),
    });
  return list;
}

export function CommandPalette() {
  const open = useEditor((s) => s.palette);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (open ? commands() : []), [open]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all
      .filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w)))
      .slice(0, 60);
  }, [all, q]);
  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  if (!open) return null;
  const close = () => actions.set({ palette: false });
  const run = (c: Cmd) => {
    close();
    c.run();
  };
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgb(0 0 0 / 0.35)',
        display: 'grid',
        placeItems: 'start center',
        paddingTop: '12vh',
      }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="menu"
        role="dialog"
        aria-label="Command palette"
        style={{ position: 'static', width: 'min(560px, 92vw)', maxHeight: '60vh' }}
        data-testid="palette"
      >
        <input
          ref={input}
          className="menu-search"
          placeholder="Type a command…"
          aria-label="Command"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={list[active] ? `cmd-${list[active].id}` : undefined}
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
              if (list[active]) run(list[active]);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        <div id="palette-list" role="listbox" aria-label="Commands">
          {list.map((c, i) => (
            <div
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              className="menu-item"
              data-active={i === active}
              onPointerMove={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              <span className="desc" style={{ marginLeft: 'auto' }}>
                {c.group}
              </span>
            </div>
          ))}
          {list.length === 0 && <div className="menu-section">No matching commands</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
