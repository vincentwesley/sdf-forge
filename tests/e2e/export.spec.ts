import { readFileSync } from 'node:fs';
import { test, expect, openApp } from './fixtures';

test('export STL: watertight result, correct header and size', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByTestId('export-dialog');
  await expect(dlg).toBeVisible();
  // set a real-world size: longest side 80 mm
  const size = dlg.getByLabel('Longest side');
  await size.fill('80');
  await size.press('Enter');
  await expect(dlg.getByTestId('export-dims')).toContainText('80');
  await dlg.getByRole('radio', { name: 'Draft' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByTestId('export-run').click(),
  ]);
  expect(download.suggestedFilename()).toBe('clay-blend.stl');
  const buf = readFileSync((await download.path())!);
  expect(buf.subarray(0, 80).toString('latin1')).toContain("SDF Forge by Vin's Atelier");
  const tris = buf.readUInt32LE(80);
  expect(buf.length).toBe(84 + tris * 50);
  expect(tris).toBeGreaterThan(1000);
  // max extent of the vertices ~ 80 mm
  let max = 0;
  for (let t = 0; t < tris; t++)
    for (let v = 0; v < 3; v++)
      for (let k = 0; k < 3; k++) max = Math.max(max, buf.readFloatLE(84 + t * 50 + 12 + v * 12 + k * 4));
  expect(max).toBeGreaterThan(30);
  await expect(dlg.getByTestId('export-result')).toContainText('Watertight and manifold');
});

test('export GLB and OBJ', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByTestId('export-dialog');
  await dlg.getByRole('radio', { name: 'Draft' }).click();
  await dlg.getByTestId('fmt-glb').click();
  const [glb] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('export-run').click()]);
  const g = readFileSync((await glb.path())!);
  expect(g.subarray(0, 4).toString('latin1')).toBe('glTF');
  const jsonLen = g.readUInt32LE(12);
  const json = JSON.parse(g.subarray(20, 20 + jsonLen).toString('utf8'));
  expect(json.asset.generator).toContain("Vin's Atelier");
  expect(json.meshes[0].primitives[0].attributes).toHaveProperty('COLOR_0');
  await dlg.getByTestId('fmt-obj').click();
  const [obj] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('export-run').click()]);
  const text = readFileSync((await obj.path())!, 'utf8');
  expect(text.startsWith("# SDF Forge by Vin's Atelier")).toBe(true);
  expect(text).toMatch(/\nf \d+\/\/\d+/);
});

test('export a PNG render and shader code', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByTestId('export-dialog');
  await dlg.getByRole('tab', { name: 'Image' }).click();
  await dlg.getByRole('radio', { name: '1280 × 720' }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('export-png').click()]);
  const b = readFileSync((await png.path())!);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(b.readUInt32BE(16)).toBe(1280);
  expect(b.readUInt32BE(20)).toBe(720);
  await dlg.getByRole('tab', { name: 'Shader code' }).click();
  const code = await dlg.getByRole('textbox', { name: 'Generated shader code' }).inputValue();
  expect(code).toContain('void mainImage');
  expect(code).toContain('float map(vec3 p)');
  expect(code).not.toContain('uP[');
});
