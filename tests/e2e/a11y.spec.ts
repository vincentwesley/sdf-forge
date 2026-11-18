import AxeBuilder from '@axe-core/playwright';
import { test, expect, openApp } from './fixtures';

async function audit(page: import('@playwright/test').Page, label: string) {
  const res = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // the WebGL canvas and the node graph's internal SVG are covered by their own labels
    .exclude('.react-flow__edges')
    .analyze();
  const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (serious.length)
    console.log(
      label,
      JSON.stringify(
        serious.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + n.failureSummary),
        })),
        null,
        1,
      ),
    );
  expect(serious, `${label}: ${serious.map((v) => v.id).join(', ')}`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test(`no serious accessibility violations (${theme})`, async ({ page }) => {
    await openApp(page, { theme, fresh: true });
    await audit(page, `${theme} home + welcome`);
    await page.getByRole('button', { name: 'No thanks' }).click();
    await page.locator('[data-testid="node-sphere"]').click();
    await audit(page, `${theme} inspector`);
    for (const open of ['open-export', 'open-share', 'open-gallery'] as const) {
      await page.getByTestId(open).click();
      await page.waitForTimeout(300);
      await audit(page, `${theme} ${open}`);
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('?');
    await audit(page, `${theme} shortcuts`);
    await page.keyboard.press('Escape');
    await page.getByTestId('graph-add').click();
    await audit(page, `${theme} add menu`);
  });
}

test('the editor is usable from the keyboard', async ({ page }) => {
  await openApp(page);
  // skip link moves focus to the properties panel
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to properties' })).toBeFocused();
  // tab to the "Add sphere" button and activate it
  const add = page.getByRole('button', { name: 'Add Sphere' });
  for (let i = 0; i < 25 && !(await add.evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  const n0 = (await page.evaluate(() => window.sdfForge.state())).nodes;
  await page.keyboard.press('Enter');
  expect((await page.evaluate(() => window.sdfForge.state())).nodes).toBe(n0 + 1);
  // move the new shape with the gizmo using arrow keys
  const sel = (await page.evaluate(() => window.sdfForge.state())).selection[0];
  const pos0 = await page.evaluate(
    (id) => window.sdfForge.getDoc().nodes.find((n) => n.id === id)!.params.position as number[],
    sel,
  );
  await page.getByTestId('gizmo-x').focus();
  await page.keyboard.press('Shift+ArrowRight');
  const pos1 = await page.evaluate(
    (id) => window.sdfForge.getDoc().nodes.find((n) => n.id === id)!.params.position as number[],
    sel,
  );
  expect(pos1[0]).toBeCloseTo(pos0[0] + 1, 5); // 10 mm = 1 unit
  // menus open and close with the keyboard
  await page.getByRole('button', { name: 'Help' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Help' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Help' })).toBeHidden();
  // view modes from the keyboard
  await page.getByTestId('viewport-canvas').focus();
  await page.keyboard.press('2');
  await expect(page.getByTestId('print-legend')).toBeVisible();
});

test('respects reduced motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openApp(page);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')!).transitionDuration);
  expect(parseFloat(dur)).toBeLessThan(0.01);
  await ctx.close();
});
