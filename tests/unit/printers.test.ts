import { describe, expect, it } from 'vitest';
import { FIT_MARGIN, PRINTERS, fitOnBed } from '../../src/core/printers';
import { embedCode, parseHash } from '../../src/core/share';

describe('printer bed check', () => {
  const bed: [number, number, number] = [250, 210, 220];
  it('fits, fits only when turned, or is too big', () => {
    expect(fitOnBed([200, 200, 200], bed)).toMatchObject({ fits: true, rotated: false });
    // 230 deep doesn't fit 210, but turned 90° it is 230 wide (≤ 250) and 200 deep
    expect(fitOnBed([200, 230, 100], bed)).toMatchObject({ fits: true, rotated: true });
    expect(fitOnBed([100, 100, 221], bed).fits).toBe(false);
    expect(fitOnBed([300, 300, 100], bed).fits).toBe(false);
  });
  it('scale to fit lands inside the bed with the margin, using the better orientation', () => {
    for (const size of [
      [300, 300, 100],
      [100, 100, 500],
      [600, 240, 50],
      [240, 600, 50],
    ] as [number, number, number][]) {
      const r = fitOnBed(size, bed);
      const scaled = size.map((v) => v * r.scaleToFit) as [number, number, number];
      expect(fitOnBed(scaled, bed).fits).toBe(true);
      // and not smaller than needed: a bit bigger than the margin allows doesn't fit
      const over = size.map((v) => (v * r.scaleToFit) / FIT_MARGIN + 0.5) as [number, number, number];
      expect(fitOnBed(over, bed).fits).toBe(false);
    }
  });
  it('lists sensible printers', () => {
    expect(PRINTERS.length).toBeGreaterThanOrEqual(4);
    for (const p of PRINTERS) for (const v of p.bed) expect(v).toBeGreaterThanOrEqual(150);
  });
});

describe('embed links', () => {
  it('view=1 asks for the view-only player', () => {
    expect(parseHash('#g=abc&view=1')).toEqual({ kind: 'graph', code: 'abc', view: true });
    expect(parseHash('#example=rock&view=1')).toEqual({ kind: 'example', id: 'rock', view: true });
    expect(parseHash('#g=abc&view=0')).toEqual({ kind: 'graph', code: 'abc' });
  });
  it('embed code is a safe iframe with a title', () => {
    const code = embedCode('https://x.test/sdf-forge/#g=a"b&view=1', 'My <shape> & "co"');
    expect(code).toMatch(/^<iframe src="https:\/\/x\.test\/sdf-forge\/#g=a%22b&view=1" /);
    expect(code).toContain('title="My &lt;shape&gt; &amp; &quot;co&quot; (SDF Forge)"');
    expect(code).toContain('allow="fullscreen"');
  });
});
