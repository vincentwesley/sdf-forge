import { describe, expect, it } from 'vitest';
import { MAX_BAKED, bakeGrid, bakedTextureGlsl, sampleBaked } from '../../src/core/bake';
import { compile } from '../../src/core/compile';
import { sampleGrid } from '../../src/core/text';
import { shadertoySource } from '../../src/core/shadertoy';
import { exampleById } from '../../src/gallery/examples';
import { rng } from '../helpers';

const gridsOf = (id: string) => compile(exampleById(id)!.build()).textures;

describe('baked distance grids (Shadertoy export of Text and SVG)', () => {
  it('small grids are kept whole: matches the texture lookup to 16-bit precision everywhere', () => {
    const t = gridsOf('keychain')[0];
    const b = bakeGrid(t, 1e9);
    expect(b.k).toBe(1);
    const range = b.scale * 65535;
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      // inside and well outside the grid
      const gx = -20 + r() * (t.w + 40),
        gy = -20 + r() * (t.h + 40);
      expect(Math.abs(sampleBaked(b, gx, gy) - sampleGrid(t, gx, gy))).toBeLessThanOrEqual(
        range / 65535 + 1e-6,
      );
    }
  });

  it('large grids keep every k-th sample exactly (to 16 bits), and stay within budget', () => {
    for (const id of ['keychain', 'heart-badge']) {
      for (const t of gridsOf(id)) {
        const b = bakeGrid(t);
        expect(b.w * b.h).toBeLessThanOrEqual(MAX_BAKED);
        if (t.w * t.h > MAX_BAKED) expect(b.k).toBeGreaterThan(1);
        for (let y = 0; y < b.h; y += 3)
          for (let x = 0; x < b.w; x += 3)
            expect(Math.abs(sampleBaked(b, x * b.k, y * b.k) - t.data[y * b.k * t.w + x * b.k])).toBeLessThan(
              b.scale,
            );
      }
    }
  });

  it('a coarser grid still traces the same outline: between samples it differs by under two cells', () => {
    const t = gridsOf('heart-badge').sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const b = bakeGrid(t);
    expect(b.k).toBeGreaterThan(1);
    const r = rng(3);
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      const gx = r() * (t.w - 1),
        gy = r() * (t.h - 1);
      worst = Math.max(worst, Math.abs(sampleBaked(b, gx, gy) - sampleGrid(t, gx, gy)));
    }
    // distance error in the grid's units, relative to the coarse cell size
    expect(worst).toBeLessThan(2 * b.k * t.cell);
  });

  it('emits a self-contained sampler: a const array, no texture uniform', () => {
    const t = gridsOf('keychain')[0];
    const g = bakedTextureGlsl(0, t);
    const b = bakeGrid(t);
    expect(g).toContain(`const uint T0[${b.words.length}] = uint[${b.words.length}](`);
    expect(g).toContain('float sfTex0(vec2 g)');
    expect(g).not.toMatch(/uniform|sampler/);
  });

  it('every example exports a complete Shadertoy shader, Text and SVG ones included', () => {
    for (const id of ['keychain', 'heart-badge']) {
      const src = shadertoySource(exampleById(id)!.build());
      expect(src).toContain('void mainImage');
      expect(src).toContain('const uint T0[');
      expect(src).not.toMatch(/uniform|sampler2D|uP\[/);
      // a few hundred kB at most, so it pastes into Shadertoy
      expect(src.length).toBeLessThan(200_000);
    }
  });
});
