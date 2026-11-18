import { describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { analyze, compile, packParams } from '../../src/core/compile';
import { DocBuilder } from '../../src/gallery/builder';
import { runExport } from '../../src/core/mesh/pipeline';
import type { ManifoldModule } from '../../src/core/mesh/mesh';
import { separateCoincident } from '../../src/core/mesh/mesh';

describe('mesh pipeline', () => {
  it('meshes a sphere with the right volume and a valid binary STL', async () => {
    const wasm = (await Module()) as unknown as ManifoldModule & { setup(): void };
    wasm.setup();
    const b = new DocBuilder('s', { mmPerUnit: 10 });
    b.output(b.add('sphere', { radius: 1 }));
    const doc = b.done();
    const c = compile(doc);
    const P = new Float32Array(c.paramCount);
    packParams(doc, c, P);
    const bounds = analyze(doc, c.rootId).bounds!;
    const out = runExport(
      wasm,
      { ...c, P, bounds, title: 's', mmPerUnit: 10, material: 'clay' },
      { format: 'stl', edgeLength: 0.05 },
    );
    expect(out.stats.status).toMatch(/NoError/);
    expect(out.stats.genus).toBe(0);
    expect(out.stats.volumeMm3).toBeGreaterThan((4 / 3) * Math.PI * 1000 * 0.98);
    expect(out.stats.volumeMm3).toBeLessThan((4 / 3) * Math.PI * 1000 * 1.01);
    expect(out.bytes.byteLength).toBe(84 + out.stats.triangles * 50);
  });
  it('separates coincident vertices inward', () => {
    // two triangles sharing a position but not a vertex
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, -1, 0, 0]);
    const idx = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const moved = separateCoincident(pos, idx, 1e-6, 1e-3);
    expect(moved).toBe(2);
    expect(pos[0] === pos[9] && pos[1] === pos[10] && pos[2] === pos[11]).toBe(false);
  });
});
