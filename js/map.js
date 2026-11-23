// --- Map -------------------------------------------------------------------
// read by ui.js: a negative zoom (solar system view) that MapLibre clamps and rewrites while constructing the map
const startHash = location.hash;
const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [0, 20],
  zoom: 1.5,
  hash: 'map', // view in URL as #map=zoom/lat/lng (other hash params kept: toggles, ui.js), overrides center/zoom
  pixelRatio: MAP_PIXEL_RATIO, // see classes.js
  attributionControl: false, // credits are drawn outside the hidden map
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
  maxCanvasSize: [16384, 16384], // default 4096 would lower the pixel ratio of a poster render (ui.js)
  fadeDuration: 0, // no symbols to fade; the default 300 keeps symbol placement dirty = a repaint every frame
});
// The globe projection reports a transition in progress forever (MapLibre 5.24), which makes the map repaint
// every frame even when idle: ~60 full emoji redraws a second for nothing. Camera changes still repaint.
// ponytail: monkeypatch of an internal; drop it if a MapLibre update fixes the idle repaint.
map.on('style.load', () => { map.style.projection.hasTransition = () => false; });

// --- Grid anchored to the world --------------------------------------------
// A screen-fixed grid shimmers while panning: every sub-cell move changes which class wins each cell. Instead cell
// (col, r) sits at screen px (col * cell + gridOX, r * cell + gridOY), the offset (-cell..0) being the view's world
// position mod one cell: each cell keeps its emoji, and the grid canvas, one cell bigger than the screen, slides by
// the offset (CSS transform, no repaint) so panning is smooth. Map/mouse <-> cell goes through cellCol/cellRow and
// cellX/cellY. The controls (ui.js) stay put on their own screen-fixed canvas and grid (scols x srows).
// Anchoring follows a reference point projected each frame (right on the globe too), re-picked near the centre when
// it drifts, with the offset kept continuous. While zooming and on the low-zoom globe (rotating, not sliding) the
// offset freezes: the grid stays put on screen, like a plain grid.
const SNAP_MINZOOM = 5; // below: no anchoring
let gridOX = 0, gridOY = 0, snapRef = null, phaseX = 0, phaseY = 0;
let vw = innerWidth, vh = innerHeight; // map viewport, CSS px: the window, except while printing a poster (ui.js)
function snapGrid() { // once per frame, before anything maps points to cells
  if (map.isZooming() || map.getZoom() < SNAP_MINZOOM) { snapRef = null; return; }
  const mod = (a) => ((a % cell) + cell) % cell;
  let p = snapRef && map.project(snapRef);
  if (!p || Math.abs(p.x - vw / 2) > vw / 4 || Math.abs(p.y - vh / 2) > vh / 4) {
    snapRef = map.unproject([vw / 2, vh / 2]); p = map.project(snapRef);
    phaseX = gridOX - p.x; phaseY = gridOY - p.y; // same offset as now: no jump
  }
  // -cell..0, whole device px: the canvas lands on the pixel grid (crisp glyphs)
  gridOX = Math.round((mod(p.x + phaseX) - cell) * dpr) / dpr;
  gridOY = Math.round((mod(p.y + phaseY) - cell) * dpr) / dpr;
}
const cellCol = (x) => Math.floor((x - gridOX) / cell), cellRow = (y) => Math.floor((y - gridOY) / cell);
const cellX = (col) => (col + 0.5) * cell + gridOX, cellY = (r) => (r + 0.5) * cell + gridOY; // cell centre, screen px

