import { beforeAll, describe, expect, it, vi } from 'vitest';

// the store schedules autosave with window.setTimeout; give it one in Node
beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window ??= globalThis;
});

describe('undo history', () => {
  it('merges a slow drag into one step while the gesture is held, but not after it ends', async () => {
    const { store, setParam, beginGesture, endMerge, undo } = await import('../../src/state/store');
    const { makeNode } = await import('../../src/core/graph/doc');
    const node = makeNode('sphere', 0, 0, {}, 'ball');
    store.setState({
      doc: { ...store.getState().doc, nodes: [...store.getState().doc.nodes, node] },
      past: [],
    });
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const radius = () => store.getState().doc.nodes.find((n) => n.id === 'ball')!.params.radius;
      // a gesture with long pauses between moves (slow machine, or the user holding still)
      beginGesture();
      for (const r of [1.1, 1.2, 1.3]) {
        setParam('ball', 'radius', r);
        now += 5000;
      }
      endMerge();
      expect(store.getState().past).toHaveLength(1);
      // without a gesture, edits further apart than the merge window are separate steps
      setParam('ball', 'radius', 1.4);
      now += 5000;
      setParam('ball', 'radius', 1.5);
      expect(store.getState().past).toHaveLength(3);
      undo();
      undo();
      undo();
      expect(radius()).toBe(1);
    } finally {
      clock.mockRestore();
    }
  });
});
