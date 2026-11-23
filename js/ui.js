// --- Place search, drawn on the emoji grid ----------------------------------------------------
// Typing anywhere opens it in the middle of the screen. The grid shows it as letter cells (like place labels);
// an invisible real <input> sits over the same cells and takes the typing (and screen readers).
// Search: Photon (photon.komoot.io, OpenStreetMap data), which allows search-as-you-type (Nominatim does not).
const SEARCH_URL = 'https://photon.komoot.io/api/';
const SEARCH_MAX = 30, SEARCH_RESULTS = 5, SEARCH_DELAY = 300; // max text cells, suggestions, ms after last key

let searchOpen = false, query = '', results = [], sel = 0, reqId = 0, timer = 0;

const searchInput = document.body.appendChild(Object.assign(document.createElement('input'), {
  className: 'ctl', type: 'text', hidden: true, autocomplete: 'off', spellcheck: false,
}));
searchInput.setAttribute('aria-label', 'Search places');

// Text box: columns [x0, x1] centred, query on `row`, suggestions from row + 2; x0 - 1 holds the 👉 of the selection
function searchBox() {
  const W = Math.min(SEARCH_MAX, scols - 4), x0 = Math.floor((scols - W) / 2);
  return { x0, x1: x0 + W - 1, row: Math.max(0, Math.floor(srows / 2) - 3) };
}

// --- Toggles, bottom right: one emoji cell each (dimmed = off), invisible buttons over them ------------------
const toggles = { labels: false }; // read by draw(); labels start off
// [key, emoji, label, action shown on hover when on, when off, emoji when off (default: emoji dimmed)]
const TOGGLES = [['labels', '🔤', 'Labels', 'HIDE LABELS', 'SHOW LABELS'],
  ['sound', '🔊', 'Ambient sound', 'MUTE', 'SOUND ON', '🔇'], // off by default, not saved (sound.js)
  ['search', '🔍', 'Search', 'CLOSE SEARCH', 'SEARCH'],
  ['locate', '🎯', 'Face my location', '', 'FACE MY LOCATION', '🎯'], // locate: an action, never "on"
  ['print', '🖨️', 'Save poster PDF', 'CLOSE POSTER', 'SAVE POSTER PDF', '🖨️']]; // ⏳ while saving (computeUi)
let soundOn = false; // set by toggleSound (sound.js)
let hoverToggle = -1; // index of the toggle under the mouse (or focused): its action is spelled to its left
const isOn = (k) => (k === 'search' ? searchOpen : k === 'print' ? printOpen : k === 'sound' ? soundOn : !!toggles[k]);
// Turn the globe to the user, zoomed in to at least LOCATE_ZOOM. Browser asks permission on first click;
// denied/unavailable = nothing happens.
const LOCATE_ZOOM = 12;
const locate = () => navigator.geolocation?.getCurrentPosition(({ coords }) => {
  closeSolar(false);
  // flyTo: duration grows with the zoom change and distance travelled (MapLibre's speed/curve), capped
  map.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), LOCATE_ZOOM), maxDuration: 5000 });
},
  () => {}, { maximumAge: 3600e3, timeout: 10e3 });
// --- Poster: the current view, deeper by the paper's zoom, saved as a PDF ------------------------------------------
// 🖨️ opens a card (drawn like the search) with three radio groups and a save row; invisible buttons sit over them.
// The hidden map is resized to the poster and zoomed in, the grid follows (layoutGrid reads the map size), and once
// everything has loaded the grid cells go into the PDF: each distinct emoji embedded once as a PDF_GLYPH_PX image,
// placed in every cell that shows it. Sharp at any print size, no poster-sized canvas to hit browser limits.
// ponytail: ~300k placements on A2; Preview/Chrome can't draw a thumbnail of it (printing is fine). JPEG strips fixed
// that but looked worse: rejected.
// A horizontal poster holds the whole viewport x 2^POSTER_ZOOM per side, grown to the paper's √2 aspect; a vertical one
// prints emojis at the same size (printPoster). Half a level per A-size would keep emojis the same size across sizes.
const POSTER_ZOOM = { a4: 1, a3: 1.5, a2: 2 }; // for horizontal posters; vertical ones match their emoji size
const PAPER_MM = { a4: [210, 297], a3: [297, 420], a2: [420, 594] }; // short, long side
const PDF_GLYPH_PX = 96; // px per emoji image in the PDF (~1600 ppi at 1.5 mm); bigger = sharper, bigger file
const poster = { size: 'a3', landscape: false }; // card choices
// [poster key, group title, [[value, text]]]
const POSTER_OPTS = [['size', 'SIZE', [['a4', 'A4'], ['a3', 'A3'], ['a2', 'A2']]],
  ['landscape', 'ORIENTATION', [[false, 'VERTICAL'], [true, 'HORIZONTAL']]]];
