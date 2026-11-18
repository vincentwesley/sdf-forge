# Free 3D resources we can use safely

Checked 2026-11-18. This list covers what SDF Forge (and the people who use it) can use **without asking, paying
or getting into licence trouble**: commercial use is allowed, and nothing forces the project's own MIT licence to
change.

Licences can change. The rule is to **check the licence on the asset's own page at download time**, keep that page's
URL in the commit message or in `public/CREDITS.md`, and prefer **CC0** whenever there is a choice.

## Green: CC0 / public domain (use freely, credit appreciated)

| Source | What it has | Licence (verified) | Good uses in SDF Forge |
| --- | --- | --- | --- |
| [Poly Haven](https://polyhaven.com/license) | HDRIs, PBR textures, 3D models | **CC0** for all assets. "You do not need to give credit… You can redistribute them… even in a product you sell." The site's own logos and renders are *not* CC0. | A small pre-filtered HDRI for reflections on the *Metal* and *Glossy* materials; reference lighting for screenshots. |
| [ambientCG](https://docs.ambientcg.com/license/) | PBR materials, HDRIs, decals | **CC0 1.0**. "Copy, modify, distribute… even for commercial purposes"; raw files may ship inside a project. | Triplanar surface textures (wood, stone, metal) if image-based materials are added. |
| [Kenney](https://kenney.nl/support) | Low-poly game kits, UI icons, textures | **CC0**. "You're free to use them, even in commercial projects… Attribution is not required." | Scale references in the viewport; game-asset examples in docs and tutorials. |
| [Smithsonian Open Access (3D)](https://3d.si.edu/explore) | Museum scans, mostly STL/OBJ | **CC0, but only items marked CC0.** Not every scan is. Filter by "CC0" and check each item. | Reference shapes for "build this with SDFs" tutorials. |
| [OpenGameArt](https://opengameart.org/) | Mixed game art, incl. CC0 matcap packs | **Per asset.** Use only items marked **CC0**; skip GPL/CC-BY-SA items for bundled assets. | CC0 matcaps for a fast "clay" preview mode. |

## Already used in the project (all compatible with MIT)

| Item | Licence | Where |
| --- | --- | --- |
| Inter typeface (`@fontsource/inter`, `@fontsource-variable/inter`) | **SIL OFL 1.1**. Bundling with software is allowed. The OFL FAQ says you can "make 3D objects with the outlines — no acknowledgement is required", so Text-node exports are fine. | UI font; Text node glyphs |
| Inigo Quilez's distance functions and techniques | Math is not copyrightable. His published code is MIT. We re-implement the formulas and credit him (README, About dialog, shader header). | `src/core/nodes/*` |
| manifold-3d | Apache-2.0 | Mesh export |
| opentype.js | MIT | Text node |
| mediabunny | MPL-2.0 (file-level copyleft only; we use it unmodified from npm) | Video export |

## Yellow: allowed with conditions (read before using)

* **NASA 3D Resources / NASA media**: generally not copyrighted in the US, but NASA asks to be acknowledged. Its
  **logos and insignia are not public domain**, and commercial use must not imply NASA endorsement.
  ([NASA guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/))
* **Quaternius**: free for commercial games, no attribution, but the
  [Quaternius Asset License](https://quaternius.com/license.html) **forbids redistributing the assets as a pack**.
  Don't commit them into this repo or offer them for download from the site.
* **Poly Pizza**: a mix of CC0 and CC-BY models. CC-BY needs visible credit, so check each model's licence.
* **Mercury hg_sdf**: dual MIT or CC-BY-NC. Use it under MIT, with credit (already the case, see RESEARCH.md).

## Red: avoid copying into the project

* **Shadertoy code by default.** Unless a shader states its own licence, community sources consistently report the
  default as **CC BY-NC-SA 3.0** (non-commercial, share-alike), which is incompatible with MIT. Learn from the
  technique and re-implement it; copy code only when the shader explicitly says MIT, CC0 or similar.
* **Sketchfab, Thingiverse, Printables, Cults3D downloads.** These sites hold every licence under the sun,
  including NC and ND (no derivatives). Never assume an item is free to bundle.
* **`nidorx/matcaps` and similar "big collections".** The repository's README says the images were gathered from
  various websites and the original authors could not be tracked, so there is no reliable licence. Use a CC0 pack
  instead.
* Anything with a **brand, character or logo** in it (game characters, car makes, sports logos), whatever the
  uploader's licence says. Trademark and likeness rights are separate from copyright.

## House rules for adding any outside asset

1. Prefer CC0. CC-BY is fine only if the credit is shown in the About dialog and README.
2. Never add NC (non-commercial), ND (no-derivatives) or SA/GPL items as bundled files.
3. Record source URL, author, licence and download date in `public/CREDITS.md` (create it with the first asset).
4. Keep files small (Pages budget, see `scripts/check-dist.mjs`). For example, use a 256–512 px pre-filtered
   HDRI, not a 4K original.
5. Gallery examples and templates stay **built from SDF nodes by us**, so they carry the project's own licence.

## Sources

* Poly Haven licence: <https://polyhaven.com/license>
* ambientCG licence: <https://docs.ambientcg.com/license/>
* Kenney support/licence: <https://kenney.nl/support>
* Quaternius licence: <https://quaternius.com/license.html>
* NASA media guidelines: <https://www.nasa.gov/nasa-brand-center/images-and-media/>
* SIL Open Font License: <https://openfontlicense.org/>
* Smithsonian 3D: <https://3d.si.edu/explore>; Open Access announcement coverage:
  <https://www.cgchannel.com/?p=112831>
* Shadertoy default licence (community reports): <https://godotshaders.com/shader/notebook-drawings/>,
  <https://creativecommons.org/licenses/by-nc-sa/3.0/deed.en>
* nidorx/matcaps README: <https://github.com/nidorx/matcaps>