// --- Emoji color lookup ----------------------------------------------------
classList.forEach((cls) => { cls.variants = [].concat(cls.emoji); });
// Class colours sit on a 6-level grid (multiples of 51), so a pixel maps to a class with two array reads:
// CHANNEL turns 0..255 into a grid level (6 = not on the grid), LUT maps the base-7 number of 3 levels to a class.
const CHANNEL = new Uint8Array(256).map((_, v) => (v % 51 ? 6 : v / 51));
const LUT = new Int16Array(343).fill(-1); // -1 = not a class colour (blended edge)
classList.forEach(({ rgb: [r, g, b] }, i) => { LUT[CHANNEL[r] * 49 + CHANNEL[g] * 7 + CHANNEL[b]] = i; });
const classAt = (pixels, p) => LUT[CHANNEL[pixels[p]] * 49 + CHANNEL[pixels[p + 1]] * 7 + CHANNEL[pixels[p + 2]]];
const counts = new Float32Array(classList.length);
const touched = new Int16Array(classList.length); // classes seen in the current cell

// --- Grid ------------------------------------------------------------------
// Emojis are stamped on one canvas from glyph images rendered once: no text layout or HTML per frame.
const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const uiCanvas = document.getElementById('ui'), uiCtx = uiCanvas.getContext('2d');
const fpsEl = document.getElementById('fps');
const EMOJI_FONT = `${FONT_SIZE}px sans-serif`, LETTER_FONT = 'bold 11px system-ui, sans-serif';
// Per cell, one number: glyph id (16 bits) | DIM (night side) | cloud opacity 0..100 << CLOUD_SHIFT
const DIM = 1 << 16, CLOUD_SHIFT = 17;
let cell, cols, rows, scols, srows, dpr, edgeX, edgeY, cells, painted, lastNight = -1, cloudGlyph;
// With a negative GAP glyphs keep their natural size and overlap their neighbours: glyph images are 2 * glyphPad
// (CSS px) bigger than a cell and drawn centred on it (padPx: the same in device px, whole pixels)
let glyphPad = 0, padPx = 0;

// Glyph keys: an emoji, 'f:' + emoji = mirrored (agent heading right), 'l:' + letter = place-name letter
const glyphIds = new Map(), glyphImgs = [];
function glyphId(key) {
  let id = glyphIds.get(key);
  if (id === undefined) { id = glyphImgs.length; glyphIds.set(key, id); glyphImgs.push(renderGlyph(key)); }
  return id;
}
function renderGlyph(key) {
  const g = document.createElement('canvas');
  const size = cell + 2 * glyphPad;
  g.width = g.height = Math.ceil(size * dpr);
  const c = g.getContext('2d'), mid = size / 2;
  c.scale(dpr, dpr); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (key.startsWith('d:')) { c.globalAlpha = 0.3; key = key.slice(2); } // 'd:' + key = dimmed (toggle off, unselected)
  if (key.startsWith('l:')) {
    c.font = LETTER_FONT; c.fillStyle = 'white'; c.shadowColor = 'black'; c.shadowBlur = 3 * dpr; // blur ignores scale
    c.fillText(key.slice(2), mid, mid); c.fillText(key.slice(2), mid, mid); // twice: darker halo
  } else {
    if (key.startsWith('f:')) { c.translate(size, 0); c.scale(-1, 1); key = key.slice(2); }
    c.font = EMOJI_FONT; c.fillText(key, mid, mid);
  }
  return g;
}

