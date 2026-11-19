import { describe, expect, it } from 'vitest';
import {
  SAMPLE_OUTLINE,
  decodeOutline,
  importSvg,
  parsePathData,
  parseSvg,
  parseTransform,
  svgGrid,
} from '../../src/core/svg';
import { sampleGrid } from '../../src/core/text';
import { G, evaluator } from '../helpers';

/** shoelace area of a closed polyline */
const area = (p: number[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(a / 2);
};

describe('SVG path data', () => {
  it('reads absolute and relative lines, H/V and implicit repeats', () => {
    const [a] = parsePathData('M10 10 H 30 V 30 L10 30 Z');
    expect(area(a)).toBeCloseTo(400, 6);
    const [b] = parsePathData('m10,10 20,0 0,20 -20,0z');
    expect(area(b)).toBeCloseTo(400, 6);
  });
  it('turns two arcs into a circle of the right area, including compact flags', () => {
    const [c] = parsePathData('M0 10 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0z');
    // a polygon through the arc (6° steps) is within 1% of the true circle
    expect(Math.abs(area(c) / (Math.PI * 100) - 1)).toBeLessThan(0.01);
    const [d] = parsePathData('M0 10a10 10 0 1020 0a10 10 0 10-20 0z');
    expect(Math.abs(area(d) / (Math.PI * 100) - 1)).toBeLessThan(0.01);
  });
  it('follows cubic and quadratic curves, smooth variants included', () => {
    const [p] = parsePathData('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0 Q 10 20 0 0 T 0 0 Z');
    expect(p.length).toBeGreaterThan(40);
    expect(p.every(Number.isFinite)).toBe(true);
  });
  it('reports malformed data', () => {
    expect(() => parsePathData('M 10 10 L')).toThrow();
  });
});

describe('SVG documents', () => {
  it('applies transforms on elements and nested groups', () => {
    const m = parseTransform('translate(10 20) scale(2) rotate(90)');
    // rotate first, then scale, then translate: (1,0) -> (0,1) -> (0,2) -> (10,22)
    expect(m[0] * 1 + m[2] * 0 + m[4]).toBeCloseTo(10, 9);
    expect(m[1] * 1 + m[3] * 0 + m[5]).toBeCloseTo(22, 9);
    const { polys } = parseSvg(
      '<svg><g transform="translate(100,0)"><rect x="0" y="0" width="10" height="10" transform="scale(2)"/></g></svg>',
    );
    expect(Math.min(...polys[0].filter((_, i) => i % 2 === 0))).toBeCloseTo(100, 9);
    expect(area(polys[0])).toBeCloseTo(400, 6);
  });
  it('reads rect, circle, ellipse, polygon; skips unfilled, hidden and definitions', () => {
    const { polys } = parseSvg(`<?xml version="1.0"?><!-- a comment -->
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><rect width="999" height="999"/></defs>
        <rect width="10" height="10"/>
        <circle cx="50" cy="50" r="5"/>
        <ellipse cx="0" cy="50" rx="4" ry="2"/>
        <polygon points="0,0 5,0 5,5"/>
        <rect width="10" height="10" fill="none"/>
        <g style="display:none"><rect width="10" height="10"/></g>
      </svg>`);
    expect(polys).toHaveLength(4);
    expect(Math.abs(area(polys[1]) / (Math.PI * 25) - 1)).toBeLessThan(0.01);
  });
  it('keeps holes with the even-odd rule', () => {
    const outline = importSvg('<svg><path fill-rule="evenodd" d="M0 0 H10 V10 H0 Z M3 3 H7 V7 H3 Z"/></svg>');
    expect(outline[0]).toBe('e');
    const g = svgGrid(outline)!;
    const at = (x: number, y: number) => sampleGrid(g, (x - g.x0) / g.cell, (y - g.y0) / g.cell);
    expect(at(0, 0)).toBeGreaterThan(0); // the hole in the middle is outside
    expect(at(0.35, 0)).toBeLessThan(0); // the frame is inside
  });
  it('normalises to a 1-unit larger side, centred, y up', () => {
    const { polys } = decodeOutline(importSvg('<svg><rect x="10" y="20" width="40" height="20"/></svg>'));
    const xs = polys[0].filter((_, i) => i % 2 === 0),
      ys = polys[0].filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.5, 4);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 4);
  });
  it('gives friendly errors for empty or overly detailed drawings', () => {
    expect(() => importSvg('<svg><rect width="10" height="10" fill="none"/></svg>')).toThrow(
      /no filled shapes/,
    );
    const many = Array.from(
      { length: 3000 },
      (_, i) => `${Math.cos(i) * 50 + 50},${Math.sin(i) * 50 + 50}`,
    ).join(' ');
    expect(() => importSvg(`<svg><polygon points="${many}"/></svg>`)).toThrow(/too detailed/);
  });
});

describe('SVG shape node', () => {
  it('has the right size and is negative inside the sample heart', () => {
    const g = new G();
    const s = g.node('svg', { svg: SAMPLE_OUTLINE, size: 2 });
    g.out(s);
    const e = evaluator(g.doc, s);
    const b = e.bounds.bounds!;
    expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeCloseTo(2, 2);
    // the preview plate shows the profile in XZ with profile y along -Z
    expect(e.map(0, 0, 0)).toBeLessThan(0);
    expect(e.map(3, 0, 0)).toBeGreaterThan(1.9);
  });
  it('keeps share links small', async () => {
    const { encodeDoc } = await import('../../src/core/share');
    const g = new G();
    const s = g.node('svg', { svg: SAMPLE_OUTLINE });
    const x = g.node('extrude', { height: 0.2 });
    g.link(s, x, 'profile').out(x);
    expect((await encodeDoc(g.doc)).length).toBeLessThan(2000);
  });
});
