import { test, expect, openApp, waitForRender } from './fixtures';

test('loads, renders the welcome shape and shows the welcome card on a first visit', async ({ page }) => {
  const { errors } = await openApp(page, { fresh: true });
  await expect(page).toHaveTitle(/SDF Forge/);
  await expect(page.getByTestId('welcome')).toBeVisible();
  const state = await page.evaluate(() => window.sdfForge.state());
  expect(state.title).toBe('Clay blend');
  const stats = await page.evaluate(() => window.sdfForge.rendererStats());
  expect(stats!.renderer).toMatch(/SwiftShader|ANGLE|WebGL/);
  // the canvas is not blank: sample some pixels
  const varied = await page.evaluate(() => window.sdfForge.pixelVariety());
  expect(varied).toBeGreaterThan(20);
  // the studio reflection map (CC0 HDRI, public/env/studio.bin) loads from the subpath
  await expect.poll(() => page.evaluate(() => window.sdfForge.environment())).toBe(true);
  await page.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.getByTestId('welcome')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the guided tour steps through and closes', async ({ page }) => {
  await openApp(page, { fresh: true });
  await page.getByRole('button', { name: 'Show me around' }).click();
  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  for (let i = 0; i < 5; i++) await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour.getByRole('heading')).toHaveText('Need ideas?');
  await tour.getByRole('button', { name: 'Start making' }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByTestId('welcome')).toBeHidden();
});

test('autosaves and restores work after a reload', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('add-torus').click();
  const n = (await page.evaluate(() => window.sdfForge.state())).nodes;
  await page.waitForTimeout(600);
  await page.reload();
  await waitForRender(page);
  expect((await page.evaluate(() => window.sdfForge.state())).nodes).toBe(n);
});
