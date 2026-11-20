# Acceptance checks

Every check below is automated. Run them all from a fresh clone with:

```bash
npm ci
python3 -m pip install -r scripts/requirements.txt   # trimesh + numpy for mesh validation
npx playwright install chromium                       # once, if no Chromium is installed
npm run acceptance
```

`npm run acceptance` (`scripts/acceptance.mjs`) runs each group in order, prints a pass/fail table and
exits non-zero if anything fails. CI runs the same groups on every push (`.github/workflows/ci.yml`).

| ID | Check | How it is verified |
| --- | --- | --- |
| **A1** | Lint and formatting are clean | `npm run lint` (ESLint + Prettier) |
| **A2** | TypeScript has no errors | `npm run typecheck` |
| **A3** | Compiler: every primitive matches its analytic distance (sphere, box, rounded box, torus, capsule, cylinder, cone, octahedron, hex prism, link, ellipsoid) | `tests/unit/primitives.test.ts` |
| **A4** | Compiler: every "exact" primitive is a true distance field (1-Lipschitz and projecting onto the surface lands on it), under arbitrary position/rotation/scale | `tests/unit/primitives.test.ts` |
| **A5** | Compiler: 2D profiles match brute-force polygon distances; Revolve and Extrude give exact torus/cylinder distances | `tests/unit/nodes.test.ts` |
| **A6** | Compiler: union/subtract/intersect/morph/smooth-union match their definitions; smooth union deviates by at most *k*; colours blend | `tests/unit/nodes.test.ts` |
| **A7** | Compiler: every node's bounds are conservative and its Lipschitz estimate is safe for ray marching | `tests/unit/nodes.test.ts` |
| **A8** | Share links round-trip documents; documents normalise safely from untrusted input | `tests/unit/share.test.ts` |
| **A9** | The shader (GPU) and the CPU evaluator agree within 2×10⁻³ (relative) on distances and 2×10⁻² on colours and materials for every gallery example and every node type | `tests/e2e/agreement.spec.ts` (headless Chromium, SwiftShader) |
| **A10** | Production build succeeds, every file < 25 MB, relative paths only (works from `/sdf-forge/`), page metadata credits Vin's Atelier | `npm run build` + `scripts/check-dist.mjs` |
| **A11** | Every exported mesh (STL, 3MF, GLB, OBJ) of every gallery shape and 5 analytic reference shapes is watertight, winding-consistent, has only 2-face edges, no degenerate faces, and matches the expected volume (1.5 % analytic / ≥3 % Monte Carlo) and size (2.5 mesh cells); 3MF files also load in lib3mf strict mode with no warnings, in millimetres | `scripts/export-meshes.ts` + `scripts/validate_meshes.py` (trimesh, lib3mf) |
| **A12** | Every exported GLB passes the Khronos glTF-Validator with 0 errors and carries the studio credit | `scripts/validate-gltf.mjs` |
| **A13** | Main flows work in a real browser: build a shape with the toolbar (add, carve, select, gizmo move), click-to-select, edit a node, undo/redo (buttons and keys), add/wire/view/delete nodes in the graph, modifier chips, command palette, autosave + reload, guided tour | `tests/e2e/app.spec.ts`, `tests/e2e/edit.spec.ts` |
| **A14** | Export flows: STL (header credit, real-world size), 3MF (zip package, mm, shape-colour palette, credit, thumbnail), GLB (valid, coloured, credit), OBJ, PNG (exact size), shader code (Shadertoy, params baked in), turntable video | `tests/e2e/export.spec.ts` |
| **A15** | Share a link and reopen it in a fresh browser: identical graph; damaged links fail gracefully; example deep links work | `tests/e2e/share.spec.ts` |
| **A16** | Every gallery example opens from the gallery and renders without errors | `tests/e2e/gallery.spec.ts` |
| **A17** | Screenshots at phone (390×844), tablet (820×1180) and desktop (1440×900) in light and dark, with no horizontal overflow | `tests/e2e/screenshots.spec.ts` → `artifacts/screenshots/` |
| **A18** | No serious/critical axe-core (WCAG 2.1 A/AA) violations in the non-canvas UI, in both themes, with each dialog and menu open | `tests/e2e/a11y.spec.ts` |
| **A19** | The editor is usable by keyboard (skip link, toolbar, gizmo arrows, menus, view modes) and respects reduced motion | `tests/e2e/a11y.spec.ts` |
| **A20** | Frame rate with software rendering (SwiftShader, no GPU) stays above 20 fps while orbiting and above 15 fps when rendering continuously | `tests/e2e/perf.spec.ts` |
| **A22** | Profile node: points can be dragged (one undo step per drag), nudged, switched sharp/smooth, added and removed by mouse and keyboard without deleting the node; a toolbar Profile starts as a revolved vase and survives a share link; distances match a brute-force polygon and the revolved volume matches Pappus's theorem | `tests/e2e/profile.spec.ts`, `tests/unit/nodes.test.ts` |
| **A23** | Animated Controls: Play changes the drawn values over time without changing the document or history; pausing restores them; Animate/Animated toggles from the Controls panel; animations survive share links and are dropped from settings that aren't plain numbers | `tests/e2e/animation.spec.ts`, `tests/unit/animation.test.ts` |
| **A24** | The illustrated PDF guide is served from the site's subpath and linked from Help, the welcome card and About | `tests/e2e/guide.spec.ts` |
| **A25** | Chamfered joins follow the hg_sdf formulas with safe bounds and steps; section view (axis, position, flip, close) is accessible, picking respects it and exports ignore it; standard views and orthographic projection work, with exact ray/projection round trips | `tests/unit/nodes.test.ts`, `tests/unit/camera.test.ts`, `tests/e2e/view.spec.ts` |
| **A26** | Gizmo modes: a rotate ring turns by 5° per arrow press and by dragging (one undo step); scale handle grows 5% per press; rotations are correct inside nested transforms; the measure tool reads the distance between two picked points in mm without changing selection or document | `tests/e2e/tools.spec.ts`, `tests/unit/gizmo.test.ts` |
| **A27** | SVG import: paths (arcs, curves, relative commands), basic shapes, nested transforms, even-odd holes and skipped elements are read correctly; outlines normalise to 1 unit; friendly errors; file import, paste and drag-and-drop work in the app, one undo step per import | `tests/unit/svg.test.ts`, `tests/e2e/svg.spec.ts` |
| **A28** | USDZ: every gallery and reference shape exports a package that opens in USD, passes the ARKit compliance rules, has the exported triangle count, millimetre extent matching the expected size, and every face bound to one material; the zip data is 64-byte aligned and uncompressed | `scripts/validate_usdz.py` (CI), `tests/unit/usdz.test.ts`, `tests/e2e/export.spec.ts` |
| **A29** | Per-shape materials: each shape keeps its own material with sharp joins and blends exactly like its colour across smooth ones; “Same as scene” follows the default without recompiling; GPU and CPU agree on materials for every example (A9); a clay mug with a metal handle exports as two parts in GLB (two primitives, metallic 0/1), USDZ (two GeomSubsets) and 3MF (named filaments); multi-primitive GLBs are checked as one exact mesh; the picker works by keyboard and on a phone, with undo and no axe violations | `tests/unit/material.test.ts`, `tests/e2e/material.spec.ts`, `tests/e2e/agreement.spec.ts`, `scripts/validate_meshes.py` |
| **A30** | Node groups: grouping never changes the compiled shape; the Output is never grouped and a node is in one group at most; inputs are open or outside-fed sockets, outputs are results leaving the group; deleting members prunes the group; groups survive share links and normalise safely; a part saved to *My parts* comes back as a wired copy with new ids, centred where asked, and untrusted parts are cleaned; in the app Ctrl+G / Ctrl+Shift+G / Ctrl+D, exposed settings, rename, expand/collapse by keyboard, wiring through a collapsed card, deleting a card, My parts add/remove, phone layout and axe all work | `tests/unit/groups.test.ts`, `tests/e2e/groups.spec.ts` |
| **A31** | Shadertoy export of every example (Text and SVG included) compiles and renders in WebGL2 with no uniforms or textures; a baked grid matches the texture lookup to 16-bit precision when kept whole, keeps every k-th sample exactly when reduced, stays within 8,192 samples and within two coarse cells of the full grid in between | `tests/unit/bake.test.ts`, `tests/e2e/shadertoy.spec.ts` |
| **A32** | Gear: flanks are involutes of the base circle (tooth half a pitch thick on the pitch circle), the distance matches a brute-force polygon of the full gear to 10⁻⁵ for several tooth counts, pressure angles and bores, a 20/12 pair at (z₁+z₂)·m/2 meshes without overlap, settings never recompile, and the *Gear pair* exports pass every mesh check | `tests/unit/gear.test.ts`, `scripts/validate_meshes.py` |
| **A33** | View-only player (`#…&view=1`): no editor UI, Controls work without touching saved work, clicks select nothing, *Open in SDF Forge* gives the shape as shared, no axe violations, phone layout fits; Share gives iframe embed code that opens it; the export dialog's printer check reports fit (with a 90° turn) and *Scale to fit* lands inside the bed with a 3 % margin | `tests/e2e/viewer.spec.ts`, `tests/unit/printers.test.ts` |
| **A21** | Live site is up: `https://vincentwesley.github.io/sdf-forge/` returns the app, which renders a shape | `node scripts/check-live.mjs` (run after deploy) |
