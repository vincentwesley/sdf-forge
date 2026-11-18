import { mkdirSync } from 'node:fs';
import { test, expect, openApp } from './fixtures';

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const theme of ['dark', 'light'] as const)
  for (const s of SIZES) {
    test(`screenshot ${s.name} ${theme}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: s.width, height: s.height },
        colorScheme: theme,
        hasTouch: s.name !== 'desktop',
      });
      const page = await ctx.newPage();
      await openApp(page, { theme, hash: 'example=twisted-vase' });
      await page.waitForTimeout(1500);
      mkdirSync('artifacts/screenshots', { recursive: true });
      await page.screenshot({ path: `artifacts/screenshots/${s.name}-${theme}.png` });
      // nothing overflows the viewport horizontally
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // select something and capture the properties view too
      if (s.name === 'phone') await page.getByTestId('tab-props').click();
      await page
        .locator('[data-testid="node-star"]')
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: `artifacts/screenshots/${s.name}-${theme}-edit.png` });
      await ctx.close();
    });
  }
