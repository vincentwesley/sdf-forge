import { useEffect, useRef } from 'react';
import { TopBar } from './TopBar';
import { Viewport } from './viewport/Viewport';
import { GraphPanel } from './graph/GraphPanel';
import { Inspector } from './inspector/Inspector';
import { Toasts } from './Toasts';
import { Tour } from './Tour';
import { CommandPalette } from './CommandPalette';
import { lazy, Suspense } from 'react';

const ExportDialog = lazy(() => import('./dialogs/ExportDialog').then((m) => ({ default: m.ExportDialog })));
const GalleryDialog = lazy(() =>
  import('./dialogs/GalleryDialog').then((m) => ({ default: m.GalleryDialog })),
);
const ShareDialog = lazy(() => import('./dialogs/ShareDialog').then((m) => ({ default: m.ShareDialog })));
const AboutDialog = lazy(() => import('./dialogs/InfoDialogs').then((m) => ({ default: m.AboutDialog })));
const ShortcutsDialog = lazy(() =>
  import('./dialogs/InfoDialogs').then((m) => ({ default: m.ShortcutsDialog })),
);
import {
  actions,
  copyNodes,
  deleteNodes,
  duplicate,
  pasteNodes,
  redo,
  select,
  store,
  undo,
  useEditor,
} from '../state/store';
import { useResolvedTheme } from './theme';
import type { ViewMode } from '../render/renderer';

function Splitter() {
  const ref = useRef<HTMLDivElement>(null);
  const setH = (px: number) => {
    const stage = ref.current!.parentElement!;
    const total = stage.clientHeight;
    const h = Math.max(120, Math.min(total - 160, px));
    stage.style.setProperty('--graph-h', `${h}px`);
    ref.current!.setAttribute('aria-valuenow', String(Math.round((h / total) * 100)));
  };
  return (
    <div
      ref={ref}
      className="splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the graph panel"
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={36}
      tabIndex={0}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const stage = el.parentElement!;
        const move = (ev: PointerEvent) => setH(stage.getBoundingClientRect().bottom - ev.clientY - 4);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
      onKeyDown={(e) => {
        const lower = ref.current!.nextElementSibling as HTMLElement;
        const cur = lower.getBoundingClientRect().height;
        if (e.key === 'ArrowUp') setH(cur + 30);
        if (e.key === 'ArrowDown') setH(cur - 30);
      }}
    />
  );
}

function NarrowTabs() {
  const tab = useEditor((s) => s.narrowTab);
  return (
    <div className="narrow-tabs segmented" role="tablist" aria-label="Panels">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'graph'}

        onClick={() => actions.set({ narrowTab: 'graph' })}
      >
        Graph
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'props'}

        onClick={() => actions.set({ narrowTab: 'props' })}
        data-testid="tab-props"
      >
        Properties
      </button>
    </div>
  );
}

/** Text selections should keep native copy. */
function inGraphText(t: HTMLElement) {
  return !!window.getSelection()?.toString() && !t.closest('.react-flow');
}

const MODE_KEYS: Record<string, ViewMode> = { '1': 'shaded', '2': 'print', '3': 'normals', '4': 'cost' };

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a widget already handled this key (e.g. Delete removes a point in the outline editor)
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      const typing = t.matches(
        'input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select, [contenteditable]',
      );
      const mod = e.ctrlKey || e.metaKey;
      const s = store.getState();
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        actions.set({ palette: !s.palette });
        return;
      }
      if (typing || s.dialog || s.palette) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c' && !inGraphText(t)) {
        if (s.selection.length && copyNodes(s.selection)) e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && !inGraphText(t)) {
        e.preventDefault();
        void pasteNodes();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (s.selection.length) duplicate(s.selection);
        return;
      }
      if (mod || e.altKey) return;
      const inGraph = !!t.closest('.react-flow');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inGraph && s.selection.length) {
        e.preventDefault();
        deleteNodes(s.selection);
      } else if (e.key === 'Escape') {
        if (s.addMenu) actions.set({ addMenu: null });
        else if (s.tour !== null) actions.set({ tour: null, tourDone: true });
        else select([]);
      } else if (e.key === 'f' || e.key === 'F') {
        actions.set({ frameRequest: s.frameRequest + 1 });
      } else if ('wWeErR'.includes(e.key) && e.key.length === 1 && s.selection.length) {
        const k = e.key.toLowerCase();
        actions.set({ gizmoMode: k === 'w' ? 'move' : k === 'e' ? 'rotate' : 'scale' });
      } else if (e.key === 'm' || e.key === 'M') {
        actions.set({ measure: s.measure ? null : [] });
      } else if (e.key === 'g' || e.key === 'G') {
        actions.set({ grid: !s.grid });
      } else if (MODE_KEYS[e.key] && !t.closest('.react-flow')) {
        actions.set({ viewMode: MODE_KEYS[e.key] });
      } else if (e.key === '?') {
        actions.set({ dialog: 'shortcuts' });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useResolvedTheme();
  useShortcuts();
  const dialog = useEditor((s) => s.dialog);
  const tab = useEditor((s) => s.narrowTab);
  return (
    <div className="app">
      <a className="skip-link" href="#inspector-region">
        Skip to properties
      </a>
      <TopBar />
      <main className="workspace">
        <div className="stage">
          <Viewport />
          <Splitter />
          <div className="lower" data-tab={tab}>
            <NarrowTabs />
            <GraphPanel />
            <div className="props-panel" data-tour="props">
              <Inspector />
            </div>
          </div>
        </div>
        <aside className="side" id="inspector-region" aria-label="Properties" data-tour="props" tabIndex={-1}>
          <Inspector />
        </aside>
      </main>
      <footer className="sr-only">SDF Forge by Vin’s Atelier</footer>
      <Suspense fallback={null}>
        {dialog === 'export' && <ExportDialog />}
        {dialog === 'code' && <ExportDialog initialTab="code" />}
        {dialog === 'gallery' && <GalleryDialog />}
        {dialog === 'share' && <ShareDialog />}
        {dialog === 'shortcuts' && <ShortcutsDialog />}
        {dialog === 'about' && <AboutDialog />}
      </Suspense>
      <CommandPalette />
      <Tour />
      <Toasts />
    </div>
  );
}