// Card cells: title, then per group a title row and an options row (radio cell, space, text; 2 cells apart), then
// save. items: one per button, in tab order: [row, first col, cells, poster key or null = save, value, aria label]
const POSTER_CARD_ROWS = 5 + 3 * POSTER_OPTS.length; // blank, title, blank, groups (title, options, blank), save, blank
function printCard() {
  const { x0, x1 } = searchBox(), row = Math.max(1, Math.floor((srows - POSTER_CARD_ROWS) / 2) + 1), items = [];
  POSTER_OPTS.forEach(([key, title, opts], g) => {
    let c = x0;
    for (const [value, text] of opts) {
      items.push([row + 3 + 3 * g, c, 2 + text.length, key, value, `${title} ${text}`.toLowerCase()]);
      c += 2 + text.length + 2;
    }
  });
  items.push([row + 2 + 3 * POSTER_OPTS.length, x0, 'SAVE PDF'.length, null, null, 'Save poster PDF']);
  return { x0, x1, row, items };
}
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let printing = false, printOpen = false, printSel = -1; // printSel: focused item (👉 on its row)
const loadScript = (src) => new Promise((ok, fail) => document.head.appendChild(
  Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail })));

const printBtns = printCard().items.map((_, i) => {
  const b = document.body.appendChild(Object.assign(document.createElement('button'), { className: 'ctl', hidden: true }));
  const sel = (on) => () => { printSel = on ? i : -1; map.triggerRepaint(); };
  b.addEventListener('focus', sel(true)); b.addEventListener('blur', sel(false));
  b.addEventListener('click', () => {
    const [, , , key, value] = printCard().items[i];
    if (key === null) { closePrint(); printPoster(); return; }
    poster[key] = value; map.triggerRepaint();
  });
  b.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePrint(); });
  return b;
});
function openPrint() {
  if (printing) return;
  closeSearch();
  printOpen = true; printBtns.forEach((b) => { b.hidden = false; }); layoutUi(); printBtns.at(-1).focus(); // save
  map.triggerRepaint();
}
function closePrint() {
  printOpen = false; printBtns.forEach((b) => { b.hidden = true; });
  map.triggerRepaint();
}

async function printPoster() {
  const { size, landscape } = poster;
  if (printing) return;
  printing = true;
  const view = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  // Scale (mm per CSS px) from the horizontal poster: the whole viewport x 2^POSTER_ZOOM, grown to the paper's aspect.
  // Both orientations use it (same emoji size on paper); the poster is the paper in CSS px, zoomed in as far as it can
  // while still holding the whole viewport (vertical on a wide screen: half a level less), centred.
  const [short, long] = PAPER_MM[size], k = 2 ** POSTER_ZOOM[size];
  const mmPx = long / Math.max(innerWidth * k, innerHeight * k * Math.SQRT2);
  const w = Math.round((landscape ? long : short) / mmPx), h = Math.round((landscape ? short : long) / mmPx);
  const zoom = Math.log2(Math.min(w / innerWidth, h / innerHeight));
  const el = map.getContainer();
  try {
    const pdfLib = window.jspdf ? Promise.resolve() : loadScript(JSPDF_URL); // first click only, meanwhile render
    Object.assign(el.style, { width: w + 'px', height: h + 'px' });
    map.resize(); // fires layout(): grid sized to the poster
    map.jumpTo({ ...view, zoom: view.zoom + zoom });
    await map.once('idle'); // tiles loaded; the readback of that last frame already ran draw()
    await pdfLib;
    const { jsPDF, GState } = window.jspdf;
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: size, compress: true });
    const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight(), mm = pageW / w;
    pdf.setFillColor(0); pdf.rect(0, 0, pageW, pageH, 'F');
    const keys = []; glyphIds.forEach((id, key) => { keys[id] = key; });
    const pngs = new Map(), states = new Map(), s = (cell + 2 * glyphPad) * mm; // glyph id -> PNG bytes (binary string)
    let opacity = 1;
    const place = (id, x, y, a) => {
      if (a !== opacity) { // GStates shared per opacity
        opacity = a;
        if (!states.has(a)) states.set(a, new GState({ opacity: a }));
        pdf.setGState(states.get(a));
      }
      // PNG bytes, not the canvas: jsPDF converts a canvas before looking up the alias, i.e. once per cell. With bytes
      // and the alias, every placement after the first reuses the one embedded image.
      if (!pngs.has(id)) {
        const screenDpr = dpr;
        dpr = PDF_GLYPH_PX / cell; const img = renderGlyph(keys[id]); dpr = screenDpr; // hi-res copy, not cached (map.js)
        pngs.set(id, atob(img.toDataURL('image/png').split(',')[1]));
      }
      pdf.addImage(pngs.get(id), 'PNG', x, y, s, s, 'g' + id);
    };
    // same cell decoding as paintGrid (map.js); lastNight = night opacity of the last paint; the page crops overflow
    for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
      const v = cells[i], g = v & 0xffff, cloud = v >>> CLOUD_SHIFT;
      const x = (c * cell + gridOX - glyphPad) * mm, y = (r * cell + gridOY - glyphPad) * mm; // glyphs overlap (map.js)
      if (g) place(g, x, y, v & DIM ? lastNight : 1);
      if (cloud) place(cloudGlyph, x, y, cloud / 100);
    }
    pdf.save(`emoji-world-${size}-${landscape ? 'horizontal' : 'vertical'}.pdf`);
  } catch (e) {
    console.error(e); alert('Could not save the poster PDF: ' + (e?.message || e?.type || e));
  } finally {
    el.style.width = el.style.height = '';
    printing = false;
    map.resize(); map.jumpTo(view); map.triggerRepaint();
  }
}

