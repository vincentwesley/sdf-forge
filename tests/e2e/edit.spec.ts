import { test, expect, openApp, waitForRender } from './fixtures';

test('build a shape with the toolbar: add, carve, select and move', async ({ page }) => {
  const { errors } = await openApp(page);
  const before = await page.evaluate(() => window.sdfForge.getDoc());
  await page.getByTestId('add-cylinder').click();
  let doc = await page.evaluate(() => window.sdfForge.getDoc());
  expect(doc.nodes.length).toBe(before.nodes.length + 1);
  const cyl = doc.nodes.find((n) => n.type === 'cylinder')!;
  // new shape is joined into the main union and selected
  expect(doc.edges.some((e) => e.source === cyl.id && e.input === 'shapes')).toBe(true);
  expect((await page.evaluate(() => window.sdfForge.state())).selection).toEqual([cyl.id]);
  await expect(page.getByTestId('inspector').getByRole('textbox', { name: 'Node name' })).toHaveValue(
    'Cylinder',
  );

  // carve mode wraps the result in a Subtract
  await page.getByRole('radio', { name: 'Carve' }).click();
  await page.getByTestId('add-sphere').click();
  doc = await page.evaluate(() => window.sdfForge.getDoc());
  const out = doc.edges.find((e) => e.target === 'out')!;
  expect(doc.nodes.find((n) => n.id === out.source)!.type).toBe('subtract');

  // drag the gizmo's Y arrow upward: the selected sphere moves up
  await waitForRender(page);
  const sel = (await page.evaluate(() => window.sdfForge.state())).selection[0];
  const y0 = (doc.nodes.find((n) => n.id === sel)!.params.position as number[])[1];
  const arrow = page.getByTestId('gizmo-y');
  const box = (await arrow.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 50, { steps: 5 });
  await page.mouse.up();
  doc = await page.evaluate(() => window.sdfForge.getDoc());
  const y1 = (doc.nodes.find((n) => n.id === sel)!.params.position as number[])[1];
  expect(y1).toBeGreaterThan(y0 + 0.05);
  expect(errors).toEqual([]);
});

test('clicking the shape selects the part under the pointer', async ({ page }) => {
  await openApp(page);
  const c = page.getByTestId('viewport-canvas');
  const b = (await c.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const sel = (await page.evaluate(() => window.sdfForge.state())).selection;
  expect(sel.length).toBe(1);
  // click empty space (above the floor, clear of the toolbars) clears the selection
  await page.mouse.click(b.x + b.width / 2, b.y + 70);
  expect((await page.evaluate(() => window.sdfForge.state())).selection).toEqual([]);
});

test('edit a node in the inspector, then undo and redo', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-testid="node-sphere"]').click();
  const radius = page.getByTestId('inspector').getByRole('textbox', { name: 'Radius (mm)' });
  await expect(radius).toHaveValue('9.5');
  await radius.fill('14');
  await radius.press('Enter');
  const r = () =>
    page.evaluate(
      () => window.sdfForge.getDoc().nodes.find((n) => n.type === 'sphere')!.params.radius as number,
    );
  expect(await r()).toBeCloseTo(1.4, 5);
  // arithmetic in fields
  await radius.fill('10*2');
  await radius.press('Enter');
  expect(await r()).toBeCloseTo(2.0, 5);
  await page.getByTestId('viewport-canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await r()).toBeCloseTo(1.4, 5);
  await page.getByTestId('undo').click();
  expect(await r()).toBeCloseTo(0.95, 5);
  await page.getByTestId('redo').click();
  expect(await r()).toBeCloseTo(1.4, 5);
  await page.keyboard.press('Control+Shift+z');
  expect(await r()).toBeCloseTo(2.0, 5);
});

test('graph: add a node from the search menu, wire it with the keyboard, view it alone, delete it', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('graph-add').click();
  const menu = page.getByTestId('add-node-menu');
  await menu.getByRole('combobox').fill('twist');
  await menu.getByRole('combobox').press('Enter');
  let doc = await page.evaluate(() => window.sdfForge.getDoc());
  const tw = doc.nodes.find((n) => n.type === 'twist')!;
  expect(tw).toBeTruthy();
  // connect the Box into the Twist using the inspector's input picker
  const insp = page.getByTestId('inspector');
  await insp.getByRole('combobox', { name: 'Connect a node to Shape' }).selectOption({ label: 'Box' });
  doc = await page.evaluate(() => window.sdfForge.getDoc());
  expect(doc.edges.some((e) => e.target === tw.id && e.input === 'shape')).toBe(true);
  // view only this node
  await insp.getByRole('button', { name: 'View only this node' }).click();
  await expect(page.getByText(/Viewing only/)).toBeVisible();
  await waitForRender(page);
  await page.getByRole('button', { name: 'Show all' }).click();
  // delete with the inspector button
  await insp.getByRole('button', { name: 'Delete node' }).click();
  doc = await page.evaluate(() => window.sdfForge.getDoc());
  expect(doc.nodes.some((n) => n.type === 'twist')).toBe(false);
});

test('modifier chips insert a node after the selected one', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-testid="node-box"]').click();
  await page.getByTestId('inspector').getByRole('button', { name: 'Twist' }).click();
  const doc = await page.evaluate(() => window.sdfForge.getDoc());
  const box = doc.nodes.find((n) => n.type === 'box')!;
  const tw = doc.nodes.find((n) => n.type === 'twist')!;
  expect(doc.edges.some((e) => e.source === box.id && e.target === tw.id)).toBe(true);
  expect(doc.edges.some((e) => e.source === tw.id && e.input === 'shapes')).toBe(true);
});

test('command palette runs actions', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  const pal = page.getByTestId('palette');
  await pal.getByRole('combobox').fill('add octahedron to');
  await pal.getByRole('combobox').press('Enter');
  const doc = await page.evaluate(() => window.sdfForge.getDoc());
  expect(doc.nodes.some((n) => n.type === 'octahedron')).toBe(true);
});

test('copy and paste nodes; blend control on a shape edits its Union', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  await page.locator('[data-testid="node-torus"]').click();
  const n0 = (await page.evaluate(() => window.sdfForge.state())).nodes;
  await page.getByTestId('viewport-canvas').focus();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await page.evaluate(() => window.sdfForge.state())).nodes).toBe(n0 + 1);
  // the shape's inspector offers the union's smoothness as "Blend with the other shapes"
  await page.locator('[data-testid="node-sphere"]').click();
  const blend = page
    .getByTestId('inspector')
    .getByRole('textbox', { name: 'Blend with the other shapes (mm)' });
  await blend.fill('5');
  await blend.press('Enter');
  const smooth = await page.evaluate(
    () => window.sdfForge.getDoc().nodes.find((n) => n.type === 'union')!.params.smooth,
  );
  expect(smooth).toBeCloseTo(0.5, 5);
});
