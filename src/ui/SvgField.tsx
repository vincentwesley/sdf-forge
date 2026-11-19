import { useId, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import type { FieldProps } from './fields';
import { decodeOutline, importSvg } from '../core/svg';

/** Read an SVG file chosen by the user and return its stored outline (throws a friendly message). */
export async function outlineFromFile(file: File): Promise<string> {
  if (file.size > 2_000_000) throw new Error('That file is larger than 2 MB. Try a simpler SVG.');
  return importSvg(await file.text());
}

/**
 * Editor for the SVG shape node: a preview of the imported outline, an
 * "Import SVG file…" button and a box to paste SVG code.
 */
export function SvgField({ def, value, onChange, onCommit, label }: FieldProps) {
  const { polys, rule } = decodeOutline(String(value ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const id = useId();
  const points = polys.reduce((n, p) => n + p.length / 2, 0);
  const path = polys
    .map((p) => {
      let d = '';
      for (let k = 0; k < p.length; k += 2)
        d += `${k ? 'L' : 'M'}${p[k].toFixed(4)},${(-p[k + 1]).toFixed(4)}`;
      return d + 'Z';
    })
    .join('');
  const apply = (outline: string) => {
    setError(null);
    onChange(outline);
    onCommit();
  };
  return (
    <div className="svg-field" data-testid="svg-field">
      <div className="field-label" id={`${id}-l`}>
        {label ?? def.label}
      </div>
      <svg
        className="svg-preview"
        viewBox="-0.6 -0.6 1.2 1.2"
        role="img"
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-d`}
      >
        <path d={path} fillRule={rule} />
      </svg>
      <p className="muted" id={`${id}-d`} style={{ fontSize: 11.5, margin: '4px 0 8px' }}>
        {polys.length} outline{polys.length === 1 ? '' : 's'}, {points} points
        {rule === 'evenodd' ? ', holes by even-odd rule' : ''}.
      </p>
      <input
        ref={file}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        data-testid="svg-file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            apply(await outlineFromFile(f));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      <button type="button" className="btn sm" onClick={() => file.current?.click()}>
        <FileUp size={14} /> Import SVG file…
      </button>
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
          …or paste SVG code
        </summary>
        <textarea
          className="text-input"
          rows={4}
          aria-label="SVG code"
          placeholder='<svg …><path d="…"/></svg>  or just the path data'
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 11, marginTop: 6 }}
        />
        <button
          type="button"
          className="btn sm"
          disabled={!code.trim()}
          onClick={() => {
            try {
              apply(importSvg(code));
              setCode('');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Use this SVG
        </button>
      </details>
      {error && (
        <p className="note warn" role="alert" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
