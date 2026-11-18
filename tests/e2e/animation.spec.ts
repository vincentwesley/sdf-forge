import { test, expect, openApp } from './fixtures';

const morphNode = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.sdfForge.getDoc().nodes.find((n) => n.type === 'morph')!.id);

test('animated Controls play in the viewport without touching the document', async ({ page }) => {
  const { errors } = await openApp(page, { hash: 'example=morph' });
  const id = await morphNode(page);
  const slot = await page.evaluate((n) => window.sdfForge.paramSlot(n, 'amount'), id);
  expect(slot).toBeGreaterThan(0);
  const before = await page.evaluate(() => ({
    doc: JSON.stringify(window.sdfForge.getDoc()),
    ...window.sdfForge.state(),
  }));
  const play = page.getByTestId('play-animation');
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  // the drawn morph amount moves over time
  const seen = new Set<number>();
  for (let i = 0; i < 8; i++) {
    seen.add(Math.round((await page.evaluate((s) => window.sdfForge.rendererParams()[s], slot)) * 100));
    await page.waitForTimeout(250);
  }
  expect(seen.size).toBeGreaterThan(3);
  // the document and the undo history are untouched
  const during = await page.evaluate(() => ({
    doc: JSON.stringify(window.sdfForge.getDoc()),
    ...window.sdfForge.state(),
  }));
  expect(during.doc).toBe(before.doc);
  expect(during.past).toBe(before.past);
  // pausing restores the document's own value
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  const docValue = await page.evaluate(
    (n) => window.sdfForge.getDoc().nodes.find((x) => x.id === n)!.params.amount as number,
    id,
  );
  await expect
    .poll(() => page.evaluate((s) => window.sdfForge.rendererParams()[s], slot))
    .toBeCloseTo(docValue, 5);
  expect(errors).toEqual([]);
});

test('a pinned Control can be animated from the Controls panel and the animation survives a share link', async ({
  page,
}) => {
  await openApp(page, { hash: 'example=twisted-vase' });
  const controls = page.getByRole('complementary', { name: 'Properties' }).getByTestId('controls');
  await expect(page.getByTestId('play-animation')).toHaveCount(0);
  await controls.getByRole('button', { name: 'Animate' }).first().click();
  await expect(page.getByTestId('play-animation')).toHaveAttribute('aria-pressed', 'true');
  await expect(controls.getByRole('group', { name: /Animation of/ })).toBeVisible();
  const doc = await page.evaluate(() => window.sdfForge.getDoc());
  const anim = doc.pinned.find((p) => p.anim)!;
  expect(anim.anim!.seconds).toBe(4);
  const back = await page.evaluate(async (d) => window.sdfForge.decode(await window.sdfForge.encode(d)), doc);
  expect(back.pinned.find((p) => p.anim)!.anim).toEqual(anim.anim);
  // turning it off again removes the Play button
  await controls.getByRole('button', { name: 'Animated' }).click();
  await expect(page.getByTestId('play-animation')).toHaveCount(0);
});
