// Validate every exported GLB with the Khronos glTF-Validator (Apache-2.0).
// Usage: node scripts/validate-gltf.mjs artifacts/meshes
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import validator from 'gltf-validator';

const dir = process.argv[2] ?? 'artifacts/meshes';
const files = readdirSync(dir).filter((f) => f.endsWith('.glb'));
let failed = 0;
for (const f of files) {
  const report = await validator.validateBytes(new Uint8Array(readFileSync(join(dir, f))), {
    uri: f,
    maxIssues: 50,
  });
  const { numErrors, numWarnings } = report.issues;
  const gen = report.info?.generator ?? '';
  const ok = numErrors === 0 && gen.includes("Vin's Atelier");
  if (!ok) failed++;
  console.log(`${f.padEnd(24)} errors ${numErrors}  warnings ${numWarnings}  ${ok ? 'ok' : 'FAIL'}`);
  if (numErrors)
    for (const m of report.issues.messages.filter((m) => m.severity === 0).slice(0, 5))
      console.log(`   ${m.code}: ${m.message} @ ${m.pointer}`);
  if (!gen.includes("Vin's Atelier")) console.log('   missing generator credit');
}
if (!files.length) {
  console.error('no GLB files found');
  process.exit(1);
}
console.log(
  failed ? `\nFAILED: ${failed} file(s)` : `\nAll ${files.length} GLB files pass the Khronos glTF validator.`,
);
process.exit(failed ? 1 : 0);
