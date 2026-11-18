# Changelog

All notable changes to SDF Forge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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
