import { describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { G, evaluator } from '../helpers';
import { analyze, compile, packParams } from '../../src/core/compile';
import { MATERIAL_VALUES, clearCoat, exportRoughness, materialValues } from '../../src/core/material';
import { type Surface, shapeSurfaces, surfaceGroups } from '../../src/core/mesh/surfaces';
import { runExport } from '../../src/core/mesh/pipeline';
import { threeMfModel } from '../../src/core/mesh/threemf';
import { usdaLayer } from '../../src/core/mesh/usdz';
import type { ManifoldModule } from '../../src/core/mesh/mesh';
import { normalizeDoc, type SdfDoc } from '../../src/core/graph/doc';
import { DocBuilder } from '../../src/gallery/builder';
import { decodeDoc, encodeDoc } from '../../src/core/share';
import { unzip } from '../unzip';

const mat = (e: ReturnType<typeof evaluator>, x: number, y: number, z: number) => {
  const out = [0, 0, 0, 0, 0, 0];
  e.color(x, y, z, out);
  return out.slice(3);
};

/** clay sphere on the left, metal sphere on the right */
function pair(smooth: number, right = 'metal', scene: 'clay' | 'glossy' | 'metal' = 'clay') {
  const g = new G();
  const a = g.node('sphere', { radius: 1, position: [-1, 0, 0], material: 'clay' });
  const b = g.node('sphere', { radius: 1, position: [1, 0, 0], material: right });
  const u = g.node('union', { smooth });
  g.link(a, u, 'shapes').link(b, u, 'shapes').out(u);
  g.doc.settings = { ...g.doc.settings, material: scene };
  return g.doc;
}

describe('materials', () => {
  it('presets: clay matte, glossy smooth with a clear coat, metal metallic, glow emissive', () => {
    expect(materialValues('scene', 'glossy')).toEqual(MATERIAL_VALUES.glossy);
    expect(materialValues('metal', 'clay')).toEqual([0.3, 1, 0]);
    expect(materialValues('nonsense', 'clay')).toEqual(MATERIAL_VALUES.clay);
    expect(materialValues('glow', 'clay')[2]).toBe(1);
    expect(clearCoat(...(MATERIAL_VALUES.glossy.slice(0, 2) as [number, number]))).toBe(1);
    expect(clearCoat(...(MATERIAL_VALUES.clay.slice(0, 2) as [number, number]))).toBe(0);
    expect(clearCoat(...(MATERIAL_VALUES.metal.slice(0, 2) as [number, number]))).toBe(0);
    // export roughness keeps the previous single-material exports exactly
    expect(exportRoughness(0.65)).toBeCloseTo(0.7, 6);
    expect(exportRoughness(0.16)).toBeCloseTo(0.25, 6);
    expect(exportRoughness(0.3)).toBeCloseTo(0.3, 6);
    for (let r = 0; r < 1; r += 0.05) expect(exportRoughness(r + 0.05)).toBeGreaterThan(exportRoughness(r));
  });

  it('each shape keeps its own material with a sharp union', () => {
    const e = evaluator(pair(0));
    expect(mat(e, -2, 0, 0)).toEqual([0.65, 0, 0].map(Math.fround));
    expect(mat(e, 2, 0, 0)).toEqual([0.3, 1, 0].map(Math.fround));
  });

  it('materials blend across a smooth union exactly like colours do', () => {
    const doc = pair(0.6);
    const e = evaluator(doc);
    // the blend weight is the colour weight: compare the material mix with the colour mix
    const g2 = new G();
    const a = g2.node('sphere', { radius: 1, position: [-1, 0, 0], color: [0, 0, 0] });
    const b = g2.node('sphere', { radius: 1, position: [1, 0, 0], color: [1, 1, 1] });
    const u = g2.node('union', { smooth: 0.6 });
    g2.link(a, u, 'shapes').link(b, u, 'shapes').out(u);
    const ec = evaluator(g2.doc);
    const out = [0, 0, 0];
    for (const x of [-0.5, -0.2, 0, 0.1, 0.4]) {
      ec.color(x, 1, 0, out);
      const t = out[0];
      const m = mat(e, x, 1, 0);
      expect(m[0]).toBeCloseTo(0.65 + (0.3 - 0.65) * t, 5);
      expect(m[1]).toBeCloseTo(t, 5);
    }
    // halfway between equal spheres the blend is exactly 50 %
    expect(mat(e, 0, 0, 0)[1]).toBeCloseTo(0.5, 5);
  });

  it('"Same as scene" follows the document default without recompiling', () => {
    const glossy = pair(0, 'scene', 'glossy');
    const metal = pair(0, 'scene', 'metal');
    expect(compile(glossy).glsl).toBe(compile(metal).glsl);
    expect(mat(evaluator(glossy), 2, 0, 0)).toEqual(MATERIAL_VALUES.glossy.map(Math.fround));
    expect(mat(evaluator(metal), 2, 0, 0)).toEqual(MATERIAL_VALUES.metal.map(Math.fround));
    // changing a shape's material only changes uniforms
    expect(compile(pair(0, 'glow')).glsl).toBe(compile(pair(0, 'metal')).glsl);
  });

  it('carving paints the cut with the cutter’s material only when asked', () => {
    for (const paint of [false, true]) {
      const g = new G();
      const a = g.node('box', { size: [2, 2, 2], material: 'clay' });
      const c = g.node('sphere', { radius: 0.8, position: [0, 1, 0], material: 'metal' });
      const s = g.node('subtract', { paintCut: paint });
      g.link(a, s, 'base').link(c, s, 'cutter').out(s);
      const e = evaluator(g.doc);
      // a point on the carved surface (inside the bowl)
      expect(mat(e, 0, 0.2, 0)[1]).toBe(paint ? 1 : 0);
      expect(mat(e, 0, -1, 0)[1]).toBe(0);
    }
  });

  it('is stored in documents and share links, and unknown values fall back', async () => {
    const doc = pair(0, 'glow');
    const back = await decodeDoc(await encodeDoc(doc));
    expect(back.nodes.map((n) => n.params.material).filter(Boolean)).toEqual(['clay', 'glow']);
    const bad = normalizeDoc({
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.type === 'sphere' ? { ...n, params: { ...n.params, material: 'lava' } } : n,
      ),
    } as SdfDoc);
    expect(bad.nodes.filter((n) => n.type === 'sphere').map((n) => n.params.material)).toEqual([
      'scene',
      'scene',
    ]);
  });
});

