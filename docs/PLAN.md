# Plan

## Goal
A live website where anyone builds 3D shapes by connecting SDF nodes, sees them ray-marched in real time,
and exports watertight meshes (STL, GLB, OBJ), images, turntable videos and shader code, or shares the graph as a link.

## Architecture

```
src/
  core/            pure TypeScript, no DOM — unit tested in Node
    ir/            typed expression IR + hash-consing + GLSL and JS code generators
    nodes/         node registry: params, sockets, IR emitter, bounds, Lipschitz, help text
    graph/         document model, validation, type checking, cycle checks, auto-layout
    compile.ts     graph → { glsl, js, bounds, lipschitz, paramLayout, leaves }
    share.ts       compact (deflate + base64url) graph links
    mesh/          manifold levelSet wrapper, STL/GLB/OBJ writers (used by worker and CI script)
  render/          WebGL2 renderer (ray marcher, accumulation, picking helpers), shader templates
  workers/         mesh.worker.ts
  ui/              React components (viewport, graph, inspector, dialogs, tour)
  state/           zustand store: document, history (undo/redo), selection, preferences
  gallery/         example and template documents (JSON) + metadata
scripts/           mesh validation (Node + Python), screenshot/GIF tooling
tests/             vitest unit tests; e2e/ Playwright tests
```

### One IR, two back ends
Each node's formula is written once in a small typed expression DSL (`float`, `vec2`, `vec3`; arithmetic,
`min/max/abs/length/dot/clamp/mix/sin/cos/atan/sqrt/floor/round/fract/select`, noise builtin). The compiler
walks back from the output node, threading the sample point through domain operations, hash-conses
identical sub-expressions and emits:

* **GLSL ES 3.00** — `float map(vec3 p)` (distance only, used for marching), `vec4 mapColor(vec3 p)`
  (colour + selection distance, evaluated once per pixel), parameters read from `uniform vec4 uP[N]`.
* **JavaScript** — scalarised straight-line code `(x, y, z, P) => d` with no allocations (fast enough for
  meshing millions of points), plus `color` and `pick` (which primitive is closest) variants.

Unit tests compare both back ends against analytic distances; a Playwright test renders the GLSL into a
float framebuffer at sample points and checks it matches the JS within 1e-4.

### Rendering
WebGL2 fullscreen triangle; sphere tracing clipped to scene AABB; step scaled by 1/L; IQ soft shadows, AO,
sky/key/rim lighting, ground shadow catcher, filmic tone map. Render on demand only. While interacting:
dynamic resolution to hold frame time; when idle: jittered progressive accumulation (up to 32 frames).
View modes: Shaded, Normals, Print check (thin walls + overhangs), Steps heat-map (for debugging cost).

### Editor
* Desktop: top bar; viewport (top-left, hero), node graph (below the viewport), inspector (right column).
* Tablet: same with collapsible inspector drawer. Phone: tabbed (Shape / Graph / Edit).
* Add shapes from a toolbar palette (auto-wires into the main Union and selects the new node).
* Click a shape in the viewport to select its node; drag gizmo arrows to move it.
* Graph: drag wire to empty space → compatible-node search; replace on occupied input; delete/duplicate;
  auto-layout; "view this node" flag; minimap off by default; keyboard: arrow keys move focus, Enter opens.
* Inspector: scrubbable numeric fields (drag label, arrows, type a value), lengths shown in mm, angles in °,
  colour pickers, enum segmented controls, "Pin to Controls", explanation of the node, input wiring
  dropdowns (keyboard alternative to dragging wires).
* Document panel (nothing selected): title, pinned Controls, material, units.
* Undo/redo with coalesced drags; autosave to localStorage; recent shapes.
* Command palette (`Ctrl/Cmd+K`) and `?` shortcuts sheet.

### Export
Mesh worker runs Manifold `levelSet` on the JS SDF (negated: Manifold wants positive inside) over the
compiled bounds plus margin. Quality presets set edge length relative to size, with an estimated time.
Outputs: binary STL (Z-up, mm, 80-byte header credits Vin's Atelier), GLB (Y-up metres, normals from SDF
gradient, vertex colours, `asset.generator`/`copyright`, `extras`), OBJ. Dialog shows mm dimensions, volume,
triangle count, manifold status, estimated filament mass. Also PNG render (up to 4K, transparent option),
turntable WebM via WebCodecs+muxer (fallback MediaRecorder), GLSL/Shadertoy code.

### Sharing and gallery
`#g=<base64url(deflate-raw(json))>` links (no server); gallery deep links `#example=<id>`. Gallery:
~12 examples (art, game asset, learning) + ~6 printable templates with Controls.

## Milestones
| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Research, plan, acceptance, scaffold, CI, deploy workflow | CI green on branch |
| M1 | IR, node registry, compiler, bounds, CPU evaluator | unit tests on known distances pass |
| M2 | Renderer + GPU/CPU agreement harness | shape renders at good fps in headless Chromium; agreement test passes |
| M3 | Editor UI (graph, inspector, palette, history, autosave, themes, responsive) | build/edit/undo flows usable by keyboard and mouse |
| M4 | Mesh export + validation scripts in CI | every gallery shape exports watertight, correct size/volume, opens in trimesh + glTF validator |
| M5 | Share links, gallery, templates, Controls | links round-trip; every example opens |
| M6 | Picking + gizmo, explain mode, tour, PNG/video/shader export, print check | flows tested |
| M7 | E2E suite, screenshots, axe, fps check; two polish passes; usability walkthroughs | ACCEPTANCE all green |
| M8 | README (screenshots, GIF, live link), PR, merge, deploy, verify live | live site works at 3 widths |

After each milestone: use the site in headless Chromium, review screenshots critically, fix, run lint +
tests + build, update HANDOVER.md, commit and push.
