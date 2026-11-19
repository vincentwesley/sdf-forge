import { describe, expect, it } from 'vitest';
import { eulerMatrix } from '../../src/core/nodes/lib';
import { axisAngle, matrixToEuler, placementOf, rotateParam } from '../../src/ui/viewport/gizmoMath';
import { DocBuilder } from '../../src/gallery/builder';

const close = (a: number[], b: number[], d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));

describe('gizmo maths', () => {
  it('Euler angles survive a round trip through the matrix', () => {
    for (const e of [
      [0, 0, 0],
      [30, -20, 75],
      [-120, 45, 10],
      [10, 89.9, -40],
    ])
      close(eulerMatrix(matrixToEuler(eulerMatrix(e))), eulerMatrix(e), 5);
  });

  it('turning about world Y by 90° turns +X into -Z', () => {
    const b = new DocBuilder('t');
    const box = b.add('box', {});
    b.output(box);
    const pl = placementOf(b.done(), box)!;
    const e = rotateParam(pl, [0, 0, 0], [0, 1, 0], Math.PI / 2);
    const R = eulerMatrix(e);
    close([R[0], R[3], R[6]], [0, 0, -1], 5); // image of +X
    close(axisAngle([0, 1, 0], Math.PI / 2), R, 5);
  });

  it('respects a parent transform: the ring axis is brought into the parent space', () => {
    const b = new DocBuilder('t');
    const box = b.add('box', {});
    // the parent turns everything 90° about Z, so world Y is the parent's +X
    const tr = b.add('transform', { rotation: [0, 0, 90] }, [box]);
    b.output(tr);
    const pl = placementOf(b.done(), box)!;
    const e = rotateParam(pl, [0, 0, 0], [0, 1, 0], 0.3);
    close(eulerMatrix(e), axisAngle([1, 0, 0], 0.3), 5);
  });
});
