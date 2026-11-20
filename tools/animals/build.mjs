// Build data/animals.json: which animal emojis live in each 2° cell of the world, from GBIF occurrence counts.
// Run: cd tools/animals && npm install && node build.mjs
// Source: GBIF.org occurrence map API (https://techdocs.gbif.org/en/openapi/v2/maps), counts binned on the server.
import fs from 'fs';
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

const TAXA = JSON.parse(fs.readFileSync(new URL('taxa.json', import.meta.url))); // [emoji, name, realm, [scientific names]]
const OUT = new URL('../../data/animals.json', import.meta.url);
const CACHE = new URL('cache.json', import.meta.url); // raw GBIF counts per taxon; delete to refetch

const GRID = 2; // output cell size in degrees
const MIN_RECORDS = 3; // fewer records in a cell = stray/misidentified, dropped
const TOP = 4; // taxa kept per cell and realm group
// Wild records only: no zoo animals (LIVING_SPECIMEN), museum specimens or fossils; recent years only
const FILTER = ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'OBSERVATION', 'MATERIAL_SAMPLE', 'OCCURRENCE']
  .map((b) => 'basisOfRecord=' + b).join('&') + '&occurrenceStatus=PRESENT&year=1990,2026';

const get = async (url) => {
  for (let i = 0; ; i++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 400 && /missing the expected layer/.test(await res.text())) return null; // no records there
    if (i === 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * (i + 1))); // GBIF is busy: back off
  }
};

async function taxonKey(name) {
  const d = await (await get('https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(name))).json();
  if (d.canonicalName !== name || d.status !== 'ACCEPTED') throw new Error(`no exact GBIF match for ${name}`);
  return d.usageKey;
}

// Record counts per GRID cell (index y * 360/GRID + x) for some taxa, from 8 zoom-1 tiles (EPSG:4326, 90° each)
async function counts(keys) {
  const out = new Map(), W = 360 / GRID;
  const q = keys.map((k) => 'taxonKey=' + k).join('&');
  for (let tx = 0; tx < 4; tx++) for (let ty = 0; ty < 2; ty++) {
    const url = `https://api.gbif.org/v2/map/occurrence/adhoc/1/${tx}/${ty}.mvt?srs=EPSG:4326&bin=square&squareSize=64&${q}&${FILTER}`;
    const res = await get(url);
    if (!res) continue;
    const layer = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer()))).layers.occurrence;
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i), ring = f.loadGeometry()[0];
      const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length, cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
      if (cx < 0 || cy < 0 || cx >= layer.extent || cy >= layer.extent) continue; // tile buffer: counted in its own tile
      const lng = -180 + 90 * (tx + cx / layer.extent), lat = 90 - 90 * (ty + cy / layer.extent);
      const idx = Math.floor((90 - lat) / GRID) * W + Math.floor((lng + 180) / GRID);
      out.set(idx, (out.get(idx) || 0) + f.properties.total);
    }
  }
  return out;
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE)) : {};
const scores = []; // per taxon: Map(cell -> score)
for (const [emoji, name, , sci] of TAXA) {
  const id = sci.join('|');
  cache[id] ??= [...await counts(await Promise.all(sci.map(taxonKey)))];
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  const c = new Map(cache[id]);
  // log scale against the taxon's own maximum: a well-sampled region doesn't hide the rest of the range
  const max = Math.log1p(Math.max(...c.values(), MIN_RECORDS));
  const kept = [...c].filter(([, n]) => n >= MIN_RECORDS);
  // ÷ √range: an animal found in few places beats one found everywhere (lion over songbird in the savanna)
  const s = new Map(kept.map(([k, n]) => [k, Math.log1p(n) / max / Math.sqrt(kept.length)]));
  scores.push(s);
  console.log(emoji, name.padEnd(16), String(s.size).padStart(5), 'cells');
}

// Per cell: best TOP taxa of each realm group (land, water + sea) as flat [index into `animals`, weight, ...];
// weight 1-10 = score against the group's best in that cell, for a weighted pick at runtime
const group = (realm) => (realm === 'land' ? 'land' : 'water');
const cells = {};
const all = new Set(scores.flatMap((s) => [...s.keys()]));
for (const idx of all) {
  const ranked = scores.map((s, i) => [i, s.get(idx) || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const keep = [];
  for (const g of ['land', 'water']) {
    const top = ranked.filter(([i]) => group(TAXA[i][2]) === g).slice(0, TOP);
    for (const [i, v] of top) keep.push(i, Math.max(1, Math.round(10 * v / top[0][1])));
  }
  cells[idx] = keep;
}
fs.writeFileSync(OUT, JSON.stringify({
  source: 'GBIF.org occurrence data via the GBIF maps API, wild records 1990-2026; see tools/animals',
  grid: GRID,
  animals: TAXA.map(([emoji, name, realm]) => [emoji, name, realm]),
  cells,
}));
console.log('cells', Object.keys(cells).length, 'bytes', fs.statSync(OUT).size);
