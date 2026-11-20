# Handover

Living document: read this first when resuming work on SDF Forge.

## Where things are

* Branch: `ccr-920c777e-aq16kx` (all work), to be merged into `main` through one pull request at the end.
  GitHub Pages deploys only from `main` (`.github/workflows/deploy.yml`).
* Plan: `docs/PLAN.md` · Decisions and brainstorm verdicts: `docs/DECISIONS.md` · Research: `docs/RESEARCH.md` · Safe free 3D resources and licence rules: `docs/RESOURCES.md`
* Acceptance checks: `docs/ACCEPTANCE.md`, all runnable with `npm run acceptance`.
* Usability walkthroughs: `docs/USABILITY.md` · Things only Vin can do: `docs/NEEDS-VIN.md`

## Architecture in one minute

`src/core` is DOM-free TypeScript: `ir/` (typed expression IR → GLSL and scalar JS), `nodes/` (35 node definitions
with emit/bounds/Lipschitz/help), `graph/` (document model, validation, auto layout), `compile.ts` (graph → shader +
CPU evaluator + param slots), `mesh/` (Manifold level-set meshing and STL/3MF/GLB/OBJ writers, `zip.ts`), `share.ts` (links).
`src/render` is the WebGL2 ray marcher; `src/ui` the React app (xyflow graph, inspector, dialogs); `src/state` the
Zustand store with undo history; `src/gallery` the examples (written with a small `DocBuilder` DSL).
`window.sdfForge` (`src/testApi.ts`) exposes hooks for tests and the thumbnail script.

## Local commands

```bash
npm run dev                       # dev server on :5173
npm run build && npm run serve    # production build served at http://localhost:4173/sdf-forge/
npm test                          # unit tests (vitest)
npm run e2e                       # Playwright (uses the build; SwiftShader WebGL)
npm run meshes                    # export + validate all gallery meshes (needs python trimesh: see scripts/requirements.txt)
npm run thumbnails                # re-render public/gallery/*.webp and public/og.png from the build
npm run acceptance                # everything
```

In the cloud container Chromium + Playwright 1.63 are preinstalled; `@playwright/test` is pinned to 1.63.0 so no
browser download is needed. A Python venv with trimesh lives in `.venv/` (git-ignored).

## Status by milestone

| Milestone | Status |
| --- | --- |
| M0 research, plan, scaffold | done |
| M1 IR + compiler + nodes + unit tests | done (102 unit tests) |
| M2 renderer + GPU/CPU agreement | done (agreement ≤ 1e-3 on all nodes/examples) |
| M3 editor UI | done |
| M4 mesh export + validation | done (63 meshes pass trimesh, GLBs pass Khronos validator) |
| M5 share links, gallery, templates, Controls | done (16 examples at first build, 18 now; printable templates with Controls) |
| M6 picking, gizmo, learning, render/video/code export | done |
| M7 e2e, screenshots, a11y, fps; polish passes; usability | done (48 browser tests; two polish passes; USABILITY.md) |
| Next idea from the brainstorm: Text node | done |
| M8 README, PR, merge, deploy, verify live | done — Pages enabled by Vin, deployed 2026-11-18, live site checked (A21) |

## Next session: where to pick up

1. The site is live and deploys on every push to `main`. After a merge, `node scripts/check-live.mjs` confirms it.
2. Next features, most valuable first (details and reasons in `docs/COMPARISON.md` → "Planned next"):
   a Thread node (printable screws and nuts), linked group instances, glow bloom, more OFL fonts for Text, named
   versions in the browser, then a WGSL/WebGPU back end from the same IR. Deliberately not planned: mesh import,
   freehand sculpting, path tracing (reasons in COMPARISON.md).
3. After a visible UI change, regenerate the PDF guide (`npm run build && npm run guide`) so its screenshots stay current,
   and check the pages (`pdftoppm -r 60 -png public/guide/sdf-forge-guide.pdf /tmp/p`).
4. Each change: `npm run acceptance` (everything) or at least lint + typecheck + unit + build, then push to the
   working branch, open a PR into `main` and merge once CI is green.

---

## Session 4 (2026-11-20): materials, groups, embeds, gears

