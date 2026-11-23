// --- Place labels (one letter per cell) -------------------------------------
// Zoom from which each OpenMapTiles place class gets a name
const PLACE_MINZOOM = { city: 5, town: 8, village: 11, suburb: 13, neighbourhood: 15 };
// Other named features, per tile layer and class, in label priority order (computeLabels). Lakes are left out: in towns they are mostly small fountains.
const NAME_MINZOOM = {
  water_name: { sea: 2, ocean: 1, bay: 5, strait: 5 },
  place: PLACE_MINZOOM,
  mountain_peak: { volcano: 9, peak: 11 },
};
const LABEL_CELLS = 500; // at most one label per this many grid cells (higher = fewer labels)
const LABEL_GAP = [2, 3]; // empty rows, cols kept around each label
const countryName = new Intl.DisplayNames(['en'], { type: 'region' }); // ISO alpha-2 -> English name, built in
// cellIndex -> [lngLat, zoom]: click on a place name (or its dot) flies there
let placeTargets = new Map();
const PLACE_ZOOM = { city: 12, town: 13, village: 14, suburb: 15, neighbourhood: 16 };

// Countries, for their name on hover and zoom on click at low zoom: Natural Earth 110m admin-0 (data/countries.json,
// iso = ISO_A2_EH), drawn once into an equirectangular image, colour = country index, so lng/lat -> country is one pixel read.
// ponytail: 110m leaves out micro-states (Andorra, Malta, Singapore...); swap in 50m data if they matter.
const COUNTRY_W = 2048, COUNTRY_H = 1024, COUNTRY_MAXZOOM = BIOME_MAXZOOM; // hover/click below this zoom
const lngX = (lng) => (lng + 180) / 360 * COUNTRY_W, latY = (lat) => (90 - lat) / 180 * COUNTRY_H;
// { iso, bbox: index -> ISO code, [w, s, e, n] of its biggest polygon; px: RGBA of the index image }
let countryIdx = null;
fetch('data/countries.json').then((r) => r.json()).then(({ features }) => {
  const g = new OffscreenCanvas(COUNTRY_W, COUNTRY_H).getContext('2d');
  const bbox = [null];
  features.forEach(({ geometry: { type, coordinates } }, i) => {
    // index in red, a check value in green: anti-aliased borders mix colours and fail the check
    g.fillStyle = `rgb(${i + 1},${(i + 1) * 97 & 255},0)`;
    g.beginPath();
    let best = null, bestArea = -1;
    for (const poly of type === 'Polygon' ? [coordinates] : coordinates) {
      for (const ring of poly) {
        ring.forEach(([lng, lat], k) => (k ? g.lineTo(lngX(lng), latY(lat)) : g.moveTo(lngX(lng), latY(lat))));
      }
      // ponytail: zoom target = bbox of the biggest polygon (France without Guiana); Russia/Fiji still span the antimeridian
      const lngs = poly[0].map((c) => c[0]), lats = poly[0].map((c) => c[1]);
      const b = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
      const area = (b[2] - b[0]) * (b[3] - b[1]);
      if (area > bestArea) { bestArea = area; best = b; }
    }
    g.fill('evenodd');
    bbox.push(best);
  });
  const iso = [null, ...features.map((f) => f.properties.iso)];
  countryIdx = { iso, bbox, px: g.getImageData(0, 0, COUNTRY_W, COUNTRY_H).data };
  map.triggerRepaint();
});
// Off the globe (space), unproject clamps to the globe's edge: a point is on the globe only if it projects back to itself
const onGlobe = (pt) => { const q = map.project(map.unproject(pt)); return Math.hypot(q.x - pt[0], q.y - pt[1]) < 1; };
// index of the country at ll, 0 on sea or a border pixel
const countryAt = (ll) => {
  const { px } = countryIdx;
  const x = ((Math.floor(lngX(ll.lng)) % COUNTRY_W) + COUNTRY_W) % COUNTRY_W;
  const y = Math.min(COUNTRY_H - 1, Math.max(0, Math.floor(latY(ll.lat))));
  const p = (y * COUNTRY_W + x) * 4, id = px[p];
  return id && px[p + 3] === 255 && px[p + 1] === (id * 97 & 255) ? id : 0;
};
const countriesOn = () => countryIdx && map.getZoom() < COUNTRY_MAXZOOM;
// name of the country under grid cell idx, for the hover label
const countryNameAtCell = (idx) => {
  if (!countriesOn() || idx < 0) return null;
  const pt = [cellX(idx % cols), cellY(Math.floor(idx / cols))];
  const id = onGlobe(pt) && countryAt(map.unproject(pt));
  return id ? countryName.of(countryIdx.iso[id]) : null;
};
// bilingual names come as "Pamplona / Iruña": keep the first
const placeName = (f) => (f.properties['name:latin'] || f.properties.name || '').split(' / ')[0].trim().toUpperCase();
// At low zoom (with the countries), the city dot (style.js 'city' layer) in grid cell idx: { name, center } or null
function cityAtCell(idx) {
  if (!countriesOn() || idx < 0) return null;
  const x = cellX(idx % cols), y = cellY(Math.floor(idx / cols)), h = cell / 2;
  const f = map.queryRenderedFeatures([[x - h, y - h], [x + h, y + h]], { layers: ['city'] })[0];
  return f && placeName(f) ? { name: placeName(f), center: f.geometry.coordinates } : null;
}
// Any zoom: the summit (style.js 'peak' layer, name with its height) or city/town/village ('placeHover') in grid
// cell idx: { name, center, zoom } (zoom: where a click flies, places only) or null
function featureAtCell(idx) {
  if (idx < 0) return null;
  const x = cellX(idx % cols), y = cellY(Math.floor(idx / cols)), h = cell / 2;
  const f = map.queryRenderedFeatures([[x - h, y - h], [x + h, y + h]], { layers: ['peak', 'placeHover'] })[0];
  const name = f && placeName(f);
  if (!name) return null;
  if (f.layer.id === 'peak') return { name: f.properties.ele ? `${name} ${f.properties.ele} M` : name };
  return { name, center: f.geometry.coordinates, zoom: Math.max(PLACE_ZOOM[f.properties.class], map.getZoom()) };
}
// click on a place name: fly there; else, at low zoom, on a city dot: fly to it, on a country: zoom to it
// (not while the search is open: that click closes it)
map.on('click', (e) => {
  if (searchOpen) return;
  const place = placeTargets.get(cellRow(e.point.y) * cols + cellCol(e.point.x));
  if (place) { map.flyTo({ center: place[0], zoom: place[1] }); return; }
  const town = featureAtCell(cellRow(e.point.y) * cols + cellCol(e.point.x));
  if (town?.zoom) { map.flyTo({ center: town.center, zoom: town.zoom }); return; }
  if (!countriesOn()) return;
  const city = cityAtCell(cellRow(e.point.y) * cols + cellCol(e.point.x));
  if (city) { map.flyTo({ center: city.center, zoom: PLACE_ZOOM.city }); return; }
  const id = onGlobe([e.point.x, e.point.y]) && countryAt(e.lngLat);
  if (id) map.fitBounds(countryIdx.bbox[id], { padding: 40, maxZoom: 7 });
});

