// Sanity checks on the production build for GitHub Pages:
// every file is small, paths are relative (works from a subpath), and the
// page carries the studio credit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'dist';
const MAX = 25 * 1024 * 1024; // well below GitHub's 100 MB limit
let total = 0;
let failed = false;
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
for (const f of walk(root)) {
  const size = statSync(f).size;
  total += size;
  if (size > MAX) {
    console.error(`too large: ${f} (${(size / 1e6).toFixed(1)} MB)`);
    failed = true;
  }
}
const html = readFileSync(join(root, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) {
  console.error('index.html contains root-absolute paths; the site must work from a subpath');
  failed = true;
}
if (!html.includes("Vin's Atelier") && !html.includes('Vin&#39;s Atelier')) {
  console.error('index.html is missing the studio credit');
  failed = true;
}
console.log(`dist: ${walk(root).length} files, ${(total / 1e6).toFixed(2)} MB total`);
process.exit(failed ? 1 : 0);
