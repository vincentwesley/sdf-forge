import { describe, expect, it } from 'vitest';
import { animValue, animatedDoc, defaultAnim, hasAnimation, sanitizeAnim } from '../../src/core/animation';
import { DocBuilder } from '../../src/gallery/builder';
import { normalizeDoc } from '../../src/core/graph/doc';
import { decodeDoc, encodeDoc } from '../../src/core/share';
import { analyze, compile } from '../../src/core/compile';
import { paramsOf } from '../../src/core/nodes/registry';

const sphereDoc = () => {
  const b = new DocBuilder('s');
  const s = b.add('sphere', { radius: 1 });
  b.output(s).pin(s, 'radius', 'Size', { from: 0.5, to: 1.5, seconds: 2 });
  return { doc: b.done(), s };
};

describe('control animation', () => {
  it('swings smoothly from → to → from once per cycle', () => {
    const a = { from: 2, to: 6, seconds: 4 };
    expect(animValue(a, 0)).toBeCloseTo(2, 9);
    expect(animValue(a, 2)).toBeCloseTo(6, 9);
    expect(animValue(a, 4)).toBeCloseTo(2, 9);
    expect(animValue(a, 1)).toBeCloseTo(4, 9);
    expect(animValue(a, 13)).toBeCloseTo(animValue(a, 1), 9); // periodic
    expect(animValue(a, -1)).toBeCloseTo(animValue(a, 3), 9);
    // eased: gentle at the ends
    expect(animValue(a, 0.1) - 2).toBeLessThan(0.1 * 0.5); // well under the linear 0.1
  });

  it('applies values to a copy and leaves the document alone', () => {
    const { doc, s } = sphereDoc();
    const before = JSON.stringify(doc);
    const d = animatedDoc(doc, 1);
    expect(d.nodes.find((n) => n.id === s)!.params.radius).toBeCloseTo(1.5, 9);
    expect(JSON.stringify(doc)).toBe(before);
    expect(hasAnimation(doc)).toBe(true);
    // bounds follow the animated size
    const c = compile(doc);
    const r0 = analyze(animatedDoc(doc, 0), c.rootId).bounds!.max[0];
    const r1 = analyze(animatedDoc(doc, 1), c.rootId).bounds!.max[0];
    expect(r1).toBeGreaterThan(r0 + 0.9);
  });

  it('rounds animated whole numbers', () => {
    const b = new DocBuilder('r');
    const bx = b.add('box', {});
    const rep = b.add('repeat', { count: [2, 1, 1] }, [bx]);
    b.output(rep);
    const doc = b.done();
    const intParam = paramsOf('repeat').find((p) => p.kind === 'int' && !p.structural);
    if (!intParam) return; // no animatable integer on this node type
    doc.pinned.push({ node: rep, param: intParam.key, anim: { from: 1, to: 4, seconds: 2 } });
    const v = animatedDoc(doc, 0.7).nodes.find((n) => n.id === rep)!.params[intParam.key] as number;
    expect(Number.isInteger(v)).toBe(true);
  });

  it('sanitises untrusted specs and drops animation on settings that are not plain numbers', () => {
    expect(sanitizeAnim({ from: 0, to: 1, seconds: 0.01 })!.seconds).toBe(0.5);
    expect(sanitizeAnim({ from: 0, to: 1, seconds: 1e9 })!.seconds).toBe(60);
    expect(sanitizeAnim({ from: 'x', to: 1, seconds: 2 })).toBeNull();
    expect(sanitizeAnim(null)).toBeNull();
    const b = new DocBuilder('p');
    const poly = b.add('polygon', { sides: 6 });
    const ex = b.add('extrude', {}, [poly]);
    b.output(ex);
    const doc = b.done();
    doc.pinned.push({ node: poly, param: 'color', anim: { from: 3, to: 8, seconds: 2 } }); // a colour
    doc.pinned.push({ node: poly, param: 'radius', anim: { from: 0.5, to: 1, seconds: 2 } });
    const n = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    expect(n.pinned.find((p) => p.param === 'color')!.anim).toBeUndefined();
    expect(n.pinned.find((p) => p.param === 'radius')!.anim).toEqual({ from: 0.5, to: 1, seconds: 2 });
  });

  it('survives a share link, with and without a custom label', async () => {
    const { doc } = sphereDoc();
    doc.pinned.push({ node: doc.nodes.find((n) => n.type === 'sphere')!.id, param: 'color' });
    const back = await decodeDoc(await encodeDoc(doc));
    expect(back.pinned[0]).toEqual({
      node: back.pinned[0].node,
      param: 'radius',
      label: 'Size',
      anim: doc.pinned[0].anim,
    });
    const unlabelled = { ...doc, pinned: [{ ...doc.pinned[0], label: undefined }] };
    const back2 = await decodeDoc(await encodeDoc(unlabelled));
    expect(back2.pinned[0].label).toBeUndefined();
    expect(back2.pinned[0].anim).toEqual(doc.pinned[0].anim);
  });

  it('suggests a first animation across the slider range', () => {
    const def = paramsOf('sphere').find((p) => p.key === 'radius')!;
    const a = defaultAnim(def, 1);
    expect(a.from).toBe(1);
    expect(a.to).not.toBe(1);
    expect(a.seconds).toBe(4);
  });
});