// Saved in the URL hash as hide=labels (the ones off), next to MapLibre's map=zoom/lat/lng
const TOGGLES_KEY = 'hide=';
const hashParts = () => location.hash.slice(1).split('&').filter((p) => p.includes('=') && !p.startsWith(TOGGLES_KEY) && !p.startsWith('toggles=') && !p.startsWith('t=')); // toggles=, t=: old formats
const savedToggles = location.hash.slice(1).split('&').find((p) => p.startsWith(TOGGLES_KEY));
if (savedToggles) { const off = savedToggles.slice(TOGGLES_KEY.length).split(','); for (const k in toggles) toggles[k] = !off.includes(k); }
const saveToggles = () => history.replaceState(history.state, '',
  '#' + [...hashParts(), TOGGLES_KEY + Object.keys(toggles).filter((k) => !toggles[k]).join(',')].join('&'));
const toggleBtns = TOGGLES.map(([k, , label], i) => {
  const b = document.body.appendChild(Object.assign(document.createElement('button'), { className: 'ctl' }));
  b.setAttribute('aria-label', label);
  const hover = (on) => () => { hoverToggle = on ? i : -1; map.triggerRepaint(); };
  b.addEventListener('pointerenter', hover(true)); b.addEventListener('focus', hover(true));
  b.addEventListener('pointerleave', hover(false)); b.addEventListener('blur', hover(false));
  b.addEventListener('click', () => {
    if (k === 'search') { if (searchOpen) closeSearch(); else openSearch(); return; }
    if (k === 'locate') { locate(); return; }
    if (k === 'sound') { toggleSound(); return; }
    if (k === 'print') { if (printOpen) closePrint(); else openPrint(); return; }
    toggles[k] = !toggles[k]; saveToggles(); map.triggerRepaint();
  });
  return b;
});
// one column on the right edge, bottom up to here, one empty cell of margin around
const toggleBox = () => ({ r0: srows - TOGGLES.length - 1, col: scols - 2 });

// --- Solar system: scrolling out past the smallest globe switches to it (scrolling back in at its closest returns).
// Covers the screen with the Sun and the planets where they really are at Date.now() (helio in sky.js), distances from
// the Sun on a log scale so Mercury and Neptune both fit, sizes from the real radii: the Earth starts as big as the
// smallest globe, so the switch looks continuous. Centred on the Earth: drag rotates around it (horizontal = spin,
// solarYaw; vertical = tilt from top-down, solarTilt), the wheel zooms (solarZoom). The 🌍 is a button back to the globe.
let solarOpen = false;
let solarYaw = 0, solarTilt = 1, solarZoom = 1; // radians; tilt 0 = from above the ecliptic, π/2 = edge-on, π = from below
let solarRoll = 0; // screen rotation (radians): always turned so the Earth's north is up (solarNorthUp)
// [emoji, name, elements, rates, radius in Earth radii], Sun outwards
const SOLAR_RADII = { Mercury: 0.383, Venus: 0.949, Earth: 1, Mars: 0.532, Jupiter: 10.97, Saturn: 9.14, Uranus: 3.98, Neptune: 3.86 };
const SOLAR = [...PLANETS.slice(0, 2), ['🌍', 'Earth', ...EARTH], ...PLANETS.slice(2), ...OUTER_PLANETS]
  .map(([emoji, name, el, rate]) => [name === 'Mercury' ? '🌑' : emoji, name, el, rate, SOLAR_RADII[name]]); // ☿️: black text
