# Handover

Living document: read this first when resuming work on SDF Forge.

## Where things are

* Branch: `ccr-920c777e-aq16kx` (all work), to be merged into `main` through one pull request at the end.
  GitHub Pages deploys only from `main` (`.github/workflows/deploy.yml`).
* Plan: `docs/PLAN.md` · Decisions and brainstorm verdicts: `docs/DECISIONS.md` · Research: `docs/RESEARCH.md` · Safe free 3D resources and licence rules: `docs/RESOURCES.md`
* Acceptance checks: `docs/ACCEPTANCE.md`, all runnable with `npm run acceptance`.
* Usability walkthroughs: `docs/USABILITY.md` · Things only Vin can do: `docs/NEEDS-VIN.md`

## Architecture in one minute

`src/core` is DOM-free TypeScript: `ir/` (typed expression IR → GLSL and scalar JS), `nodes/` (34 node definitions
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
| M5 share links, gallery, templates, Controls | done (16 examples, 6 printable templates with Controls) |
| M6 picking, gizmo, learning, render/video/code export | done |
| M7 e2e, screenshots, a11y, fps; polish passes; usability | done (48 browser tests; two polish passes; USABILITY.md) |
| Next idea from the brainstorm: Text node | done |
| M8 README, PR, merge, deploy, verify live | done — Pages enabled by Vin, deployed 2026-11-18, live site checked (A21) |

## Next session: where to pick up

1. The site is live and deploys on every push to `main`. After a merge, `node scripts/check-live.mjs` confirms it.
2. Ideas left in the brainstorm (DECISIONS.md), most valuable first: Shadertoy export for text (embed the grid as
   a texture channel note or const array), parameter animation over time, node groups / sub-graphs, a spline profile
   editor for Revolve, 3MF export, a WGSL/WebGPU back end from the same IR.
3. Each change: `npm run acceptance` (everything) or at least lint + typecheck + unit + build, then push to the
   working branch, open a PR into `main` and merge once CI is green.

---

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
* Gallery: 16 examples incl. 6 printable templates whose Controls are tested across their ranges.
* Docs: README (screenshots, GIF, live link), RESEARCH, PLAN, DECISIONS, ACCEPTANCE, USABILITY (three
  walkthroughs, all friction points fixed or recorded), CHANGELOG, CONTRIBUTING, SECURITY, MIT licence
  (© 2026 Vin's Atelier).

### Not done, and why

* Shadertoy export for shapes containing Text (needs a texture channel; the code tab explains this).
* Parameter animation, node groups, spline profile editor, sculpt brushes, image-based materials, 3MF, WebGPU:
  recorded as "Later" in DECISIONS.md with reasons; a smaller polished feature set was preferred.

### What needs Vin

* Optional: social preview image, About box, private vulnerability reporting (NEEDS-VIN.md §2).
