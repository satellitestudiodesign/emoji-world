// Build data/landcover/{z}/{x}/{y}.png (z0-4): low-zoom land cover tiles painted in the class colours of js/classes.js.
//   node build.mjs <Copernicus LC100 discrete map .tif>
// Source: Copernicus Global Land Service LC100 2019 (CC-BY 4.0), zenodo.org/records/3939050 (1.7 GB):
//   PROBAV_LC100_global_v3.0.1_2019-nrt_Discrete-Classification-map_EPSG-4326.tif
// Mountains: local relief from AWS Terrain Tiles (terrarium, z5), cached in ./cache.
// Each z5 Web Mercator pixel (~5 km at the equator) takes the majority land cover under it; lower zooms take the
// majority of their 4 children. The tiles bake class colours, which depend on the order of CLASSES:
// rerun this after inserting or reordering classes.
import { fromFile } from 'geotiff';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const Z = 5, W = 256 << Z; // world size in px at Z (computed here; relief thresholds are tuned for this scale)
const MAXZ = 4; // tiles written: z0..MAXZ. ponytail: z5 tiles were 3/4 of the size for zooms where biomes fade out
const OUT = new URL('../../data/landcover/', import.meta.url);
const CACHE = new URL('./cache/', import.meta.url);
const tifPath = process.argv[2];
if (!tifPath) { console.error('usage: node build.mjs <LC100 discrete map .tif>'); process.exit(1); }

// --- class colours, same formula and order as js/classes.js ----------------------------------------------------
const src = readFileSync(new URL('../../js/classes.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('const CLASSES = {') + 16, src.indexOf('\n};') + 2);
const keys = Object.keys(new Function(`return ${body}`)());
const rgb = (key) => { const n = keys.indexOf(key) + 1; if (!n) throw new Error(`no class ${key}`); return [(n % 6) * 51, (Math.floor(n / 6) % 6) * 51, (Math.floor(n / 36) % 6) * 51]; };

// --- land cover categories ----------------------------------------------------------------------------------------
// LC100 codes -> category (0 = nothing: no data, water; the map's own water and background show through)
const NEEDLE = 1, BROAD = 2, EVERGREEN_BROAD = 3, SHRUB = 4, HERB = 5, WET = 6, MOSS = 7, BARE = 8, CROP = 9, URBAN = 10, SNOW = 11, NCAT = 12;
const CAT = new Uint8Array(256);
for (const v of [111, 113, 121, 123]) CAT[v] = NEEDLE;
for (const v of [114, 115, 116, 124, 125, 126]) CAT[v] = BROAD;
for (const v of [112, 122]) CAT[v] = EVERGREEN_BROAD;
Object.assign(CAT, { 20: SHRUB, 30: HERB, 90: WET, 100: MOSS, 60: BARE, 40: CROP, 50: URBAN, 70: SNOW });

// category + latitude -> class key. ponytail: latitude bands stand in for climate (dry vs wet shrubland etc.)
function classOf(cat, lat) {
  const a = Math.abs(lat);
  switch (cat) {
    case NEEDLE: return 'conifer';
    case BROAD: return 'forest';
    case EVERGREEN_BROAD: return a < 28 ? 'jungle' : 'forest';
    case SHRUB: return a < 23 ? 'savanna' : a > 55 ? 'tundra' : 'scrub';
    case HERB: return a < 23 ? 'savanna' : a > 58 ? 'tundra' : 'steppe';
    case WET: return 'wetland';
    case MOSS: return 'tundra';
    case BARE: return a > 60 ? 'tundra' : 'desert';
    case CROP: return 'crops';
    case URBAN: return 'town';
    case SNOW: return 'rockice';
  }
  return null;
}

// --- 1. majority category per z5 pixel ----------------------------------------------------------------------------
const mercY = (lat) => Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * W);
const latOf = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / W))) * 180 / Math.PI;

const cat = new Uint8Array(W * W); // per z5 pixel
const tiff = await fromFile(tifPath);
const img = await tiff.getImage();
const iw = img.getWidth(), ih = img.getHeight(), [west, , , north] = img.getBoundingBox(), [resX, resY] = img.getResolution();
console.log(`land cover ${iw}x${ih}, from ${west},${north}`);
const STEP = 2; // read every 2nd pixel of each row/column: majority over ~500 samples per pixel is plenty
const colX = Int32Array.from({ length: Math.ceil(iw / STEP) }, (_, i) => Math.floor((west + (i * STEP + 0.5) * resX + 180) / 360 * W));
const counts = new Uint32Array(W * NCAT);
let curY = -1;
const flush = () => {
  if (curY < 0) return;
  for (let x = 0; x < W; x++) {
    let best = 0, bestN = 0, water = counts[x * NCAT];
    for (let k = 1; k < NCAT; k++) if (counts[x * NCAT + k] > bestN) { bestN = counts[x * NCAT + k]; best = k; }
    cat[curY * W + x] = bestN > water ? best : 0; // mostly water: let the map's water show
  }
  counts.fill(0);
};
const STRIP = 1024;
for (let r0 = 0; r0 < ih; r0 += STRIP) {
  const r1 = Math.min(ih, r0 + STRIP);
  const [band] = await img.readRasters({ window: [0, r0, iw, r1], samples: [0] });
  for (let r = r0; r < r1; r += STEP) {
    const y = mercY(north + (r + 0.5) * resY);
    if (y < 0 || y >= W) continue;
    if (y !== curY) { flush(); curY = y; }
    const row = (r - r0) * iw;
    for (let i = 0, c = 0; c < iw; i++, c += STEP) counts[colX[i] * NCAT + CAT[band[row + c]]]++;
  }
  process.stdout.write(`\r  rows ${r1}/${ih}`);
}
flush();
console.log();