const SUN_RADII = 109.1; // Sun radius in Earth radii, capped so it never swallows Mercury's orbit
const SOLAR_OBLIQUITY = 23.439 * RAD; // Earth's axial tilt: the angle between the star catalogue's frame and the planets'
const SOLAR_STAR_MAG = 4; // only stars brighter than this (the orbits need the room)
const SOLAR_INNER = 2.5; // cells from the Sun to Mercury's orbit at zoom 1
const SOLAR_ZOOM = [0.5, 30], SOLAR_WHEEL = 0.0015; // zoom range (max = where the globe hands over), zoom per wheel px
const SOLAR_SWITCH = 150; // wheel px pushed past the end of a zoom range before switching views (trackpad momentum)
const SOLAR_CAMERA = 3, SOLAR_DRAG = 0.01; // camera distance in Neptune-orbit radii (perspective strength), rad per px
// full-screen cover under the controls: takes drag and wheel, keeps the hidden globe still underneath
const solarCover = document.body.insertBefore(Object.assign(document.createElement('div'), { hidden: true }), document.querySelector('.ctl'));
Object.assign(solarCover.style, { position: 'fixed', inset: 0, touchAction: 'none', cursor: 'grab' });
const earthBtn = document.body.appendChild(Object.assign(document.createElement('button'), { className: 'ctl', hidden: true }));
earthBtn.setAttribute('aria-label', 'Back to Earth');
earthBtn.addEventListener('click', () => closeSolar());
function openSolar() {
  closeSearch(); closePrint();
  solarOpen = true; solarZoom = SOLAR_ZOOM[1]; solarCover.hidden = earthBtn.hidden = false;
  globeToSolarCamera(); saveSolarHash();
  map.triggerRepaint();
}
function closeSolar(toGlobe = true) { // toGlobe (Earth click, Escape): zoom in to the whole Earth; wheel: stay smallest
  if (!solarOpen) return;
  solarOpen = false; solarCover.hidden = earthBtn.hidden = true;
  solarToGlobeCamera();
  if (toGlobe) map.easeTo({ zoom: 1.5, duration: 1000 });
  map.triggerRepaint();
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSolar(); });
// The same sky on both sides of the switch. Globe camera (computeStars in sky.js): above the map centre looking at the
// Earth's centre, axes in the equatorial (star catalogue) frame from the centre, sidereal time and bearing. Solar camera:
// yaw/tilt/roll in the ecliptic frame. Switching converts one into the other.
const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const toEcliptic = ([x, y, z]) => [x, y * Math.cos(SOLAR_OBLIQUITY) + z * Math.sin(SOLAR_OBLIQUITY), z * Math.cos(SOLAR_OBLIQUITY) - y * Math.sin(SOLAR_OBLIQUITY)];
const toEquatorial = ([x, y, z]) => [x, y * Math.cos(SOLAR_OBLIQUITY) - z * Math.sin(SOLAR_OBLIQUITY), y * Math.sin(SOLAR_OBLIQUITY) + z * Math.cos(SOLAR_OBLIQUITY)];
// solar camera axes (ecliptic) before roll: right, up, view direction
const solarAxes = (yaw, tilt) => [[Math.cos(yaw), -Math.sin(yaw), 0],
  [Math.sin(yaw) * Math.cos(tilt), Math.cos(yaw) * Math.cos(tilt), Math.sin(tilt)],
  [Math.sin(yaw) * Math.sin(tilt), Math.cos(yaw) * Math.sin(tilt), -Math.cos(tilt)]];
