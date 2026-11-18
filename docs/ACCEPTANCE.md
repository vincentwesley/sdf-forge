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
| **A9** | The shader (GPU) and the CPU evaluator agree within 2×10⁻³ (relative) on distances and 2×10⁻² on colours for every gallery example and every node type | `tests/e2e/agreement.spec.ts` (headless Chromium, SwiftShader) |
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
| **A21** | Live site is up: `https://vincentwesley.github.io/sdf-forge/` returns the app, which renders a shape | `node scripts/check-live.mjs` (run after deploy) |
