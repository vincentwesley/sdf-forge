// A21: the deployed site responds and renders. Usage: node scripts/check-live.mjs [url]
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://vincentwesley.github.io/sdf-forge/';
const res = await fetch(url);
if (!res.ok) {
  console.error(`${url} returned ${res.status}`);
  process.exit(1);
}
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.sdfForge?.rendererStats()?.accumulated > 0, null, {
  timeout: 60_000,
});
const variety = await page.evaluate(() => window.sdfForge.pixelVariety());
await browser.close();
console.log(`${url}: rendered (${variety} colours), ${errors.length} page errors`);
process.exit(variety > 15 && errors.length === 0 ? 0 : 1);
