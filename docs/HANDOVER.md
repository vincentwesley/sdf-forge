# Handover

Living document: read this first when resuming work on SDF Forge.

## Where things are

* Branch: `ccr-920c777e-aq16kx` (all work), to be merged into `main` through one pull request at the end.
  GitHub Pages deploys only from `main` (`.github/workflows/deploy.yml`).
* Plan: `docs/PLAN.md` · Decisions and brainstorm verdicts: `docs/DECISIONS.md` · Research: `docs/RESEARCH.md`
* Acceptance checks: `docs/ACCEPTANCE.md`, all runnable with `npm run acceptance`.
* Usability walkthroughs: `docs/USABILITY.md` · Things only Vin can do: `docs/NEEDS-VIN.md`

## Architecture in one minute

`src/core` is DOM-free TypeScript: `ir/` (typed expression IR → GLSL and scalar JS), `nodes/` (34 node definitions
with emit/bounds/Lipschitz/help), `graph/` (document model, validation, auto layout), `compile.ts` (graph → shader +
CPU evaluator + param slots), `mesh/` (Manifold level-set meshing and STL/GLB/OBJ writers), `share.ts` (links).
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
| M8 README, PR, merge, deploy, verify live | in progress |

## Known issues / next steps

See the bottom of this file once the project is finished; during work, the task list is:
1. Polish passes (design, wording, performance, edge cases, mobile) and the three usability walkthroughs.
2. README with screenshots + GIF, then the PR → merge → deploy → verify live.
