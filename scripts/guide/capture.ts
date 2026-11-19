/**
 * Screenshots for the user guide, taken from the built site (light theme,
 * which prints better). Each shot also records where key UI regions are, so
 * the guide can draw numbered callouts on top.
 */
import { type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Shot {
  file: string;
  width: number;
  height: number;
  /** regions in percent of the image */
  marks: Record<string, Box>;
}

const OUT = 'artifacts/guide';

async function open(browser: Browser, base: string, hash: string, w = 1280, h = 800) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('g')) return;
    sessionStorage.setItem('g', '1');
    localStorage.clear();
    localStorage.setItem('sdf-forge:prefs', JSON.stringify({ tourDone: true, theme: 'light', grid: true }));
  });
  await page.goto(`${base}#${hash}`);
  await page.waitForFunction(() => (window.sdfForge?.rendererStats()?.accumulated ?? 0) > 0, null, {
    timeout: 90_000,
  });
  await settle(page);
  return { page, close: () => ctx.close() };
}

async function settle(page: Page, ms = 2500) {
  await page.waitForFunction(() => !window.sdfForge.compiling(), null, { timeout: 60_000 });
  // let progressive refinement finish so the render is clean
  await page.waitForTimeout(ms);
}

async function shoot(
  page: Page,
  name: string,
  clip?: Box,
  marks: Record<string, string> = {},
): Promise<Shot> {
  const vp = page.viewportSize()!;
  const area = clip ?? { x: 0, y: 0, w: vp.width, h: vp.height };
  const out: Record<string, Box> = {};
  for (const [key, selector] of Object.entries(marks)) {
    const b = await page.locator(selector).first().boundingBox();
    if (!b) continue;
    out[key] = {
      x: ((b.x - area.x) / area.w) * 100,
      y: ((b.y - area.y) / area.h) * 100,
      w: (b.width / area.w) * 100,
      h: (b.height / area.h) * 100,
    };
  }
  const file = `${OUT}/${name}.jpg`;
  await page.screenshot({
    path: file,
    type: 'jpeg',
    quality: 82,
    clip: { x: area.x, y: area.y, width: area.w, height: area.h },
  });
  return { file, width: area.w, height: area.h, marks: out };
}

const boxOf = async (page: Page, selector: string, maxH = Infinity): Promise<Box> => {
  const b = (await page.locator(selector).first().boundingBox())!;
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.width),
    h: Math.round(Math.min(b.height, maxH)),
  };
};

export async function captureAll(browser: Browser, base: string): Promise<Record<string, Shot>> {
  mkdirSync(OUT, { recursive: true });
  const shots: Record<string, Shot> = {};
  const VIEWPORT = 'section.viewport';
  const SIDE = 'aside#inspector-region';
  const DIALOG = 'dialog.modal[open]';

  // 1. the whole screen, with its regions marked
  {
    const { page, close } = await open(browser, base, 'example=clay-blend');
    shots.overview = await shoot(page, 'overview', undefined, {
      add: '[role="toolbar"][aria-label="Add a shape"]',
      view: '[role="toolbar"][aria-label="View"]',
      viewport: VIEWPORT,
      graph: '[aria-label="Node graph"]',
      props: SIDE,
      top: '[data-testid="open-gallery"]',
      export: '[data-testid="open-export"]',
    });
    // 2. add a box from the toolbar: it appears selected, with move arrows
    await page.getByRole('button', { name: 'Add Box' }).click();
    await settle(page);
    shots.addShape = await shoot(page, 'add-shape', await boxOf(page, VIEWPORT));
    shots.inspector = await shoot(page, 'inspector', await boxOf(page, SIDE, 470));
    // 3. carve a hole
    await page.getByRole('radio', { name: 'Carve' }).click();
    await page.getByRole('button', { name: 'Carve with Cylinder' }).click();
    await settle(page);
    shots.carve = await shoot(page, 'carve', await boxOf(page, VIEWPORT));
    shots.graph = await shoot(page, 'graph', await boxOf(page, '[aria-label="Node graph"]'));
    await close();
  }
  // 4. the drawn outline (Profile) on the chess pawn
  {
    const { page, close } = await open(browser, base, 'example=pawn');
    await page.locator('.react-flow__node', { hasText: 'Body outline' }).first().click();
    await settle(page);
    shots.profile = await shoot(page, 'profile');
    await close();
  }
  // 5. Controls on a template
  {
    const { page, close } = await open(browser, base, 'example=twisted-vase');
    shots.controls = await shoot(page, 'controls', await boxOf(page, SIDE, 560));
    shots.vase = await shoot(page, 'vase', await boxOf(page, VIEWPORT));
    await close();
  }
  // 6. print check
  {
    const { page, close } = await open(browser, base, 'example=planter');
    await page.keyboard.press('2'); // Print check view
    await settle(page);
    shots.printCheck = await shoot(page, 'print-check', await boxOf(page, VIEWPORT));
    // 7. export dialog with a finished 3MF export
    await page.getByTestId('open-export').click();
    await page.getByTestId('fmt-3mf').click();
    await page.getByRole('radio', { name: 'Draft' }).click();
    await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
    await page.getByTestId('export-result').waitFor();
    shots.export = await shoot(page, 'export', await boxOf(page, DIALOG));
    await page.keyboard.press('Escape');
    // 8. share dialog
    await page.getByTestId('open-share').click();
    await page.getByTestId('share-url').waitFor();
    await page.waitForTimeout(500);
    shots.share = await shoot(page, 'share', await boxOf(page, DIALOG));
    await page.keyboard.press('Escape');
    // 9. gallery
    await page.getByTestId('open-gallery').click();
    await page.waitForTimeout(1500);
    shots.gallery = await shoot(page, 'gallery', await boxOf(page, DIALOG, 470));
    await close();
  }
  // 10. animation
  {
    const { page, close } = await open(browser, base, 'example=morph');
    await page.getByTestId('play-animation').click();
    await page.waitForTimeout(1300);
    await page.getByTestId('play-animation').click(); // pause mid-morph for a clean frame
    await settle(page);
    shots.animate = await shoot(page, 'animate', undefined, {
      play: '[data-testid="play-animation"]',
      controls: '[data-testid="controls"]',
    });
    await close();
  }
  // 11. phone
  {
    const { page, close } = await open(browser, base, 'example=donut', 390, 844);
    shots.phone = await shoot(page, 'phone');
    await close();
  }
  // 12. a large hero render for the cover
  {
    const { page, close } = await open(browser, base, 'example=pawn', 1200, 900);
    await page.evaluate(() => window.sdfForge.setCamera({ distance: 6.2 }));
    // a clean render: hide the toolbars and hints that float over the 3D view
    await page.addStyleTag({ content: '.vp-overlay { display: none !important; }' });
    await settle(page, 4000);
    shots.hero = await shoot(page, 'hero', await boxOf(page, VIEWPORT));
    await close();
  }
  writeFileSync(`${OUT}/shots.json`, JSON.stringify(shots, null, 2));
  return shots;
}
