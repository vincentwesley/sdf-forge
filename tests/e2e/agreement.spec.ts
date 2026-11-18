import { test, expect, openApp } from './fixtures';

/**
 * The generated GLSL (run on the GPU through ANGLE/SwiftShader) and the CPU
 * evaluator (generated JavaScript) must agree on distances and colours.
 */
test('shader and CPU evaluator agree for every gallery example and every node type', async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  const report = await page.evaluate(() => {
    const api = window.sdfForge;
    const docs: { name: string; doc: unknown }[] = api
      .examples()
      .map((id) => ({ name: id, doc: api.exampleDoc(id) }));
    // one small graph per node type
    const types = [
      'sphere',
      'box',
      'torus',
      'cylinder',
      'capsule',
      'cone',
      'ellipsoid',
      'octahedron',
      'hexPrism',
      'link',
      'twist',
      'bend',
      'repeat',
      'radial',
      'mirror',
      'elongate',
      'shell',
      'round',
      'displace',
      'lattice',
      'cut',
      'transform',
    ];
    for (const t of types) {
      const leaf = [
        'twist',
        'bend',
        'repeat',
        'radial',
        'mirror',
        'elongate',
        'shell',
        'round',
        'displace',
        'lattice',
        'cut',
        'transform',
      ].includes(t);
      const nodes: unknown[] = [{ id: 'out', type: 'output', x: 0, y: 0, params: {} }];
      const edges: unknown[] = [];
      if (leaf) {
        nodes.push({
          id: 'a',
          type: 'box',
          x: 0,
          y: 0,
          params: { position: [0.6, 0.2, 0], rotation: [20, 30, 0] },
        });
        nodes.push({ id: 'm', type: t, x: 0, y: 0, params: {} });
        edges.push(
          { id: 'e1', source: 'a', target: 'm', input: 'shape' },
          { id: 'e2', source: 'm', target: 'out', input: 'shape' },
        );
      } else {
        nodes.push({
          id: 'a',
          type: t,
          x: 0,
          y: 0,
          params: { position: [0.1, -0.2, 0.3], rotation: [15, 25, 35], scale: 1.3 },
        });
        edges.push({ id: 'e1', source: 'a', target: 'out', input: 'shape' });
      }
      docs.push({
        name: `node:${t}`,
        doc: {
          version: 1,
          title: t,
          nodes,
          edges,
          pinned: [],
          settings: { mmPerUnit: 10, material: 'clay' },
        },
      });
    }
    const out: { name: string; maxErr: number; maxColErr: number; n: number }[] = [];
    let seed = 1;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (const { name, doc } of docs) {
      const probe = api.agreement(doc as never, [0, 0, 0]);
      const b = probe.bounds!;
      const pts: number[] = [];
      for (let i = 0; i < 1500; i++)
        for (let k = 0; k < 3; k++) pts.push(b.min[k] - 0.3 + rnd() * (b.max[k] - b.min[k] + 0.6));
      const r = api.agreement(doc as never, pts);
      let maxErr = 0,
        maxColErr = 0;
      for (let i = 0; i < r.cpu.length; i++) {
        const scale = Math.max(1, Math.abs(r.cpu[i]));
        maxErr = Math.max(maxErr, Math.abs(r.gpu[i] - r.cpu[i]) / scale);
        // colours only matter near the surface, where shading happens
        if (Math.abs(r.cpu[i]) < 0.2)
          for (let k = 0; k < 3; k++)
            maxColErr = Math.max(maxColErr, Math.abs(r.gpuColor[i * 3 + k] - r.cpuColor[i * 3 + k]));
      }
      out.push({ name, maxErr, maxColErr, n: r.cpu.length });
    }
    return out;
  });
  console.table(
    report.map((r) => ({ ...r, maxErr: r.maxErr.toExponential(2), maxColErr: r.maxColErr.toExponential(2) })),
  );
  for (const r of report) {
    expect(r.n, r.name).toBe(1500);
    expect(r.maxErr, `${r.name} distance`).toBeLessThan(2e-3);
    expect(r.maxColErr, `${r.name} colour`).toBeLessThan(2e-2);
  }
});
