import {
  Download,
  HelpCircle,
  LayoutGrid,
  Moon,
  Redo2,
  Share2,
  Sun,
  Undo2,
  Monitor,
  Command,
} from 'lucide-react';
import { actions, redo, setTitle, undo, useEditor, type ThemePref } from '../state/store';
import { BrandMark } from './meta';
import { CommitInput } from './fields';
import { Menu } from './Menu';
import { startTour } from './Tour';

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Match system', icon: Monitor },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
];

export function TopBar() {
  const title = useEditor((s) => s.doc.title);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const theme = useEditor((s) => s.theme);
  const ThemeIcon = THEMES.find((t) => t.id === theme)!.icon;
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';
  return (
    <header className="topbar">
      <a className="brand" href="./" aria-label="SDF Forge home" onClick={(e) => e.preventDefault()}>
        <BrandMark />
        <span className="hide-sm">SDF Forge</span>
      </a>
      <span className="sep hide-sm" aria-hidden="true" />
      <CommitInput className="title-input" label="Shape name" value={title} onCommit={setTitle} />
      <button
        type="button"
        className="btn icon ghost"
        onClick={undo}
        disabled={!canUndo}
        title={`Undo (${mod}Z)`}
        aria-label="Undo"
        data-testid="undo"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="btn icon ghost"
        onClick={redo}
        disabled={!canRedo}
        title={`Redo (${mod}Shift+Z)`}
        aria-label="Redo"
        data-testid="redo"
      >
        <Redo2 size={16} />
      </button>
      <div className="spacer" />
      <button
        type="button"
        className="btn ghost"
        onClick={() => actions.set({ dialog: 'gallery' })}
        data-tour="gallery"
        data-testid="open-gallery"
      >
        <LayoutGrid size={16} /> <span className="hide-sm">Gallery</span>
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => actions.set({ dialog: 'share' })}
        data-testid="open-share"
      >
        <Share2 size={16} /> <span className="hide-sm">Share</span>
      </button>
      <button
        type="button"
        className="btn primary"
        onClick={() => actions.set({ dialog: 'export' })}
        data-tour="export"
        data-testid="open-export"
      >
        <Download size={16} /> <span className="hide-sm">Export</span>
      </button>
      <span className="sep hide-sm" aria-hidden="true" />
      <Menu
        label="Theme"
        buttonClass="btn icon ghost"
        icon={<ThemeIcon size={16} />}
        align="end"
        items={THEMES.map((t) => ({
          id: t.id,
          label: t.label,
          checked: theme === t.id,
          onSelect: () => actions.set({ theme: t.id }),
        }))}
      />
      <Menu
        label="Help"
        buttonClass="btn icon ghost"
        icon={<HelpCircle size={16} />}
        align="end"
        testId="help-menu"
        items={[
          { id: 'tour', label: 'Take the 1-minute tour', onSelect: startTour },
          {
            id: 'cmd',
            label: 'Command palette',
            shortcut: `${mod}K`,
            icon: <Command size={14} />,
            onSelect: () => actions.set({ palette: true }),
          },
          {
            id: 'keys',
            label: 'Keyboard shortcuts',
            shortcut: '?',
            onSelect: () => actions.set({ dialog: 'shortcuts' }),
          },
          { id: 'code', label: 'View shader code', onSelect: () => actions.set({ dialog: 'code' }) },
          { id: 'about', label: 'About SDF Forge', onSelect: () => actions.set({ dialog: 'about' }) },
        ]}
      />
    </header>
  );
}
