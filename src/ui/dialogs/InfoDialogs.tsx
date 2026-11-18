import { Modal } from './Modal';

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const M = mac ? '⌘' : 'Ctrl';

const SHORTCUTS: [string, string][] = [
  [`${M} Z`, 'Undo'],
  [`${M} Shift Z / ${M} Y`, 'Redo'],
  [`${M} K`, 'Command palette (every action, searchable)'],
  [`${M} D`, 'Duplicate selected nodes'],
  [`${M} C / ${M} V`, 'Copy and paste nodes (works between tabs)'],
  ['Delete / Backspace', 'Delete selected nodes or wires'],
  ['A (in graph)', 'Add a node'],
  ['Right-click (graph)', 'Add a node at the pointer'],
  ['Drag wire to empty space', 'Add a compatible node already connected'],
  ['F', 'Frame the shape in the 3D view'],
  ['Esc', 'Clear selection / close dialogs'],
  ['1 – 4', 'View mode: shaded, print check, normals, cost'],
  ['G', 'Toggle floor grid'],
  ['?', 'This list'],
  ['Arrows (3D view focused)', 'Orbit; + and − zoom'],
  ['Arrows (gizmo arrow focused)', 'Move 1 mm along that axis (Shift: 10 mm)'],
  ['Shift + drag a value', 'Fine adjustment'],
];

export function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" testId="shortcuts">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap' }}>
                <kbd>{k}</kbd>
              </td>
              <td style={{ padding: '7px 0', color: 'var(--text-2)' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function AboutDialog() {
  return (
    <Modal title="About SDF Forge" testId="about">
      <p className="explain" style={{ marginTop: 0 }}>
        SDF Forge builds 3D shapes from <strong>signed distance functions</strong>: little formulas that tell
        you, for any point in space, how far it is from the surface (negative inside). Combining formulas lets
        shapes blend like clay, repeat for free and twist without breaking — then a guaranteed-watertight
        mesher turns the result into a printable file.
      </p>
      <p className="explain">
        Made by <strong>Vin</strong> · <strong>Vin’s Atelier</strong>. Open source under the MIT licence.
      </p>
      <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>Credits</h3>
      <ul className="explain" style={{ paddingLeft: 18, margin: 0 }}>
        <li>
          Distance functions, smooth minimum, soft shadows and normals after Inigo Quilez’s articles
          (iquilezles.org, MIT).
        </li>
        <li>Polar repetition after Mercury’s hg_sdf (MIT).</li>
        <li>Meshing: Manifold by Emmett Lalish and contributors (Apache-2.0).</li>
        <li>Tone mapping: Khronos PBR Neutral (Apache-2.0).</li>
        <li>
          Node editor: React Flow / xyflow (MIT). UI: React (MIT), Zustand (MIT), Lucide icons (ISC), Inter
          typeface (SIL OFL 1.1).
        </li>
        <li>Video encoding: Mediabunny (MPL-2.0).</li>
      </ul>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Everything runs in your browser. Your work is saved in this browser only; share links carry the graph
        inside the URL.
      </p>
    </Modal>
  );
}
