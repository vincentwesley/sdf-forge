import { mkdirSync } from 'node:fs';
import { test, expect, openApp, waitForRender } from './fixtures';

const IDS = [
  'clay-blend',
  'twisted-vase',
  'planter',
  'gyroid-sphere',
  'keychain',
  'ring',
  'bowl',
  'donut',
  'rock',
  'mushroom',
  'twisted-tower',
  'chain',
  'flower',
  'bridge',
  'morph',
  'pawn',
  'bracket',
  'heart-badge',
  'gem',
];

test('the gallery lists every example', async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => window.sdfForge.examples());
  expect(ids.sort()).toEqual([...IDS].sort());
  await page.getByTestId('open-gallery').click();
  for (const id of ids) await expect(page.getByTestId(`example-${id}`)).toBeVisible();
});

for (const id of IDS) {
  test(`gallery example opens and renders: ${id}`, async ({ page }) => {
    const { errors } = await openApp(page);
    await page.getByTestId('open-gallery').click();
    await page.getByTestId(`example-${id}`).click();
    await expect(page.getByTestId('gallery')).toBeHidden();
    await waitForRender(page);
    await page.waitForTimeout(800);
    const v = await page.evaluate(() => window.sdfForge.pixelVariety());
    expect(v).toBeGreaterThan(15);
    mkdirSync('artifacts/screenshots/gallery', { recursive: true });
    await page.getByTestId('viewport-canvas').screenshot({ path: `artifacts/screenshots/gallery/${id}.png` });
    expect(errors).toEqual([]);
  });
}
