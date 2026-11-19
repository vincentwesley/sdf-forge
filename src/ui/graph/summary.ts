import type { GNode } from '../../core/graph/doc';
import { getDef, paramsOf } from '../../core/nodes/registry';
import { displayUnit, fmt } from '../format';
import { decodeOutline } from '../../core/svg';

/** One-line description of a node's key values, shown on the node card. */
export function nodeSummary(n: GNode, mmPerUnit: number): string {
  const def = getDef(n.type);
  if (!def) return '';
  const len = (v: number) => `${fmt(v * mmPerUnit, mmPerUnit >= 10 ? 0 : 1)} mm`;
  const p = n.params;
  switch (n.type) {
    case 'box': {
      const s = p.size as number[];
      return `${s.map((v) => fmt(v * mmPerUnit, 0)).join(' × ')} mm`;
    }
    case 'union':
    case 'subtract':
    case 'intersect':
      return (p.smooth as number) > 0
        ? `${p.edge === 'chamfer' ? 'chamfer' : 'smooth'} ${len(p.smooth as number)}`
        : 'sharp edges';
    case 'svg': {
      const n = decodeOutline(String(p.svg ?? '')).polys.length;
      return `${n} outline${n === 1 ? '' : 's'}, ${len(p.size as number)}`;
    }
    case 'profile':
      return `${(p.points as number[]).length / 3} points`;
    case 'repeat':
      return `${p.countX} × ${p.countY} × ${p.countZ} copies`;
    case 'radial':
      return `${p.count} copies`;
    case 'mirror':
      return `mirror ${
        ['x', 'y', 'z']
          .filter((a) => p[a])
          .join(', ')
          .toUpperCase() || 'none'
      }`;
    case 'transform': {
      const pos = p.position as number[];
      return pos.some((v) => v) ? `move ${pos.map((v) => fmt(v * mmPerUnit, 0)).join(', ')} mm` : 'no offset';
    }
    case 'output':
      return 'final shape';
    case 'text':
      return `“${String(p.text)}”, ${len(p.size as number)}`;
    case 'displace':
      return `${p.pattern}, ${len(p.amount as number)}`;
    case 'lattice':
      return `${p.pattern}, cell ${len(p.cell as number)}`;
    case 'cut':
      return `keep ${p.keep === 'above' ? 'above' : 'below'} ${String(p.axis).toUpperCase()} = ${len(p.offset as number)}`;
  }
  const main = paramsOf(n.type)
    .filter((x) => !x.group || x.group === 'main')
    .slice(0, 2);
  return main
    .map((d) => {
      const v = p[d.key];
      if (typeof v === 'number') {
        const u = displayUnit(d, mmPerUnit);
        return `${d.label.toLowerCase()} ${fmt(v * u.factor, u.suffix === 'mm' ? 0 : u.decimals)}${u.suffix === 'mm' ? ' mm' : u.suffix}`;
      }
      if (typeof v === 'string') return v;
      return '';
    })
    .filter(Boolean)
    .join(', ');
}
