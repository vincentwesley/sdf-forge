# Decisions

Each entry: what was chosen, what was rejected, and why. Newest decisions are appended at the end.

## Product scope (brainstorm results)

Ideas considered, with verdicts. "Build" items are in scope; "Later" are recorded for future sessions.

| Idea | Verdict | Reason |
| --- | --- | --- |
| Toolbar "Add shape" that auto-wires into the scene | **Build** | The fastest route for first-time visitors; the graph updates and teaches by example. |
| Click-to-select in viewport + drag gizmo to move shapes ("sculpt by dragging") | **Build** | Direct manipulation is what non-experts expect from a 3D tool. |
| Printable templates with named Controls (customizer) | **Build** | Most common real use for parametric printing (vases, planters, tags, rings). Also lets experts publish a "product" from any graph by pinning params. |
| Print check view (thin walls, overhangs) | **Build** | Prevents failed prints; cheap with an SDF (march inward to measure thickness). |
| Export in mm with live dimensions, volume, filament estimate | **Build** | Printers think in mm; avoids the classic "my print is 1 mm tall" mistake. |
| GLB with vertex colours + per-shape colours | **Build** | Game/render users need colour; SDF colour blending is a signature look. |
| Shader code export (GLSL + Shadertoy-ready) | **Build** | Shader artists want to continue in code; trivially correct because the shader is generated. |
| PNG render (hi-res, transparent) and turntable video | **Build** | Shareable output for artists and portfolio use. |
| Explain-this-node + "view this node" | **Build** | Learning feature and debugging aid in one. |
| Short guided tour (skippable, first visit only) | **Build** | Required for "no instructions" goal; kept to ≤6 steps. |
| Surprise me (random variation of params) | **Build** | Generative-art hook and a playful entry for beginners. |
| Command palette + shortcuts sheet | **Build** | Experienced users and keyboard accessibility. |
| Noise displacement | **Build** | Organic shapes (rocks, terrain-like assets). Integer hash keeps GPU/CPU identical. |
| Lattice (gyroid etc.) infill op | **Build** | Iconic for 3D printing; bounded by its input so meshing stays finite. |
| 2D profiles + Extrude/Revolve | **Build** | Vases, coasters, tags — the backbone of printable objects. |
| Free-text "describe a shape" → graph | Rejected | Needs an AI model and keys/server (violates free & keyless) or a toy keyword matcher that would disappoint. Replaced by searchable gallery/templates. |
| SDF text (names on keychains) | Later | Needs font outlines → 2D polygon SDF per glyph on GPU and CPU; worth doing properly in a later session. |
| Spline profile editor for Revolve | Later | Big UI job; regular polygon/rounded profiles + shell + twist cover most vases. |
| Sculpt brushes (add/remove clay) | Later | Requires a voxel/brush layer outside the graph model. |
| Image-based materials / triplanar textures | Later | GLB textures and UVs from SDF meshes need unwrapping; vertex colours chosen instead. |
| Node groups / sub-graphs | Later | Valuable for experts; v1 ships Controls pinning instead. |
| User accounts / cloud gallery | Rejected | Needs a server; links + local library cover sharing for free. |
| WebGPU backend | Later (optional) | WebGL2 is required for testing; the IR makes WGSL a contained addition. |
| 3MF export | Later | STL is universal; 3MF mainly adds colour for multi-material printers. |

## Technical decisions

1. **Single expression IR with GLSL and JS back ends** (vs hand-writing every node twice). Guarantees the
   preview and the exported mesh are the same shape; tests check both back ends anyway.
2. **Parameters as uniforms** (vs inlined constants). Slider drags never recompile; only topology changes do.
   Inline constants are used as a fallback if a graph exceeds the uniform budget.
3. **Manifold `levelSet` for meshing** (vs own marching cubes / surface nets / dual contouring).
   Guaranteed manifold output, small wasm (543 kB), Apache-2.0, plus volume and genus for free. Dual
   contouring would keep sharp edges but is not manifold-safe. Verified speed in RESEARCH.md §4.
4. **React + @xyflow/react + Zustand** (vs a home-grown canvas graph). React Flow handles touch, zoom, panning,
   connection logic and keyboard focus; building that from scratch would cost weeks for a worse result.
5. **Vite + TypeScript, relative base `./`** so the build works at any subpath (GitHub Pages `/sdf-forge/`).
6. **Hash-based links** (`#g=`) so sharing needs no server and works on GitHub Pages.
7. **Y-up scene; STL written Z-up in mm, GLB Y-up in metres**, matching each format's convention.
8. **Units**: scene values are "units"; a document setting maps 1 unit → N mm (default 10 mm). Length fields
   show mm. Export can rescale to a target size.
9. **Smooth blend parameter `k` = maximum deviation** (IQ's normalised quadratic smin), so bounds grow by
   exactly `k` and users can reason about it as a distance.
10. **Bundled Inter font** (OFL) so the UI looks the same on every OS and in screenshots.
11. **Playwright pinned to the version matching the preinstalled Chromium** locally; CI installs its own.