// globe camera axes (equatorial) for a centre lng/lat and bearing, like computeStars: east/north at the centre, out
function globeAxes(lng, lat, bearing) {
  const a = (lng + gmst(new Date())) * RAD, d = lat * RAD;
  return [[-Math.sin(a), Math.cos(a), 0], [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)],
    [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)], bearing * RAD];
}
// The solar view keeps the Earth's north up: roll so its axis points up on screen (kept when looking straight along
// the axis, where up is undefined). So the globe always comes back north up, and a north-up globe (bearing 0)
// switches with the stars in exactly the same place; a rotated globe snaps to north up.
const EARTH_AXIS = toEcliptic([0, 0, 1]);
function solarNorthUp() {
  const [sr, su] = solarAxes(solarYaw, solarTilt), X = dot3(EARTH_AXIS, sr), U = dot3(EARTH_AXIS, su);
  if (Math.hypot(X, U) > 1e-3) solarRoll = Math.atan2(-X, U);
}
function globeToSolarCamera() {
  const c = map.getCenter(), [, , out] = globeAxes(c.lng, c.lat, 0);
  const view = toEcliptic(out.map((v) => -v)); // looking at the Earth's centre: away from the map centre's direction
  solarTilt = Math.acos(Math.max(-1, Math.min(1, -view[2])));
  solarYaw = Math.atan2(view[0], view[1]);
}
function solarCenter() { // [lng, lat] the globe would face
  const out = toEquatorial(solarAxes(solarYaw, solarTilt)[2].map((v) => -v));
  const lat = Math.asin(Math.max(-1, Math.min(1, out[2]))) / RAD;
  return [((Math.atan2(out[1], out[0]) / RAD - gmst(new Date())) % 360 + 540) % 360 - 180, lat];
}
const solarToGlobeCamera = () => map.jumpTo({ center: solarCenter(), bearing: 0 });
// In the URL the solar view goes on below the globe's zoom as map=<negative zoom>/lat/lng: one level per halving of
// solarZoom, -1 at the closest (globe min zoom 0). lat/lng = where the globe faces, so a reload looks the same way.
const solarHashZoom = () => -1 - Math.log2(SOLAR_ZOOM[1] / solarZoom);
function saveSolarHash() {
  if (!solarOpen) return;
  const [lng, lat] = solarCenter();
  history.replaceState(history.state, '', '#' + [`map=${solarHashZoom().toFixed(2)}/${lat.toFixed(4)}/${lng.toFixed(4)}`,
    ...location.hash.slice(1).split('&').filter((p) => p && !p.startsWith('map='))].join('&'));
}
// debounced (wheel, drag); also after MapLibre's own hash update on moveend (e.g. resize), which writes the globe's zoom
// ponytail: 400 ms > MapLibre's 300 ms hash throttle, so ours lands last
let solarHashTimer = 0;
const queueSolarHash = () => { clearTimeout(solarHashTimer); solarHashTimer = setTimeout(saveSolarHash, 400); };
map.on('moveend', () => solarOpen && queueSolarHash());
let solarPush = 0; // wheel px pushed past the end of the current zoom range
map.getCanvasContainer().addEventListener('wheel', (e) => { // out past the smallest globe: switch
  if (e.deltaY > 0 && map.getZoom() <= map.getMinZoom() + 0.01) {
    if ((solarPush += e.deltaY) > SOLAR_SWITCH) { solarPush = 0; openSolar(); }
  } else solarPush = 0;
}, { passive: true });
function solarWheel(e) { // trackpad pinch arrives as wheel + ctrlKey: same thing
  e.preventDefault();
  if (e.deltaY < 0 && solarZoom >= SOLAR_ZOOM[1]) { // in past the closest: back to the globe
    if ((solarPush -= e.deltaY) > SOLAR_SWITCH) { solarPush = 0; closeSolar(false); }
    return;
  }
  solarPush = 0;
  solarZoom = Math.max(SOLAR_ZOOM[0], Math.min(SOLAR_ZOOM[1], solarZoom * Math.exp(-e.deltaY * SOLAR_WHEEL)));
  queueSolarHash(); map.triggerRepaint();
}
for (const el of [solarCover, earthBtn]) el.addEventListener('wheel', solarWheel, { passive: false }); // 🌍 sits on top
let solarDrag = null;
solarCover.addEventListener('pointerdown', (e) => { solarDrag = [e.clientX, e.clientY]; solarCover.setPointerCapture(e.pointerId); solarCover.style.cursor = 'grabbing'; });
let solarHover = null; // [row, col] of the screen cell under the mouse: with labels off, the body there shows its name
for (const el of [solarCover, earthBtn]) {
  el.addEventListener('pointermove', (e) => { solarHover = [Math.floor(e.clientY / cell), Math.floor(e.clientX / cell)]; map.triggerRepaint(); });
  el.addEventListener('pointerleave', () => { solarHover = null; map.triggerRepaint(); });
}
solarCover.addEventListener('pointermove', (e) => {
  if (!solarDrag) return;
  solarYaw += (e.clientX - solarDrag[0]) * SOLAR_DRAG;
  solarTilt = Math.max(0, Math.min(Math.PI, solarTilt + (e.clientY - solarDrag[1]) * SOLAR_DRAG));
  solarDrag = [e.clientX, e.clientY]; map.triggerRepaint();
});
const endSolarDrag = () => { solarDrag = null; solarCover.style.cursor = 'grab'; queueSolarHash(); };
solarCover.addEventListener('pointerup', endSolarDrag); solarCover.addEventListener('pointercancel', endSolarDrag);