// Returns Map(cellIndex -> 'l:' + letter). Names sit centered in the row above the place;
// most important first (tile rank), skipped if they would come within LABEL_GAP of an earlier label.
function computeLabels() {
  const labels = new Map();
  placeTargets = new Map();
  const z = map.getZoom(), center = map.getCenter();
  const taken = new Uint8Array(rows * cols);
  const seen = new Set();
  let budget = Math.max(1, Math.floor(rows * cols / LABEL_CELLS));
  // NAME_MINZOOM order = priority (seas, then places, then peaks), then rank within a layer: peak ranks restart at 1
  // in every tile, so a plain rank sort let hills crowd out suburb and neighbourhood names
  const feats = Object.entries(NAME_MINZOOM).flatMap(([layer, minZoom], li) =>
    map.querySourceFeatures('omt', { sourceLayer: layer }).filter((f) => z >= (minZoom[f.properties.class] ?? Infinity))
      .map((f) => Object.assign(f, { li })))
    .sort((a, b) => a.li - b.li || (a.properties.rank ?? 0) - (b.properties.rank ?? 0)); // seas have no rank: first
  for (const f of feats) {
    if (!budget) break;
    const name = placeName(f);
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
    const r = cellRow(p.y) - 1;
    const c0 = cellCol(p.x) - Math.floor(chars.length / 2);
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
    const zoom = PLACE_ZOOM[f.properties.class]; // place classes only (querySourceFeatures leaves sourceLayer unset)
    if (zoom) { // the whole name (spaces too) and the cell of the place itself, under it
      const target = [lngLat, Math.max(zoom, z)];
      for (let i = 0; i < chars.length; i++) placeTargets.set(r * cols + c0 + i, target);
      if (r + 1 < rows) placeTargets.set((r + 1) * cols + cellCol(p.x), target);
    }
  }
  return labels;
}

// Hover: the POI, city dot or country (low zoom), planet, Sun or Moon under the mouse spells its name on the grid, like a place name
let hoverIdx = -1, mouse = null; // map grid cell under the mouse; mouse point, to follow the grid as it slides
const hoverCell = () => (mouse ? cellRow(mouse.y) * cols + cellCol(mouse.x) : -1);
map.on('mousemove', (e) => {
  if (map.dragPan.isActive()) return; // no hover labels while dragging (cleared on dragstart)
  mouse = e.point;
  if (hoverCell() !== hoverIdx) map.triggerRepaint(); // draw() updates hoverIdx
});
map.on('mouseout', () => { mouse = null; map.triggerRepaint(); });
map.on('dragstart', () => { mouse = null; map.triggerRepaint(); });

// Map(cellIndex -> 'l:' + letter): name centred in the row above the hovered cell (below on the top row)
function hoverLabel(name) {
  const out = new Map();
  const row = Math.floor(hoverIdx / cols), r = row > 0 ? row - 1 : row + 1;
  const chars = [...name.toUpperCase()].slice(0, cols);
  const c0 = Math.max(0, Math.min(cols - chars.length, hoverIdx % cols - Math.floor(chars.length / 2)));
  chars.forEach((ch, i) => ch !== ' ' && out.set(r * cols + c0 + i, 'l:' + ch)); // spaces show the map
  return out;
}