describe('material exports', () => {
  const surf = (color: Surface['color'], m: 'clay' | 'metal' | 'glow'): Surface => {
    const [rough, metal, glow] = MATERIAL_VALUES[m];
    return { color, rough, metal, glow };
  };
  // a tetrahedron: three clay vertices and one metal one
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
  const nrm = new Float32Array([-0.577, -0.577, -0.577, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const idx = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);

  it('same colour, different materials: two groups', () => {
    const colors = new Float32Array(12).fill(0.5);
    const mats = new Float32Array([0.65, 0, 0, 0.65, 0, 0, 0.65, 0, 0, 0.3, 1, 0]);
    // the face away from vertex 3 is pure clay; faces touching it are 1/3 metal → still clay
    const one = surfaceGroups(colors, mats, idx, [
      surf([0.5, 0.5, 0.5], 'clay'),
      surf([0.5, 0.5, 0.5], 'metal'),
    ]);
    expect(one.groups).toHaveLength(1);
    // make vertices 2 and 3 metal: faces touching both become metal
    const mats2 = new Float32Array([0.65, 0, 0, 0.65, 0, 0, 0.3, 1, 0, 0.3, 1, 0]);
    const two = surfaceGroups(colors, mats2, idx, [
      surf([0.5, 0.5, 0.5], 'clay'),
      surf([0.5, 0.5, 0.5], 'metal'),
    ]);
    expect(two.groups.map((g) => g.metal)).toEqual([0, 1]);
    // faces (0,2,1) and (0,1,3) have one metal corner, (0,3,2) and (1,2,3) have two
    expect([...two.tri]).toEqual([0, 0, 1, 1]);
  });

  it('USDZ gets a UsdPreviewSurface per surface, with metallic and emissive values', () => {
    const groups = {
      groups: [surf([1, 0, 0], 'metal'), surf([0, 1, 0], 'glow')],
      tri: new Uint16Array([0, 0, 1, 1]),
    };
    const usda = usdaLayer(pos, nrm, idx, { title: 't', groups });
    expect(usda.match(/info:id = "UsdPreviewSurface"/g)).toHaveLength(2);
    expect(usda).toContain('float inputs:metallic = 1');
    expect(usda).toContain('float inputs:roughness = 0.3');
    expect(usda).toContain('color3f inputs:emissiveColor = (0, 1, 0)');
    expect(usda.match(/emissiveColor/g)).toHaveLength(1);
  });

  it('3MF names each filament with its material and stays plain core 3MF', () => {
    const groups = {
      groups: [surf([1, 0, 0], 'clay'), surf([0, 0, 1], 'metal')],
      tri: new Uint16Array([0, 0, 1, 1]),
    };
    const xml = threeMfModel(pos, idx, { title: 't', groups, date: '2026-01-01' });
    expect(xml).toContain('<base name="Colour 1 (clay)" displaycolor="#FF0000"/>');
    expect(xml).toContain('<base name="Colour 2 (metal)" displaycolor="#0000FF"/>');
    expect(xml.match(/<triangle [^>]*p1="1"/g)).toHaveLength(2);
    // no extension namespaces: lib3mf's strict mode rejects PBR display properties
    expect(xml).not.toContain('xmlns:m=');
  });

  it('a clay mug with a metal handle exports as two parts in GLB, USDZ and 3MF', async () => {
    const wasm = (await Module()) as unknown as ManifoldModule & { setup(): void };
    wasm.setup();
    const b = new DocBuilder('mug', { mmPerUnit: 10 });
    const body = b.add('cylinder', { radius: 1, height: 2, color: [0.9, 0.5, 0.3] });
    const handle = b.add('torus', {
      major: 0.6,
      minor: 0.15,
      position: [1.1, 0, 0],
      rotation: [90, 0, 0],
      color: [0.9, 0.5, 0.3],
      material: 'metal',
    });
    b.output(b.add('union', { smooth: 0.1 }, [body, handle]));
    const doc = b.done();
    const comp = compile(doc);
    const P = new Float32Array(comp.paramCount);
    packParams(doc, comp, P);
    const input = {
      ...comp,
      P,
      bounds: analyze(doc, comp.rootId).bounds!,
      title: 'mug',
      mmPerUnit: 10,
      material: 'clay' as const,
      surfaces: shapeSurfaces(doc, comp.leaves),
    };
    expect(input.surfaces).toHaveLength(2);

    const glb = await runExport(wasm, input, { format: 'glb', edgeLength: 0.08 });
    const dv = new DataView(glb.bytes);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb.bytes, 20, dv.getUint32(12, true))));
    const prims = json.meshes[0].primitives;
    expect(prims).toHaveLength(2);
    expect(
      json.materials
        .map(
          (m: { pbrMetallicRoughness: { metallicFactor: number } }) => m.pbrMetallicRoughness.metallicFactor,
        )
        .sort(),
    ).toEqual([0, 1]);
    const idxCount = prims.reduce(
      (a: number, p: { indices: number }) => a + json.accessors[p.indices].count,
      0,
    );
    expect(idxCount).toBe(glb.stats.triangles * 3);
    // the handle is much smaller than the body
    const counts = prims.map((p: { indices: number; material: number }) => ({
      n: json.accessors[p.indices].count,
      metal: json.materials[p.material].pbrMetallicRoughness.metallicFactor,
    }));
    const metalN = counts.find((c: { metal: number }) => c.metal === 1).n;
    expect(metalN).toBeGreaterThan(0);
    expect(metalN).toBeLessThan(idxCount / 2);

    const usdz = await runExport(wasm, input, { format: 'usdz', edgeLength: 0.08 });
    const usda = new TextDecoder().decode(unzip(new Uint8Array(usdz.bytes)).get('model.usda')!);
    expect(usda.match(/def GeomSubset/g)).toHaveLength(2);
    expect(usda).toContain('float inputs:metallic = 1');

    const tmf = await runExport(wasm, input, { format: '3mf', edgeLength: 0.08 });
    const model = new TextDecoder().decode(unzip(new Uint8Array(tmf.bytes)).get('3D/3dmodel.model')!);
    expect(model).toContain('(metal)');
    expect(model).toContain('(clay)');
  });
});
