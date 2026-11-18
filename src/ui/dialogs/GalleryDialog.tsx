import { useState } from 'react';
import { Modal } from './Modal';
import { EXAMPLES } from '../../gallery/examples';
import { openExample } from '../../gallery/open';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'printable', label: 'Printable' },
  { id: 'game', label: 'Game assets' },
  { id: 'art', label: 'Art' },
  { id: 'learn', label: 'Learn' },
] as const;

const TAG_LABEL: Record<string, string> = {
  printable: 'Printable',
  game: 'Game asset',
  art: 'Art',
  learn: 'Learn',
};

export function GalleryDialog() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const list = EXAMPLES.filter((e) => filter === 'all' || e.tags.includes(filter as never));
  return (
    <Modal title="Gallery" wide testId="gallery">
      <div className="segmented" role="radiogroup" aria-label="Filter examples" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="gallery-grid" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((ex) => (
          <li key={ex.id} style={{ display: 'flex' }}>
            <button
              type="button"
              className="gallery-card"
              onClick={() => openExample(ex)}
              data-testid={`example-${ex.id}`}
              style={{ flex: 1 }}
            >
              <img
                src={`./gallery/${ex.id}.webp`}
                alt=""
                loading="lazy"
                width={320}
                height={240}
                onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
              />
              <span className="meta">
                <strong>{ex.title}</strong>
                <span>
                  {ex.tags.map((t) => (
                    <span key={t} className="tag">
                      {TAG_LABEL[t]}
                    </span>
                  ))}
                </span>
                <span style={{ display: 'block', marginTop: 4 }}>{ex.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Opening an example replaces the current shape; press Ctrl+Z (⌘Z) to get yours back.
      </p>
    </Modal>
  );
}
