/**
 * Record the README media from the built site: screenshots and a short demo GIF.
 * Usage: npm run build && npx tsx scripts/make-media.ts   (needs Python with Pillow for the GIF)
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const server = spawn('node', ['scripts/serve-dist.mjs'], {
  stdio: 'ignore',
  env: { ...process.env, PORT: '4198' },
});
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const FR = 'artifacts/gif-frames';
rmSync(FR, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });
mkdirSync('docs/media', { recursive: true });

async function settle(page: Page, ms = 900) {
  await page.waitForFunction(() => !window.sdfForge.compiling());
  await page.waitForTimeout(ms);
}

try {
  // ---- screenshots ----
  for (const [name, w, h, theme, hash] of [
    ['desktop-dark', 1440, 900, 'dark', 'example=clay-blend'],
    ['desktop-light', 1440, 900, 'light', 'example=planter'],
    ['phone-dark', 390, 844, 'dark', 'example=donut'],
  ] as const) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.addInitScript(
      (t) => localStorage.setItem('sdf-forge:prefs', JSON.stringify({ tourDone: true, theme: t })),
      theme,
    );
    await page.goto(`http://localhost:4198/sdf-forge/#${hash}`);
    await page.waitForFunction(() => (window.sdfForge?.rendererStats()?.accumulated ?? 0) > 0);
    if (name === 'desktop-dark') await page.locator('[data-testid="node-torus"]').click();
    await settle(page, 2500);
    await page.screenshot({ path: `docs/media/${name}.png` });
    await ctx.close();
  }

  // ---- GIF frames ----
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 680 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() =>
    localStorage.setItem('sdf-forge:prefs', JSON.stringify({ tourDone: true, theme: 'dark' })),
  );
  await page.goto('http://localhost:4198/sdf-forge/#example=clay-blend');
  await page.waitForFunction(() => (window.sdfForge?.rendererStats()?.accumulated ?? 0) > 0);
  await settle(page, 1500);
  let n = 0;
  const frame = async (repeat = 1) => {
    const buf = await page.screenshot();
    for (let i = 0; i < repeat; i++) {
      const f = `${FR}/${String(n++).padStart(4, '0')}.png`;
      (await import('node:fs')).writeFileSync(f, buf);
    }
  };
  await frame(4);
  // orbit a little
  const cam0 = await page.evaluate(() => window.sdfForge.camera());
  for (let i = 1; i <= 6; i++) {
    await page.evaluate((y) => window.sdfForge.setCamera({ yaw: y }), cam0.yaw + i * 0.12);
    await settle(page, 500);
    await frame();
  }
  // add a capsule with the toolbar
  await page.getByTestId('add-capsule').click();
  await settle(page, 900);
  await frame(3);
  // drag it upward with the gizmo
  const arrow = page.getByTestId('gizmo-y');
  const b = (await arrow.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - i * 14);
    await settle(page, 450);
    await frame();
  }
  await page.mouse.up();
  // melt it in with the blend slider
  const union = await page.evaluate(() => window.sdfForge.getDoc().nodes.find((x) => x.type === 'union')!.id);
  for (const v of [0.25, 0.4, 0.55]) {
    await page.evaluate(
      ([id, v]) => window.sdfForge.setParam(id as string, 'smooth', v as number),
      [union, v],
    );
    await settle(page, 600);
    await frame();
  }
  await frame(3);
  // open a printable template and twist it
  await page.getByTestId('open-gallery').click();
  await page.waitForTimeout(500);
  await frame(3);
  await page.getByTestId('example-twisted-vase').click();
  await settle(page, 1200);
  await frame(3);
  const tw = await page.evaluate(() => window.sdfForge.getDoc().nodes.find((x) => x.type === 'twist')!.id);
  for (const v of [40, 60, 80, 100]) {
    await page.evaluate(([id, v]) => window.sdfForge.setParam(id as string, 'amount', v as number), [tw, v]);
    await settle(page, 600);
    await frame();
  }
  await frame(2);
  // export dialog
  await page.getByTestId('open-export').click();
  await page.waitForTimeout(500);
  await frame(4);
  await ctx.close();
} finally {
  await browser.close();
  server.kill();
}

const py = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    `
import glob
from PIL import Image
files = sorted(glob.glob('${FR}/*.png'))
frames = [Image.open(f).convert('RGB').resize((825, 510), Image.LANCZOS) for f in files]
q = [f.quantize(palette=f.quantize(colors=256, method=Image.Quantize.MEDIANCUT), dither=Image.Dither.FLOYDSTEINBERG) for f in frames]
q[0].save('docs/media/demo.gif', save_all=True, append_images=q[1:], duration=380, loop=0, optimize=True)
for name in ['desktop-dark','desktop-light','phone-dark']:
    im = Image.open(f'docs/media/{name}.png').convert('RGB')
    im.save(f'docs/media/{name}.png', optimize=True)
print('gif frames', len(frames))
`,
  ],
  { stdio: 'inherit' },
);
process.exit(py.status ?? 1);
