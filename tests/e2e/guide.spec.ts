import { test, expect, openApp } from './fixtures';

test('the illustrated PDF guide is served and linked from Help, the welcome card and About', async ({
  page,
}) => {
  await openApp(page, { fresh: true });
  // the welcome card links to it
  const href = await page.getByTestId('welcome-guide').getAttribute('href');
  expect(href).toMatch(/guide\/sdf-forge-guide\.pdf$/);
  // the file exists under the site's subpath and is a real, reasonably small PDF
  const res = await page.request.get(new URL(href!, page.url()).toString());
  expect(res.status()).toBe(200);
  const body = await res.body();
  expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(body.length).toBeGreaterThan(200_000);
  expect(body.length).toBeLessThan(6_000_000);
  // Help → User guide opens it in a new tab
  await page.evaluate(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((u: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(u));
      return null;
    }) as typeof window.open;
  });
  await page.getByRole('button', { name: 'No thanks' }).click();
  await page.getByTestId('help-menu').click();
  await page.getByRole('menuitem', { name: 'User guide (PDF)' }).click();
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened).toHaveLength(1);
  expect(opened[0]).toMatch(/guide\/sdf-forge-guide\.pdf$/);
  // About links to it too
  await page.getByTestId('help-menu').click();
  await page.getByRole('menuitem', { name: 'About SDF Forge' }).click();
  await expect(page.getByRole('link', { name: 'Read the user guide (PDF)' })).toHaveAttribute(
    'href',
    /sdf-forge-guide\.pdf$/,
  );
});
