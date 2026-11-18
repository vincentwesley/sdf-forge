import { test, expect, openApp, waitForRender } from './fixtures';

test('share link round-trips the whole graph', async ({ page, browser }) => {
  await openApp(page);
  // make a change so the doc is not the default
  await page.getByTestId('add-capsule').click();
  await page.getByRole('textbox', { name: 'Shape name' }).first().fill('My shared blob');
  await page.getByRole('textbox', { name: 'Shape name' }).first().press('Enter');
  const original = await page.evaluate(() => window.sdfForge.getDoc());
  await page.getByTestId('open-share').click();
  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toMatch(/#g=[\w-]+$/);
  expect(url).toContain('/sdf-forge/');
  // open the link in a fresh browser context (no shared storage)
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(url);
  await waitForRender(p2);
  const opened = await p2.evaluate(() => window.sdfForge.getDoc());
  expect(opened.title).toBe('My shared blob');
  expect(opened.nodes.length).toBe(original.nodes.length);
  const types = (d: typeof original) => d.nodes.map((n) => n.type).sort();
  expect(types(opened)).toEqual(types(original));
  const cap = (d: typeof original) => d.nodes.find((n) => n.type === 'capsule')!.params.position;
  expect(cap(opened)).toEqual(cap(original));
  // the hash is cleared so a reload keeps later edits
  expect(p2.url()).not.toContain('#g=');
  await ctx.close();
});

test('a damaged link shows a friendly error and still loads the app', async ({ page }) => {
  await openApp(page, { hash: 'g=not-a-real-link' });
  await expect(page.getByText(/damaged or incomplete/)).toBeVisible();
});

test('example deep links open the example', async ({ page }) => {
  await openApp(page, { hash: 'example=twisted-vase' });
  expect((await page.evaluate(() => window.sdfForge.state())).title).toBe('Twisted vase');
});
