import { test as base, expect, type Page } from '@playwright/test';

export interface AppOptions {
  /** show the first-visit welcome card */
  fresh?: boolean;
  theme?: 'dark' | 'light';
  hash?: string;
}

/** Open the app with clean storage and wait until the shape has been rendered. */
export async function openApp(page: Page, opts: AppOptions = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(
    ({ fresh, theme }) => {
      if (sessionStorage.getItem('__init')) return;
      sessionStorage.setItem('__init', '1');
      localStorage.clear();
      localStorage.setItem(
        'sdf-forge:prefs',
        JSON.stringify({ tourDone: !fresh, theme: theme ?? 'dark', grid: true }),
      );
    },
    { fresh: !!opts.fresh, theme: opts.theme },
  );
  await page.goto(opts.hash ? `./#${opts.hash}` : './');
  await waitForRender(page);
  return { errors };
}

export async function waitForRender(page: Page) {
  await page.waitForFunction(() => !!window.sdfForge, null, { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const s = window.sdfForge.rendererStats();
      return !!s && s.accumulated > 0 && !window.sdfForge.compiling();
    },
    null,
    { timeout: 60_000 },
  );
}

export const test = base;
export { expect };
