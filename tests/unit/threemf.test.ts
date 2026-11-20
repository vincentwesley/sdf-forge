import { describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { crc32, writeZip } from '../../src/core/mesh/zip';
import { trianglePalette, write3MF } from '../../src/core/mesh/threemf';
import { analyze, compile, packParams } from '../../src/core/compile';
import { DocBuilder } from '../../src/gallery/builder';
import { runExport, shapeSurfaces } from '../../src/core/mesh/pipeline';
import type { ManifoldModule } from '../../src/core/mesh/mesh';
import { unzip } from '../unzip';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('zip writer', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('round-trips stored and deflated entries', async () => {
    const big = new TextEncoder().encode('abc'.repeat(5000));
    const zip = new Uint8Array(
      await writeZip([
        { name: 'a.txt', data: big },
        { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]), store: true },
      ]),
    );
    expect(zip.length).toBeLessThan(big.length); // compressed
    const files = unzip(zip);
    expect(text(files.get('a.txt')!)).toBe('abc'.repeat(5000));
    expect([...files.get('dir/b.bin')!]).toEqual([1, 2, 3]);
  });
});

describe('3MF', () => {
  // a unit tetrahedron, outward winding
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
  const idx = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);

  it('packages a model with millimetres, credit, palette and thumbnail', async () => {
    const colors = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const files = unzip(
      new Uint8Array(
        await write3MF(pos, idx, { title: 'Tet <&>', colors, thumbnail: png, date: '2026-01-02' }),
      ),
    );
    expect([...files.keys()].sort()).toEqual([
      '3D/3dmodel.model',
      'Metadata/thumbnail.png',
      '[Content_Types].xml',
      '_rels/.rels',
    ]);
    const model = text(files.get('3D/3dmodel.model')!);
    expect(model).toContain('unit="millimeter"');
    expect(model).toContain('<metadata name="Title">Tet &lt;&amp;&gt;</metadata>');
    expect(model).toContain('Vin&apos;s Atelier');
    expect(model).toContain('<metadata name="CreationDate">2026-01-02</metadata>');
    expect(model.match(/<vertex /g)).toHaveLength(4);
    expect(model.match(/<triangle /g)).toHaveLength(4);
    expect(model).toContain('<vertex x="10" y="0" z="0"/>');
    expect(text(files.get('_rels/.rels')!)).toContain('/Metadata/thumbnail.png');
    expect(text(files.get('[Content_Types].xml')!)).toContain('3dmanufacturing-3dmodel+xml');
  });

  it('snaps triangle colours to the shapes’ own palette and drops unused colours', () => {
    // three red-ish vertices and one blue: faces touching vertex 3 average 2/3 red, 1/3 blue
    const colors = new Float32Array([1, 0, 0, 0.9, 0.1, 0, 1, 0, 0.1, 0, 0, 1]);
    const r = trianglePalette(colors, idx, 16, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(r.palette).toEqual([[1, 0, 0]]);
    expect([...r.tri]).toEqual([0, 0, 0, 0]);
  });

  it('clusters colours when no palette is given', () => {
    const colors = new Float32Array([1, 0, 0, 0.98, 0.02, 0, 1, 0, 0.02, 0.99, 0, 0]);
    expect(trianglePalette(colors, idx).palette).toHaveLength(1);
  });

  it('exports a two-colour shape with exactly its two colours', async () => {
    const wasm = (await Module()) as unknown as ManifoldModule & { setup(): void };
    wasm.setup();
    const b = new DocBuilder('two', { mmPerUnit: 10 });
    const a = b.add('sphere', { radius: 1, color: [0.9, 0.2, 0.1] });
    const c = b.add('box', { size: [1.5, 1.5, 1.5], color: [0.1, 0.3, 0.9], position: [1.2, 0, 0] });
    b.output(b.add('union', { smooth: 0.3 }, [a, c]));
    const doc = b.done();
    const comp = compile(doc);
    const P = new Float32Array(comp.paramCount);
    packParams(doc, comp, P);
    const bounds = analyze(doc, comp.rootId).bounds!;
    const out = await runExport(
      wasm,
      {
        ...comp,
        P,
        bounds,
        title: 'two',
        mmPerUnit: 10,
        material: 'clay',
        surfaces: shapeSurfaces(doc, comp.leaves),
      },
      { format: '3mf', edgeLength: 0.08 },
    );
    expect(out.ext).toBe('3mf');
    const model = text(unzip(new Uint8Array(out.bytes)).get('3D/3dmodel.model')!);
    const cols = [...model.matchAll(/displaycolor="(#[0-9A-F]{6})"/g)].map((m) => m[1]);
    expect(cols.sort()).toEqual(['#1A4DE6', '#E6331A']);
    expect(model.match(/<triangle /g)!.length).toBe(out.stats.triangles);
  });
});
