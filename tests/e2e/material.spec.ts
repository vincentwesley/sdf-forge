import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, openApp, waitForRender } from './fixtures';

const paramOf = (page: Page, name: string) =>
  page.evaluate((name) => {
    const n = window.sdfForge.getDoc().nodes.find((x) => x.name === name)!;
    return n.params.material;
  }, name);

const canvasShot = async (page: Page) => {
  await waitForRender(page);
  await page.waitForTimeout(600);
  return page.getByTestId('viewport-canvas').screenshot();
};

test('per-shape material: pick with the keyboard, see it render, undo, accessible', async ({ page }) => {
  await openApp(page, { hash: 'example=lamp' });
  // the shade is glossy, the stand metal, the bulb glows
  expect(await paramOf(page, 'Stem')).toBe('metal');
  expect(await paramOf(page, 'Bulb')).toBe('glow');
  await page.locator('.react-flow__node').filter({ hasText: 'Stem' }).click();
  const field = page.getByRole('combobox', { name: 'Material' });
  await expect(field).toHaveValue('metal');
  // the node card says so too
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Stem' })).toContainText('metal');

  const before = await canvasShot(page);
  // keyboard: focus the list and move to the next option (Metal → Glow)
  await field.focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => paramOf(page, 'Stem')).toBe('glow');
  const after = await canvasShot(page);
  expect(Buffer.compare(before, after)).not.toBe(0);

  // one undo step brings it back, even with the focus still on the dropdown
  await page.keyboard.press('Control+z');
  await expect.poll(() => paramOf(page, 'Stem')).toBe('metal');

  const res = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('.inspector')
    .analyze();
  expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('the default material applies to "Same as scene" shapes only', async ({ page }) => {
  await openApp(page, { hash: 'example=lamp' });
  const before = await page.evaluate(() => window.sdfForge.rendererParams().slice(1, 4));
  expect(before).toEqual([0.65, 0, 0].map(Math.fround)); // clay
  await page
    .getByRole('radiogroup', { name: 'Default material' })
    .getByRole('radio', { name: 'Metal' })
    .click();
  await expect
    .poll(async () => page.evaluate(() => window.sdfForge.rendererParams().slice(1, 4)))
    .toEqual([0.3, 1, 0].map(Math.fround));
  // shapes with their own material keep it
  expect(await paramOf(page, 'Bulb')).toBe('glow');
});

test('material picker fits and works on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await openApp(page, { hash: 'example=lamp' });
  await page.locator('.react-flow__node').filter({ hasText: 'Bulb' }).tap();
  await page.getByTestId('tab-props').tap();
  const field = page.getByRole('combobox', { name: 'Material' });
  await expect(field).toBeVisible();
  await expect(field).toHaveValue('glow');
  await field.selectOption('glossy');
  await expect.poll(() => paramOf(page, 'Bulb')).toBe('glossy');
  const box = (await field.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});
