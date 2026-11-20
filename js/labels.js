// --- Place labels (one letter per cell) -------------------------------------
// Zoom from which each OpenMapTiles place class gets a name
// From FLAG_MINZOOM to FLAG_MAXZOOM capitals show their country's flag instead of city names
const FLAG_MINZOOM = 3, FLAG_MAXZOOM = 5;
const PLACE_MINZOOM = { city: FLAG_MAXZOOM, town: 8, village: 11, suburb: 13, neighbourhood: 15 };
// Other named features, per tile layer and class. Lakes are left out: in towns they are mostly small fountains.
const NAME_MINZOOM = {
  place: PLACE_MINZOOM,
  water_name: { sea: 2, ocean: 1, bay: 5, strait: 5 },
  mountain_peak: { volcano: 9, peak: 11 },
};
const LABEL_CELLS = 500; // at most one label per this many grid cells (higher = fewer labels)
const LABEL_GAP = [2, 3]; // empty rows, cols kept around each label
// Natural Earth admin-0 capitals as [lng, lat, ISO alpha-2], most populous first
let capitals = [];
fetch('data/capitals.json').then((r) => r.json()).then((c) => { capitals = c; map.triggerRepaint(); });
// ISO alpha-2 -> flag emoji (pair of regional indicator letters)
const flag = (iso) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
const countryName = new Intl.DisplayNames(['en'], { type: 'region' }); // ISO alpha-2 -> English name, built in
let flagNames = new Map(); // cellIndex -> country name of the flag there, for hover

// Returns Map(cellIndex -> glyph key: flag emoji or 'l:' + letter). Names sit centered in the row above the place;
// most important first (tile rank), skipped if they would come within LABEL_GAP of an earlier label.
function computeLabels() {
  const labels = new Map();
  flagNames = new Map();
  const z = map.getZoom(), center = map.getCenter();
  const taken = new Uint8Array(rows * cols);
  const seen = new Set();
  let budget = Math.max(1, Math.floor(rows * cols / LABEL_CELLS));
  if (z >= FLAG_MINZOOM && z < FLAG_MAXZOOM) {
    for (const [lng, lat, iso] of capitals) {
      if (center.distanceTo(new maplibregl.LngLat(lng, lat)) > 8e6) continue; // back of the globe
      const p = map.project([lng, lat]);
      const r = Math.floor(p.y / cell), c = Math.floor(p.x / cell);
      if (r < 0 || r >= rows || c < 0 || c >= cols || labels.has(r * cols + c)) continue; // bigger capital keeps the cell
      labels.set(r * cols + c, flag(iso)); taken[r * cols + c] = 1; // names keep off flags
      flagNames.set(r * cols + c, countryName.of(iso));
    }
  }
  const feats = Object.entries(NAME_MINZOOM).flatMap(([layer, minZoom]) =>
    map.querySourceFeatures('omt', { sourceLayer: layer }).filter((f) => z >= (minZoom[f.properties.class] ?? Infinity)))
    .sort((a, b) => (a.properties.rank ?? 0) - (b.properties.rank ?? 0)); // seas have no rank: first
  for (const f of feats) {
    if (!budget) break;
    // bilingual names come as "Pamplona / Iruña": keep the first
    const name = (f.properties['name:latin'] || f.properties.name || '').split(' / ')[0].trim().toUpperCase();
    if (!name || seen.has(name)) continue; // same place comes from several tiles
    seen.add(name);
    // anchor: the point, or the middle vertex of a (multi)line (some seas and bays are lines)
    const g = f.geometry, line = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates[0] : null;
    const lngLat = line ? line[Math.floor(line.length / 2)] : g.coordinates;
    if (typeof lngLat[0] !== 'number') continue; // polygon names (rare): no anchor point, skipped
    // back side of the globe (projects onto the visible side otherwise)
    if (center.distanceTo(new maplibregl.LngLat(lngLat[0], lngLat[1])) > 8e6) continue;
    const p = map.project(lngLat);
    const chars = [...name];
    const r = Math.floor(p.y / cell) - 1;
    const c0 = Math.floor(p.x / cell) - Math.floor(chars.length / 2);
    if (r < 0 || r >= rows || c0 < 0 || c0 + chars.length > cols) continue;
    let free = true;
    for (let c = c0; c < c0 + chars.length && free; c++) free = !taken[r * cols + c];
    if (!free) continue;
    // reserve the label plus a margin so labels keep apart
    const [gr, gc] = LABEL_GAP;
    for (let rr = Math.max(0, r - gr); rr <= Math.min(rows - 1, r + gr); rr++)
      for (let c = Math.max(0, c0 - gc); c <= Math.min(cols - 1, c0 + chars.length - 1 + gc); c++) taken[rr * cols + c] = 1;
    budget--;
    chars.forEach((ch, i) => ch !== ' ' && labels.set(r * cols + c0 + i, 'l:' + ch)); // spaces show the map
  }
  return labels;
}

// Hover: the POI, flag, planet, Sun or Moon under the mouse spells its name on the grid, like a place name
let hoverIdx = -1;
map.on('mousemove', (e) => {
  const i = Math.floor(e.point.y / cell) * cols + Math.floor(e.point.x / cell);
  if (i !== hoverIdx) { hoverIdx = i; map.triggerRepaint(); }
});
map.on('mouseout', () => { hoverIdx = -1; map.triggerRepaint(); });

// Map(cellIndex -> 'l:' + letter): name centred in the row above the hovered cell (below on the top row)
function hoverLabel(name) {
  const out = new Map();
  const row = Math.floor(hoverIdx / cols), r = row > 0 ? row - 1 : row + 1;
  const chars = [...name.toUpperCase()].slice(0, cols);
  const c0 = Math.max(0, Math.min(cols - chars.length, hoverIdx % cols - Math.floor(chars.length / 2)));
  chars.forEach((ch, i) => ch !== ' ' && out.set(r * cols + c0 + i, 'l:' + ch)); // spaces show the map
  return out;
}
