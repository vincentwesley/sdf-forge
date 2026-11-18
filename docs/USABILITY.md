# Usability walkthroughs

Three walkthroughs of the whole site, each done as a specific person would use it, in headless Chromium at
desktop (1366×820) and phone (390×844) sizes, with screenshots reviewed after every step. Every point of
confusion or friction is listed with what was done about it.

Status key: **Fixed** (changed and re-checked) · **Accepted** (deliberate, with reason) · **Later** (recorded in
DECISIONS.md).

## 1. First-time visitor ("Sam", has never heard of SDFs, on a laptop and later a phone)

Goal: make a shape they like in a few minutes without reading anything.

| # | What happened | Friction | Outcome |
| --- | --- | --- | --- |
| 1.1 | Landed on a colourful blended shape with a welcome card. | Blank canvases are intimidating; a ready shape invites poking. | Already designed this way; welcome card offers a 1-minute tour, never blocks. |
| 1.2 | Took the tour (6 steps). | Step 3 pointed at the inspector, which is hidden on phones. | **Fixed**: the tour switches the phone's lower panel to the matching tab before highlighting it. |
| 1.3 | Clicked the sphere icon in the Add toolbar. | Icons alone; on touch there are no tooltips. | **Accepted**: icons are standard shapes with accessible names; the tour names the toolbar, and new shapes are labelled in the inspector immediately. |
| 1.4 | New sphere appeared on the right of the shape, selected, with arrows. | — | Works: shapes are placed overlapping the existing model so you see them join. |
| 1.5 | Dragged the green arrow up; the sphere moved and melted into the shape. | Earlier build: the view stayed blurry after dragging. | **Fixed**: renderer kept low resolution after interactions on slow GPUs; it now refines to full quality once you stop. |
| 1.6 | Wanted the new sphere to "melt more". | Smoothness lives on the Union node, which a beginner never selects. | **Fixed**: every shape that feeds a Union/Subtract/Intersect now shows a "Blend with the other shapes" slider in its own properties. |
| 1.7 | Changed colour from the swatches. | — | Works. |
| 1.8 | Selected a shape, then wanted the overall settings back. | No obvious way back from a node to the shape overview / Controls. | **Fixed**: "← Shape overview and Controls" link at the top of node properties; Esc also deselects. |
| 1.9 | Deleted the Union by accident: the view went empty with "Nothing to show yet — add a shape". | The message was wrong: nodes still existed, they just weren't connected. | **Fixed**: the empty state now explains that only what's wired into Output is drawn; Undo restores. |
| 1.10 | Selected highlight looked muddy (orange mixed into teal made brown). | Confusing colour shift. | **Fixed**: selection is now a soft accent glow plus rim light that keeps the shape's own colour. |
| 1.11 | On the phone: the two toolbars overlapped. | Controls unreachable. | **Fixed**: view toolbar moves to a second row on narrow screens. |
| 1.12 | Opened the gallery on the phone. | One giant card per screen. | **Fixed**: two-column gallery on phones. |

## 2. Someone who wants a printable part ("Priya", owns an FDM printer, wants a 120 mm planter with 2 mm walls)

| # | What happened | Friction | Outcome |
| --- | --- | --- | --- |
| 2.1 | Gallery → Printable → Planter. | — | Thumbnails show what each template makes. |
| 2.2 | With nothing selected, the Controls panel showed Radius, Height, Wall and Drain hole in millimetres. | — | Works: templates pin their important settings. |
| 2.3 | Increased the height in Controls. | Earlier build: the open top was a separate Cut at a fixed height, so a taller pot got a lid back (and the cut left a paper-thin film at the rim). | **Fixed**: Shell has an "Open top/bottom" option that follows the shape's size; Cut can be measured from the top or bottom of its input. |
| 2.4 | Opened Export; set "Longest side" to 120 mm. | — | Dimensions update live; the whole document's mm display rescales consistently. |
| 2.5 | Wondered whether walls were thick enough. | Print check existed but was buried in the View menu. | **Fixed**: the STL tab suggests "Show print check" with a one-click button; the legend lets you change the thin-wall threshold. |
| 2.6 | Exported STL. | Wanted to know it's printable. | Works: result card says "Watertight and manifold — ready to print", with size, volume, grams of PLA, triangle count. |
| 2.7 | Opened the STL in a slicer (validated with trimesh and the same checks a slicer runs). | Earlier build: a few shapes had vertices at identical positions on pinch points, which slicers weld into non-manifold edges. | **Fixed**: the mesher nudges coincident vertices apart; CI now checks every gallery mesh with position-welding. |
| 2.8 | On the phone the export form was cramped (labels squeezed, "Ultra" cut off). | | **Fixed**: one-column form on narrow screens. |
| 2.9 | Wanted text on a keychain. | Not supported. | **Later** (DECISIONS.md): needs font outlines → 2D SDFs. The keychain template uses a raised star instead. |

## 3. Experienced shader artist ("Kai", writes raymarchers on Shadertoy)

| # | What happened | Friction | Outcome |
| --- | --- | --- | --- |
| 3.1 | Ignored the toolbar, right-clicked the graph and searched "twist". | — | Works: searchable menu; dragging a wire into empty space opens it filtered to compatible nodes. |
| 3.2 | Typed `40/3` into a field. | — | Works: fields accept arithmetic; arrow keys step, Shift ×10. |
| 3.3 | Wanted to copy a sub-graph between two tabs. | No copy/paste, only duplicate. | **Fixed**: Ctrl/⌘+C and Ctrl/⌘+V copy nodes (and the wires between them) via the system clipboard. |
| 3.4 | Exported Shadertoy code and pasted it. | Must actually compile. | **Verified**: a test compiles the exported shader of every gallery example under a Shadertoy-style wrapper and checks it renders. |
| 3.5 | Toggled the eye on a node to debug a sub-tree. | — | Works ("Viewing only …" pill with Show all). |
| 3.6 | Checked the Cost view while adding Displace with 6 octaves. | — | Works; the step bound adapts so the noise never tears. |
| 3.7 | Wanted the glossy material to read as glossy. | Glossy and clay looked almost the same. | **Fixed**: glossy gets a clear-coat style highlight. |
| 3.8 | Wanted animation over time (`iTime`). | Not supported in the editor. | **Later**: the exported Shadertoy shader already orbits with time; parameter animation is recorded in DECISIONS.md. |
| 3.9 | Wanted node groups / reusable sub-graphs. | Not supported. | **Later**: Controls pinning covers the "expose a few knobs" case for now. |

## Re-check

After the fixes, all three walkthroughs were repeated end to end; the flows are covered by the Playwright suite
(`tests/e2e`), so they stay fixed.
