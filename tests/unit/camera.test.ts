import { describe, expect, it } from 'vitest';
import { cameraRay, defaultCamera, project, STANDARD_VIEWS, type OrbitCamera } from '../../src/render/camera';
import { sectionPlane } from '../../src/state/section';

const along = (c: OrbitCamera, ndcX: number, ndcY: number, t: number) => {
  const { ro, rd } = cameraRay(c, ndcX, ndcY);
  return [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t] as [number, number, number];
};

describe('camera', () => {
  for (const ortho of [false, true]) {
    it(`a point on a pixel's ray projects back to that pixel (${ortho ? 'orthographic' : 'perspective'})`, () => {
      const c: OrbitCamera = { ...defaultCamera(), target: [0.3, -0.2, 0.1], ortho };
      for (const [x, y] of [
        [0, 0],
        [0.5, -0.3],
        [-0.8, 0.6],
      ]) {
        const p = along(c, x, y, ortho ? 16 : 6);
        const s = project(c, p, 800, 600)!;
        expect((s.x - 400) / 300).toBeCloseTo(x, 6);
        expect(-(s.y - 300) / 300).toBeCloseTo(y, 6);
      }
    });
  }

  it('orthographic rays are parallel and keep the framing at the target', () => {
    const c: OrbitCamera = { ...defaultCamera(), ortho: true };
    const a = cameraRay(c, -0.7, 0.2).rd,
      b = cameraRay(c, 0.9, -0.5).rd;
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
    expect(a[2]).toBeCloseTo(b[2], 9);
  });

  it('standard views look along the axes', () => {
    const front = cameraRay({ ...defaultCamera(), ...STANDARD_VIEWS.front }, 0, 0).rd;
    expect(front[2]).toBeCloseTo(-1, 6);
    const top = cameraRay({ ...defaultCamera(), ...STANDARD_VIEWS.top }, 0, 0).rd;
    expect(top[1]).toBeLessThan(-0.999);
  });
});

describe('section plane', () => {
  const b = { min: [-1, 0, -2] as [number, number, number], max: [3, 4, 2] as [number, number, number] };
  it('cuts across the chosen axis at a fraction of the bounds, keeping the chosen side', () => {
    expect(sectionPlane({ axis: 'x', at: 0.5, flip: false }, b)).toEqual([1, 0, 0, 1]);
    expect(sectionPlane({ axis: 'y', at: 0.25, flip: true }, b)).toEqual([0, -1, 0, -1]);
    expect(sectionPlane(null, b)).toBeNull();
    expect(sectionPlane({ axis: 'z', at: 0.5, flip: false }, null)).toBeNull();
  });
});

describe('picking with a section cut', () => {
  it('rays pass through the cut-away half and hit the cut face', async () => {
    const { G, evaluator } = await import('../helpers');
    const { raycast } = await import('../../src/ui/viewport/pick');
    const g = new G();
    g.out(g.node('sphere', { radius: 1 }));
    const ev = evaluator(g.doc);
    const b = ev.bounds.bounds!;
    const ro: [number, number, number] = [0, 0, 5],
      rd: [number, number, number] = [0, 0, -1];
    expect(raycast(ev, ro, rd, b, 1)).toBeCloseTo(4, 3); // front of the sphere
    expect(raycast(ev, ro, rd, b, 1, [0, 0, 1, 0])).toBeCloseTo(5, 3); // keep z <= 0: hits the cut at z = 0
    expect(raycast(ev, [3, 0, 5], rd, b, 1, [0, 0, 1, 0])).toBeNull();
  });
});
