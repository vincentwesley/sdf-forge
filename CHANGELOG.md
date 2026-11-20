# Changelog

All notable changes to SDF Forge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Per-shape materials**: every shape has a *Material*: Same as scene, Clay, Glossy, Metal or Glow. Materials blend across smooth unions exactly like colours, the scene's default (now called *Default material*) applies to shapes left on “Same as scene”, and changing a material never recompiles the shader. GLB files get one PBR material per part (with emission for glowing parts), USDZ one UsdPreviewSurface per part (with `emissiveColor`), 3MF one named filament per colour and material, and the Shadertoy export shades them too. New *Desk lamp* example; the donut's icing is now glossy.
- **USDZ export** for AR Quick Look on iPhone and iPad: open the file to place your model in the room at real size. Millimetres, one material per shape colour, credited. CI validates every file with Pixar's USD library and Apple's ARKit compliance rules (`scripts/validate_usdz.py`).
- **SVG shape node**: import a logo or drawing from an SVG file (Import button, paste the code, or drop the file on the 3D view). It supports paths with arcs, rect, circle, ellipse, polygon, transforms on groups, and even-odd holes; strokes and hidden elements are skipped. Use it for badges, signs, stamps and engravings. New *Heart badge* example.
- **Rotate and scale gizmo modes** (W / E / R, or the Move / Rotate / Scale buttons): drag a ring to turn the selected part about a world axis (Ctrl snaps to 15°), or drag a square to scale it. All handles work with the arrow keys.
- **Measure tool** (M): click two points on the shape to read the distance in millimetres, with its X, Y and Z parts. It works through section cuts.
- **Chamfered joins**: Union, Subtract and Intersect have an *Edge* choice, Rounded or Chamfered (a flat 45° bevel, Mercury hg_sdf formulas). The Shelf bracket's screw holes are now countersunk.
- **Section view**: cut the shape open along X, Y or Z with a position slider and Flip. The cut faces are hatched like a technical drawing, picking goes through the removed half, and exports are unaffected.
- **Camera menu**: front, back, left, right, top, bottom and ¾ views, plus orthographic (no-perspective) projection.
- `docs/COMPARISON.md`: a feature comparison with Womp, MagicaCSG, Tinkercad, Spline, Fusion 360/Shapr3D and Substance Modeler, and the roadmap it led to.
- **Illustrated user guide (PDF, 13 pages)**: why use SDF Forge, a tour of the screen, a first shape step by step, going further, printing and other exports, templates, sharing and animation, nine real-life use cases, and tips. It's built from real screenshots by `npm run guide` and linked from Help → *User guide*, the welcome card, About and the README.
- **Animated Controls**: click *Animate* on a pinned setting to swing it between two values (From, To, seconds per cycle, eased). The 3D view gets a Play button, and turntable videos can record the animation, with or without orbiting. Animations are stored in share links. The document and undo history are never touched while playing. *Sphere to cube* now animates.
- The saved light/dark theme is applied before the first paint (no dark flash on load).
- **Profile node**: draw your own 2D outline. Drag points, add them with the + on an edge, switch each point between a sharp corner and a smooth curve, and use the keyboard for all of it. Spin it with Revolve (vases, bottles, chess pieces) or extrude it (brackets). New gallery examples: *Chess pawn* and *Shelf bracket*.
- **Studio reflections** on the Glossy and Metal materials, from the CC0 “Studio Small 09” HDRI (Poly Haven), pre-filtered per roughness into a 44 KB mip chain (`scripts/make_env.py`). It turns with the key light and falls back to the old gradient if it can't load.
- **3MF export** for modern slicers: millimetres, a colour palette taken from the shapes (one entry per filament colour), credit metadata and a preview thumbnail, compressed to about a fifth of the STL size. Validated in CI with trimesh and the 3MF Consortium's lib3mf (strict mode).
- Text node (2D profile) built from real glyph outlines; *Add → Text* from the toolbar; the keychain template now carries a name.
- Shell *Opening* option and Cut *measured from* top/bottom, so printable templates stay correct when resized.
- Copy/paste of nodes, a *Blend with the other shapes* control on every shape, print-check hint in the export dialog.
- `docs/RESOURCES.md`: vetted list of free 3D resources (CC0 first) and licence rules for outside assets.

### Changed
- Settings with more than four choices (like Material) are a dropdown instead of a row of buttons, and Ctrl+Z / Ctrl+Y work while the dropdown has focus.

### Fixed
- On phones, the Properties tab no longer makes the page 16 px wider than the screen.

### Changed
- The bottom-left of the 3D view stacks status messages above the new Tools bar, so neither covers the other.
- A drag (slider scrub, gizmo, node move, outline point) is now always one undo step, however slowly it happens; before, pausing for over 1.2 s split it.
- Keys handled by a widget (like Delete on an outline point) no longer also trigger the app's shortcuts.
- CI and deploy workflows use the current major versions of the official GitHub actions (Node 24 runtime).
- The gallery dialog now loads as its own chunk (the open-example helper moved to `src/gallery/open.ts`).

## [1.0.0] - 2026-11-18

### Added
- Node graph editor (React Flow) with 34 node types: 10 primitives, 5 2D profiles (including Text), union / subtract / intersect / morph
  with smooth blending, transform, twist, bend, repeat, radial repeat, mirror, elongate, shell (with open top/bottom),
  inflate, displace (noise and waves), lattice (gyroid, Schwarz P, diamond), cut, extrude and revolve.
- Graph compiler: one typed expression IR generates both GLSL (WebGL2 ray marcher) and allocation-free JavaScript
  (picking, meshing, tests). Parameters are uniforms, so dragging a slider never recompiles.
- Real-time ray marcher: soft shadows, ambient occlusion, PBR-ish clay / glossy / metal materials, dynamic resolution
  while interacting and progressive anti-aliasing when idle; view modes for print checking (thin walls, overhangs),
  normals and rendering cost.
- Beginner flow: add shapes from a toolbar (Add or Carve), click to select, drag gizmo arrows to move, inspector with
  scrubbable fields in millimetres, plain-language explanations of every node, a guided tour, command palette.
- Watertight, manifold mesh export (Manifold level sets) to STL, GLB (with vertex colours) and OBJ, sized in
  millimetres with volume and filament estimates; PNG renders up to 4K with transparent background; turntable video
  (MP4/WebM via WebCodecs); Shadertoy-ready shader code.
- Share links that contain the whole graph, graph files, autosave, undo/redo.
- Gallery of 16 examples including printable templates with pinned Controls.
- Tests: unit tests for the compiler (analytic distances, exactness, bounds, Lipschitz), GPU-vs-CPU agreement, mesh
  validation with trimesh and the Khronos glTF validator, Playwright flows, accessibility (axe), screenshots and a
  software-rendering frame-rate check. CI and GitHub Pages deployment.
