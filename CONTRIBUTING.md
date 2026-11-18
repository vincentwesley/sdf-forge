# Contributing

Thanks for your interest in SDF Forge!

## Setup

```bash
npm ci
npm run dev          # http://localhost:5173
```

Optional, for mesh validation: `python3 -m pip install -r scripts/requirements.txt`.

## Before you open a pull request

```bash
npm run lint && npm run typecheck && npm test   # fast checks
npm run build && npm run e2e                   # browser tests (needs Chromium: npx playwright install chromium)
npm run meshes                                 # export + validate every gallery mesh
```

`npm run acceptance` runs everything listed in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Adding a node

1. Add a `NodeDef` in `src/core/nodes/` (params, inputs, `emit` written with the IR builder, conservative `bounds`,
   `lipschitz` if it warps space, and a plain-language `help` text). Credit the formula's source in `credit`.
2. Register it in `src/core/nodes/registry.ts` and give it an icon in `src/ui/meta.tsx`.
3. The generic tests in `tests/unit/nodes.test.ts` and `tests/e2e/agreement.spec.ts` cover bounds, step safety and
   GPU/CPU agreement automatically; add a known-distance test if the node is exact.

## Code style

TypeScript strict mode, Prettier formatting, ESLint. Keep the `core/` folder free of DOM code so it can run in workers
and Node.

## Outside assets

Before adding any texture, HDRI, model, font or code from elsewhere, read [docs/RESOURCES.md](docs/RESOURCES.md). Prefer CC0, never add NC/ND/GPL files, and record the source and licence in `public/CREDITS.md`.
