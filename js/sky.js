// --- Night side & stars (globe view only) -----------------------------------
const NIGHT_MAXZOOM = 6, NIGHT_FADE = 2; // night dimming fades out over zoom 4 -> 6
const NIGHT_OPACITY = 0.35; // opacity of the night side at full dimming
const RAD = Math.PI / 180;

const days2000 = (date) => date / 864e5 + 2440587.5 - 2451545; // days since J2000.0
const toVec = (ra, dec) => [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];

// Ecliptic -> equatorial (degrees)
function eclToEq(lon, lat, n) {
  const e = (23.439 - 4e-7 * n) * RAD, l = lon * RAD, b = lat * RAD;
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD,
    dec: Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD,
  };
}

// Sun position, low precision (~0.01°), from the Astronomical Almanac formula
function sunPos(date) {
  const n = days2000(date);
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lon = 280.460 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  return { lon, ...eclToEq(lon, 0, n) };
}

// Moon position (~1°) from the largest terms of the lunar theory, plus phase emoji.
// ponytail: treats the Moon as infinitely far (ignores ~1° parallax).
function moonPos(date) {
  const n = days2000(date);
  const L = 218.316 + 13.176396 * n, M = (134.963 + 13.064993 * n) * RAD;
  const F = (93.272 + 13.229350 * n) * RAD, D = (297.850 + 12.190749 * n) * RAD;
  const lon = L + 6.289 * Math.sin(M) - 1.274 * Math.sin(M - 2 * D) + 0.658 * Math.sin(2 * D);
  return eclToEq(lon, 5.128 * Math.sin(F), n);
}

