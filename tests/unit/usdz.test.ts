import { describe, expect, it } from 'vitest';
import { writeZip } from '../../src/core/mesh/zip';
import { usdaLayer, writeUSDZ } from '../../src/core/mesh/usdz';
import { unzip } from '../unzip';

// a unit tetrahedron, outward winding, in millimetres
const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
const nrm = new Float32Array([-0.577, -0.577, -0.577, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const idx = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);

/** offsets of each local file's data in a zip */
function dataOffsets(buf: Uint8Array): number[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: number[] = [];
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const n = dv.getUint16(p + 26, true),
      x = dv.getUint16(p + 28, true),
      size = dv.getUint32(p + 18, true);
    out.push(p + 30 + n + x);
    p += 30 + n + x + size;
  }
  return out;
}

describe('USDZ', () => {
  it('zip entries can be 64-byte aligned and stored', async () => {
    const z = new Uint8Array(
      await writeZip([
        { name: 'a.usda', data: new TextEncoder().encode('#usda 1.0\n'), align: 64 },
        { name: 'textures/b.png', data: new Uint8Array(100).fill(7), align: 64 },
      ]),
    );
    for (const off of dataOffsets(z)) expect(off % 64).toBe(0);
    expect(new TextDecoder().decode(unzip(z).get('a.usda')!)).toBe('#usda 1.0\n');
  });

  it('writes a millimetre, Y-up layer with one material per shape colour', () => {
    const colors = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1]);
    const usda = usdaLayer(pos, nrm, idx, {
      title: 'Tet "one"',
      colors,
      palette: [
        [1, 0, 0],
        [0, 0, 1],
      ],
      roughness: 0.7,
      metallic: 0,
    });
    expect(usda.startsWith('#usda 1.0')).toBe(true);
    expect(usda).toContain('metersPerUnit = 0.001');
    expect(usda).toContain('upAxis = "Y"');
    expect(usda).toContain("Vin's Atelier");
    expect(usda).toContain('"Tet \\"one\\""'); // quotes escaped
    expect(usda).toContain('def Mesh "Tet__one_"');
    expect(usda).toContain('int[] faceVertexCounts = [3,3,3,3]');
    expect(usda).toContain('float3[] extent = [(0, 0, 0), (10, 10, 10)]');
    // faces touching the blue vertex average to red: one subset, one material
    expect(usda.match(/def GeomSubset/g)).toHaveLength(1);
    expect(usda.match(/info:id = "UsdPreviewSurface"/g)).toHaveLength(1);
    expect(usda).toContain('int[] indices = [0,1,2,3]');
  });

  it('packages the layer first and aligned', async () => {
    const z = new Uint8Array(
      await writeUSDZ(pos, nrm, idx, {
        title: 't',
        colors: new Float32Array(12).fill(0.5),
        roughness: 0.5,
        metallic: 0,
      }),
    );
    expect([...unzip(z).keys()]).toEqual(['model.usda']);
    expect(dataOffsets(z)[0] % 64).toBe(0);
    // stored, not compressed
    expect(new DataView(z.buffer).getUint16(8, true)).toBe(0);
  });
});