function layoutGrid() {
  dpr = printing ? 1 : devicePixelRatio || 1;
  ctx.font = EMOJI_FONT;
  cell = ctx.measureText('🌳').width + GAP; // real emoji advance in this browser/font
  glyphPad = Math.min(Math.max(0, -GAP / 2), cell / 2 - 1); padPx = Math.round(glyphPad * dpr); // < half a cell: only
  // the rows next to a row overlap it (paintGrid)
  scols = Math.floor(innerWidth / cell); srows = Math.floor(innerHeight / cell); // controls grid
  vw = map.getContainer().clientWidth; vh = map.getContainer().clientHeight; // window size, or the poster size (ui.js)
  cols = Math.ceil(vw / cell) + 1; rows = Math.ceil(vh / cell) + 1; // map grid: covers any offset
  // cell edges in device px, rounded so glyphs land on whole pixels (crisp)
  edgeX = Int32Array.from({ length: cols + 1 }, (_, c) => Math.round(c * cell * dpr));
  edgeY = Int32Array.from({ length: rows + 1 }, (_, r) => Math.round(r * cell * dpr));
  canvas.width = edgeX[cols]; canvas.height = edgeY[rows];
  canvas.style.width = canvas.width / dpr + 'px'; canvas.style.height = canvas.height / dpr + 'px';
  uiCanvas.width = Math.round(innerWidth * dpr); uiCanvas.height = Math.round(innerHeight * dpr); uiPainted = null;
  cells = new Uint32Array(rows * cols);
  painted = new Uint32Array(rows * cols).fill(0xffffffff); // nothing painted yet: every row repaints
  glyphIds.clear(); glyphImgs.length = 0;
  glyphId(''); // id 0 = empty
  cloudGlyph = glyphId('☁️');
}

// Repaint the rows whose cells changed since the last paint (all of them when the night opacity changed). With
// overlapping glyphs a row band also shows the edges of the rows above and below it: a band repaints when any of the
// three changed, clipped to the band, drawing all three rows (top to bottom, so lower rows overlap upper ones).
function paintGrid(nightOpacity) {
  const all = nightOpacity !== lastNight; lastNight = nightOpacity;
  const reach = padPx > 0 ? 1 : 0, changed = new Uint8Array(rows + 2); // changed[r + 1]: row r, padded both ends
  for (let r = 0; r < rows; r++) {
    let i = r * cols;
    const i1 = i + cols;
    if (!all) while (i < i1 && cells[i] === painted[i]) i++;
    changed[r + 1] = i < i1 ? 1 : 0;
  }
  for (let b = 0; b < rows; b++) {
    if (!changed[b + 1] && !(reach && (changed[b] || changed[b + 2]))) continue;
    const y = edgeY[b], hgt = edgeY[b + 1] - y;
    ctx.save();
    if (reach) { ctx.beginPath(); ctx.rect(0, y, canvas.width, hgt); ctx.clip(); }
    ctx.clearRect(0, y, canvas.width, hgt);
    for (let r = Math.max(0, b - reach); r <= Math.min(rows - 1, b + reach); r++) {
      for (let c = 0, i = r * cols; c < cols; c++, i++) {
        const v = cells[i], g = v & 0xffff, cloud = v >>> CLOUD_SHIFT, x = edgeX[c] - padPx, gy = edgeY[r] - padPx;
        if (g) { ctx.globalAlpha = v & DIM ? nightOpacity : 1; ctx.drawImage(glyphImgs[g], x, gy); }
        if (cloud) { ctx.globalAlpha = cloud / 100; ctx.drawImage(glyphImgs[cloudGlyph], x, gy); }
      }
    }
    ctx.restore();
  }
  painted.set(cells);
}

// Controls (ui.js): Map(screen cellIndex -> glyph key, '' = black cell) on their own canvas, repainted when changed
let uiPainted = null;
function paintUi(ui) {
  const sig = [...ui].join();
  if (sig === uiPainted) return;
  uiPainted = sig;
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  uiCtx.fillStyle = 'black';
  const at = (i) => { const c = i % scols, r = (i - c) / scols; return [c, r, Math.round(c * cell * dpr), Math.round(r * cell * dpr)]; };
  for (const [i] of ui) { // all black cells first, then the glyphs, which may overlap their neighbours
    const [c, r, x, y] = at(i);
    uiCtx.fillRect(x, y, Math.round((c + 1) * cell * dpr) - x, Math.round((r + 1) * cell * dpr) - y);
  }
  for (const [i, key] of ui) if (key) { const [, , x, y] = at(i); uiCtx.drawImage(glyphImgs[glyphId(key)], x - padPx, y - padPx); }
}
