// Well-mixed 32-bit hash of a grid cell (stable per cell, no visible row/column patterns)
function cellHash(col, r) {
  let h = Math.imul(col, 0x9e3779b1) ^ Math.imul(r + 0x7f4a7c15, 0x85ebca77);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

const ANIM_MS = 300, ANIM_PERIOD = 6; // redraw tick; wave cells re-roll every ANIM_PERIOD ticks (~2s)
// Waves: water cells within COAST_CELLS of land, from WAVE_MINZOOM; 🌊 comes and goes over time
const WAVE_MINZOOM = 5, COAST_CELLS = 1, WAVES = ['💦', '💦', '💦', '💦', '🌊']; // 1 in 5 wave cells shows 🌊
// From INTERP_MINZOOM the map position of a cell is interpolated (in Mercator) between exact positions
// every INTERP_STEP cells of a row; below it the globe curves too much and every cell is exact.
const INTERP_MINZOOM = 6, INTERP_STEP = 8;

// --- Per-frame pipeline ----------------------------------------------------
const WATER = classList.indexOf(CLASSES.water), LAKE = classList.indexOf(CLASSES.lake);
// cells agents may show on (not over buildings/water): thin lines often lose their cell to the area around
const classSet = (...names) => new Set(names.map((k) => classList.indexOf(CLASSES[k])));
const CAR_CELLS = classSet('road', 'highway', 'pavement');
const PEOPLE_CELLS = classSet('pavement', 'grass', 'ground', 'road');
// POI kind -> what it fills around itself: all touching cells of its `areas` (court, school/hospital grounds), and
// `near` cells (buildings) up to `max` steps from the POI or its area
// ponytail: school/hospital buildings filled up to FILL_MAX steps from the grounds (touching buildings render as one block)
const FILL_MAX = 3, BUILDINGS = classSet('house', 'building', 'tower');
const AREA_FILL = {
  sport: { areas: classSet('sport') },
  poiSchool: { areas: classSet('school'), near: BUILDINGS, max: FILL_MAX },
  poiHospital: { areas: classSet('hospital'), near: BUILDINGS, max: FILL_MAX },
};
// every other POI fills the real outline of the building it is in (none: just its cell), except street furniture and
// outdoor spots
const IN_BUILDING = 'building';
const EDGE_SAMPLES = [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]; // cell corners, for outline edges
const NO_FILL = new Set(['bus', 'parking', 'atm', 'toilets', 'drinking', 'bicycle', 'artwork', 'subway', 'playground',
  'attraction', 'fuel', 'pier', 'harbour', 'ferryTerminal', 'bin', 'recycling', 'info', 'phone', 'campsite', 'shelter',
  'picnic', 'dogPark', 'motoParking', 'bikeParking', 'gate']);
const fillRule = (kind) => AREA_FILL[kind] || (NO_FILL.has(kind) ? null : IN_BUILDING);

// Seasons by month and hemisphere, none in the tropics: share of eligible cells (by world hash) and what they show
const TREES = classSet('wood', 'forest', 'land', 'olive'), OPEN = classSet('grass', 'ground', 'farmland');
const SEASONS = {
  spring: { cells: new Set([...TREES, ...OPEN]), share: 0.05, emojis: ['🌸'] },
  autumn: { cells: TREES, share: 0.4, emojis: ['🍂', '🍁'] },
  winter: { cells: new Set([...TREES, ...OPEN]), share: 0.03, emojis: ['⛄', '☃️'], minLat: 40 },
};
const SEASON_CELLS = SEASONS.spring.cells;
const SEASON_OF_MONTH = ['winter', 'winter', 'spring', 'spring', 'spring', null, null, null, 'autumn', 'autumn', 'autumn', 'winter'];
// Boats placed (not moving) on lakes/rivers and on the sea next to the coast: share of those cells
const PLACED_BOATS = { lake: ['⛵', '🚣'], coast: ['🚤', '⛵'] }, PLACED_BOAT_SHARE = 0.008;

// Turns the latest map pixels (readback.js) into emoji cells and paints the changed rows
function draw() {
  if (!pixels) return;
  const labels = computeLabels();
  const ui = computeUi();
  const w = pixW, h = pixH;

  const sx = w / innerWidth, sy = h / innerHeight; // map px per CSS px (1 with pixelRatio 1)
  const sun = map.getZoom() < NIGHT_MAXZOOM ? subsolar() : null;
  // night opacity goes from NIGHT_OPACITY to 1 across the fade, applied to every .n span via a CSS variable
  const nightFade = Math.min(1, Math.max(0, (NIGHT_MAXZOOM - map.getZoom()) / NIGHT_FADE));
  const nightOpacity = 1 - (1 - NIGHT_OPACITY) * nightFade;
  const starCells = sun ? computeStars() : null;
  // like a MapLibre ['interpolate', ['linear'], ['zoom'], 6, 1, 8, 0] opacity, done here since clouds aren't a map layer
  const cloudFade = Math.min(1, Math.max(0, (CLOUD_MAXZOOM - map.getZoom()) / CLOUD_FADE));
  const cloudy = clouds && cloudFade > 0;
  // same fade for biomes: share of biome cells kept (the rest show plain ground)
  const biomeFade = Math.min(1, Math.max(0, (BIOME_MAXZOOM + BIOME_FADE - map.getZoom()) / BIOME_FADE));
  const ground = CLASSES.ground.variants;
  // world grid about one emoji wide at the current integer zoom: random choices stick to places, not screen cells
  // ceil: world cells never bigger than screen cells, so neighbours don't share a value (no twin columns)
  const worldCells = 512 * 2 ** Math.ceil(map.getZoom()) / cell;
  const tick = Date.now() / ANIM_MS;
  const poiCells = map.getZoom() >= SPORT_MINZOOM ? computePois() : null;
  const animalsOn = animals && map.getZoom() >= ANIMAL_MINZOOM && map.getZoom() <= ANIMAL_MAXZOOM;
  const carCells = map.getZoom() >= CAR_MINZOOM ? computeCars() : null;
  const boatCells = map.getZoom() >= BOAT_MINZOOM ? computeBoats() : null;
  const trainCells = map.getZoom() >= TRAIN_MINZOOM ? computeTrains() : null;
  const peopleCells = map.getZoom() >= PEOPLE_MINZOOM ? computePeople() : null;
  const waves = map.getZoom() >= WAVE_MINZOOM;
  // any land (known non-water class) at the centres of the cells within COAST_CELLS?
  const near = (col, r, test) => {
    for (let dr = -COAST_CELLS; dr <= COAST_CELLS; dr++) for (let dc = -COAST_CELLS; dc <= COAST_CELLS; dc++) {
      const x = Math.floor((col + dc + 0.5) * cell * sx), y = Math.floor((r + dr + 0.5) * cell * sy);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const p = ((h - 1 - y) * w + x) * 4;
      if (pixels[p + 3] !== 255) continue;
      const i = classAt(pixels, p);
      if (i >= 0 && test(i)) return true;
    }
    return false;
  };
  const nearLand = (col, r) => near(col, r, (i) => i !== WATER && i !== LAKE);
  // pier ends: only the tip (next to water) shows 🎣
  if (poiCells) for (const [idx, [, , kind]] of poiCells) {
    if (kind === 'pier' && !near(idx % cols, Math.floor(idx / cols), (i) => i === WATER || i === LAKE)) poiCells.delete(idx);
  }
  const month = new Date().getMonth();
  const placedBoats = map.getZoom() >= BOAT_MINZOOM;
  const step = map.getZoom() >= INTERP_MINZOOM ? INTERP_STEP : 1;
  const needLL = !!(sun || cloudy);
  // cloud opacity 0..100 for a cell at ll, dithered by its world hash
  const cloudOpacity = (ll, hash) => {
    const a = cloudAt(ll);
    // dither: cloud cover above CLOUD_MIN is also the chance this cell gets a ☁️ at all
    if (a < CLOUD_MIN || ((hash >>> 8) & 1023) / 1024 >= (a - CLOUD_MIN) / (255 - CLOUD_MIN) + 0.15) return 0;
    const level = Math.min(CLOUD_LEVELS, Math.floor((a - CLOUD_MIN) / (256 - CLOUD_MIN) * CLOUD_LEVELS) + 1);
    return Math.round(level / CLOUD_LEVELS * cloudFade * (sun && isNight(ll, sun) ? nightOpacity : 1) * 100);
  };
  // class index of the grid cell (most hidden-map pixels, weighted by priority), -1 = space
  const bestClass = (col, r) => {
    const x0 = Math.floor(col * cell * sx), x1 = Math.floor((col + 1) * cell * sx);
    const y0 = Math.floor(r * cell * sy), y1 = Math.floor((r + 1) * cell * sy);
    let nTouched = 0;
    for (let y = y0; y < y1; y += SAMPLE_STEP) {
      const row = (h - 1 - y) * w; // GL origin is bottom-left
      for (let x = x0; x < x1; x += SAMPLE_STEP) {
        const p = (row + x) * 4;
        if (pixels[p + 3] !== 255) continue; // outside the globe
        const i = classAt(pixels, p);
        if (i < 0) continue; // blended edge, ignored
        if (counts[i]++ === 0) touched[nTouched++] = i;
      }
    }
    let best = -1, bestScore = 0;
    for (let t = 0; t < nTouched; t++) { // only classes present in this cell; reset them for the next one
      const i = touched[t], score = counts[i] * classList[i].priority;
      counts[i] = 0;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  };
  // areas take the emoji of the POI inside them (AREA_FILL): flood fill over touching cells of the POI's area
  // classes from every POI at once, so touching areas split between their POIs (nearest wins)
  const areaFill = new Map(); // idx -> [emoji, fill rule, steps from the POI or its area, POI name]
  if (poiCells) {
    const queue = [], owners = new Map(); // building rings -> [[col, row, emoji, name]] of the POIs in it
    for (const [idx, [emoji, name, kind, buildings]] of poiCells) {
      const rule = fillRule(kind);
      if (!rule) continue;
      areaFill.set(idx, [emoji, rule, 0, name]);
      if (rule !== IN_BUILDING) { queue.push(idx); continue; }
      for (const building of buildings || []) {
        if (!owners.has(building)) owners.set(building, []);
        owners.get(building).push([idx % cols + 0.5, Math.floor(idx / cols) + 0.5, emoji, name]);
      }
    }
    // each building's cells: inside its outline (projected to cell units), shared by the POIs in it (nearest wins)
    for (const [building, pois] of owners) {
      const pr = building.map((ring) => ring.map((ll) => { const p = map.project(ll); return [p.x / cell, p.y / cell]; }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pr[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      for (let r = Math.max(0, Math.floor(y0)); r <= Math.min(rows - 1, Math.floor(y1)); r++) {
        for (let c = Math.max(0, Math.floor(x0)); c <= Math.min(cols - 1, Math.floor(x1)); c++) {
          const n = r * cols + c;
          if (areaFill.has(n)) continue;
          // centre inside, or an edge cell drawn as building that the outline touches (else it shows a stray 🏠)
          if (!inside(c + 0.5, r + 0.5, pr) && !(EDGE_SAMPLES.some(([dx, dy]) => inside(c + dx, r + dy, pr))
            && BUILDINGS.has(bestClass(c, r)))) continue;
          let best = pois[0], bestD = Infinity;
          for (const o of pois) { const d = (o[0] - c - 0.5) ** 2 + (o[1] - r - 0.5) ** 2; if (d < bestD) { bestD = d; best = o; } }
          areaFill.set(n, [best[2], IN_BUILDING, 0, best[3]]);
        }
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const idx = queue[q], col = idx % cols, r = (idx - col) / cols, [emoji, rule, d, name] = areaFill.get(idx);
      for (const [c, rr] of [[col + 1, r], [col - 1, r], [col, r + 1], [col, r - 1]]) {
        const n = rr * cols + c;
        if (c < 0 || c >= cols || rr < 0 || rr >= rows || areaFill.has(n)) continue;
        const k = bestClass(c, rr), dn = rule.areas.has(k) ? 0 : rule.near?.has(k) && d < rule.max ? d + 1 : -1;
        if (dn < 0) continue;
        areaFill.set(n, [emoji, rule, dn, name]); queue.push(n);
      }
    }
  }
  const iss = issCell();
  // name of the ISS, POI (or the area it fills), flag or sky body under the mouse, spelled on the grid
  const hoverName = (iss >= 0 && hoverIdx === iss && ISS_NAME) || (poiCells && poiCells.get(hoverIdx)?.[1]) || areaFill.get(hoverIdx)?.[3] || flagNames.get(hoverIdx)
    || (starCells && starCells.get(hoverIdx)?.[2]);
  const hoverCells = hoverName ? hoverLabel(hoverName) : null;
  const anchorX = new Float64Array(Math.ceil(cols / step) + 2), anchorY = new Float64Array(anchorX.length);

  for (let r = 0; r < rows; r++) {
    // exact Mercator positions every `step` cells (and the last cell) of this row
    if (step > 1) for (let k = 0; k * step < cols + step; k++) {
      const c = Math.min(k * step, cols - 1);
      const m = maplibregl.MercatorCoordinate.fromLngLat(map.unproject([(c + 0.5) * cell, (r + 0.5) * cell]));
      anchorX[k] = m.x; anchorY[k] = m.y;
    }
    for (let col = 0; col < cols; col++) {
      const idx = r * cols + col;
      const u = ui.get(idx);
      if (u !== undefined) { cells[idx] = u ? glyphId(u) : 0; continue; } // controls (ui.js)
      const label = (hoverCells && hoverCells.get(idx)) || labels.get(idx);
      if (label) {
        // flags (not letters) dim on the night side like the ground under them
        const flagNight = !!sun && !label.startsWith('l:') && isNight(map.unproject([(col + 0.5) * cell, (r + 0.5) * cell]), sun);
        cells[idx] = glyphId(label) | (flagNight ? DIM : 0); continue;
      }
      if (idx === iss) { cells[idx] = glyphId('🛰️'); continue; } // over land, sea and space alike
      const poi = poiCells && poiCells.get(idx);
      if (poi) { cells[idx] = glyphId(poi[0]); continue; } // over whatever area is under it
      const best = bestClass(col, r);
      if (best < 0) {
        const star = starCells && starCells.get(idx); // space
        cells[idx] = star ? glyphId(star[0]) | (star[1] ? DIM : 0) : 0;
        continue;
      }
      let mx, my, ll = null;
      if (step === 1) {
        ll = map.unproject([(col + 0.5) * cell, (r + 0.5) * cell]);
        const m = maplibregl.MercatorCoordinate.fromLngLat(ll);
        mx = m.x; my = m.y;
      } else {
        const k = Math.floor(col / step), c0 = k * step, c1 = Math.min(c0 + step, cols - 1);
        const t = c1 > c0 ? (col - c0) / (c1 - c0) : 0;
        let dx = anchorX[k + 1] - anchorX[k];
        if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1; // across the antimeridian
        mx = anchorX[k] + dx * t; my = anchorY[k] + (anchorY[k + 1] - anchorY[k]) * t;
        if (needLL) ll = new maplibregl.MercatorCoordinate(((mx % 1) + 1) % 1, my).toLngLat();
      }
      const hash = cellHash(Math.floor(mx * worldCells), Math.floor(my * worldCells));
      const cls = classList[best];
      const fadedOut = cls.biome && ((hash >>> 18) & 1023) / 1024 >= biomeFade;
      const v = fadedOut ? ground : cls.variants;
      let emoji = (v.length === 1 ? v[0] : v[hash % v.length]) || '';
      emoji = areaFill.get(idx)?.[0] || emoji;
      if (SEASON_CELLS.has(best)) {
        const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) / RAD;
        const s = Math.abs(lat) >= 23.5 && SEASONS[SEASON_OF_MONTH[lat < 0 ? (month + 6) % 12 : month]];
        if (s && Math.abs(lat) >= (s.minLat || 0) && ((hash >>> 4) & 1023) / 1024 < s.share) {
          emoji = s.emojis[cellHash(hash, 5) % s.emojis.length];
        }
      }
      const animal = animalsOn && animalAt(best, hash, mx, my);
      if (animal) emoji = animal[0];
      if (peopleCells && PEOPLE_CELLS.has(best)) emoji = peopleCells.get(idx) || emoji;
      if (carCells && CAR_CELLS.has(best)) emoji = carCells.get(idx) || emoji; // a car wins over a walker
      const coast = waves && best === WATER && nearLand(col, r);
      if (coast) {
        // re-roll every ~ANIM_PERIOD ticks, each cell at its own moment
        emoji = WAVES[cellHash(hash, Math.floor(tick / ANIM_PERIOD + (hash & 255) / 256)) % WAVES.length];
      }
      if (placedBoats && (coast || best === LAKE) && cellHash(hash, 21) % 1000 < PLACED_BOAT_SHARE * 1000) {
        const b = PLACED_BOATS[coast ? 'coast' : 'lake'];
        emoji = b[cellHash(hash, 22) % b.length];
      }
      if (boatCells && (best === WATER || best === LAKE)) emoji = boatCells.get(idx) || emoji; // a boat wins over a wave
      // any land cell: thin rail lines lose most of their cells to the houses or fields around them
      if (trainCells && best !== WATER && best !== LAKE) emoji = trainCells.get(idx) || emoji;
      const night = !!sun && isNight(ll, sun);
      const op = cloudy && cls.priority < 5 ? cloudOpacity(ll, hash) : 0; // no clouds over city dots/POIs
      cells[idx] = glyphId(emoji) | (night ? DIM : 0) | op << CLOUD_SHIFT;
    }
  }
  paintGrid(nightOpacity);
}

// --- Wiring ----------------------------------------------------------------
setInterval(() => map.triggerRepaint(), ANIM_MS); // animation + time-based things (night line, clouds)
let frames = 0, last = performance.now();
const readMap = createReadback(() => {
  draw();
  frames++;
  const now = performance.now();
  if (now - last > 1000 && fpsEl) { fpsEl.textContent = 'FPS: ' + Math.round(frames * 1000 / (now - last)); frames = 0; last = now; }
});
map.on('render', readMap); // start a read after each map frame; draw() runs when the pixels arrive
const layout = () => { layoutGrid(); layoutUi(); };
map.on('resize', layout);
layout();
