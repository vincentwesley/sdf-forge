/**
 * Build the illustrated user guide (public/guide/sdf-forge-guide.pdf) from the
 * built site: real screenshots of the app, laid out as an A4 document and
 * printed to PDF by Chromium.
 *
 * Usage: npm run build && npm run guide
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { captureAll, type Shot } from './guide/capture';

const PORT = '4197';
const BASE = `http://localhost:${PORT}/sdf-forge/`;
const LIVE = 'https://vincentwesley.github.io/sdf-forge/';
const OUT = 'public/guide/sdf-forge-guide.pdf';

const server = spawn('node', ['scripts/serve-dist.mjs'], { stdio: 'ignore', env: { ...process.env, PORT } });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const dataUrl = (file: string, mime: string) =>
  `data:${mime};base64,${readFileSync(file).toString('base64')}`;
const font = dataUrl(
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'font/woff2',
);
const thumb = (id: string) => dataUrl(`public/gallery/${id}.webp`, 'image/webp');
const logo = dataUrl('public/favicon.svg', 'image/svg+xml');

try {
  const s = await captureAll(browser, BASE);

  /** A screenshot, optionally with numbered callouts on named regions. */
  const fig = (shot: Shot, caption: string, marks: [string, string, number?, number?][] = [], cls = '') => {
    const pins = marks
      .filter(([k]) => shot.marks[k])
      .map(([k, n, ax = 0.5, ay = 0.5]) => {
        // anchor (ax, ay) is a position inside the marked region, 0..1
        const b = shot.marks[k];
        return `<span class="pin" style="left:${b.x + b.w * ax}%;top:${b.y + b.h * ay}%">${n}</span>`;
      })
      .join('');
    return `<figure class="${cls}"><div class="shot"><img src="${dataUrl(shot.file, 'image/jpeg')}" alt="">${pins}</div><figcaption>${caption}</figcaption></figure>`;
  };

  const caseCard = (id: string, title: string, who: string, body: string, how: string) => `
    <div class="case">
      <img src="${thumb(id)}" alt="">
      <div>
        <h3>${title}</h3>
        <p class="who">${who}</p>
        <p>${body}</p>
        <p class="how"><b>How:</b> ${how}</p>
      </div>
    </div>`;

  const html = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>SDF Forge — User Guide</title>