Built through PRs #15–#17. CI was green on each (lint, types, unit, build, mesh validation, full Playwright), each was
merged, then deployed and checked live with `node scripts/check-live.mjs`.
* **Per-shape materials** (#15): Same as scene / Clay / Glossy / Metal / Glow per shape.
  * Blended across smooth unions with the colour's weight. They are uniforms, so changing one never recompiles.
  * GPU/CPU agreement now compares materials too.
  * Exports group triangles by (colour, material):
    * GLB: one primitive + PBR material each, with emission for glow.
    * USDZ: a GeomSubset with `metallic` / `roughness` / `emissiveColor`.
    * 3MF: filaments named after their material. PBR display properties were tried and dropped, because lib3mf
      strict rejects them (DECISIONS 22).
  * CI rebuilds multi-primitive GLBs as one exact mesh for the watertight checks.
  * New *Desk lamp* example.
  * Fixed on the way: on phones the Properties tab was 16 px wider than the screen; Ctrl+Z now works while a
    dropdown has focus.
* **Node groups and My parts** (#16):
  * Ctrl+G folds nodes into one card with inputs, results and up to eight exposed settings. Expand, rename,
    duplicate (Ctrl+D), ungroup (Ctrl+Shift+G), delete.
  * Save a group to *My parts* (localStorage) and add it to any shape from the Add node menu.
  * Groups are an organising layer, so compiled code, picking, undo and exports are unchanged (DECISIONS 23).
* **Shadertoy export for Text/SVG shapes** (#17): the grids are baked as 16-bit const arrays (DECISIONS 24).
* **Gear node** (#17): true involute spur gears that mesh, with a *Gear pair* example (DECISIONS 25).
* **Embed on a website** (#17): `#…&view=1` view-only player with Controls; iframe code in Share (DECISIONS 26).
* **Printer fit check** (#17): in the export dialog, with scale to fit (DECISIONS 27).
* Research for this round is in `docs/COMPARISON.md`: Spline viewer/embeds, Fusion gears/threads, printer build volumes.
* Totals now:
  * 37 node types, 21 examples
  * 209 unit tests, 77 Playwright tests
  * 26 shapes × 5 formats validated (STL, 3MF, GLB, OBJ with trimesh/lib3mf; GLB with Khronos; USDZ with OpenUSD + ARKit)
* Not done: the "Planned next" items above. Linked group instances were left out on purpose (DECISIONS 23). Nothing
  needs Vin.

## Session 3 (2026-11-19/20): features from other 3D tools

Researched Womp, MagicaCSG, Tinkercad, Spline, Fusion 360/Shapr3D and Substance Modeler (`docs/COMPARISON.md`),
then built the gaps through PRs #9–#13, with CI green on each, deployed and checked live.
* **PDF user guide** (#10): `public/guide/sdf-forge-guide.pdf`, built by `npm run guide` from real screenshots.
  It's linked from Help, the welcome card, About and the README.
* **Chamfered joins, section view, camera menu with standard and orthographic views** (#11).
* **Rotate/scale gizmo (W/E/R) and measure tool (M)** (#12).
* **SVG shape node** (file, paste, drag-and-drop) and **USDZ export** for AR Quick Look (#13). USDZ is validated in
  CI with OpenUSD (`usd-core==25.11`, the last release with the Python ARKit checker) by `scripts/validate_usdz.py`.
* The perf test now measures the renderer (orbit driven in-page), not the Playwright input round trip (#9).
* Totals now: 36 node types, 19 examples, 169 unit tests, 64 Playwright tests, 24 shapes × 5 formats validated.

## Session 2 (2026-11-18): added after the first build

All merged through PRs #3–#8, with CI green on each, then deployed and checked live.
* **3MF export** (#5): millimetres, a palette of the shapes' own colours, credit metadata and a thumbnail.
  Validated in CI by trimesh and lib3mf (strict).
* **Studio reflections** (#6, fix #7): a CC0 Poly Haven HDRI, pre-filtered into a 44 KB RGB9E5 mip chain. A
  regression test checks it survives resizes.
* **Profile node** (#8): a point editor (mouse, touch and keyboard) with sharp and smooth points, plus the
  *Chess pawn* and *Shelf bracket* examples. Tested against a brute-force polygon distance and Pappus's theorem.
* **Animated Controls** (#8): a Play button in the view, animated turntable videos, animations in share links.
* Fixes: a drag is always one undo step; keys handled by a widget skip the app shortcuts; the theme is applied
  before first paint; the GitHub Actions run on Node 24.
* **Free 3D resources** vetted for licences: `docs/RESOURCES.md` (CC0 first, with the risks spelled out).
* Totals now: 35 node types, 18 examples, 140 unit tests, 55 Playwright tests, 23 shapes × 4 formats (92 meshes) validated.

## Final status (end of the first build, 2026-11-18)

### Done and verified

* Live URL: **<https://vincentwesley.github.io/sdf-forge/>** — deployed from `main` by GitHub Actions. A21
  (`node scripts/check-live.mjs`) passes: the page renders a shape with 0 page errors. The live site was also
  opened at 390×844, 820×1180 and 1440×900 (gallery example `gem`): it renders, the layout fits and no request fails.
* Everything in `docs/ACCEPTANCE.md` A1–A20 pass **from a fresh clone** (`npm run acceptance`) and in CI on the
  final commit (lint, typecheck, 117 unit tests, build + dist checks, 63 meshes validated with trimesh, 21 GLBs
  with the Khronos validator, 48 Playwright tests incl. GPU/CPU agreement, a11y, screenshots, frame rate).
* Editor: 34 node types (incl. Text), toolbar add/carve, picking + move gizmo, inspector in mm with explanations,
  graph with compatible-node search, copy/paste, command palette, undo/redo, autosave, tour, light/dark, responsive
  phone/tablet/desktop layouts, keyboard support, reduced motion.
* Exports: STL/3MF/GLB/OBJ (watertight, manifold, sized in mm, credited), PNG up to 4K, MP4/WebM turntable,
  Shadertoy/GLSL code. Share links and graph files.
* Gallery: 18 examples incl. 7 printable templates whose Controls are tested across their ranges.
* Docs: README (screenshots, GIF, live link), RESEARCH, PLAN, DECISIONS, ACCEPTANCE, USABILITY (three
  walkthroughs, all friction points fixed or recorded), CHANGELOG, CONTRIBUTING, SECURITY, MIT licence
  (© 2026 Vin's Atelier).

### Not done, and why

* Shadertoy export for shapes containing Text (needs a texture channel; the code tab explains this).
* Node groups, sculpt brushes, image-based materials, WebGPU: recorded as "Later" in DECISIONS.md with reasons.
  (Parameter animation, the profile editor and 3MF were built in session 2.)

### What needs Vin

* Optional: social preview image, About box, private vulnerability reporting (NEEDS-VIN.md §2).
