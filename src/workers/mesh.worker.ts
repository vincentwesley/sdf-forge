/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { type ExportInput, type ExportOptions, runExport } from '../core/mesh/pipeline';
import type { ManifoldModule } from '../core/mesh/mesh';

let wasmPromise: Promise<ManifoldModule> | null = null;
function wasm(): Promise<ManifoldModule> {
  if (!wasmPromise)
    wasmPromise = Module({ locateFile: () => wasmUrl }).then((m) => {
      m.setup();
      return m as unknown as ManifoldModule;
    });
  return wasmPromise;
}

self.onmessage = async (e: MessageEvent<{ id: number; input: ExportInput; opts: ExportOptions }>) => {
  const { id, input, opts } = e.data;
  try {
    const w = await wasm();
    const out = await runExport(w, input, opts);
    (self as unknown as Worker).postMessage({ id, ok: true, out }, [out.bytes]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: (err as Error).message ?? String(err) });
  }
};
