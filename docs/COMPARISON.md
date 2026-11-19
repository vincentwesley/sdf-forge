# How SDF Forge compares with other 3D tools

Researched 2026-11-19 from public product pages, documentation and release notes (sources at the end). The point
is not to clone any tool. It is to find what people already expect from 3D software that SDF Forge can offer in its
own way: free, in the browser, private, and printable by default.

## The tools

| Tool | What it is | Price | Where it runs |
| --- | --- | --- | --- |
| **Womp** | "Goop" modelling: SDF/CSG shapes that blend like clay, with materials and rendering | Free tier; Pro subscription | Browser |
| **MagicaCSG** | SDF/CSG modeller from the MagicaVoxel author, with a path tracer | Free demo; full version via Patreon | Windows |
| **Tinkercad** | Beginner CAD for 3D printing and schools: shapes, holes, workplane, ruler, align | Free (account) | Browser |
| **Spline** | Web 3D design for interactive scenes, materials and embeds | Free tier; paid export (USDZ is Pro) | Browser |
| **Fusion 360 / Shapr3D** | Professional parametric CAD | Subscriptions | Desktop / iPad |
| **Substance 3D Modeler** | SDF clay sculpting in VR or on desktop | Subscription | Windows / Quest |
| **Blender** | Everything 3D | Free, open source | Desktop |

## Feature matrix

✅ has it · 🟡 partly · — doesn't · **bold** = added to SDF Forge in this round

| Feature | Womp | MagicaCSG | Tinkercad | Spline | Fusion / Shapr3D | **SDF Forge** |
| --- | --- | --- | --- | --- | --- | --- |
| Smooth (clay) blends | ✅ | ✅ | — | — | 🟡 fillets | ✅ |
| Chamfer / bevel joins | 🟡 | ✅ | — | 🟡 | ✅ | **✅ Chamfered edge on Union/Subtract/Intersect** |
| Section (cut-away) view | — | — | — | — | ✅ | **✅ X/Y/Z, position, flip; hatched caps** |
| Standard views + orthographic | 🟡 | ✅ | ✅ | ✅ | ✅ | **✅ Camera menu** |
| Move gizmo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rotate / scale gizmo | ✅ | ✅ | ✅ | ✅ | ✅ | **✅ W / E / R modes; rings and scale handles** |
| Measure / ruler | — | — | ✅ | — | ✅ | **✅ Measure tool (M): distance and X/Y/Z parts in mm** |
| SVG import → 3D | ✅ | — | ✅ | ✅ | ✅ | **✅ SVG shape node: file, paste or drag-and-drop** |
| Text | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Draw a custom outline / lathe | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ Profile node |
| Repeat, mirror, twist, bend | 🟡 | ✅ | 🟡 | 🟡 | ✅ | ✅ |
| Hollow (shell) + lattice infill | 🟡 | — | — | — | ✅ | ✅ |
| Print-readiness check | — | — | — | — | 🟡 | ✅ Print check (thin walls, overhangs) |
| Watertight export, validated | 🟡 | 🟡 | ✅ | 🟡 | ✅ | ✅ (trimesh + lib3mf in CI) |
| STL / OBJ / GLB / 3MF | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ |
| USDZ (iPhone AR) | ✅ | — | — | ✅ (paid) | 🟡 | **✅ USDZ export, ARKit-checked in CI** |
| Per-shape materials | ✅ | 🟡 | — | ✅ | ✅ | 🟡 colour per shape, one material style |
| Path-traced render | ✅ | ✅ | — | — | ✅ | 🟡 soft shadows, AO, studio reflections |
| Turntable video / animation | 🟡 | — | — | ✅ | 🟡 | ✅ |
| Parametric templates (Controls) | 🟡 | — | — | 🟡 | ✅ | ✅ |
| Share as a link, no account | 🟡 | — | 🟡 | ✅ | — | ✅ |
| Works offline / nothing uploaded | — | ✅ | — | — | 🟡 | ✅ |
| Free, open source | — | — | — | — | — | ✅ |
| Mesh import (STL → SDF) | ✅ | ✅ | ✅ | ✅ | ✅ | Not planned (see below) |
| Freehand sculpting | ✅ | — | — | — | — | Not planned (see below) |

## What we added in this round, and why

* **Chamfered joins.** Mechanical parts need flat bevels, not just clay-like fillets: countersunk screw holes,
  chamfered box edges, printable 45° transitions that need no support. MagicaCSG and every CAD tool have them. In
  SDF Forge it's an *Edge: Rounded / Chamfered* choice on Union, Subtract and Intersect, using the hg_sdf formulas.
  The *Shelf bracket* example now has countersunk holes.
