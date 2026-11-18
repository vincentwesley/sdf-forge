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
  // a real pointer drag orbits the camera
  const canvas = page.getByTestId('viewport-canvas');
  const b = (await canvas.boundingBox())!;
  const yaw0 = (await page.evaluate(() => window.sdfForge.camera())).yaw;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2 + i * 8, b.y + b.height / 2);
  await page.mouse.up();
  expect((await page.evaluate(() => window.sdfForge.camera())).yaw).not.toBeCloseTo(yaw0, 3);
  // Measure the renderer, not the test harness: orbit from inside the page on every
  // animation frame (as a fast drag would), so slow input round trips on a busy CI
  // machine cannot cap the count. Warm up first so the dynamic resolution settles.
  const result = await page.evaluate(
    () =>
      new Promise<{ fps: number; scale: number; w: number; h: number }>((resolve) => {
        const api = window.sdfForge;
        let yaw = api.camera().yaw;
        let f0 = 0,
          t0 = 0;
        const start = performance.now();
        const step = (now: number) => {
          yaw += 0.02;
          api.setCamera({ yaw });
          if (!t0 && now - start > 1500) {
            t0 = now;
            f0 = api.rendererStats()!.frames;
          }
          if (t0 && now - t0 > 3000) {
            const s = api.rendererStats()!;
            resolve({ fps: ((s.frames - f0) * 1000) / (now - t0), scale: s.scale, w: s.width, h: s.height });
          } else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  console.log(
    `orbiting: ${result.fps.toFixed(1)} frames/s at render scale ${result.scale.toFixed(2)} (${result.w}x${result.h})`,
  );
  expect(result.fps).toBeGreaterThan(20);
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
