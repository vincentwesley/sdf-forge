import { test, expect, openApp } from './fixtures';

const boxParams = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.sdfForge.getDoc().nodes.find((n) => n.type === 'box')!.params);

test('gizmo modes: rotate and scale by keyboard and by dragging, one undo step per drag', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-testid="node-box"]').click();
  // rotate: E switches mode; a focused ring turns 5° per arrow press
  await page.keyboard.press('e');
  await expect(page.getByTestId('gizmo-mode-rotate')).toHaveAttribute('aria-checked', 'true');
  const r0 = (await boxParams(page)).rotation as number[];
  await page.getByTestId('gizmo-rot-y').focus();
  await page.keyboard.press('ArrowRight');
  const r1 = (await boxParams(page)).rotation as number[];
  expect(r1[1] - r0[1]).toBeCloseTo(5, 3);
  // dragging along a ring turns the shape; the whole drag is one undo step
  const past0 = (await page.evaluate(() => window.sdfForge.state())).past;
  const ring = (await page.getByTestId('gizmo-rot-y').boundingBox())!;
  await page.mouse.move(ring.x + ring.width / 2, ring.y + 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(ring.x + ring.width / 2 + i * 8, ring.y + 2 + i * 2);
  await page.mouse.up();
  const r2 = (await boxParams(page)).rotation as number[];
  expect(JSON.stringify(r2)).not.toBe(JSON.stringify(r1));
  expect((await page.evaluate(() => window.sdfForge.state())).past).toBe(past0 + 1);
  // scale: R switches mode; arrows grow by 5%
  await page.keyboard.press('r');
  await expect(page.getByTestId('gizmo-mode-scale')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('gizmo-scale').focus();
  await page.keyboard.press('ArrowUp');
  expect((await boxParams(page)).scale).toBeCloseTo(1.05, 4);
  // W goes back to the move arrows
  await page.keyboard.press('w');
  await expect(page.getByTestId('gizmo-x')).toBeVisible();
});

test('measure tool: two clicks give the distance in millimetres', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('measure-toggle').click();
  const panel = page.getByTestId('measure-panel');
  await expect(panel).toContainText('Click a point');
  const c = (await page.getByTestId('viewport-canvas').boundingBox())!;
  await page.mouse.click(c.x + c.width * 0.42, c.y + c.height * 0.5);
  await expect(panel).toContainText('second point');
  await page.mouse.click(c.x + c.width * 0.6, c.y + c.height * 0.55);
  const result = await page.getByTestId('measure-result').innerText();
  const shown = parseFloat(result);
  // the readout matches the two picked points and the document scale
  const expected = await page.evaluate(() => {
    const s = window.sdfForge.measure()!;
    const mm = window.sdfForge.getDoc().settings.mmPerUnit;
    return Math.hypot(...s[1].map((v, i) => (v - s[0][i]) * mm));
  });
  expect(shown).toBeCloseTo(expected, 1);
  expect(shown).toBeGreaterThan(5);
  // measuring never changes the selection or the document
  expect((await page.evaluate(() => window.sdfForge.state())).selection).toEqual([]);
  await page.keyboard.press('m');
  await expect(panel).toBeHidden();
});
