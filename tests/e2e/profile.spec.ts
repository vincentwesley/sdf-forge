import { test, expect, openApp, waitForRender } from './fixtures';

const outline = async (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((nid) => {
    const n = window.sdfForge.getDoc().nodes.find((x) => x.id === nid)!;
    return n.params.points as number[];
  }, id);

test('Profile: drag, add, switch and remove points with mouse and keyboard', async ({ page }) => {
  await openApp(page, { hash: 'example=pawn' });
  const id = await page.evaluate(() => window.sdfForge.getDoc().nodes.find((n) => n.type === 'profile')!.id);
  await page.locator('.react-flow__node', { hasText: 'Body outline' }).first().click();
  const editor = page.getByRole('complementary', { name: 'Properties' }).getByTestId('points-editor');
  await expect(editor).toBeVisible();
  const before = await outline(page, id);
  const n0 = before.length / 3;

  // drag point 3 (index 2) to the right
  const handle = editor.getByTestId('point-2');
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const dragged = await outline(page, id);
  expect(dragged[6]).toBeGreaterThan(before[6] + 0.05);
  // one drag is one undo step
  await page.keyboard.press('Control+z');
  await expect.poll(() => outline(page, id)).toEqual(before);

  // keyboard: focus a point, nudge it, make it sharp, then delete it
  await editor.getByTestId('point-3').focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await outline(page, id))[10]).toBeCloseTo(before[10] + 0.05, 5);
  await page.keyboard.press('s');
  await expect.poll(async () => (await outline(page, id))[11]).toBe(before[11] ? 0 : 1);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await outline(page, id)).length / 3).toBe(n0 - 1);

  // the Add button inserts after the selected point
  await editor.getByRole('button', { name: 'Add' }).click();
  await expect.poll(async () => (await outline(page, id)).length / 3).toBe(n0);
  await waitForRender(page);
  expect(await page.evaluate(() => window.sdfForge.pixelVariety())).toBeGreaterThan(20);
});

test('Profile from the toolbar starts as a revolved vase and survives a share link', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More shapes' }).click();
  await page.getByRole('menuitem', { name: /Profile/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = window.sdfForge.getDoc();
        const p = d.nodes.find((n) => n.type === 'profile');
        const e = p && d.edges.find((x) => x.source === p.id);
        return e ? d.nodes.find((n) => n.id === e.target)!.type : null;
      }),
    )
    .toBe('revolve');
  const doc = await page.evaluate(() => window.sdfForge.getDoc());
  const round = await page.evaluate(async (d) => {
    const code = await window.sdfForge.encode(d);
    const back = await window.sdfForge.decode(code);
    return back.nodes.find((n) => n.type === 'profile')!.params.points;
  }, doc);
  expect(round).toEqual(doc.nodes.find((n) => n.type === 'profile')!.params.points);
});
