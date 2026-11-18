import { describe, expect, it } from 'vitest';
import { decodeDoc, encodeDoc, pack, parseHash, unpack } from '../../src/core/share';
import { EXAMPLES } from '../../src/gallery/examples';
import { canConnect, normalizeDoc } from '../../src/core/graph/doc';
import { compile } from '../../src/core/compile';

describe('share links', () => {
  for (const ex of EXAMPLES) {
    it(`round-trips ${ex.id}`, async () => {
      const doc = ex.build();
      const code = await encodeDoc(doc);
      expect(code).toMatch(/^[\w-]+$/);
      const back = await decodeDoc(code);
      expect(back.title).toBe(doc.title);
      expect(back.nodes.length).toBe(doc.nodes.length);
      expect(back.edges.length).toBe(doc.edges.length);
      expect(back.pinned.length).toBe(doc.pinned.length);
      // the compiled shader is identical, so the shape is identical
      expect(compile(back).glsl).toBe(compile(doc).glsl);
    });
  }
  it('keeps links short', async () => {
    const code = await encodeDoc(EXAMPLES[0].build());
    expect(code.length).toBeLessThan(600);
  });
  it('parses hashes', () => {
    expect(parseHash('#g=abc')).toEqual({ kind: 'graph', code: 'abc' });
    expect(parseHash('#example=rock')).toEqual({ kind: 'example', id: 'rock' });
    expect(parseHash('')).toBeNull();
  });
  it('rejects garbage', async () => {
    await expect(decodeDoc('!!!')).rejects.toThrow();
    expect(() => unpack({} as never)).toThrow();
  });
  it('pack drops default params', () => {
    const p = pack(EXAMPLES[0].build());
    const union = p.n.find((n) => n[1] === 'union')!;
    expect(Object.keys(union[4])).toEqual(['smooth']);
  });
});

describe('document normalisation (untrusted input)', () => {
  it('survives junk', () => {
    const d = normalizeDoc({
      nodes: [
        { id: 'x', type: 'nope' },
        null,
        { id: 's', type: 'sphere', params: { radius: 'big', color: [1, 2] } },
      ],
      edges: 5,
    });
    expect(d.nodes.some((n) => n.type === 'output')).toBe(true);
    const s = d.nodes.find((n) => n.id === 's')!;
    expect(s.params.radius).toBe(1);
    expect(s.params.color).toEqual([0.8, 0.8, 0.8]);
  });
  it('removes cycles and duplicate single inputs', () => {
    const d = normalizeDoc({
      nodes: [
        { id: 'out', type: 'output', params: {} },
        { id: 'a', type: 'twist', params: {} },
        { id: 'b', type: 'bend', params: {} },
      ],
      edges: [
        { id: '1', source: 'a', target: 'b', input: 'shape' },
        { id: '2', source: 'b', target: 'a', input: 'shape' },
        { id: '3', source: 'a', target: 'out', input: 'shape' },
        { id: '4', source: 'b', target: 'out', input: 'shape' },
      ],
    });
    expect(d.edges.length).toBe(2);
    expect(compile(d).issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('type-checks connections', () => {
    const d = normalizeDoc({
      nodes: [
        { id: 'out', type: 'output', params: {} },
        { id: 'c', type: 'circle', params: {} },
        { id: 's', type: 'sphere', params: {} },
        { id: 'x', type: 'extrude', params: {} },
      ],
      edges: [],
    });
    expect(canConnect(d, 'c', 'out', 'shape').ok).toBe(false);
    expect(canConnect(d, 's', 'x', 'profile').ok).toBe(false);
    expect(canConnect(d, 'c', 'x', 'profile').ok).toBe(true);
  });
});
