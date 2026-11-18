import { readFileSync } from 'node:fs';
import { test, expect, openApp } from './fixtures';

// Heavy tests run in the 'perf' project, alone, after everything else.
test('export a turntable video', async ({ page }) => {
  test.setTimeout(150_000);
  await openApp(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByTestId('export-dialog');
  await dlg.getByRole('tab', { name: 'Turntable' }).click();
  await dlg.getByRole('radio', { name: '480 × 480' }).click();
  await dlg.getByRole('radio', { name: '4 s' }).click();
  const [vid] = await Promise.all([
    page.waitForEvent('download', { timeout: 140_000 }),
    dlg.getByTestId('export-video').click(),
  ]);
  const name = vid.suggestedFilename();
  expect(name).toMatch(/turntable\.(mp4|webm)$/);
  const b = readFileSync((await vid.path())!);
  expect(b.length).toBeGreaterThan(10_000);
});
