// Run every acceptance check (docs/ACCEPTANCE.md) and print a summary table.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const py = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3';
const steps = [
  ['A1 lint', 'npm run lint'],
  ['A2 typecheck', 'npm run typecheck'],
  ['A3-A8 unit tests', 'npm test'],
  ['A10 build', 'npm run build'],
  ['A10 dist checks', 'node scripts/check-dist.mjs'],
  ['A11 export meshes', 'npx tsx scripts/export-meshes.ts artifacts/meshes'],
  ['A11 validate meshes (trimesh)', `${py} scripts/validate_meshes.py artifacts/meshes`],
  ['A12 validate glTF', 'node scripts/validate-gltf.mjs artifacts/meshes'],
  ['A9, A13-A20 browser tests', 'npx playwright test --trace off'],
];
if (process.argv.includes('--live')) steps.push(['A21 live site', 'node scripts/check-live.mjs']);

const results = [];
for (const [name, cmd] of steps) {
  const t0 = Date.now();
  console.log(`\n=== ${name}: ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  results.push({ name, ok: r.status === 0, s: ((Date.now() - t0) / 1000).toFixed(0) });
}
console.log('\nAcceptance summary');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} ${r.s}s`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
