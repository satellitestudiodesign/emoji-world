// --- Map -------------------------------------------------------------------
const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [0, 20],
  zoom: 1.5,
  hash: true, // view in URL as #zoom/lat/lng, overrides center/zoom when present
  pixelRatio: MAP_PIXEL_RATIO, // see classes.js
  attributionControl: false, // credits are drawn outside the hidden map
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
  fadeDuration: 0, // no symbols to fade; the default 300 keeps symbol placement dirty = a repaint every frame
});
// The globe projection reports a transition in progress forever (MapLibre 5.24), which makes the map repaint
// every frame even when idle: ~60 full emoji redraws a second for nothing. Camera changes still repaint.
// ponytail: monkeypatch of an internal; drop it if a MapLibre update fixes the idle repaint.
map.on('style.load', () => { map.style.projection.hasTransition = () => false; });

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
const fpsEl = document.getElementById('fps');
const EMOJI_FONT = `${FONT_SIZE}px sans-serif`, LETTER_FONT = 'bold 11px system-ui, sans-serif';
// Per cell, one number: glyph id (16 bits) | DIM (night side) | cloud opacity 0..100 << CLOUD_SHIFT
const DIM = 1 << 16, CLOUD_SHIFT = 17;
let cell, cols, rows, dpr, edgeX, edgeY, cells, painted, lastNight = -1, cloudGlyph;

// Glyph keys: an emoji, 'f:' + emoji = mirrored (agent heading right), 'l:' + letter = place-name letter
const glyphIds = new Map(), glyphImgs = [];
function glyphId(key) {
  let id = glyphIds.get(key);
  if (id === undefined) { id = glyphImgs.length; glyphIds.set(key, id); glyphImgs.push(renderGlyph(key)); }
  return id;
}
function renderGlyph(key) {
  const g = document.createElement('canvas');
  g.width = g.height = Math.ceil(cell * dpr);
  const c = g.getContext('2d'), mid = cell / 2;
  c.scale(dpr, dpr); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (key.startsWith('l:')) {
    c.font = LETTER_FONT; c.fillStyle = 'white'; c.shadowColor = 'black'; c.shadowBlur = 3 * dpr; // blur ignores scale
    c.fillText(key.slice(2), mid, mid); c.fillText(key.slice(2), mid, mid); // twice: darker halo
  } else {
    if (key.startsWith('f:')) { c.translate(cell, 0); c.scale(-1, 1); key = key.slice(2); }
    c.font = EMOJI_FONT; c.fillText(key, mid, mid);
  }
  return g;
}

function layoutGrid() {
  dpr = devicePixelRatio || 1;
  ctx.font = EMOJI_FONT;
  cell = ctx.measureText('🌳').width + GAP; // real emoji advance in this browser/font
  cols = Math.floor(innerWidth / cell);
  rows = Math.floor(innerHeight / cell);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  // cell edges in device px, rounded so glyphs land on whole pixels (crisp)
  edgeX = Int32Array.from({ length: cols + 1 }, (_, c) => Math.round(c * cell * dpr));
  edgeY = Int32Array.from({ length: rows + 1 }, (_, r) => Math.round(r * cell * dpr));
  cells = new Uint32Array(rows * cols);
  painted = new Uint32Array(rows * cols).fill(0xffffffff); // nothing painted yet: every row repaints
  glyphIds.clear(); glyphImgs.length = 0;
  glyphId(''); // id 0 = empty
  cloudGlyph = glyphId('☁️');
}

// Repaint the rows whose cells changed since the last paint (all of them when the night opacity changed)
function paintGrid(nightOpacity) {
  const all = nightOpacity !== lastNight; lastNight = nightOpacity;
  for (let r = 0; r < rows; r++) {
    const i0 = r * cols, i1 = i0 + cols;
    let i = i0;
    if (!all) while (i < i1 && cells[i] === painted[i]) i++;
    if (i === i1) continue;
    const y = edgeY[r];
    ctx.clearRect(0, y, canvas.width, edgeY[r + 1] - y);
    for (let c = 0, i = i0; c < cols; c++, i++) {
      const v = painted[i] = cells[i], g = v & 0xffff, cloud = v >>> CLOUD_SHIFT;
      if (g) { ctx.globalAlpha = v & DIM ? nightOpacity : 1; ctx.drawImage(glyphImgs[g], edgeX[c], y); }
      if (cloud) { ctx.globalAlpha = cloud / 100; ctx.drawImage(glyphImgs[cloudGlyph], edgeX[c], y); }
    }
  }
}
