import { test, expect, openApp, waitForRender } from './fixtures';

const svgNode = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.sdfForge.getDoc().nodes.find((n) => n.type === 'svg') ?? null);

test('add an SVG shape from the toolbar and import a logo file into it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More shapes' }).click();
  await page.getByRole('menuitem', { name: /SVG shape/ }).click();
  const before = await svgNode(page);
  expect(before).not.toBeNull();
  const field = page.getByRole('complementary', { name: 'Properties' }).getByTestId('svg-field');
  await expect(field).toBeVisible();
  await expect(field).toContainText('1 outline');
  await field.getByTestId('svg-file').setInputFiles('tests/fixtures/logo.svg');
  // ring (outer + inner circle) and star: 3 outlines, holes by the even-odd rule
  await expect(field).toContainText('3 outlines');
  await expect(field).toContainText('even-odd');
  const after = await svgNode(page);
  expect(after!.params.svg).not.toBe(before!.params.svg);
  await waitForRender(page);
  expect(await page.evaluate(() => window.sdfForge.pixelVariety())).toBeGreaterThan(20);
  // one import is one undo step
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await svgNode(page))!.params.svg).toBe(before!.params.svg);
});

test('pasting broken SVG code shows a friendly error', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More shapes' }).click();
  await page.getByRole('menuitem', { name: /SVG shape/ }).click();
  const field = page.getByRole('complementary', { name: 'Properties' }).getByTestId('svg-field');
  await field.getByText('…or paste SVG code').click();
  await field
    .getByRole('textbox', { name: 'SVG code' })
    .fill('<svg><rect width="10" height="10" fill="none"/></svg>');
  await field.getByRole('button', { name: 'Use this SVG' }).click();
  await expect(field.getByRole('alert')).toContainText('no filled shapes');
});

test('dropping an SVG file on the 3D view adds it as a shape', async ({ page }) => {
  await openApp(page);
  const n0 = (await page.evaluate(() => window.sdfForge.state())).nodes;
  const svgText = (await import('node:fs')).readFileSync('tests/fixtures/logo.svg', 'utf8');
  const dt = await page.evaluateHandle((text) => {
    const d = new DataTransfer();
    d.items.add(new File([text], 'logo.svg', { type: 'image/svg+xml' }));
    return d;
  }, svgText);
  await page.dispatchEvent('section.viewport', 'drop', { dataTransfer: dt });
  await expect
    .poll(async () => (await page.evaluate(() => window.sdfForge.state())).nodes)
    .toBeGreaterThan(n0);
  expect(await svgNode(page)).not.toBeNull();
});