<meta name="author" content="Vin's Atelier">
<style>
@font-face { font-family: Inter; src: url(${font}) format('woff2'); font-weight: 100 900; }
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Inter, sans-serif; color: #1b1b1e; font-size: 10.5pt; line-height: 1.55; margin: 0; }
h1 { font-size: 26pt; line-height: 1.1; margin: 0 0 6mm; letter-spacing: -0.02em; }
h2 { font-size: 17pt; margin: 0 0 3mm; letter-spacing: -0.01em; color: #1b1b1e; }
h2 .n { display: inline-block; min-width: 9mm; color: #f47b2b; }
h3 { font-size: 11.5pt; margin: 4mm 0 1.5mm; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
li { margin-bottom: 1.2mm; }
a { color: #b5450b; text-decoration: none; }
section { break-before: page; }
.lead { font-size: 12pt; color: #3a3b40; }
.muted { color: #57585f; }
.accent { color: #f47b2b; }
kbd { font-family: inherit; font-size: 9pt; border: 1px solid #c9c9c4; border-bottom-width: 2px; border-radius: 4px; padding: 0 1.5mm; background: #f4f4f2; }
figure { margin: 3mm 0 4mm; break-inside: avoid; }
figure .shot { position: relative; border: 1px solid #e0e0dc; border-radius: 3mm; overflow: hidden; }
figure img { display: block; width: 100%; }
figcaption { font-size: 9pt; color: #57585f; margin-top: 1.5mm; }
.pin { position: absolute; transform: translate(-50%, -50%); width: 7mm; height: 7mm; border-radius: 50%; background: #f47b2b; color: #fff; font-weight: 700; font-size: 10pt; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1mm rgba(255,255,255,0.9), 0 1mm 3mm rgba(0,0,0,0.3); }
.row { display: flex; gap: 6mm; align-items: flex-start; }
.row > * { flex: 1; min-width: 0; }
.narrow { max-width: 62mm; flex: 0 0 62mm; }
.half { max-width: 50%; }
.keep { break-inside: avoid; }
.box { background: #fff4ec; border: 1px solid #ffd9bf; border-radius: 3mm; padding: 3.5mm 4.5mm; margin: 3mm 0; break-inside: avoid; }
.box h3 { margin-top: 0; }
.legend { list-style: none; padding: 0; columns: 2; column-gap: 8mm; }
.legend li { break-inside: avoid; display: flex; gap: 2.5mm; }
.legend .k { flex: 0 0 6mm; height: 6mm; border-radius: 50%; background: #f47b2b; color: #fff; font-weight: 700; font-size: 9pt; display: flex; align-items: center; justify-content: center; margin-top: 0.4mm; }
.steps { counter-reset: s; list-style: none; padding: 0; }
.steps > li { counter-increment: s; position: relative; padding-left: 9mm; margin-bottom: 2.4mm; }
.steps > li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 6mm; height: 6mm; border-radius: 50%; background: #1b1b1e; color: #fff; font-weight: 700; font-size: 9pt; display: flex; align-items: center; justify-content: center; }
.case { display: flex; gap: 5mm; border: 1px solid #e0e0dc; border-radius: 3mm; padding: 3.5mm; margin-bottom: 3.5mm; break-inside: avoid; }
.case img { width: 34mm; height: 25.5mm; object-fit: cover; border-radius: 2mm; background: #111; flex: 0 0 auto; }
.case h3 { margin: 0 0 0.5mm; }
.case p { margin-bottom: 1.4mm; font-size: 9.8pt; }
.case .who { color: #b5450b; font-weight: 600; font-size: 9pt; }
.case .how { color: #3a3b40; }
table { border-collapse: collapse; width: 100%; font-size: 9.6pt; margin: 2mm 0 4mm; }
th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 1px solid #e0e0dc; vertical-align: top; }
th { background: #f4f4f2; font-weight: 600; }
table.compact { font-size: 9pt; margin-bottom: 0; }
table.compact th, table.compact td { padding: 1.1mm 2mm; line-height: 1.35; }
.cover { height: 260mm; display: flex; flex-direction: column; }
.cover .brand { display: flex; align-items: center; gap: 3mm; font-weight: 700; font-size: 13pt; }
.cover .brand img { width: 9mm; }
.cover .hero { margin: 8mm 0 6mm; border-radius: 4mm; overflow: hidden; }
.cover .hero img { width: 100%; display: block; }
.cover .foot { margin-top: auto; font-size: 9.5pt; color: #57585f; border-top: 1px solid #e0e0dc; padding-top: 3mm; }
.toc { columns: 2; column-gap: 8mm; padding-left: 5mm; }
.pill { display: inline-block; background: #f4f4f2; border: 1px solid #e0e0dc; border-radius: 99px; padding: 0 2.5mm; font-size: 9pt; margin: 0 1mm 1mm 0; }
</style></head><body>

<!-- ============================== COVER ============================== -->
<div class="cover">
  <div class="brand"><img src="${logo}" alt="">SDF Forge</div>
  <div class="hero"><img src="${dataUrl(s.hero.file, 'image/jpeg')}" alt=""></div>
  <h1>Make real 3D things in your browser.<br><span class="accent">A friendly guide.</span></h1>
  <p class="lead">SDF Forge lets you build 3D shapes by joining, blending and carving simple forms, then export
  them for 3D printing, games, videos and the web. It's free, needs no install or account, and nothing you make
  leaves your computer unless you share it.</p>
  <p><b>Open it:</b> <a href="${LIVE}">${LIVE.replace('https://', '')}</a> · works in Chrome, Edge, Firefox and Safari,
  on computers, tablets and phones.</p>
  <h3>In this guide</h3>
  <ol class="toc">
    <li>Why use SDF Forge?</li><li>The screen at a glance</li><li>Your first shape in 5 minutes</li>
    <li>Going further: graph, settings, outlines</li><li>Make it real: printing, games, images, video</li>
    <li>Templates, sharing and animation</li><li>Real-life uses</li><li>Tips, shortcuts and help</li>
  </ol>
  <div class="foot">Made by <b>Vin's Atelier</b> · SDF Forge is open source (MIT licence) · This guide shows SDF Forge as of
  ${new Date().toISOString().slice(0, 10)}.</div>
</div>

<!-- ============================== WHY ============================== -->
<section>
<h2><span class="n">1</span>Why use SDF Forge?</h2>
<p class="lead">Most 3D software is big, expensive or hard to learn. SDF Forge is built for the moment you
think “I just want to make <i>this</i>”: a hook, a vase, a name tag, a game prop, a shape for a lesson.</p>
<div class="row">
<div>
<h3>What makes it different</h3>
<ul>
<li><b>Shapes blend like clay.</b> Every shape is a smooth mathematical form (a <i>signed distance field</i>, or SDF),
so two shapes can melt into each other with one slider. Doing the same in typical modelling apps takes careful,
fiddly work.</li>
<li><b>Real sizes in millimetres.</b> Set the size you want, and the file you export is exactly that size.</li>
<li><b>Files that print.</b> Exports are <i>watertight</i>: closed, without holes or broken edges, which is what slicers
(the programs that prepare 3D prints) need. A built-in <i>Print check</i> shows thin walls and overhangs before you
waste filament.</li>
<li><b>Change your mind at any time.</b> Nothing is “baked”: every size, angle and blend stays editable, and Undo
is always there.</li>
<li><b>Free and private.</b> No account, no upload, no subscription. Your work is saved in your browser.</li>
<li><b>Runs on modest hardware.</b> Laptops with built-in graphics, Chromebooks and tablets all work.</li>
</ul>
</div>
<div class="narrow">
<div class="box">
<h3>In one sentence</h3>
<p>Pick shapes from a toolbar, drag them where you want, blend or carve them, and press Export.</p>
</div>
<div class="box">
<h3>Who it's for</h3>
<p><span class="pill">3D printing hobbyists</span><span class="pill">teachers &amp; students</span>
<span class="pill">game makers</span><span class="pill">artists</span><span class="pill">makerspaces</span>
<span class="pill">designers</span><span class="pill">shader coders</span></p>
</div>
<div class="box">
<h3>What you can make</h3>
<p>Printable parts and gifts, game props, product mock-ups, renders and turntable videos, and shader code.</p>
</div>
</div>
</div>
<h3>How it compares</h3>
<table>
<tr><th></th><th>SDF Forge</th><th>Typical 3D modelling app</th></tr>
<tr><td>Getting started</td><td>Open a web page</td><td>Download, install, often sign up</td></tr>
<tr><td>Smooth blends between parts</td><td>One slider</td><td>Careful manual modelling</td></tr>
<tr><td>Printable (watertight) files</td><td>Every export, checked automatically</td><td>Often needs repair tools</td></tr>
<tr><td>Changing sizes later</td><td>Always editable</td><td>Depends on how the model was built</td></tr>
<tr><td>Cost</td><td>Free and open source</td><td>Free to expensive</td></tr>
</table>
</section>

<!-- ============================== SCREEN ============================== -->
<section>
<h2><span class="n">2</span>The screen at a glance</h2>
<p>SDF Forge opens with a shape you can play with straight away. Here's what each area does.</p>
${fig(
  s.overview,
  'The editor on a desktop. On tablets and phones the same parts stack vertically, with tabs for the graph and settings.',
  [
    ['add', '1', 0.02, 0.5],
    ['viewport', '2', 0.08, 0.82],
    ['view', '3', 0.02, 0.5],
    ['graph', '4', 0.03, 0.8],
    ['props', '5', 0.85, 0.05],
    ['top', '6', 0.5, 0.5],
    ['export', '7', 0.5, 0.5],
  ],
)}
<ul class="legend">
<li><span class="k">1</span><div><b>Add toolbar.</b> Click a shape to add it. Switch <i>Add</i> to <i>Carve</i> to cut holes instead.
The <b>+</b> holds more shapes, like Text and Profile.</div></li>
<li><span class="k">2</span><div><b>3D view.</b> Drag to turn around the shape, right-drag to slide, scroll to zoom. Click a
part to select it, then drag the coloured arrows to move it.</div></li>
<li><span class="k">3</span><div><b>View options.</b> Shaded or <i>Print check</i> view, the camera menu (front, top, side
views and a no-perspective mode), a <i>section</i> cut to see inside, the floor grid (10 mm squares), and <i>Frame</i>.</div></li>
<li><span class="k">4</span><div><b>Graph.</b> The recipe of your shape: boxes (“nodes”) joined by wires. You can ignore it
at first; it's there when you want full control.</div></li>
<li><span class="k">5</span><div><b>Properties.</b> The settings of whatever is selected, in millimetres and degrees,
with a plain-language explanation. With nothing selected it shows the whole shape: name, Controls, material, size.</div></li>
<li><span class="k">6</span><div><b>Gallery and Share.</b> Ready-made examples to open and change, and a link that
holds your whole shape.</div></li>
<li><span class="k">7</span><div><b>Export.</b> Save a 3D file for printing or other apps, a picture, a turntable video or
shader code.</div></li>
<li><span class="k">?</span><div><b>Help menu</b> (top right). The 1-minute tour, keyboard shortcuts, the command
palette, and this guide.</div></li>
</ul>
</section>

<!-- ============================== FIRST SHAPE ============================== -->
<section>
<h2><span class="n">3</span>Your first shape in 5 minutes</h2>
<p>Let's make a small object with a hole through it, the kind of thing you might print as a pendant or hook.</p>
<div class="row">
<div>
<ol class="steps">
<li><b>Start fresh or keep the welcome shape.</b> To start empty, open the command palette
(<kbd>Ctrl</kbd>+<kbd>K</kbd>, or <kbd>⌘</kbd>+<kbd>K</kbd> on a Mac) and choose <i>New empty shape</i>. Or just keep the shape you see.</li>
<li><b>Add a shape.</b> Click the cube in the Add toolbar. It appears next to what's there, already selected.</li>
<li><b>Move it.</b> Drag one of the coloured arrows in the 3D view (red = left/right, green = up/down, blue =
front/back). Hold <kbd>Shift</kbd> for fine steps. Press <kbd>E</kbd> for rotation rings and <kbd>R</kbd> to scale
(<kbd>W</kbd> goes back to moving), or type exact values in the Properties panel.</li>
<li><b>Blend it.</b> In Properties, raise <i>Blend with the other shapes</i>: the parts melt together. <i>Material</i>
makes a part clay, glossy, metal or glowing.</li>
<li><b>Carve a hole.</b> Switch the toolbar from <i>Add</i> to <i>Carve</i>, then click the cylinder. It cuts through
whatever it touches; move it like any other part.</li>
</ol>
</div>
<div>${fig(s.addShape, 'A new box, selected, with its move arrows.')}
<div class="box"><b>Made a mistake?</b> Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo and <kbd>Ctrl</kbd>+<kbd>Y</kbd> to redo. Your
work is saved automatically in this browser, so closing the tab doesn't lose it.</div></div>
</div>
<div class="row">
<div>${fig(s.carve, 'Carve mode: the cylinder becomes a hole.')}</div>
<div class="narrow">${fig(s.inspector, 'The selected part’s settings, in real units, with an explanation.')}</div>
</div>
</section>

<!-- ============================== GOING FURTHER ============================== -->
<section>
<h2><span class="n">4</span>Going further</h2>
<h3>The graph: your shape's recipe</h3>
<div class="row">
<div>
<p>Each box in the graph is a step: a <b>shape</b> (sphere, box, text…), a <b>combine</b> step (join, carve,
overlap) or a <b>modifier</b> (twist, bend, repeat, mirror, hollow out…). Wires carry shapes from left to right
into the <b>Output</b>, which is what you see and export.</p>
<ul>
<li>Drag from a dot into empty space to get a list of nodes that fit there.</li>
<li>Right-click (or press <kbd>A</kbd>) to add any node; type to search.</li>
<li>Click the eye on a node to view only that step.</li>
<li><i>Tidy</i> straightens the layout; <kbd>Ctrl</kbd>+<kbd>G</kbd> folds selected nodes into one group card.</li>
</ul>
</div>
<div>${fig(s.graph, 'A sphere, box and torus joined, then carved by a cylinder.')}</div>
</div>
<h3>Measure, look inside, line things up</h3>
<ul>
<li><b>Measure</b> (<kbd>M</kbd>): click two points on the shape to read the distance in millimetres.</li>
<li><b>Section view</b>: cut the shape open along X, Y or Z to check walls and hidden spaces. It only changes the
view; exports keep the whole shape.</li>
<li><b>Camera menu</b>: front, top and side views, and an orthographic (no-perspective) mode for lining parts up.</li>
<li><b>Chamfered edges</b>: on Union, Subtract and Intersect, set <i>Edge</i> to <i>Chamfered</i> for a flat 45° bevel,
such as countersunk screw holes, instead of a rounded blend.</li>
</ul>
<h3>Handy modifiers</h3>
<table>
<tr><th>Modifier</th><th>What it does</th><th>Try it for</th></tr>
<tr><td>Twist / Bend</td><td>Twists or curves a shape along its height</td><td>Twisted vases, curved handles</td></tr>
<tr><td>Repeat / Radial</td><td>Copies in a row or grid, or around a circle</td><td>Fences, gear teeth, flower petals</td></tr>
<tr><td>Mirror</td><td>Makes the shape symmetric</td><td>Faces, vehicles, ornaments</td></tr>
<tr><td>Shell</td><td>Hollows it out with a wall thickness, optionally open at the top</td><td>Cups, planters, lamp shades</td></tr>
<tr><td>Inflate / Displace</td><td>Rounds edges, or adds bumpy organic detail</td><td>Rocks, soft toys, terrain</td></tr>
<tr><td>Lattice</td><td>Turns the inside into a 3D mesh pattern</td><td>Lightweight prints, decor</td></tr>
<tr><td>Cut</td><td>Keeps one side of a flat plane</td><td>Flat bottoms that sit on a print bed</td></tr>
</table>
<div class="keep">
<h3>Draw your own outline (Profile)</h3>
${fig(s.profile, 'The chess pawn example: the Profile editor (right) holds the half-silhouette that Revolve spins into the body.')}
</div>
<p>Add <b>Profile</b> from the <b>+</b> in the toolbar. Drag points, click a <b>+</b> on an edge to add one, and
double-click a point (or press <kbd>S</kbd>) to switch between a <i>sharp corner</i> (square) and a <i>smooth
curve</i> (circle). Connected to <b>Revolve</b>, the horizontal axis is the distance from the centre, so you draw half
of a vase, bottle or chess piece. Connected to <b>Extrude</b>, it becomes a plate or bracket.</p>
</section>

<!-- ============================== MAKE IT REAL ============================== -->
<section>
<h2><span class="n">5</span>Make it real</h2>
<div class="row">
<div>
<h3>3D printing</h3>
<ol class="steps">
<li>Switch the view to <b>Print check</b>. Walls thinner than your nozzle show <b style="color:#c92a2a">red</b>, steep
overhangs that need supports show <b style="color:#d9730d">orange</b>.</li>
<li>Click <b>Export</b> and type the <b>Longest side</b> in millimetres.</li>
<li>Choose <b>3MF</b> for Bambu Studio, PrusaSlicer or Cura, or <b>STL</b> for any slicer.</li>
<li>Pick a detail level (Standard is right for most prints) and export. You get a summary: size, volume, an estimate
of filament, and <i>Watertight and manifold</i>, which means ready to print.</li>
</ol>
</div>
<div class="narrow">${fig(s.printCheck, 'Print check: the planter has no problem areas.')}</div>
</div>
<div class="row">
<div class="narrow">${fig(s.export, 'The Export dialog after a 3MF export.')}</div>
<div>
<h3>What you get</h3>
<p>After exporting, SDF Forge shows the final size, the number of triangles, the volume and roughly how many grams of
PLA a solid print would use, and confirms the file is <b>watertight and manifold</b>.</p>
<p>The file is saved to your Downloads folder, named after your shape. Open it in your slicer, choose your printer and
material, and print.</p>
</div>
</div>
<h3>Other ways to export</h3>
<table class="compact">
<tr><th>Format</th><th>Use it for</th><th>Notes</th></tr>
<tr><td><b>3MF</b></td><td>Modern slicers</td><td>Millimetres, your shapes' colours as named filaments, a preview image, small files</td></tr>
<tr><td><b>STL</b></td><td>Any slicer or 3D printing service</td><td>Millimetres, Z up</td></tr>
<tr><td><b>GLB</b> (glTF)</td><td>Game engines (Unity, Godot, Unreal), Blender, web viewers, AR</td><td>Colours, smooth normals and a material per part (metal, glossy, glow)</td></tr>
<tr><td><b>OBJ</b></td><td>Almost any 3D app</td><td>Millimetres, vertex colours</td></tr>
<tr><td><b>USDZ</b></td><td>AR on iPhone and iPad (open the file to place it in your room), Apple apps</td><td>Real size, colours and materials</td></tr>
<tr><td><b>PNG image</b></td><td>Posts, thumbnails, documents</td><td>Up to 4K, transparent background option</td></tr>
<tr><td><b>Turntable video</b></td><td>Social media, portfolios, product pages</td><td>MP4 or WebM; can also play your animation</td></tr>
<tr><td><b>Shader code</b></td><td>Shadertoy and graphics programming</td><td>A complete, working shader</td></tr>
</table>
</section>

<!-- ============================== TEMPLATES / SHARE / ANIMATE ============================== -->
<section>
<h2><span class="n">6</span>Templates, sharing and animation</h2>
<div class="row">
<div>
<h3>Templates and Controls</h3>
<p>The <b>Gallery</b> has ready-made examples. Printable ones (vase, planter, keychain, ring, bowl, bracket, chess
pawn…) come with <b>Controls</b>: the few settings that matter, gathered in one place. Change the height, wall
thickness or hole size without touching the graph. The template is tested so it keeps working at any value.</p>
<p>To make your own Controls, click the pin next to any setting.</p>
</div>
<div class="narrow">${fig(s.controls, 'Controls of the twisted vase template.')}</div>
</div>
${fig(s.gallery, 'The Gallery: filter by Printable, Game assets, Art or Learn.')}
<div class="row keep">
<div>
<h3>Share a link</h3>
<p><b>Share</b> creates a link that contains your whole shape, with no account and no upload. Anyone who opens it gets
an editable copy. It's great for sending a design to a friend, posting a template, or handing in homework. You can
also download the graph as a file.</p>
${fig(s.share, 'The Share dialog.')}
</div>
<div>
<h3>Animate</h3>
<p>Click <b>Animate</b> under any Control to make it swing between two values. Press <b>Play</b> in the 3D view to
watch, and tick <i>Play the animated Controls</i> in the turntable video export to record it. Try the
<i>Sphere to cube</i> example.</p>
${fig(s.animate, 'Sphere to cube, paused half-way through its animation.', [
  ['play', '▶'],
  ['controls', '✎'],
])}
</div>
</div>
</section>

<!-- ============================== USE CASES ============================== -->
<section>
<h2><span class="n">7</span>Real-life uses</h2>
<p>A few of the ways people can use SDF Forge, and what it saves them.</p>
${caseCard(
  'bracket',
  'Fix things around the house',
  'Home owners, renters, DIY fans',
  'A broken shelf bracket, a missing cable clip, a hook in an odd size. Hardware stores rarely sell exactly what you need, and replacement parts can cost more than they should.',
  'Start from the <i>Shelf bracket</i> template, set the width and screw-hole sizes in Controls, measure with a ruler, export 3MF and print it at home, at a library or with a printing service.',
)}
${caseCard(
  'keychain',
  'Personal gifts and small-batch merch',
  'Gift makers, small shops, clubs and teams',
  'Name tags, keychains and badges with a person’s name or a team logo feel special, but custom orders are slow and pricey.',
  'Open the <i>Keychain</i> or <i>Heart badge</i> template, type the name in its Name Control, or drop your own logo (SVG file) onto the 3D view. 3MF keeps the colours as separate filaments; share the link so customers can preview their own.',
)}
${caseCard(
  'planter',
  'Things for the home: planters, vases, lamps',
  'Plant lovers, home decorators',
  'Mass-market planters come in a few sizes. A pot that fits your windowsill, with proper drainage, is hard to find.',
  'The <i>Planter</i> and <i>Twisted vase</i> templates are made for printing. Set the size and wall, check overhangs with Print check, and the drainage hole stays in the right place whatever you change.',
)}
${caseCard(
  'morph',
  'Teaching and learning maths, geometry and 3D',
  'Teachers, students, coding clubs',
  'Abstract ideas such as distance, union and intersection, symmetry and interpolation are hard to picture on paper.',
  'Every node explains itself in plain language, and examples like <i>Sphere to cube</i> animate an idea. It runs on school Chromebooks with nothing to install, and students hand in work as a share link.',
)}
${caseCard(
  'rock',
  'Game assets and prototypes',
  'Indie game developers, game-jam teams, modders',
  'Rocks, gems, props and level pieces take time in full 3D suites, and a jam lasts a weekend.',
  'Blend and displace shapes into props, export GLB with colours straight into Unity, Godot or Unreal, and tweak and re-export in seconds.',
)}
${caseCard(
  'flower',
  'Art, renders and social media',
  'Digital artists, content creators',
  'Smooth, organic forms and eye-catching motion are what stop the scroll, and they’re hard to produce quickly.',
  'Combine Radial, Twist and smooth blends, then export a 4K image or a turntable video (with animation) for Instagram, TikTok or a portfolio.',
)}
${caseCard(
  'gyroid-sphere',
  'Makerspaces and libraries',
  'Makerspace staff, librarians, workshop leaders',
  'Teaching a group to make a printable object usually starts with an hour of installing and learning software.',
  'Everyone opens a link and starts from a template. Every export is watertight, so prints succeed more often. It works on old laptops and tablets, and no accounts are needed.',
)}
${caseCard(
  'gem',
  'Product ideas and quick mock-ups',
  'Designers, inventors, small businesses',
  'Before paying for CAD work or tooling, you want to see the idea in 3D and maybe hold a printed version.',
  'Sketch the form with shapes and outlines, set real dimensions, check it with the section view and measure tool, print a prototype, and send a USDZ so your client can see it in their room on an iPhone.',
)}
${caseCard(
  'twisted-tower',
  'Shader programming',
  'Graphics programmers, demoscene and Shadertoy fans',
  'Writing ray-marched signed distance fields by hand means lots of trial and error.',
  'Build visually, then export a complete Shadertoy shader or just the distance function to paste into your own code.',
)}
</section>

<!-- ============================== TIPS ============================== -->
<section>
<h2><span class="n">8</span>Tips, shortcuts and help</h2>
<div class="row">
<div>
<h3>Keyboard shortcuts</h3>
<table>
<tr><td><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd></td><td>Command palette: do anything by typing</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Undo / redo</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd></td><td>Copy / paste / duplicate</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>G</kbd> (+<kbd>Shift</kbd>)</td><td>Group the selected nodes (ungroup)</td></tr>
<tr><td><kbd>Delete</kbd></td><td>Delete the selection</td></tr>
<tr><td><kbd>F</kbd></td><td>Frame the shape</td></tr>
<tr><td><kbd>W</kbd> / <kbd>E</kbd> / <kbd>R</kbd></td><td>Move / rotate / scale the selected part</td></tr>
<tr><td><kbd>M</kbd></td><td>Measure tool</td></tr>
<tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Shaded, Print check, Normals, Cost views</td></tr>
<tr><td><kbd>A</kbd> or right-click</td><td>Add a node (in the graph)</td></tr>
<tr><td><kbd>?</kbd></td><td>All shortcuts</td></tr>
</table>
<h3>Good habits</h3>
<ul>
<li>Name your shape (top left): it becomes the file name.</li>
<li>Pin the settings you change often: they appear under Controls.</li>
<li>Number fields accept maths: type <code>40/2+3</code>.</li>
<li>Drag on a setting's label to scrub its value; hold <kbd>Shift</kbd> for fine steps.</li>
</ul>
</div>
<div class="narrow">
${fig(s.phone, 'On a phone: the 3D view on top, Graph and Properties as tabs.')}
</div>
</div>
<h3>If something isn't right</h3>
<table>
<tr><th>Problem</th><th>Try this</th></tr>
<tr><td>The view is slow or blurry while moving</td><td>That's normal: it renders at lower resolution while you move,
then sharpens. On slow devices, keep shapes simpler or close other tabs.</td></tr>
<tr><td>“WebGL 2 is not available”</td><td>Update your browser, or turn on hardware acceleration in its settings.</td></tr>
<tr><td>The shape disappeared</td><td>Press <kbd>F</kbd> to frame it. Check that the last node is connected to Output.</td></tr>
<tr><td>A printed hole is too tight</td><td>Printers shrink holes slightly; make the hole about 0.2–0.4 mm bigger.</td></tr>
<tr><td>I lost my work</td><td>Work is saved per browser. Use Share or download the graph file to keep a copy.</td></tr>
</table>
<div class="keep">
<h2 style="margin-top:2mm">Ready to start?</h2>
<p class="lead">Open <a href="${LIVE}"><b>${LIVE.replace('https://', '')}</b></a> and try one of these:</p>
<ol class="steps">
<li><b>Five minutes:</b> open <i>Gallery → Keychain tag</i>, type your name in the Name Control, and export a 3MF.</li>
<li><b>Fifteen minutes:</b> open <i>Planter with drainage</i>, set it to fit your windowsill, check it in Print check, and print it.</li>
<li><b>An afternoon:</b> draw a vase or chess piece with a Profile, blend on details, and export a turntable video to share.</li>
</ol>
</div>
<div class="box">
<h3>Privacy and licence</h3>
<p>Everything runs in your browser; nothing is uploaded. Share links carry the shape inside the link itself. SDF
Forge is free and open source under the MIT licence, and the things you make are yours.</p>
</div>
<p class="muted">SDF Forge is made by <b>Vin's Atelier</b>. Distance functions follow Inigo Quilez's articles; meshing uses
Manifold; studio lighting by Sergej Majboroda (Poly Haven, CC0). Full credits are in the app under Help → About.
Open SDF Forge at <a href="${LIVE}">${LIVE.replace('https://', '')}</a>.</p>
</section>
</body></html>`;

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync('public/guide', { recursive: true });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="font-family:sans-serif;font-size:8px;color:#888;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>SDF Forge user guide · Vin’s Atelier</span><span class="pageNumber"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
  });
  writeFileSync(OUT, pdf);
  writeFileSync('artifacts/guide/guide.html', html);
  console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  await browser.close();
  server.kill();
}