* **Section view.** Fusion 360 and Shapr3D let you cut a model open to see inside. For 3D printing that's how you
  check wall thickness, hidden cavities and drainage. In SDF Forge the cut is exact (it's one more `max()` in the
  distance function), with hatched caps like a technical drawing. It only affects the view: exports keep the whole
  shape.
* **Standard views and orthographic projection.** Front, back, left, right, top, bottom and a ¾ view, plus a
  no-perspective mode for lining things up and taking drawing-like screenshots. Every CAD tool has these.

* **Rotate and scale gizmo modes** (W / E / R, as in Unity, Unreal and Maya). Rings turn a part about a world axis,
  even inside nested transforms; Ctrl snaps to 15°. Square handles scale it. Arrow keys work on every handle.
* **Measure tool** (M): click two points on the surface and read the distance in mm, with its X/Y/Z parts, like
  Tinkercad's ruler or Fusion's Measure. Clicks go through a section cut, so inner walls can be measured too.

* **SVG import** (Tinkercad, Womp): an *SVG shape* node turns the filled shapes of an SVG file into a flat profile
  for badges, signs, stamps and engraving. It handles paths (arcs included), basic shapes, group transforms,
  even-odd holes, and skips strokes, hidden elements and definitions. Import by file, paste or drag-and-drop onto
  the 3D view. The outline is stored compactly, so share links stay small. New example: *Heart badge*.

* **USDZ export** (Spline, where it's a paid feature; Womp): open the file on an iPhone or iPad to place the model in
  your room at real size with AR Quick Look. Millimetres, Y up, one UsdPreviewSurface per shape colour. CI opens every
  file with Pixar's USD library and runs Apple's ARKit compliance rules.

## Planned next, most valuable first

1. **Per-shape material** (metal handle on a clay mug), like Womp.

## Deliberately not planned

* **Mesh import (STL → SDF)** needs a large voxelisation pipeline, and a converted mesh loses what makes SDF Forge
  useful: editable, blendable parameters.
* **Freehand sculpting** is a different product (Womp, Substance Modeler, Nomad). SDF Forge stays procedural, so
  share links, templates and Controls keep working.
* **Path tracing** would make the viewport too slow on integrated graphics, one of the brief's hard requirements.
  The studio reflections give most of the visual benefit cheaply.

## Sources

* Womp: [womp.com](https://womp.com) · [designers page](https://womp.com/solutions/designers/) ·
  [CG Channel on the beta](https://www.cgchannel.com/2024/05/free-browser-based-3d-modeling-app-womp-is-now-in-beta) ·
  [materials blog](https://www.womp.com/blogs/500-photorealistic-3d-materials-instantly-apply-professional-textures-to-your-models)
* MagicaCSG: [ephtracy.github.io/magicacsg](https://ephtracy.github.io/magicacsg.html) ·
  [GameFromScratch](https://gamefromscratch.com/magicacsg-released-by-maker-of-magicavoxel/)
* Tinkercad: [align tool](https://curriculum.spolearninglab.com/software/3d_modeling/tinkercad/tinkercad_align.html) ·
  [importing and advanced features](https://eolasprints.com/blogs/tinkercad-complete-guide-series/adding-text-importing-models-advanced-features) ·
  [ruler and workplane](https://packtpub.com/en-fr/product/taking-tinkercad-to-the-next-level-9781835468005/chapter/chapter-6-using-the-ruler-and-workplane-tool-to-dimension-our-designs-8/section/using-the-workplane-tool-ch08lvl1sec41)
* Spline: [USDZ export docs](https://docs.spline.design/exporting-your-scene/files/exporting-as-usdz)
* Fusion 360: [Section Analysis](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-SECTION-ANALYSIS.htm) ·
  [analysis tools](https://help.autodesk.com/cloudhelp/ENU/Fusion-Model/files/SLD-INSPECT-TOOLS.htm) ·
  Shapr3D: [vs Fusion 360](https://www.shapr3d.com/content-library/shapr3d-vs-fusion-360)
* Substance 3D Modeler: [product page](https://www.adobe.com/products/substance3d-modeler.html) ·
  [CG Channel 1.18](https://www.cgchannel.com/2025/01/adobe-releases-substance-3d-modeler-1-18)
* Chamfer formulas: Mercury [hg_sdf](https://mercury.sexy/hg_sdf/) (MIT)
