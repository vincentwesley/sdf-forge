/**
 * Render gallery thumbnails (public/gallery/<id>.webp) and the social preview
 * image (public/og.png) from the built site.
 * Usage: npm run build && npm run thumbnails
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const server = spawn('node', ['scripts/serve-dist.mjs'], {
  stdio: 'ignore',
  env: { ...process.env, PORT: '4199' },
});
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  await page.addInitScript(() =>
    localStorage.setItem('sdf-forge:prefs', JSON.stringify({ tourDone: true, theme: 'dark' })),
  );
  await page.goto('http://localhost:4199/sdf-forge/');
  await page.waitForFunction(() => (window.sdfForge?.rendererStats()?.accumulated ?? 0) > 0);
  mkdirSync('public/gallery', { recursive: true });
  const ids: string[] = await page.evaluate(() => window.sdfForge.examples());
  const dataUrl = (s: string) => Buffer.from(s.split(',')[1], 'base64');
  for (const id of ids) {
    await page.evaluate((id) => window.sdfForge.loadExample(id), id);
    await page.waitForFunction(
      () => !window.sdfForge.compiling() && window.sdfForge.rendererStats()!.accumulated > 2,
    );
    await page.waitForTimeout(300);
    const url = await page.evaluate(() => window.sdfForge.snapshot(480, 360));
    writeFileSync(`public/gallery/${id}.webp`, dataUrl(url));
    console.log('thumbnail', id);
  }
  // social preview: the welcome example, 1200x630
  await page.evaluate(() => window.sdfForge.loadExample('clay-blend'));
  await page.waitForFunction(
    () => !window.sdfForge.compiling() && window.sdfForge.rendererStats()!.accumulated > 2,
  );
  writeFileSync(
    'public/og.png',
    dataUrl(await page.evaluate(() => window.sdfForge.snapshot(1200, 630, 'image/png'))),
  );
} finally {
  await browser.close();
  server.kill();
}