// --- 2. relief from terrain tiles -------------------------------------------------------------------------------
mkdirSync(CACHE, { recursive: true });
const elev = new Float32Array(W * W);
const tiles = [];
for (let ty = 0; ty < 1 << Z; ty++) for (let tx = 0; tx < 1 << Z; tx++) {
  let land = false;
  for (let y = ty * 256; y < ty * 256 + 256 && !land; y++) for (let x = tx * 256; x < tx * 256 + 256; x++) if (cat[y * W + x]) { land = true; break; }
  if (land) tiles.push([tx, ty]);
}
async function terrain([tx, ty]) {
  const f = new URL(`${tx}-${ty}.png`, CACHE);
  if (!existsSync(f)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!res.ok) throw new Error(`terrain ${tx}/${ty}: ${res.status}`);
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const { data } = PNG.sync.read(readFileSync(f));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const p = (y * 256 + x) * 4;
    elev[(ty * 256 + y) * W + tx * 256 + x] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
  }
}
for (let i = 0; i < tiles.length; i += 16) {
  await Promise.all(tiles.slice(i, i + 16).map(terrain));
  process.stdout.write(`\r  terrain ${Math.min(i + 16, tiles.length)}/${tiles.length}`);
}
console.log();

// relief = max - min elevation within R px (~25 km at the equator). ponytail: px shrink toward the poles, so the
// window does too; fine below the arctic
const R = 2, RELIEF = 700, HIGH = 3800;
function mountainAt(x, y) {
  let lo = Infinity, hi = -Infinity;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const yy = y + dy; if (yy < 0 || yy >= W) continue;
    const e = elev[yy * W + ((x + dx + W) % W)];
    if (e < lo) lo = e; if (e > hi) hi = e;
  }
  const e = elev[y * W + x];
  return hi - lo > RELIEF || e > HIGH ? (e > HIGH ? 'peaks' : 'mountain') : null;
}

// --- 3. z5 class colours, then lower zooms by majority, then tiles ------------------------------------------------
const NONE = 0xffffffff;
let level = new Uint32Array(W * W).fill(NONE); // packed rgb, NONE = transparent
const pack = ([r, g, b]) => (r << 16) | (g << 8) | b;
const colour = new Map();
const packed = (key) => { if (!colour.has(key)) colour.set(key, pack(rgb(key))); return colour.get(key); };
for (let y = 0; y < W; y++) {
  const lat = latOf(y);
  for (let x = 0; x < W; x++) {
    const k = cat[y * W + x];
    if (!k) continue;
    const key = (k !== URBAN && k !== SNOW && mountainAt(x, y)) || classOf(k, lat);
    level[y * W + x] = packed(key);
  }
}

function writeTiles(z, px, size) {
  for (let ty = 0; ty < 1 << z; ty++) for (let tx = 0; tx < 1 << z; tx++) {
    const png = new PNG({ width: 256, height: 256 });
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = px[(ty * 256 + y) * size + tx * 256 + x], p = (y * 256 + x) * 4;
      if (v === NONE) { png.data[p + 3] = 0; continue; }
      png.data[p] = v >> 16; png.data[p + 1] = (v >> 8) & 255; png.data[p + 2] = v & 255; png.data[p + 3] = 255;
    }
    const dir = new URL(`${z}/${tx}/`, OUT);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL(`${ty}.png`, dir), PNG.sync.write(png, { colorType: 6 }));
  }
}

for (let z = Z, size = W; ; z--, size /= 2) {
  if (z <= MAXZ) { writeTiles(z, level, size); console.log(`  z${z} written`); }
  if (z === 0) break;
  const half = size / 2, next = new Uint32Array(half * half);
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
    const four = [level[2 * y * size + 2 * x], level[2 * y * size + 2 * x + 1], level[(2 * y + 1) * size + 2 * x], level[(2 * y + 1) * size + 2 * x + 1]];
    // majority, ties to the first; transparent only when most children are
    let best = four[0], bestN = 0;
    for (const v of four) { const n = four.filter((u) => u === v).length; if (n > bestN || (best === NONE && n === bestN)) { best = v; bestN = n; } }
    next[y * half + x] = best;
  }
  level = next;
}
console.log('done:', new URL(OUT).pathname);
