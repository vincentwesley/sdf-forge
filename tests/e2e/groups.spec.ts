import AxeBuilder from '@axe-core/playwright';
import { test, expect, openApp } from './fixtures';
import type { Page } from '@playwright/test';

const node = (page: Page, text: string) =>
  page
    .locator('.react-flow__node')
    .filter({ hasText: new RegExp(`^${text}`) })
    .first();
const panel = (page: Page) => page.getByTestId('group-panel').filter({ visible: true });
const groups = (page: Page) => page.evaluate(() => window.sdfForge.getDoc().groups ?? []);
const glsl = (page: Page) =>
  page.evaluate(() => {
    const d = window.sdfForge.getDoc();
    return window.sdfForge.encode({
      ...d,
      groups: undefined,
      nodes: d.nodes.map((n) => ({ ...n, x: 0, y: 0 })),
    });
  });

test('group nodes with Ctrl+G, expose a setting, collapse/expand, ungroup, undo', async ({ page }) => {
  await openApp(page, { hash: 'example=clay-blend' });
  const before = await glsl(page);
  await node(page, 'Sphere').click();
  await node(page, 'Box').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('group-card')).toBeVisible();
  await expect(panel(page)).toBeVisible();
  expect((await groups(page))[0].members).toHaveLength(2);
  // the members are hidden behind the card, and the shape is unchanged
  await expect(node(page, 'Sphere')).toBeHidden();
  expect(await glsl(page)).toBe(before);

  // expose the sphere's radius: it shows on the card and drives the node
  await page
    .getByRole('combobox', { name: 'Show a setting on the group' })
    .selectOption({ label: 'Sphere · Radius' });
  await expect(page.getByTestId('group-card')).toContainText('Radius');
  const field = panel(page).getByRole('textbox', { name: /Radius/ });
  await field.fill('12');
  await field.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => window.sdfForge.getDoc().nodes.find((n) => n.type === 'sphere')!.params.radius),
    )
    .toBeCloseTo(1.2, 5);

  // rename the group
  const name = page.getByRole('textbox', { name: 'Group name' });
  await name.fill('Body');
  await name.press('Enter');
  await expect(page.getByTestId('group-card')).toContainText('Body');

  // expand with the keyboard: the frame appears and the members come back
  await page.getByRole('button', { name: 'Expand group', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('group-frame')).toBeVisible();
  await expect(node(page, 'Sphere')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse group', exact: true }).click();
  await expect(page.getByTestId('group-card')).toBeVisible();

  const res = await new AxeBuilder({ page: page as never })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('.side [data-testid="group-panel"]')
    .include('[data-testid="group-card"]')
    .analyze();
  expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

  // ungroup from the keyboard, then undo brings the group back
  await page.getByTestId('group-card').click();
  await page.keyboard.press('Control+Shift+g');
  await expect.poll(async () => (await groups(page)).length).toBe(0);
  await expect(node(page, 'Sphere')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await groups(page)).length).toBe(1);
});

test('wires connect to a collapsed group, and deleting the card deletes its nodes', async ({ page }) => {
  await openApp(page, { hash: 'example=lamp' });
  // the lampshade ships collapsed with three settings on its card
  const card = page.getByTestId('group-card');
  await expect(card).toContainText('Lampshade');
  await expect(card).toContainText('Width');
  await expect(card).toContainText('Finish');
  const n0 = (await page.evaluate(() => window.sdfForge.getDoc().nodes.length)) as number;
  // its result is wired into the union through the card
  const edges = page.locator('.react-flow__edge');
  expect(await edges.count()).toBeGreaterThan(3);
  await card.click();
  await expect(panel(page)).toBeVisible();
  // Ctrl+D duplicates the whole group, settings included
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await groups(page)).length).toBe(2);
  const copy = (await groups(page))[1];
  expect(copy.name).toBe('Lampshade copy');
  expect(copy.exposed.map((e) => e.label)).toEqual(['Width', 'Wall', 'Finish']);
  await expect(page.getByTestId('group-card')).toHaveCount(2);
  // Delete removes the selected copy's nodes, then the original's
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(() => window.sdfForge.getDoc().nodes.length)).toBe(n0);
  await page.getByTestId('group-card').click();
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(() => window.sdfForge.getDoc().nodes.length)).toBe(n0 - 3);
  expect(await groups(page)).toEqual([]);
});

test('save a group to My parts and add it to another shape', async ({ page }) => {
  await openApp(page, { hash: 'example=lamp' });
  await page.getByTestId('group-card').click();
  await page.getByRole('button', { name: 'Save to My parts' }).click();
  await expect(page.getByText('Saved “Lampshade” to My parts')).toBeVisible();
  // a new empty shape, then the part from the Add node menu (keyboard: A, type, Enter)
  await page.evaluate(() => window.sdfForge.loadExample('clay-blend'));
  await page.getByTestId('graph-add').click();
  await expect(page.getByRole('combobox', { name: 'Search nodes' })).toBeFocused();
  await page.getByRole('combobox', { name: 'Search nodes' }).fill('lamp');
  await expect(page.getByRole('combobox', { name: 'Search nodes' })).toHaveAttribute(
    'aria-activedescendant',
    'add-part-0',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('group-card')).toContainText('Lampshade');
  const g = await groups(page);
  expect(g).toHaveLength(1);
  expect(g[0].members).toHaveLength(3);
  expect(g[0].exposed).toHaveLength(3);
  // remove it from the library with Shift+Delete
  await page.getByTestId('graph-add').click();
  await expect(page.getByRole('combobox', { name: 'Search nodes' })).toBeFocused();
  await page.getByRole('combobox', { name: 'Search nodes' }).fill('lamp');
  // a part whose name matches ranks first
  await expect(page.getByRole('combobox', { name: 'Search nodes' })).toHaveAttribute(
    'aria-activedescendant',
    'add-part-0',
  );
  await page.keyboard.press('Shift+Delete');
  await expect(page.getByRole('option', { name: /Lampshade/ })).toBeHidden();
});

test('groups work on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await openApp(page, { hash: 'example=lamp' });
  await page.getByTestId('group-card').tap();
  await page.getByTestId('tab-props').tap();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText('Width')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});
