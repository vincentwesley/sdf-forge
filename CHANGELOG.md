# Changelog

All notable changes to SDF Forge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Text node (2D profile) built from real glyph outlines; *Add → Text* from the toolbar; the keychain template now carries a name.
- Shell *Opening* option and Cut *measured from* top/bottom, so printable templates stay correct when resized.
- Copy/paste of nodes, a *Blend with the other shapes* control on every shape, print-check hint in the export dialog.

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