// rings, labels, Sun and planets into the ui cells (computeUi), the Earth button moved over the 🌍
function putSolar(put) {
  for (let r = 0; r < srows; r++) for (let c = 0; c < scols; c++) put(r, c, '');
  const T = days2000(new Date()) / 36525, cx = Math.floor(scols / 2), cy = Math.floor(srows / 2);
  const R = Math.max(SOLAR_INNER + 4, Math.min(Math.floor(scols / 2) - 9, Math.floor(srows / 2) - 2)); // Neptune's orbit
  const a0 = SOLAR[0][2][0], a1 = SOLAR.at(-1)[2][0]; // Mercury's and Neptune's semi-major axes, AU
  solarNorthUp();
  const cr = Math.cos(solarRoll), sr = Math.sin(solarRoll);
  const D = SOLAR_CAMERA * R, cy0 = Math.cos(solarYaw), sy0 = Math.sin(solarYaw), ct = Math.cos(solarTilt), st = Math.sin(solarTilt);
  const logDist = (au) => SOLAR_INNER + (R - SOLAR_INNER) * Math.log(au / a0) / Math.log(a1 / a0); // cells at zoom 1
  const scaled = ([x, y, z]) => { const au = Math.hypot(x, y, z), k = au ? logDist(au) / au : 0; return [x * k, y * k, z * k]; };
  const earth = scaled(helio(EARTH, T)); // the view's centre
  // Earth radius in cells: the smallest globe's (MapLibre: 512 * 2^zoom px around) at the closest zoom, shrinking with it
  const earthCells = 512 * 2 ** map.getMinZoom() / (2 * Math.PI) / cell * solarZoom / SOLAR_ZOOM[1];
  // heliocentric ecliptic AU -> [row, col, depth, scale] or null (behind the camera): log-scaled distance, moved so the
  // Earth is at the origin, yaw around the ecliptic pole, tilt, perspective, zoom
  const project = (p) => {
    const [x, y, z] = scaled(p).map((v, i) => v - earth[i]);
    const x1 = x * cy0 - y * sy0, y1 = x * sy0 + y * cy0;
    const u = y1 * ct + z * st, depth = y1 * st - z * ct;
    if (D + depth < D / 10) return null;
    const s = D / (D + depth) * solarZoom, X = x1 * cr + u * sr, U = u * cr - x1 * sr; // roll
    return [Math.round(cy - U * s), Math.round(cx + X * s), depth, s / solarZoom];
  };
  // stars at infinity behind everything: equatorial -> ecliptic (tilt by the obliquity), then the camera's rotation;
  // zoom leaves them alone (it reads as moving closer, not as a telephoto lens), and they use the globe camera's field of
  // view so they don't jump at the switch. Faintest first: brighter ones win cells.
  const f = (vh / 2) / Math.tan(((map.transform.fov ?? 36.87) * RAD) / 2) / cell; // focal length in cells, as computeStars
  const ce = Math.cos(SOLAR_OBLIQUITY), se = Math.sin(SOLAR_OBLIQUITY);
  for (let i = starVecs.length - 1; i >= 0; i--) {
    const [qx, qy, qz, emoji, dimmed, , mag] = starVecs[i];
    if (mag >= SOLAR_STAR_MAG) continue;
    const y = qy * ce + qz * se, z = qz * ce - qy * se;
    const x1 = qx * cy0 - y * sy0, y1 = qx * sy0 + y * cy0, u = y1 * ct + z * st, depth = y1 * st - z * ct;
    if (depth < 0.1) continue; // behind the camera
    put(Math.round(cy - (u * cr - x1 * sr) / depth * f), Math.round(cx + (x1 * cr + u * sr) / depth * f), dimmed ? 'd:' + emoji : emoji);
  }
  for (const [, , el, rate] of SOLAR) { // orbit: the planet's own ellipse at T, dots about one cell apart
    const now = el.map((v, k) => v + rate[k] * T), zero = rate.map(() => 0);
    const n = Math.min(4000, Math.ceil(2 * Math.PI * logDist(now[0]) * solarZoom)); // ponytail: cap, gaps when zoomed far in
    for (let k = 0; k < n; k++) {
      const p = project(helio([now.map((v, j) => (j === 3 ? now[4] + 360 * k / n : v)), zero], 0)); // L sweeps the orbit
      if (p) put(p[0], p[1], 'd:l:·');
    }
  }
  // [emoji, name, row, col, depth, radius in cells], far first: nearer bodies and labels win shared cells
  const bodies = [['🌞', 'Sun', [0, 0, 0], Math.min(SUN_RADII * earthCells, 0.7 * SOLAR_INNER * solarZoom)],
    ...SOLAR.map(([emoji, name, el, rate, radii]) => [emoji, name, helio([el, rate], T), radii * earthCells])]
    .map(([emoji, name, p, rad]) => { const q = project(p); return q && [emoji, name, q[0], q[1], q[2], rad * q[3]]; })
    .filter(Boolean).sort((p, q) => q[4] - p[4]);
  for (const [emoji, name, r, c, , rad] of bodies) {
    // disc: every cell within the radius (at least the centre one); the Sun's edge glows like in the sky
    const n = Math.ceil(rad);
    for (let dr = -n; dr <= n; dr++) for (let dc = -n; dc <= n; dc++) {
      const d = Math.hypot(dr, dc);
      if (d <= Math.max(0.5, rad)) put(r + dr, c + dc, emoji === '🌞' && d > rad - 1 && rad >= 1.5 ? '🔆' : emoji);
    }
    // label right of the disc, or left of it near the right edge; labels off: only for the body under the mouse
    const hovered = solarHover && Math.hypot(solarHover[0] - r, solarHover[1] - c) <= Math.max(0.5, rad) + 0.5;
    const text = toggles.labels || hovered ? [...name.toUpperCase()] : [], gap = Math.max(1, Math.round(rad)) + 1;
    const c0 = c + gap + text.length < scols - 3 ? c + gap : c - gap - text.length + 1;
    text.forEach((ch, i) => put(r, c0 + i, 'l:' + ch));
    if (name === 'Earth') { // the button covers the Earth's disc
      const w = (2 * Math.max(0, Math.round(rad)) + 1) * cell;
      Object.assign(earthBtn.style, { left: (c + 0.5) * cell - w / 2 + 'px', top: (r + 0.5) * cell - w / 2 + 'px', width: w + 'px', height: w + 'px' });
    }
  }
}

