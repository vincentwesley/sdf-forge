import { test, expect, openApp } from './fixtures';

/**
 * Frame-rate check with software rendering (SwiftShader, no GPU). While the
 * user drags, the renderer lowers its resolution to stay interactive; we
 * measure the frame rate it achieves during continuous orbiting.
 */
test('stays interactive during orbit with software rendering', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const canvas = page.getByTestId('viewport-canvas');
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  // warm up so the dynamic resolution settles
  for (let i = 0; i < 30; i++)
    await page.mouse.move(b.x + b.width / 2 + (i % 20) * 4, b.y + b.height / 2, { steps: 1 });
  const f0 = (await page.evaluate(() => window.sdfForge.rendererStats()))!.frames;
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 3000) {
    i++;
    await page.mouse.move(
      b.x + b.width / 2 + Math.sin(i / 5) * 120,
      b.y + b.height / 2 + Math.cos(i / 7) * 40,
      { steps: 1 },
    );
  }
  const stats = (await page.evaluate(() => window.sdfForge.rendererStats()))!;
  await page.mouse.up();
  const fps = ((stats.frames - f0) * 1000) / (Date.now() - t0);
  console.log(
    `orbiting: ${fps.toFixed(1)} frames/s at render scale ${stats.scale.toFixed(2)} (${stats.width}x${stats.height})`,
  );
  expect(fps).toBeGreaterThan(20);
});

test.describe.configure({ mode: 'serial' });

test('continuous rendering at adaptive resolution reaches an interactive frame rate', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.evaluate(() => window.sdfForge.setContinuous(true));
  await page.waitForTimeout(4000); // let the resolution adapt
  const s1 = await page.evaluate(() => window.sdfForge.rendererStats());
  await page.waitForTimeout(3000);
  const s2 = await page.evaluate(() => window.sdfForge.rendererStats());
  await page.evaluate(() => window.sdfForge.setContinuous(false));
  console.log(
    `renderer fps ${s2!.fps.toFixed(1)} at scale ${s2!.scale.toFixed(2)} (${s2!.width}x${s2!.height}); before ${s1!.fps.toFixed(1)}`,
  );
  expect(s2!.fps).toBeGreaterThan(15);
});
