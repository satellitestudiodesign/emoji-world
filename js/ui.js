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
  const W = Math.min(SEARCH_MAX, cols - 4), x0 = Math.floor((cols - W) / 2);
  return { x0, x1: x0 + W - 1, row: Math.max(0, Math.floor(rows / 2) - 3) };
}

function openSearch() {
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
}

// Map(cellIndex -> glyph key, '' = empty cell) for the search; wins over everything else in draw()
function computeUi() {
  const ui = new Map();
  if (!searchOpen) return ui;
  const put = (r, c, key) => { if (r < rows && c >= 0 && c < cols) ui.set(r * cols + c, key); };
  const { x0, x1, row } = searchBox(), W = x1 - x0 + 1;
  // one letter per cell over a black band from x0 - 1 to x1
  const line = (r, chars, mark = '') => {
    put(r, x0 - 1, mark);
    for (let i = 0; i < W; i++) put(r, x0 + i, chars[i] && chars[i] !== ' ' ? 'l:' + chars[i] : '');
  };
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
