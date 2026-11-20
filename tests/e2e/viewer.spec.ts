import AxeBuilder from '@axe-core/playwright';
import { test, expect, openApp } from './fixtures';

test('view-only player: shape, Controls, open link, no editing, nothing saved', async ({ page }) => {
  const { errors } = await openApp(page, { hash: 'example=planter&view=1' });
  await expect(page.getByTestId('viewer-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Planter' })).toBeVisible();
  // no editor: no graph, no inspector, no add toolbar
  await expect(page.locator('.react-flow')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Add a shape' })).toBeHidden();
  expect(await page.evaluate(() => window.sdfForge.pixelVariety())).toBeGreaterThan(20);
  // the Controls work, and nothing is written to the visitor's saved work
  const before = await page.evaluate(() => localStorage.getItem('sdf-forge:doc'));
  const field = page.getByRole('textbox', { name: /Height/ });
  await field.fill('90');
  await field.press('Enter');
  await expect(page.getByTestId('viewer-panel').getByRole('textbox', { name: /Height/ })).toHaveValue('90');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('sdf-forge:doc'))).toBe(before);
  // clicking the shape selects nothing
  const c = (await page.getByTestId('viewport-canvas').boundingBox())!;
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  expect((await page.evaluate(() => window.sdfForge.state())).selection).toEqual([]);
  // "Open in SDF Forge" opens the shape as shared (not the visitor's changes) in the editor
  const href = await page.getByTestId('viewer-open').getAttribute('href');
  expect(href).toMatch(/#g=/);
  expect(href).not.toContain('view=1');
  const res = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  expect(errors).toEqual([]);
});

test('the Share dialog gives embed code that opens the player', async ({ page }) => {
  await openApp(page, { hash: 'example=lamp' });
  await page.getByRole('button', { name: 'Share' }).click();
  const code = page.getByTestId('embed-code');
  await expect(code).toHaveValue(/^<iframe src="[^"]+#g=[^"]+&view=1"/);
  const url = (await page.getByTestId('view-link').getAttribute('href'))!;
  await page.goto('about:blank');
  await page.goto(url);
  await expect(page.getByTestId('viewer-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desk lamp' })).toBeVisible();
});

test('the player on a phone: Controls fold away, nothing overflows', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true });
  const page = await ctx.newPage();
  await openApp(page, { hash: 'example=planter&view=1' });
  const toggle = page.getByRole('button', { name: 'Show Controls' });
  await expect(toggle).toBeVisible();
  await toggle.tap();
  await expect(page.getByRole('group', { name: 'Controls' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});

test('export: the printer check says whether it fits and scales it to fit', async ({ page }) => {
  await openApp(page, { hash: 'example=planter' });
  await page.getByRole('button', { name: 'Export' }).first().click();
  await page.getByLabel('Longest side').fill('400');
  await page.getByLabel('Longest side').press('Enter');
  await page.getByLabel('Printer').selectOption('a1mini');
  await expect(page.getByTestId('bed-fit')).toContainText('Too big');
  await page.getByRole('button', { name: 'Scale to fit' }).click();
  await expect(page.getByTestId('bed-fit')).toContainText('Fits the 180 × 180 × 180 mm bed');
  const dims = await page.getByTestId('export-dims').textContent();
  expect(Math.max(...dims!.replace(' mm', '').split(' × ').map(Number))).toBeLessThanOrEqual(180);
  // remembered for next time
  expect(await page.evaluate(() => localStorage.getItem('sdf-forge:printer'))).toBe('a1mini');
});
