/**
 * Export every gallery example plus analytic reference shapes as STL, 3MF, GLB
 * and OBJ using exactly the same pipeline as the website's export worker, and
 * write a manifest with the expected size and volume of each.
 *
 * Usage: npx tsx scripts/export-meshes.ts [outDir] [--cells N] [--only id,id]
 * Then:  python scripts/validate_meshes.py artifacts/meshes
 *        node scripts/validate-gltf.mjs artifacts/meshes
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Module from 'manifold-3d';
import '../tests/setup';
import { analyze, compile, makeEvaluator, packParams } from '../src/core/compile';
import { type SdfDoc } from '../src/core/graph/doc';
import { EXAMPLES } from '../src/gallery/examples';
import { DocBuilder } from '../src/gallery/builder';
import { edgeForQuality, type ManifoldModule } from '../src/core/mesh/mesh';
import { runExport, shapeColors, type MeshFormat } from '../src/core/mesh/pipeline';
import type { AABB } from '../src/core/nodes/types';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) ?? 'artifacts/meshes';
const cellsArg = args.indexOf('--cells');
const CELLS = cellsArg >= 0 ? Number(args[cellsArg + 1]) : 110;
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;

interface Case {
  id: string;
  doc: SdfDoc;
  /** analytic volume in mm^3, if known */
  volume?: number;
  /** analytic size in mm (x, y, z in scene axes), if known */
  size?: [number, number, number];
}

const PI = Math.PI;
function analytic(): Case[] {
  const mk = (title: string, type: string, params: Record<string, unknown>) => {
    const b = new DocBuilder(title, { mmPerUnit: 10 });
    b.output(b.add(type, params as never));
    return b.done();
  };
  return [
    {
      id: 'ref-sphere',
      doc: mk('Sphere r=12mm', 'sphere', { radius: 1.2 }),
      volume: (4 / 3) * PI * 12 ** 3,
      size: [24, 24, 24],
    },
    {
      id: 'ref-box',
      doc: mk('Box 20x10x30mm', 'box', { size: [2, 1, 3], rounding: 0 }),
      volume: 20 * 10 * 30,
      size: [20, 10, 30],
    },
    {
      id: 'ref-torus',
      doc: mk('Torus R=10 r=3mm', 'torus', { major: 1, minor: 0.3 }),
      volume: 2 * PI * PI * 10 * 3 * 3,
      size: [26, 6, 26],
    },
    {
      id: 'ref-cylinder',
      doc: mk('Cylinder r=8 h=20mm', 'cylinder', { radius: 0.8, height: 2, rounding: 0 }),
      volume: PI * 8 * 8 * 20,
      size: [16, 20, 16],
    },
    {
      id: 'ref-capsule',
      doc: mk('Capsule L=30 r=5mm', 'capsule', { length: 3, radius: 0.5 }),
      volume: PI * 25 * 20 + (4 / 3) * PI * 125,
      size: [10, 30, 10],
    },
  ];
}

/** Monte Carlo volume (mm^3) and tight extents from the SDF itself. */
function sampleVolume(map: (x: number, y: number, z: number) => number, b: AABB, mm: number, n = 250_000) {
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let inside = 0;
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const p = [0, 1, 2].map((k) => b.min[k] + rnd() * (b.max[k] - b.min[k]));
    if (map(p[0], p[1], p[2]) < 0) {
      inside++;
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
  }
  const boxVol = [0, 1, 2].reduce((a, k) => a * (b.max[k] - b.min[k]), 1);
  const frac = inside / n;
  return {
    volume: frac * boxVol * mm ** 3,
    // relative standard error of the estimate
    relErr: Math.sqrt((1 - frac) / Math.max(1, frac * n)),
    size: [0, 1, 2].map((k) => (hi[k] - lo[k]) * mm),
  };
}

async function main() {
  const wasm = (await Module()) as unknown as ManifoldModule & { setup(): void };
  wasm.setup();
  mkdirSync(outDir, { recursive: true });
  const cases: Case[] = [...analytic(), ...EXAMPLES.map((e) => ({ id: e.id, doc: e.build() }))].filter(
    (c) => !ONLY || ONLY.includes(c.id),
  );
  const manifest: Record<string, unknown>[] = [];
  for (const c of cases) {
    const comp = compile(c.doc);
    if (comp.issues.some((i) => i.level === 'error'))
      throw new Error(`${c.id}: ${JSON.stringify(comp.issues)}`);
    const P = new Float32Array(comp.paramCount);
    packParams(c.doc, comp, P);
    const bounds = analyze(c.doc, comp.rootId).bounds!;
    const mm = c.doc.settings.mmPerUnit;
    const ev = makeEvaluator(comp, P);
    const mc = sampleVolume(ev.map, bounds, mm);
    const edge = edgeForQuality(bounds, CELLS);
    const entry: Record<string, unknown> = {
      id: c.id,
      title: c.doc.title,
      mmPerUnit: mm,
      edgeMm: edge * mm,
      expectedVolume: c.volume ?? mc.volume,
      volumeSource: c.volume ? 'analytic' : 'monte-carlo',
      volumeTolerance: c.volume ? 0.015 : Math.max(0.03, 4 * mc.relErr),
      expectedSize: c.size ?? mc.size,
      sizeSource: c.size ? 'analytic' : 'sampled',
      files: {},
    };
    for (const format of ['stl', '3mf', 'glb', 'obj'] as MeshFormat[]) {
      const out = await runExport(
        wasm,
        {
          ...comp,
          P,
          bounds,
          title: c.doc.title,
          mmPerUnit: mm,
          material: c.doc.settings.material,
          palette: shapeColors(c.doc, comp.leaves),
        },
        { format, edgeLength: edge },
      );
      const file = `${c.id}.${out.ext}`;
      writeFileSync(join(outDir, file), new Uint8Array(out.bytes));
      (entry.files as Record<string, unknown>)[format] = { file, ...out.stats };
      if (format === 'stl')
        console.log(
          `${c.id.padEnd(16)} ${String(out.stats.triangles).padStart(7)} tris  ${out.stats.status}  ${(out.stats.ms / 1000).toFixed(1)} s`,
        );
    }
    manifest.push(entry);
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${manifest.length} cases to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
