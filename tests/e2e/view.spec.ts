import AxeBuilder from '@axe-core/playwright';
import { test, expect, openApp, waitForRender } from './fixtures';

test('camera menu: standard views and orthographic projection', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('camera-menu').click();
  await page.getByRole('menuitem', { name: 'Top' }).click();
  const top = await page.evaluate(() => window.sdfForge.camera());
  expect(top.pitch).toBeGreaterThan(1.56);
  await page.getByTestId('camera-menu').click();
  const ortho = page.getByRole('menuitemcheckbox', { name: /Orthographic/ });
  await expect(ortho).toHaveAttribute('aria-checked', 'false');
  await ortho.click();
  expect((await page.evaluate(() => window.sdfForge.camera())).ortho).toBe(true);
  await waitForRender(page);
  expect(await page.evaluate(() => window.sdfForge.pixelVariety())).toBeGreaterThan(20);
});

test('section view: axis, position and close controls work, are accessible, and exports keep the whole shape', async ({
  page,
}) => {
  await openApp(page, { hash: 'example=planter' });
  // look straight at the front so the cut side faces the camera
  await page.getByTestId('camera-menu').click();
  await page.getByRole('menuitem', { name: 'Front' }).click();
  await page.keyboard.press('f');
  const canvas = page.getByTestId('viewport-canvas');
  const b = (await canvas.boundingBox())!;
  const centre = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  // before: clicking the middle of the pot selects it
  await page.mouse.click(centre.x, centre.y);
  await expect
    .poll(async () => (await page.evaluate(() => window.sdfForge.state())).selection.length)
    .toBe(1);
  await page.keyboard.press('Escape');
  // cut along Z, keeping the back half: the click now hits the inside of the far wall, not the near one
  await page.getByTestId('section-toggle').click();
  const panel = page.getByTestId('section-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('radio', { name: 'Z' }).click();
  await panel.getByRole('slider', { name: 'Cut position' }).fill('0.5');
  await waitForRender(page);
  const res = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('[data-testid="section-panel"]')
    .analyze();
  expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  // the export still contains the whole shape: the section is view-only
  const full = await page.evaluate(() => window.sdfForge.exportMesh('stl', 40));
  await panel.getByRole('button', { name: 'Close section view' }).click();
  await expect(panel).toBeHidden();
  const again = await page.evaluate(() => window.sdfForge.exportMesh('stl', 40));
  expect(full.stats.volumeMm3).toBeCloseTo(again.stats.volumeMm3, 0);
});