function openSearch() {
  closePrint(); closeSolar(false);
  searchOpen = true; searchInput.hidden = false; layoutUi(); searchInput.focus();
  map.triggerRepaint();
}
function closeSearch() {
  searchOpen = false; searchInput.hidden = true; searchInput.value = query = '';
  results = []; reqId++; clearTimeout(timer);
  map.triggerRepaint();
}

async function suggest() {
  const q = query.trim(), id = ++reqId;
  if (q.length < 2) { results = []; map.triggerRepaint(); return; }
  const c = map.getCenter(); // bias results toward what's on screen
  let found = [];
  try {
    const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}&limit=${SEARCH_RESULTS * 2}&lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}`);
    found = (await res.json()).features || [];
  } catch { /* offline or service down: no suggestions */ }
  if (id !== reqId) return; // a newer query (or close) happened meanwhile
  const seen = new Set(); // same place often comes twice (city node + boundary): keep the first of each text
  results = found.map(({ properties: p, geometry }) => ({
    text: [...new Set([p.name, p.city, p.state, p.country].filter(Boolean))].join(', ').toUpperCase(),
    center: geometry.coordinates, extent: p.extent, // extent: [minLng, maxLat, maxLng, minLat], areas only
  })).filter((r) => !seen.has(r.text) && seen.add(r.text)).slice(0, SEARCH_RESULTS);
  sel = 0;
  map.triggerRepaint();
}

function go(i) {
  const r = results[i];
  if (!r) return;
  const e = r.extent;
  if (e) map.fitBounds([[e[0], e[3]], [e[2], e[1]]], { maxZoom: 16, padding: 40 });
  else map.flyTo({ center: r.center, zoom: 15 });
  closeSearch();
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  clearTimeout(timer); timer = setTimeout(suggest, SEARCH_DELAY);
  map.triggerRepaint();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sel = Math.max(0, Math.min(results.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
    map.triggerRepaint();
  } else if (e.key === 'Enter') go(sel);
  else if (e.key === 'Escape') closeSearch();
});
// Any printable key opens the search with that key as its first letter (not space: debug toggle, nor the map's
// keyboard zoom keys + - = _ ; not while another field or a modifier is in use)
addEventListener('keydown', (e) => {
  if (searchOpen || e.key.length !== 1 || ' +-=_'.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey
    || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  e.preventDefault();
  openSearch();
  searchInput.value = e.key;
  searchInput.dispatchEvent(new Event('input'));
});
// Suggestions are only grid cells: clicks on them reach the map; a click anywhere else closes the search
map.on('click', (e) => {
  if (printOpen) { // options are buttons; a click reaching the map closes the card unless it is on the card itself
    const { x0, x1, row } = printCard(), r = Math.floor(e.point.y / cell) - row, c = Math.floor(e.point.x / cell);
    if (r < -1 || r > POSTER_CARD_ROWS - 2 || c < x0 - 1 || c > x1) closePrint();
  }
  if (!searchOpen) return;
  const { x0, x1, row } = searchBox();
  const i = Math.floor(e.point.y / cell) - row - 2, c = Math.floor(e.point.x / cell);
  if (i >= 0 && i < results.length && c >= x0 - 1 && c <= x1) go(i); else closeSearch();
});

// Put the invisible input over its cells (after every grid layout)
function layoutUi() {
  const { x0, x1, row } = searchBox();
  Object.assign(searchInput.style,
    { left: x0 * cell + 'px', top: row * cell + 'px', width: (x1 - x0 + 1) * cell + 'px', height: cell + 'px' });
  const t = toggleBox();
  toggleBtns.forEach((b, i) => Object.assign(b.style,
    { left: t.col * cell + 'px', top: (t.r0 + i) * cell + 'px', width: cell + 'px', height: cell + 'px' }));
  printCard().items.forEach(([r, c, n, key, , label], i) => {
    Object.assign(printBtns[i].style, { left: c * cell + 'px', top: r * cell + 'px', width: n * cell + 'px', height: cell + 'px' });
    printBtns[i].setAttribute('aria-label', label);
    if (key !== null) printBtns[i].setAttribute('role', 'radio');
  });
}

// Map(cellIndex -> glyph key, '' = empty cell) for the toggles and search; wins over everything else in draw()
function computeUi() {
  const ui = new Map();
  const put = (r, c, key) => { if (r >= 0 && r < srows && c >= 0 && c < scols) ui.set(r * scols + c, key); };
  if (solarOpen) putSolar(put); // first: toggles and search draw over it
  const t = toggleBox();
  for (let r = t.r0 - 1; r < srows; r++) for (let c = t.col - 1; c < scols; c++) put(r, c, ''); // black band
  // hovered toggle: its action; else the playing radio station (sound.js) left of 🔊
  const letters = (s) => [...s].map((ch) => (ch === ' ' ? '' : 'l:' + ch));
  let band = -1, text = [];
  if (hoverToggle >= 0) {
    const [k, , , onText, offText] = TOGGLES[hoverToggle];
    band = hoverToggle; text = letters(isOn(k) ? onText : offText);
  } else if (soundOn && !radio.paused && radio.title) {
    band = TOGGLES.findIndex(([k]) => k === 'sound');
    text = ['📻', '', ...letters([...radio.title.trim().toUpperCase()].slice(0, RADIO_NAME_MAX).join(''))];
  }
  if (band >= 0) { // right-aligned one cell left of the button, on its own black band
    const r = t.r0 + band, c0 = t.col - 1 - text.length;
    for (let rr = r - 1; rr <= r + 1; rr++) for (let c = c0 - 1; c < t.col; c++) put(rr, c, '');
    text.forEach((key, i) => put(r, c0 + i, key));
  }
  TOGGLES.forEach(([k, emoji, , , , offEmoji], i) => {
    put(t.r0 + i, t.col, k === 'print' && printing ? '⏳' : isOn(k) ? emoji : offEmoji || 'd:' + emoji);
    toggleBtns[i].setAttribute('aria-pressed', isOn(k));
  });
  if (!searchOpen && !printOpen) return ui;
  const { x0, x1, row } = searchBox(), W = x1 - x0 + 1; // the print card uses the same box
  // one letter per cell over a black band from x0 - 1 to x1; a { key } item is a glyph (emoji) cell
  const line = (r, chars, mark = '') => {
    put(r, x0 - 1, mark);
    for (let i = 0; i < W; i++) put(r, x0 + i, chars[i]?.key || (chars[i] && chars[i] !== ' ' ? 'l:' + chars[i] : ''));
  };
  if (printOpen) {
    const card = printCard(), rowCells = new Map(); // row -> its cells, items written into them
    for (let r = card.row - 1; r < card.row + POSTER_CARD_ROWS - 1; r++) rowCells.set(r, []);
    rowCells.set(card.row, [...'POSTER PDF']);
    POSTER_OPTS.forEach(([, title], g) => rowCells.set(card.row + 2 + 3 * g, [...title]));
    card.items.forEach(([r, c, n, key, value], i) => {
      const cells = rowCells.get(r), text = key === null ? 'SAVE PDF' : POSTER_OPTS.find((o) => o[0] === key)[2].find((o) => o[0] === value)[1];
      if (key === null) cells.splice(c - x0, n, ...text);
      else {
        const on = poster[key] === value; // selected: 🟢 and bright text; others dimmed
        cells[c - x0] = { key: on ? '🟢' : 'd:⚪' };
        [...text].forEach((ch, j) => { cells[c - x0 + 2 + j] = on ? ch : { key: 'd:l:' + ch }; });
        printBtns[i].setAttribute('aria-checked', poster[key] === value);
      }
    });
    const focusRow = card.items[printSel]?.[0];
    rowCells.forEach((cells, r) => line(r, cells, r === focusRow ? '👉' : r === card.row ? '🖨️' : ''));
    return ui;
  }
  // query: its end stays in view, with a blinking cursor
  const q = [...query.toUpperCase()].slice(-(W - 1));
  line(row - 1, []);
  line(row, Date.now() % 1000 < 500 ? [...q, '_'] : q, '🔍');
  line(row + 1, []);
  results.forEach((res, i) => {
    let t = [...res.text];
    if (t.length > W) t = [...t.slice(0, W - 1), '…'];
    line(row + 2 + i, t, i === sel ? '👉' : '');
  });
  return ui;
}

// Opened on a solar system URL (negative zoom, see saveSolarHash): back to that view
const startZoom = +startHash.match(/[#&]map=(-?[\d.]+)\//)?.[1];
if (startZoom < 0) {
  openSolar();
  solarZoom = Math.max(SOLAR_ZOOM[0], Math.min(SOLAR_ZOOM[1], SOLAR_ZOOM[1] / 2 ** (-1 - startZoom)));
  saveSolarHash();
}