// Planets: Keplerian elements at J2000 and their change per century, from E.M. Standish (JPL),
// "Approximate Positions of the Planets", table 1 (1800-2050, errors of arcminutes: far below a cell).
// [a AU, e, I°, L°, long. perihelion°, long. node°] and rates; the Earth row is the Earth-Moon barycentre.
const PLANETS = [
  ['☿️', 'Mercury', [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  ['⚪', 'Venus', [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  ['🔴', 'Mars', [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  ['🟠', 'Jupiter', [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  ['🪐', 'Saturn', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
];
const OUTER_PLANETS = [ // solar system view only (ui.js): too faint to show in the sky
  ['🟢', 'Uranus', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    [0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  ['🔵', 'Neptune', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.01262724]],
];
const EARTH = [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
  [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]];

// Heliocentric ecliptic position (AU) of a planet at T centuries since J2000
function helio([el, rate], T) {
  const [a, e, I, L, peri, node] = el.map((v, k) => v + rate[k] * T);
  const M = ((L - peri) % 360) * RAD, w = (peri - node) * RAD, O = node * RAD, i = I * RAD;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 5; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); // Kepler's equation
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E); // in the orbit plane
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [(cw * cO - sw * sO * ci) * x + (-sw * cO - cw * sO * ci) * y,
    (cw * sO + sw * cO * ci) * x + (-sw * sO + cw * cO * ci) * y,
    sw * si * x + cw * si * y];
}

// [x, y, z, emoji, dimmed, name] unit vectors (celestial frame, like starVecs) of the planets seen from Earth
function planetVecs(date) {
  const n = days2000(date), T = n / 36525, earth = helio(EARTH, T);
  const ob = (23.439 - 4e-7 * n) * RAD, ce = Math.cos(ob), se = Math.sin(ob);
  return PLANETS.map(([emoji, name, ...elements]) => {
    const [x, y, z] = helio(elements, T).map((v, k) => v - earth[k]); // geocentric ecliptic
    const q = [x, y * ce - z * se, y * se + z * ce], len = Math.hypot(...q); // -> equatorial
    return [q[0] / len, q[1] / len, q[2] / len, emoji, false, name];
  });
}

// Point on Earth where the sun is overhead right now
function subsolar(date = new Date()) {
  const { ra, dec } = sunPos(date);
  return { sinLat: Math.sin(dec * RAD), cosLat: Math.cos(dec * RAD), lng: ra - gmst(date) };
}

// Real stars: Yale/HYG bright stars (mag <= 5.5) via d3-celestial (BSD-3), as [ra°, dec°, mag, name?], brightest first;
// names: d3-celestial starnames.json (480 proper names, e.g. Sirius; others have none)
const starEmoji = (mag) => (mag < 1 ? '🌟' : mag < 3 ? '⭐' : '✨');
const STAR_BRIGHT = 2; // stars brighter than this magnitude are not dimmed

let starVecs = []; // [x, y, z, emoji, dimmed, name, mag] unit vectors in the celestial frame
fetch('data/stars.json').then((r) => r.json()).then((stars) => {
  starVecs = stars.map(([ra, dec, mag, name]) => [
    Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD), starEmoji(mag), mag >= STAR_BRIGHT, name, mag]);
  map.triggerRepaint();
});

// Greenwich mean sidereal time in degrees: turns Earth longitudes into right ascension
const gmst = (date) => (280.46061837 + 360.98564736629 * (date / 864e5 + 2440587.5 - 2451545)) % 360;

// Sun, Moon, planets and stars behind the globe as seen by the camera -> Map(cellIndex -> [emoji, dimmed, name?]).
// Camera sits above the map center looking at Earth's center; stars are at infinity,
// so only the camera's rotation matters (gnomonic projection with MapLibre's field of view).
// ponytail: ignores pitch; bearing handled.
// Sun and Moon are discs of normal-size cells. Sun: 🟡 core, 🔆 rim. Moon: 🌕 lit, 🌑 dimmed, lit side faces the Sun.
const SUN = 'sun', MOON = 'moon', DISC_RADIUS = 2;
// Moon radius in cells grows with zoom like the globe does (x2 per zoom level), DISC_RADIUS at MOON_ZOOM_REF
const MOON_ZOOM_REF = 1, MOON_MAX_RADIUS = 12;
function computeStars() {
  const stars = new Map();
  const now = new Date();
  const sun = sunPos(now), moon = moonPos(now);
  // Sun and Moon first so they win their cell over stars
  const bodies = [[...toVec(sun.ra, sun.dec), SUN, false], [...toVec(moon.ra, moon.dec), MOON, false]];
  const sunVec = toVec(sun.ra, sun.dec);
  const center = map.getCenter();
  const a = (center.lng + gmst(now)) * RAD, d = center.lat * RAD, b = map.getBearing() * RAD;
  const out = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; // camera position direction
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const right = east.map((v, i) => v * Math.cos(b) - north[i] * Math.sin(b));
  const up = north.map((v, i) => v * Math.cos(b) + east[i] * Math.sin(b));
  const f = (vh / 2) / Math.tan(((map.transform.fov ?? 36.87) * RAD) / 2);
  for (const [x, y, z, emoji, dimmed, name] of [...bodies, ...planetVecs(now), ...starVecs]) {
    const depth = -(x * out[0] + y * out[1] + z * out[2]); // along the view direction
    if (depth < 0.1) continue; // behind the camera
    const px = vw / 2 + f * (x * right[0] + y * right[1] + z * right[2]) / depth;
    const py = vh / 2 - f * (x * up[0] + y * up[1] + z * up[2]) / depth;
    const col = cellCol(px), r = cellRow(py);
    if (emoji === SUN || emoji === MOON) { // the globe covers discs since stars only fill space
      const rad = emoji === SUN ? DISC_RADIUS
        : Math.min(MOON_MAX_RADIUS, DISC_RADIUS * 2 ** (map.getZoom() - MOON_ZOOM_REF));
      const R = rad + 0.5, n = Math.ceil(rad);
      // Sun direction in screen axes (x right, y up, z toward the viewer = out)
      const s = [0, 1, 2].map((k) => [right, up, out][k].reduce((acc, v, i) => acc + v * sunVec[i], 0));
      for (let dr = -n; dr <= n; dr++) for (let dc = -n; dc <= n; dc++) {
        const d = Math.hypot(dr, dc), rr = r + dr, cc = col + dc;
        if (d > R || cc < 0 || cc >= cols || rr < 0 || rr >= rows) continue;
        if (emoji === SUN) { stars.set(rr * cols + cc, [d < DISC_RADIUS - 0.5 ? '🌞' : '🔆', false, 'Sun']); continue; }
        // point on the Moon's visible hemisphere under this cell, lit if its normal faces the Sun
        const nx = dc / R, ny = -dr / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lit = nx * s[0] + ny * s[1] + nz * s[2] > 0;
        stars.set(rr * cols + cc, [lit ? '🌚' : '🌚', !lit, 'Moon']);
      }
      continue;
    }
    if (col < 0 || col >= cols || r < 0 || r >= rows) continue;
    const idx = r * cols + col;
    if (!stars.has(idx)) stars.set(idx, [emoji, dimmed, name]); // brightest first keeps the cell
  }
  return stars;
}

// Sun below the horizon at lng/lat?
const isNight = (ll, sun) =>
  Math.sin(ll.lat * RAD) * sun.sinLat + Math.cos(ll.lat * RAD) * sun.cosLat * Math.cos((ll.lng - sun.lng) * RAD) < 0;

// --- ISS: real position from wheretheiss.at (no key, CORS open), polled every ISS_POLL ms and extrapolated between
// polls from the last two fixes. Drawn at its height above the globe (projectHeight).
// ponytail: linear extrapolation between polls; fixed 420 km height
const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544', ISS_POLL = 5000, ISS_NAME = 'International Space Station';
let issFix = []; // last two [time ms, lng, lat]
async function pollIss() {
  try {
    const d = await (await fetch(ISS_URL)).json();
    const fix = [d.timestamp * 1000, d.longitude, d.latitude], last = issFix[issFix.length - 1];
    if (!last || fix[0] > last[0]) issFix = [last, fix].filter(Boolean);
  } catch { /* offline or rate limited: keep extrapolating */ }
}
pollIss(); setInterval(pollIss, ISS_POLL);

// Screen position {x, y} of a point h km above lng/lat on the globe, or null when hidden behind the globe or the camera.
// Camera model of the MapLibre globe: it looks at the map centre (pitch ignored) from cameraToCenterDistance px above
// the surface, with the globe radius scaled so the centre matches Mercator (worldSize / 2π / cos(centre lat)).
const EARTH_KM = 6371;
function projectHeight(lng, lat, h) {
  const t = map.transform, c = map.getCenter(), b = map.getBearing() * RAD;
  const R = 512 * 2 ** map.getZoom() / (2 * Math.PI) / Math.cos(c.lat * RAD); // globe radius, px
  const D = t.cameraToCenterDistance; // camera above the centre point, px
  const vec = (lo, la) => [Math.cos(la * RAD) * Math.cos(lo * RAD), Math.cos(la * RAD) * Math.sin(lo * RAD), Math.sin(la * RAD)];
  const a = c.lng * RAD, d = c.lat * RAD;
  const out = vec(c.lng, c.lat), east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const right = east.map((v, i) => v * Math.cos(b) - north[i] * Math.sin(b));
  const up = north.map((v, i) => v * Math.cos(b) + east[i] * Math.sin(b));
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const u = vec(lng, lat), r = R * (1 + h / EARTH_KM);
  const x = r * dot(u, right), y = r * dot(u, up), z = r * dot(u, out); // from the Earth's centre, z toward the camera
  const cz = R + D, depth = cz - z; // camera on the z axis
  if (depth <= 1) return null; // behind the camera
  // hidden if the line camera -> point enters the globe before reaching the point
  const dx = x, dy = y, dz = z - cz, A = dx * dx + dy * dy + dz * dz, B = 2 * cz * dz, C = cz * cz - R * R;
  const disc = B * B - 4 * A * C;
  if (disc > 0 && (-B - Math.sqrt(disc)) / (2 * A) < 0.999) return null;
  return { x: vw / 2 + D * x / depth, y: vh / 2 - D * y / depth };
}

// Cell index of the ISS at its real height, or -1 (no data yet, hidden, off screen)
const ISS_KM = 420;
function issCell() {
  const last = issFix[issFix.length - 1];
  if (!last) return -1;
  let [, lng, lat] = last;
  if (issFix.length === 2) {
    const [[t0, x0, y0], [t1, x1, y1]] = issFix, f = Math.min(3, (Date.now() - t1) / (t1 - t0));
    let dx = x1 - x0; if (dx > 180) dx -= 360; else if (dx < -180) dx += 360; // across the antimeridian
    lng = ((x1 + dx * f) % 360 + 540) % 360 - 180; lat = Math.max(-52, Math.min(52, y1 + (y1 - y0) * f));
  }
  const p = projectHeight(lng, lat, ISS_KM);
  if (!p) return -1;
  const col = cellCol(p.x), r = cellRow(p.y);
  return col < 0 || col >= cols || r < 0 || r >= rows ? -1 : r * cols + col;
}
