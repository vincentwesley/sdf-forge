import { useEffect, useState } from 'react';
import { Check, Copy, Download, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { loadDoc, toast, useEditor } from '../../state/store';
import { embedCode, shareUrl, viewUrl } from '../../core/share';
import { downloadBlob, safeFilename } from '../../workers/meshClient';
import { normalizeDoc } from '../../core/graph/doc';

export function ShareDialog() {
  const doc = useEditor((s) => s.doc);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState('');
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  useEffect(() => {
    let alive = true;
    shareUrl(doc, location.href.split('#')[0]).then((u) => alive && setUrl(u));
    viewUrl(doc, location.href.split('#')[0]).then((u) => alive && setView(u));
    return () => {
      alive = false;
    };
  }, [doc]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Could not copy automatically — select the link and copy it.', 'error');
    }
  };
  const openFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.sdf.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        loadDoc(normalizeDoc(data.doc ?? data), { keepHistory: true });
        toast(`Opened ${f.name}`, 'success');
      } catch {
        toast('That file is not an SDF Forge graph.', 'error');
      }
    };
    input.click();
  };
  return (
    <Modal title="Share" testId="share-dialog">
      <p className="explain" style={{ marginTop: 0 }}>
        This link contains the whole graph, so anyone who opens it gets your exact shape and can keep editing
        their own copy. Nothing is uploaded.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          className="text-input"
          readOnly
          value={url}
          aria-label="Share link"
          onFocus={(e) => e.target.select()}
          data-testid="share-url"
        />
        <button type="button" className="btn primary" onClick={copy} disabled={!url} data-testid="share-copy">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {url ? `${url.length.toLocaleString()} characters` : 'Preparing link…'}
      </p>
      <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Embed on a website</h3>
      <p className="explain" style={{ marginTop: 0 }}>
        A view-only player: visitors can turn the shape and try its Controls, then open their own copy. Paste
        this into a page builder (WordPress, Notion, Webflow…) or any HTML.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          className="text-input code-small"
          readOnly
          rows={3}
          value={view ? embedCode(view, doc.title) : ''}
          aria-label="Embed code"
          onFocus={(e) => e.target.select()}
          data-testid="embed-code"
        />
        <button
          type="button"
          className="btn"
          disabled={!view}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(embedCode(view, doc.title));
              setCopiedEmbed(true);
              setTimeout(() => setCopiedEmbed(false), 1800);
            } catch {
              toast('Could not copy automatically — select the code and copy it.', 'error');
            }
          }}
        >
          {copiedEmbed ? <Check size={15} /> : <Copy size={15} />} {copiedEmbed ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Or{' '}
        <a href={view || undefined} target="_blank" rel="noopener" data-testid="view-link">
          open the view-only link
        </a>
        .
      </p>
      <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Save as a file</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            downloadBlob(
              JSON.stringify({ app: 'SDF Forge', by: "Vin's Atelier", doc }, null, 1),
              `${safeFilename(doc.title)}.sdf.json`,
              'application/json',
            )
          }
        >
          <Download size={15} /> Download graph (.json)
        </button>
        <button type="button" className="btn" onClick={openFile}>
          <Upload size={15} /> Open a graph file…
        </button>
      </div>
    </Modal>
  );
}
