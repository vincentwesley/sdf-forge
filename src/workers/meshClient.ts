import type { ExportInput, ExportOptions, ExportOutput } from '../core/mesh/pipeline';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (o: ExportOutput) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.out);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Mesh worker failed'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/** Mesh and encode in a worker so the UI stays responsive. */
export function exportMesh(input: ExportInput, opts: ExportOptions): Promise<ExportOutput> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, input: { ...input, P: new Float32Array(input.P) }, opts });
  });
}

/** Stop any running export (terminates the worker). */
export function cancelExports() {
  if (worker) worker.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(new Error('cancelled'));
  pending.clear();
}

export function downloadBlob(data: BlobPart, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(title: string): string {
  return (
    (title || 'shape')
      .trim()
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'shape'
  );
}
