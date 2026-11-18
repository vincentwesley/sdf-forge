import {
  ArrowUpFromLine,
  Blend,
  Box,
  Circle,
  CircleDashed,
  Combine,
  Cone,
  Cylinder,
  Donut,
  Egg,
  Expand,
  FlipHorizontal,
  Flag,
  Flower,
  Gem,
  Grid3x3,
  Hexagon,
  Link,
  Move3d,
  MoveHorizontal,
  Pentagon,
  Pill,
  RectangleHorizontal,
  RefreshCw,
  Scissors,
  Spline,
  SquareMinus,
  SquaresIntersect,
  Star,
  Tornado,
  Waves,
  Hash,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '../core/nodes/types';

export const NODE_ICONS: Record<string, LucideIcon> = {
  sphere: Globe,
  box: Box,
  torus: Donut,
  cylinder: Cylinder,
  capsule: Pill,
  cone: Cone,
  ellipsoid: Egg,
  octahedron: Gem,
  hexPrism: Hexagon,
  link: Link,
  circle: Circle,
  rect: RectangleHorizontal,
  polygon: Pentagon,
  star: Star,
  union: Combine,
  subtract: SquareMinus,
  intersect: SquaresIntersect,
  morph: Blend,
  transform: Move3d,
  twist: Tornado,
  bend: Spline,
  repeat: Grid3x3,
  radial: Flower,
  mirror: FlipHorizontal,
  elongate: MoveHorizontal,
  shell: CircleDashed,
  round: Expand,
  displace: Waves,
  lattice: Hash,
  cut: Scissors,
  extrude: ArrowUpFromLine,
  revolve: RefreshCw,
  output: Flag,
};

export const CAT_VAR: Record<Category, string> = {
  shape: 'var(--cat-shape)',
  profile: 'var(--cat-profile)',
  combine: 'var(--cat-combine)',
  modify: 'var(--cat-modify)',
  convert: 'var(--cat-convert)',
  output: 'var(--cat-output)',
};

export function NodeIcon({ type, category, size = 15 }: { type: string; category: Category; size?: number }) {
  const Icon = NODE_ICONS[type] ?? Box;
  return (
    <span
      className="node-icon"
      style={{
        background: `color-mix(in srgb, ${CAT_VAR[category]} 18%, transparent)`,
        color: CAT_VAR[category],
      }}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

/** Brand mark: a smooth-blended pair of discs. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb36b" />
          <stop offset="1" stopColor="#ff6a2b" />
        </linearGradient>
      </defs>
      <path
        d="M8.5 4.5a6 6 0 0 1 5.6 3.9 4.6 4.6 0 1 1 1.4 9.1H8.5a6.5 6.5 0 0 1 0-13z"
        fill="url(#bm)"
        transform="rotate(-8 12 12)"
      />
    </svg>
  );
}
