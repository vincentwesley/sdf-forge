# Needs Vin

## 1. Turn on GitHub Pages (required for the live site) — 1 minute

The site is merged into `main` and the deploy workflow builds it successfully, but GitHub reports that Pages is not
enabled for this repository (`Get Pages site failed … Not Found` in
[the deploy run](https://github.com/vincentwesley/sdf-forge/actions/workflows/deploy.yml)). The workflow's token is
not allowed to switch Pages on by itself (`Resource not accessible by integration` — tried with
`configure-pages`'s `enablement` option), so this needs a repository admin:

1. Open <https://github.com/vincentwesley/sdf-forge/settings/pages>.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (if it already shows that, switch it to
   "Deploy from a branch" and back to **GitHub Actions** so it saves). No branch or folder needs choosing.
3. Open <https://github.com/vincentwesley/sdf-forge/actions/workflows/deploy.yml>, click **Run workflow** →
   branch **main** → **Run workflow**. (Any later push to `main` also deploys.)
4. After about a minute the site is live at <https://vincentwesley.github.io/sdf-forge/>.
   To double-check from a clone: `node scripts/check-live.mjs` (acceptance check A21).

## 2. Optional, nice to have

* **Social preview image** for the repository: **Settings** → **General** → **Social preview** → **Edit** → upload
  `public/og.png`.
* **About box**: on the repository page click ⚙ next to **About**; description "Build 3D shapes from signed distance
  functions in your browser — node graph, real-time ray marching, watertight STL/glTF export.", website
  `https://vincentwesley.github.io/sdf-forge/`, topics `sdf`, `raymarching`, `webgl2`, `3d-printing`, `node-editor`.
* **Private vulnerability reporting** (referenced in SECURITY.md): **Settings** → **Code security** → enable
  **Private vulnerability reporting**.
