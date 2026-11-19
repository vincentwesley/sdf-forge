import type { SdfDoc } from '../core/graph/doc';
import { DocBuilder } from './builder';

export interface Example {
  id: string;
  title: string;
  description: string;
  tags: ('art' | 'printable' | 'game' | 'learn')[];
  build: () => SdfDoc;
}

const C = {
  coral: [0.95, 0.52, 0.3],
  blue: [0.33, 0.6, 0.95],
  yellow: [0.98, 0.8, 0.3],
  green: [0.45, 0.8, 0.55],
  violet: [0.75, 0.5, 0.92],
  pink: [0.95, 0.5, 0.7],
  teal: [0.35, 0.8, 0.85],
  stone: [0.72, 0.7, 0.66],
  cream: [0.96, 0.9, 0.78],
  dough: [0.86, 0.6, 0.32],
  white: [0.95, 0.95, 0.93],
  red: [0.88, 0.2, 0.18],
  terracotta: [0.8, 0.42, 0.28],
};

export const EXAMPLES: Example[] = [
  {
    id: 'clay-blend',
    title: 'Clay blend',
    description:
      'Three shapes melted together with a smooth union. Drag the Smoothness slider to see SDF blending.',
    tags: ['learn', 'art'],
    build: () => {
      const b = new DocBuilder('Clay blend');
      const s = b.add('sphere', { radius: 0.95, position: [-0.75, 0, 0], color: C.coral });
      const x = b.add('box', {
        size: [1.3, 1.3, 1.3],
        rounding: 0.18,
        position: [0.75, -0.15, 0.1],
        rotation: [0, 25, 0],
        color: C.blue,
      });
      const t = b.add('torus', {
        major: 0.75,
        minor: 0.2,
        position: [0, 0.85, 0],
        rotation: [90, 0, 15],
        color: C.yellow,
      });
      const u = b.add('union', { smooth: 0.18 }, [s, x, t]);
      b.output(u).pin(u, 'smooth', 'Blend');
      return b.done();
    },
  },
  {
    id: 'twisted-vase',
    title: 'Twisted vase',
    description:
      'A star profile extruded, twisted and hollowed: a classic vase-mode print. Use the Controls to resize it.',
    tags: ['printable', 'art'],
    build: () => {
      const b = new DocBuilder('Twisted vase', { mmPerUnit: 25, material: 'glossy' });
      const st = b.add('star', { points: 9, radius: 1.1, inner: 0.84, color: C.teal });
      const ex = b.add('extrude', { height: 4, rounding: 0.04, position: [0, 2, 0] }, [st]);
      const tw = b.add('twist', { amount: 25 }, [ex]);
      const sh = b.add('shell', { thickness: 0.08, side: 'inside', open: 'top' }, [tw]);
      b.output(sh);
      b.pin(ex, 'height', 'Height')
        .pin(st, 'radius', 'Radius')
        .pin(st, 'points', 'Ridges')
        .pin(tw, 'amount', 'Twist')
        .pin(sh, 'thickness', 'Wall');
      return b.done();
    },
  },
  {
    id: 'planter',
    title: 'Planter with drainage',
    description:
      'A tapered pot with a drainage hole. Set its size and wall thickness in Controls, then export an STL.',
    tags: ['printable'],
    build: () => {
      const b = new DocBuilder('Planter', { mmPerUnit: 25 });
      // a tapered pot: every Control stays valid whatever values you choose
      const pot = b.add(
        'cone',
        { height: 2.8, bottom: 1.3, top: 1.7, position: [0, 1.4, 0], color: C.terracotta },
        undefined,
        'Pot',
      );
      const soft = b.add('round', { amount: 0.06 }, [pot], 'Soften edges');
      const sh = b.add('shell', { thickness: 0.1, side: 'inside', open: 'top' }, [soft]);
      // a tall thin cylinder only meets the floor, because the pot is hollow
      const hole = b.add(
        'cylinder',
        { radius: 0.22, height: 8, rounding: 0, position: [0, 1.4, 0], color: C.terracotta },
        undefined,
        'Drain hole',
      );
      const res = b.add('subtract', { smooth: 0.03 }, { base: sh, cutter: hole });
      b.output(res);
      b.pin(pot, 'top', 'Top radius')
        .pin(pot, 'bottom', 'Bottom radius')
        .pin(pot, 'height', 'Height')
        .pin(sh, 'thickness', 'Wall')
        .pin(hole, 'radius', 'Drain hole');
      return b.done();
    },
  },
  {
    id: 'gyroid-sphere',
    title: 'Gyroid sphere',
    description:
      'A sphere filled with a gyroid lattice — the curvy minimal surface used for 3D-print infill.',
    tags: ['printable', 'art'],
    build: () => {
      const b = new DocBuilder('Gyroid sphere', { mmPerUnit: 20, material: 'glossy' });
      const s = b.add('sphere', { radius: 1.5, color: C.violet });
      const l = b.add('lattice', { pattern: 'gyroid', cell: 0.9, thickness: 0.14, skin: 0 }, [s]);
      const base = b.add('cut', { axis: 'y', from: 'min', offset: 0.3, keep: 'above' }, [l], 'Flat base');
      b.output(base).pin(l, 'cell', 'Cell size').pin(l, 'thickness', 'Strut').pin(s, 'radius', 'Radius');
      return b.done();
    },
  },
  {
    id: 'keychain',
    title: 'Keychain tag',
    description:
      'A name tag with a key-ring hole and raised letters. Type your name in Controls, then export an STL.',
    tags: ['printable'],
    build: () => {
      const b = new DocBuilder('Keychain tag', { mmPerUnit: 10 });
      // the hole is cut in 2D before extruding, so it is easy to move with the Hole position control
      const r = b.add('rect', { size: [5, 2.6], rounding: 0.6, color: C.blue }, undefined, 'Tag outline');
      const hole = b.add('circle', { radius: 0.3, offset: [-1.9, 0], color: C.blue }, undefined, 'Ring hole');
      const holed = b.add('subtract', { smooth: 0.05 }, { base: r, cutter: hole });
      const tag = b.add('extrude', { height: 0.35, rounding: 0.08, position: [0, 0.175, 0] }, [holed], 'Tag');
      const name = b.add(
        'text',
        { text: 'HELLO', size: 0.8, offset: [0.45, 0], color: C.yellow },
        undefined,
        'Name',
      );
      const raised = b.add(
        'extrude',
        { height: 0.2, rounding: 0.04, position: [0, 0.42, 0] },
        [name],
        'Raised name',
      );
      const u = b.add('union', { smooth: 0.03 }, [tag, raised]);
      b.output(u);
      b.pin(r, 'size', 'Size')
        .pin(tag, 'height', 'Thickness')
        .pin(hole, 'radius', 'Hole radius')
        .pin(hole, 'offset', 'Hole position')
        .pin(name, 'text', 'Name')
        .pin(name, 'size', 'Letter height');
      return b.done();
    },
  },
  {
    id: 'ring',
    title: 'Comfort-fit ring',
    description:
      'A ring made by revolving a rounded rectangle. Band radius is measured to the middle of the band: add half the thickness to your finger radius.',
    tags: ['printable'],
    build: () => {
      const b = new DocBuilder('Ring', { mmPerUnit: 5, material: 'metal' });
      const prof = b.add(
        'rect',
        { size: [0.4, 1.2], rounding: 0.18, color: C.yellow },
        undefined,
        'Band profile',
      );
      const ring = b.add('revolve', { offset: 2, rotation: [90, 0, 0] }, [prof]);
      b.output(ring);
      b.pin(ring, 'offset', 'Band radius').pin(prof, 'size', 'Thickness × width');
      return b.done();
    },
  },
  {
    id: 'bowl',
    title: 'Ribbed bowl',
    description: 'A hollow half-sphere with ripples and a flat foot — sculpted with Shell, Displace and Cut.',
    tags: ['printable', 'art'],
    build: () => {
      const b = new DocBuilder('Ribbed bowl', { mmPerUnit: 40, material: 'glossy' });
      const s = b.add('sphere', { radius: 1.5, color: C.cream });
      const foot = b.add('cut', { axis: 'y', from: 'min', offset: 0.2, keep: 'above' }, [s], 'Flat foot');
      const w = b.add('displace', { pattern: 'waves', amount: 0.03, scale: 0.5 }, [foot], 'Ripples');
      const sh = b.add('shell', { thickness: 0.08, side: 'inside' }, [w]);
      const top = b.add('cut', { axis: 'y', offset: 0.35, keep: 'below' }, [sh], 'Open top');
      b.output(top)
        .pin(s, 'radius', 'Radius')
        .pin(sh, 'thickness', 'Wall')
        .pin(top, 'offset', 'Rim height')
        .pin(w, 'amount', 'Ripple depth');
      return b.done();
    },
  },
  {
    id: 'donut',
    title: 'Glazed donut',
    description:
      'Dough, icing and sprinkles: an Intersect for the icing, Displace for the drips and Radial repeat for sprinkles.',
    tags: ['art', 'game'],
    build: () => {
      const b = new DocBuilder('Glazed donut');
      const dough = b.add('torus', { major: 1, minor: 0.48, color: C.dough }, undefined, 'Dough');
      const icingShape = b.add('torus', { major: 1, minor: 0.52, color: C.pink }, undefined, 'Icing');
      const drip = b.add('displace', { pattern: 'noise', amount: 0.1, scale: 0.45, octaves: 2, seed: 3 }, [
        b.add('cut', { axis: 'y', offset: 0.0, keep: 'above' }, [icingShape]),
      ]);
      const sprinkle = b.add('capsule', {
        length: 0.2,
        radius: 0.035,
        position: [1.0, 0.5, 0.15],
        rotation: [0, 40, 80],
        color: C.yellow,
      });
      const sprinkle2 = b.add('capsule', {
        length: 0.2,
        radius: 0.035,
        position: [0.75, 0.47, -0.28],
        rotation: [30, -20, 70],
        color: C.blue,
      });
      const sprinkle3 = b.add('capsule', {
        length: 0.2,
        radius: 0.035,
        position: [1.25, 0.4, -0.1],
        rotation: [70, 10, 20],
        color: C.white,
      });
      const sp = b.add('union', { smooth: 0 }, [sprinkle, sprinkle2, sprinkle3]);
      const ring = b.add('radial', { count: 9 }, [sp], 'Sprinkles');
      const u = b.add('union', { smooth: 0.03 }, [dough, drip, ring]);
      b.output(u);
      return b.done();
    },
  },
  {
    id: 'rock',
    title: 'Low-poly-ready rock',
    description:
      'A squashed sphere with layered noise. Change the seed for a new rock, then export a GLB for your game.',
    tags: ['game'],
    build: () => {
      const b = new DocBuilder('Rock');
      const e = b.add('ellipsoid', { radii: [1.4, 0.9, 1.1], color: C.stone });
      const d = b.add('displace', { pattern: 'noise', amount: 0.32, scale: 1.1, octaves: 4, seed: 7 }, [e]);
      const base = b.add('cut', { axis: 'y', from: 'min', offset: 0.45, keep: 'above' }, [d], 'Flat base');
      b.output(base).pin(d, 'seed', 'Seed').pin(d, 'amount', 'Roughness').pin(d, 'scale', 'Lump size');
      return b.done();
    },
  },
  {
    id: 'mushroom',
    title: 'Toadstool',
    description:
      'A cartoon mushroom: a cut sphere cap blended onto a capsule stem, with spots placed by Radial repeat.',
    tags: ['game', 'art'],
    build: () => {
      const b = new DocBuilder('Toadstool');
      const stem = b.add(
        'capsule',
        { length: 2, radius: 0.42, position: [0, -0.2, 0], color: C.cream },
        undefined,
        'Stem',
      );
      const capS = b.add(
        'ellipsoid',
        { radii: [1.5, 1.05, 1.5], position: [0, 0.75, 0], color: C.red },
        undefined,
        'Cap',
      );
      const cap = b.add('cut', { axis: 'y', offset: 0.85, keep: 'above' }, [capS]);
      const capR = b.add('round', { amount: 0.06 }, [cap]);
      const spot = b.add(
        'sphere',
        { radius: 0.2, position: [0.95, 1.38, 0], color: C.white },
        undefined,
        'Spot',
      );
      const spots = b.add('radial', { count: 6 }, [spot]);
      const top = b.add(
        'sphere',
        { radius: 0.22, position: [0, 1.82, 0], color: C.white },
        undefined,
        'Top spot',
      );
      const u = b.add('union', { smooth: 0.12 }, [stem, capR]);
      const u2 = b.add('union', { smooth: 0.04 }, [u, spots, top]);
      b.output(u2);
      return b.done();
    },
  },
  {
    id: 'twisted-tower',
    title: 'Twisted tower',
    description:
      'A rounded box stacked with Repeat, then twisted. Twist rotates each slice by an angle that grows with height.',
    tags: ['art', 'learn'],
    build: () => {
      const b = new DocBuilder('Twisted tower', { material: 'glossy' });
      const slab = b.add('box', { size: [1.6, 0.32, 1.6], rounding: 0.08, color: C.blue });
      const stack = b.add('repeat', { countX: 1, countY: 8, countZ: 1, spacing: [2, 0.42, 2] }, [slab]);
      const core = b.add('cylinder', { radius: 0.45, height: 3.4, rounding: 0.1, color: C.yellow });
      const u = b.add('union', { smooth: 0.08 }, [stack, core]);
      const tw = b.add('twist', { amount: 40 }, [u]);
      b.output(tw).pin(tw, 'amount', 'Twist');
      return b.done();
    },
  },
  {
    id: 'chain',
    title: 'Chain',
    description:
      'Two rows of links, one turned 90°, repeated along X — a print-in-place chain if you keep the gaps open.',
    tags: ['printable', 'learn'],
    build: () => {
      const b = new DocBuilder('Chain', { mmPerUnit: 8, material: 'metal' });
      // links are 1.6 long; Repeat centres its copies, so the 3 flat links sit at 0, ±2.6 and the 2 upright ones at ±1.3
      const l1 = b.add('link', {
        length: 0.6,
        radius: 0.5,
        thickness: 0.15,
        rotation: [0, 0, 90],
        color: C.stone,
      });
      const r1 = b.add('repeat', { countX: 3, countY: 1, countZ: 1, spacing: [2.6, 2, 2] }, [l1]);
      const l2 = b.add('link', {
        length: 0.6,
        radius: 0.5,
        thickness: 0.15,
        rotation: [90, 0, 90],
        color: C.stone,
      });
      const r2 = b.add('repeat', { countX: 2, countY: 1, countZ: 1, spacing: [2.6, 2, 2] }, [l2]);
      const u = b.add('union', { smooth: 0 }, [r1, r2]);
      b.output(u);
      return b.done();
    },
  },
  {
    id: 'flower',
    title: 'Flower',
    description:
      'Petals are one ellipsoid copied around the centre with Radial repeat. Change Copies for more petals.',
    tags: ['art', 'learn'],
    build: () => {
      const b = new DocBuilder('Flower');
      const petal = b.add(
        'ellipsoid',
        { radii: [0.9, 0.16, 0.42], position: [0.85, 0, 0], rotation: [0, 0, 12], color: C.pink },
        undefined,
        'Petal',
      );
      const petals = b.add('radial', { count: 7 }, [petal]);
      const centre = b.add(
        'sphere',
        { radius: 0.42, position: [0, 0.12, 0], color: C.yellow },
        undefined,
        'Centre',
      );
      const bumps = b.add('displace', { pattern: 'noise', amount: 0.035, scale: 0.12, octaves: 1 }, [centre]);
      const u = b.add('union', { smooth: 0.1 }, [petals, bumps]);
      b.output(u).pin(petals, 'count', 'Petals');
      return b.done();
    },
  },
  {
    id: 'bridge',
    title: 'Bent arch',
    description: 'A long rounded box curved into an arch with Bend, then copied with Repeat.',
    tags: ['learn', 'art'],
    build: () => {
      const b = new DocBuilder('Bent arch');
      const beam = b.add('box', { size: [4.2, 0.36, 0.5], rounding: 0.12, color: C.green });
      const bend = b.add('bend', { amount: 38 }, [beam]);
      const up = b.add('transform', { position: [0, 0.75, 0] }, [bend]);
      const rep = b.add('repeat', { countX: 1, countY: 1, countZ: 3, spacing: [2, 2, 0.9] }, [up]);
      const base = b.add('box', {
        size: [4.4, 0.25, 3],
        rounding: 0.1,
        position: [0, -0.9, 0],
        color: C.stone,
      });
      const u = b.add('union', { smooth: 0.15 }, [rep, base]);
      b.output(u).pin(bend, 'amount', 'Bend');
      return b.done();
    },
  },
  {
    id: 'morph',
    title: 'Sphere to cube',
    description:
      'Morph mixes two distance fields. Press Play (top right of the 3D view) to watch the sphere become a cube, or slide Morph yourself.',
    tags: ['learn'],
    build: () => {
      const b = new DocBuilder('Sphere to cube');
      const s = b.add('sphere', { radius: 1.1, color: C.coral });
      const c = b.add('box', { size: [1.8, 1.8, 1.8], rounding: 0.05, color: C.blue });
      const m = b.add('morph', { amount: 0.5 }, { a: s, b: c });
      b.output(m).pin(m, 'amount', 'Morph', { from: 0, to: 1, seconds: 4 });
      return b.done();
    },
  },
  {
    id: 'pawn',
    title: 'Chess pawn',
    description:
      'A Profile you draw, spun by Revolve, with a sphere blended on top. Select the Profile node and drag its points to make your own piece.',
    tags: ['printable', 'game', 'learn'],
    build: () => {
      const b = new DocBuilder('Chess pawn', { mmPerUnit: 20, material: 'glossy' });
      // half silhouette: X = distance from the axis, Y = height; sharp corners on the axis and the collar
      const body = b.add(
        'profile',
        {
          points: [
            0, 0, 1, 0.72, 0, 1, 0.72, 0.14, 0, 0.5, 0.3, 0, 0.32, 0.75, 0, 0.24, 1.25, 0, 0.42, 1.35, 1,
            0.42, 1.45, 1, 0, 1.45, 1,
          ],
          rounding: 0.01,
        },
        undefined,
        'Body outline',
      );
      const rev = b.add('revolve', { offset: 0, color: C.cream }, [body]);
      const head = b.add(
        'sphere',
        { radius: 0.38, position: [0, 1.78, 0], color: C.cream },
        undefined,
        'Head',
      );
      const u = b.add('union', { smooth: 0.06 }, [rev, head]);
      b.output(u).pin(head, 'radius', 'Head size').pin(body, 'rounding', 'Soften');
      return b.done();
    },
  },
  {
    id: 'bracket',
    title: 'Shelf bracket',
    description:
      'An L-shaped Profile extruded into a bracket, with two screw holes. Set the width and hole size in Controls; drag the outline’s points to change the arms.',
    tags: ['printable', 'learn'],
    build: () => {
      const b = new DocBuilder('Shelf bracket', { mmPerUnit: 25 });
      const outline = b.add(
        'profile',
        {
          points: [0, 0, 1, 1.6, 0, 1, 1.6, 0.25, 1, 0.55, 0.25, 0, 0.25, 0.55, 0, 0.25, 1.6, 1, 0, 1.6, 1],
          rounding: 0.03,
          color: C.blue,
        },
        undefined,
        'L outline',
      );
      // stand the outline up facing the camera; Extrude's height is the bracket's width
      const ex = b.add('extrude', { height: 0.8, rounding: 0.03, rotation: [90, 0, 0], color: C.blue }, [
        outline,
      ]);
      const holeV = b.add(
        'cylinder',
        { radius: 0.11, height: 1.2, rounding: 0, position: [1.05, 0, 0], color: C.blue },
        undefined,
        'Screw hole (floor)',
      );
      const holeH = b.add(
        'cylinder',
        {
          radius: 0.11,
          height: 1.2,
          rounding: 0,
          position: [0, 1.05, 0],
          rotation: [0, 0, 90],
          color: C.blue,
        },
        undefined,
        'Screw hole (wall)',
      );
      const holes = b.add('union', { smooth: 0 }, [holeV, holeH], 'Screw holes');
      const cut = b.add('subtract', { smooth: 0.04, edge: 'chamfer' }, { base: ex, cutter: holes });
      b.output(cut)
        .pin(ex, 'height', 'Width')
        .pin(holeV, 'radius', 'Hole (floor)')
        .pin(holeH, 'radius', 'Hole (wall)');
      return b.done();
    },
  },
  {
    id: 'gem',
    title: 'Cut gem',
    description:
      'An octahedron stretched with Elongate and trimmed with Cut — shiny with the metal material.',
    tags: ['art', 'game'],
    build: () => {
      const b = new DocBuilder('Cut gem', { material: 'glossy' });
      const o = b.add('octahedron', { size: 1.2, color: C.teal });
      const el = b.add('elongate', { amount: [0.5, 0.2, 0.5] }, [o]);
      const top = b.add('cut', { axis: 'y', offset: 0.75, keep: 'below' }, [el], 'Table cut');
      b.output(top);
      return b.done();
    },
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

export const DEFAULT_EXAMPLE = 'clay-blend';
