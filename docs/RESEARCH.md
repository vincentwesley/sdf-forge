# Research notes

Research done before building SDF Forge (November 2026). Links are the sources I read or used.
Where I could not run a tool myself (desktop-only, paid, or Windows-only), I say so and rely on
documentation, changelogs and community threads.

## 1. SDF modelling references

| Source | What I took from it |
| --- | --- |
| Inigo Quilez, [3D distance functions](https://iquilezles.org/articles/distfunctions/) | Exact/bound formulas for sphere, box, round box, torus, capped cylinder, capsule, capped cone, octahedron, hex prism, ellipsoid (bound), link; domain ops: elongate, round, onion (shell), twist, cheap bend, limited repetition, extrusion and revolution of 2D shapes. These are the reference formulas used by the node library. |
| Inigo Quilez, [2D distance functions](https://iquilezles.org/articles/distfunctions2d/) | Circle, box, rounded box, regular polygon (n-gon), star, arc/ring. Used for the 2D profile nodes feeding Extrude and Revolve. |
| Inigo Quilez, [smooth minimum](https://iquilezles.org/articles/smin/) | Quadratic polynomial `smin` normalised so `k` equals the maximum deviation (`k *= 4`), and the variant that also returns a blend factor so colours/materials blend with the shape. The max deviation (`k`) is also what the bounds code uses to expand boxes. |
| Inigo Quilez, [soft shadows](https://iquilezles.org/articles/rmshadows/) | The "improved" penumbra estimator (uses the previous step to triangulate the closest approach) for soft shadows that do not band. |
| Inigo Quilez, [normals for an SDF](https://iquilezles.org/articles/normalsSDF/) | Tetrahedron technique: 4 evaluations instead of 6 for central differences. |
| Inigo Quilez, [domain repetition](https://iquilezles.org/articles/sdfrepetition/) | Limited repetition with `clamp(round(p/s), -n, n)`; warning that single-cell evaluation is only correct when the shape stays inside its cell (documented as a limitation in the node's help text). |
| Inigo Quilez, [interior distances](https://iquilezles.org/articles/interiordistance/) | Boolean ops give a *bound*, not an exact distance, inside the shape. Tests therefore check exactness only where theory says it holds, and check "bound" (never over-estimates) elsewhere. |
| Inigo Quilez site terms ([iquilezles.org](https://iquilezles.org/)) | Code that implements an algorithm on his site/Shadertoy is MIT licensed. SDF Forge re-implements the formulas (in its own IR) and credits him in the README, the in-app "About" dialog, node help text and the generated shader header. |
| Mercury, [hg_sdf](https://mercury.sexy/hg_sdf/) | Dual-licensed MIT OR CC-BY-NC-4.0. Ideas: polar repetition (`pModPolar`), mirror folds, chamfer/stairs/columns booleans. I implement polar repetition and chamfer blends myself from the published math; credited. |
| Hart, *Sphere Tracing* (1996), [PDF](https://graphics.stanford.edu/courses/cs348b-20-spring-content/uploads/hart.pdf) | Lipschitz bound argument: a field with Lipschitz constant L must be marched with step `d / L`. SDF Forge propagates an estimated L through the graph (twist, bend, displacement increase it) and scales the step. |
| Matt Keeter, [MPR: massively parallel rendering of implicit surfaces](https://www.mattkeeter.com/research/mpr/) and [libfive](https://libfive.com/) | Interval arithmetic for bounds and pruning. I use a much simpler conservative AABB propagation per node (good enough for ray-march start/end, picking and the export grid). |
| fogleman, [sdf](https://github.com/fogleman/sdf) (MIT, Python) | Good model for the node vocabulary (2D→3D extrude/revolve, shell, elongate, twist, bend, circular array) and the "develop at low resolution, export at high" workflow. Its marching cubes + sparse batches can leave holes with inexact SDFs, a pitfall I avoid by meshing the whole bounded grid with a manifold-guaranteeing method. |
| Szymon Kaliski, [SDF-UI](https://github.com/szymonkaliski/SDF-UI) | Proof that a node graph compiled by walking back from the output node works well; no export, no CPU evaluation, experimental. |
| Isoline (Gaurav Tejpal), [write-up](https://dev.to/gaurav_tejpal_5e0d2f50499/i-built-a-browser-based-sdf-geometry-studio-that-compiles-node-graphs-to-glsl-at-runtime-1bij) | Same idea, recent. Lessons: emit shared helpers once (duplicate function bodies break compilation); aggressive warps need smaller steps; missing materials, reusable sub-graphs and better camera. It implements each node once and evaluates on CPU and GPU — I go further with a single IR that generates both. |

## 2. Existing SDF and node-based tools

I could run the browser-based ones; desktop tools I assessed from docs, changelogs and long user threads
(e.g. Blender Artists' [big SDF modelling thread](https://blenderartists.org/t/the-big-sdf-modeling-thread/1293075)).

| Tool | Does well | Does badly / leaves out |
| --- | --- | --- |
| [MagicaCSG](https://ephtracy.github.io/index.html?page=magicacsg) (desktop, Windows) | Fast live primitives, path-traced renders, huge op set, colour per shape. Widely called the best standalone SDF editor. | Windows only, full version paid; mesh export is plain marching cubes ("basic"); no graph, so reuse and parametric edits are limited. |
| [SDF Modeler](https://sascha-rode.itch.io/sdf-modeler) (desktop, free) | Clean, Blender-like navigation, sculpt layers. | Desktop install; layer stack rather than graph. |
| [Womp](https://womp.com/) (browser) | Beginner-friendly "goop" blending, renders, STL/OBJ/GLB export. Users praise real-time feedback. | Account needed; exports need checking for manifoldness for print ([guide note](https://www.hackdesign.org/toolkit/womp/)); dense meshes; no node graph or exposed parameters; users ask for a shared SDF format. |
| [Uniform 1.4](https://digitalproduction.com/2025/05/07/sdf-uvs-stls-uniform-1-4-goes-all-in/) | SDF as a first-class representation, STL out. | Commercial, not a learning tool. |
| [Clavicula](https://blenderartists.org/t/clavicula-3d-editor/1446812) | Many SDF ops, VR. | Rarely updated. |
| [libfive Studio](https://libfive.com/) / [Curv](https://github.com/curv3d/curv) | Code-first, exact CAD-style meshing (libfive's dual contouring keeps sharp edges). | Code only — not approachable for non-programmers. Curv users hit [seams in unions on export](https://git.histb.com/curv3d/curv/issues/145) with one mesher; libfive needs interval arithmetic for every op. |
| [Shadertoy](https://www.shadertoy.com/) | Where shader artists live; instant feedback, shareable links. | Code only; no export to meshes. → SDF Forge exports a self-contained Shadertoy-compatible shader so artists can continue there. |
| Blender Geometry Nodes / Houdini SOPs / Unreal material editor | Mature graph UX: link-drag-to-search, replace link on occupied input, drop node onto a wire to insert it, display flag to view any node (Houdini), node groups. | Complaints collected from [Blender devtalk](https://devtalk.blender.org/t/proposal-addressing-geometry-nodes-ux-issues/23239?page=2), [vvvv forum](https://forum.vvvv.org/t/dragging-links-out-of-pins/21874): socket menus hard to discover, search pop-ups on disconnect, small drag hit-areas, intimidating blank canvas. |
| [cables.gl](https://cables.gl/) | Excellent live feedback in the browser; op docs inline. | Dense UI aimed at experts. |
| Thingiverse [Customizer](https://www.thingiverse.com/apps/customizer/) / MakerWorld parametric models | Non-modellers change a few named sliders (height, text, diameter) and download a print. Keychains, vases and planters are among the most common parametric prints ([examples](https://makerworld.com/en/models/2902742-customizable-planter-parametric-custom-pot), [Dr Lex](https://dr-lex.be/3d-printing/models.html)). | Slow server-side OpenSCAD renders; the model itself can't be changed beyond the sliders. |

**Takeaways for SDF Forge**

1. Never start on a blank canvas: open on a good-looking shape, with a gallery one click away.
2. Let beginners add shapes from a toolbar and move them by dragging in the viewport; the graph updates itself and teaches the structure by example. Experts use the graph directly.
3. Steal the good graph conventions: drag a wire into empty space → searchable menu of *compatible* nodes; dropping on an occupied input replaces the wire; drop a node onto a wire to insert it; a "view this node" flag.
4. Expose named parameters ("Controls") like a customizer so printable templates are a 30-second job.
5. Guarantee manifold output and say so in the UI — it is the most common complaint about SDF exports.
6. Give shader artists the code.

## 3. Ray-marching and rendering techniques

* Sphere tracing with relaxed step and Lipschitz scaling ([Hart 1996](https://graphics.stanford.edu/courses/cs348b-20-spring-content/uploads/hart.pdf)); clip rays to the scene's AABB so empty space costs nothing.
* Soft shadows: IQ's improved penumbra estimator ([article](https://iquilezles.org/articles/rmshadows/)).
* Ambient occlusion: 5-tap normal-direction AO (IQ, used throughout Shadertoy).
* Lighting: key + sky + bounce + rim, filmic tone map, sRGB output. Ground plane receives shadows so shapes feel grounded.
* Performance on integrated GPUs: render only when something changes; dynamic resolution while interacting; progressive jittered accumulation for anti-aliasing when idle. All numeric parameters are **uniforms**, so dragging a slider never recompiles the shader — only topology changes do.
* WebGL2 everywhere (works in headless Chromium with SwiftShader — verified locally: `ANGLE (SwiftShader Device (Subzero))`, WebGL 2.0, `EXT_color_buffer_float` available). WebGPU kept as an optional future path (the IR makes a WGSL backend straightforward).

## 4. Meshing techniques

| Method | Watertight / manifold? | Notes |
| --- | --- | --- |
| Marching cubes (classic tables) | Closed if the grid encloses the surface; ambiguous cases can create non-manifold vertices; zero-valued samples create degenerate triangles ([CGAL isosurfacing comparison](https://cgal.github.io/6849/v5/Isosurfacing_3/index.html)). | Rounds sharp edges. |
| Surface nets / dual contouring | Not guaranteed manifold (CGAL: DC "guarantees neither a 2-manifold nor a watertight mesh"). | DC keeps sharp features; [Manifold DC](https://people.engr.tamu.edu/schaefer/research/dualsimp_tvcg.pdf) fixes topology at much higher complexity. |
| Marching tetrahedra on a body-centred cubic grid — **[Manifold](https://github.com/elalish/manifold) `levelSet`** (Apache-2.0) | Guaranteed manifold and watertight by construction; reports `status`, volume and genus. | Verified locally (Node 22, manifold-3d 3.5.5): smooth-union sphere+box at 0.05 edge → 33k triangles in 0.26 s, status `NoError`, genus 0, volume converges (5.3570 → 5.3587). 0.025 → 132k tris in 2.2 s. The wasm is 543 kB — fine for GitHub Pages. |

Decision: mesh with Manifold's `levelSet` in a Web Worker, feeding it the CPU version of the compiled graph (straight-line JS with no allocations, generated from the same IR as the shader). Root-finding tolerance is set to a fraction of the edge length so vertices sit on the true surface.

## 5. Validation tools (for CI)

* [trimesh](https://trimesh.org/) (MIT, Python): `is_watertight`, `is_winding_consistent`, `is_volume`, volume, bounds, loads STL and GLB.
* [Khronos glTF-Validator](https://github.khronos.org/glTF-Validator/) (Apache-2.0, npm `gltf-validator`): spec validation of every exported GLB.
* Manifold itself (status check) as a second opinion.

## 6. What users need (by audience)

**3D printing** ([Hubs: common STL errors](https://www.hubs.com/knowledge-base/fixing-most-common-stl-file-errors/), [TU Delft guide](https://digipedia.tudelft.nl/?p=12840), [Craftcloud mistakes](https://blog.craftcloud3d.com/?p=91)):
watertight/manifold meshes; real-world size in millimetres; walls thicker than ~0.8–2 mm (FDM nozzle is usually 0.4 mm); overhangs under ~45° or supports; a flat base on the bed; Z-up STL; sensible triangle counts. Popular parametric prints: keychains/tags, vases (vase mode), planters with drainage, pen holders, rings, bowls, coasters.
→ Export dialog in mm with live dimensions, volume and triangle count; a **Print check** view that colours thin walls and steep overhangs; Cut/flat-base node; printable templates with named controls.

**Game assets / renders:** glTF binary with normals and vertex colours, controllable density, Y-up metres, materials per shape; PNG renders with transparent background; turntable video.

**Generative and shader art:** randomise/"surprise me", noise displacement, repetition and twist, colour per shape, high-resolution renders, export of the shader code (GLSL / Shadertoy).

**Learners:** explanation of each node in plain words, a way to view any node's output alone, a short tour, examples that show one idea each.

## 7. Creative-tool web design references

* [Spline](https://spline.design/) and Figma: calm neutral chrome so the canvas is the hero; right-hand properties panel; scrubbable numeric fields (drag the label).
* [Shadertoy](https://www.shadertoy.com/) / [cables.gl](https://cables.gl/): instant compile feedback with inline error messages.
* Houdini: parameter pane separate from the network; display flag.
* Linear / Raycast: a fast command palette (`/` or `Ctrl+K`) that also works as the keyboard route to every action.
* React Flow ([xyflow](https://reactflow.dev/), MIT): mature pan/zoom/connect with touch support, keyboard-focusable nodes, custom node rendering; used for the graph instead of a home-grown canvas.

## 8. Licences of things reused

See the README "Credits" section. Summary: React (MIT), @xyflow/react (MIT), Zustand (MIT), manifold-3d (Apache-2.0), lucide icons (ISC), Inter font (SIL OFL 1.1), Inigo Quilez formulas (MIT, credited), hg_sdf ideas (MIT option, credited). opentype.js (MIT) + Inter ExtraBold WOFF (OFL) for Text. Test-only: Playwright (Apache-2.0), axe-core (MPL-2.0, test-only, not shipped), trimesh (MIT), glTF-Validator (Apache-2.0).
