// --- POIs: placed straight into the cell under their point (like place names) --------------------
// Not drawn on the hidden map: a 3px dot split across cell borders lost its cell to the building or road around
// it (~40% of POIs at zoom 17). Here every POI gets exactly one cell; when two share a cell the tile's rank decides.
const POI_MINZOOM = 15;
// sport pitches show from here (tile zoom 14 is the first with pitch points; z13 tiles only have the bare areas)
const SPORT_MINZOOM = 14;
// small street furniture (hundreds per district) only from STREET_MINZOOM
// shops: the shop class plus kinds that are shops in OSM but get their own class here
const SHOPS = new Set(['shop', 'bakery', 'pharmacy', 'hairdresser', 'laundry', 'carDealer']);
const SHOP_MINZOOM = 16, STREET_MINZOOM = 17, STREET = new Set(['bin', 'motoParking', 'bikeParking', 'gate', 'recycling', 'phone', 'info']);
// OpenMapTiles poi `class` -> our class
const POI = {
  restaurant: 'food', fast_food: 'fastfood', cafe: 'cafe', ice_cream: 'cafe', bar: 'bar', beer: 'bar',
  shop: 'shop', grocery: 'shop', clothing_store: 'shop', bakery: 'shop', butcher: 'shop', alcohol_shop: 'shop',
  place_of_worship: 'worship', school: 'poiSchool', college: 'poiSchool', hospital: 'poiHospital',
  bank: 'bank', lodging: 'hotel', museum: 'museum', art_gallery: 'museum', castle: 'castle', monument: 'monument',
  railway: 'station', bus: 'bus', fuel: 'fuel', parking: 'parking',
  pharmacy: 'pharmacy', hairdresser: 'hairdresser', bicycle_rental: 'bicycle', swimming_pool: 'swimming',
  playground: 'playground', toilets: 'toilets', cinema: 'cinema', theatre: 'theatre', police: 'police',
  fire_station: 'fireStation', attraction: 'attraction', stadium: 'stadium', atm: 'atm',
  drinking_water: 'drinking', library: 'library', office: 'office', dentist: 'dentist', doctors: 'doctors',
  veterinary: 'vet', harbor: 'harbour', ferry_terminal: 'ferryTerminal', town_hall: 'townHall', laundry: 'laundry',
  waste_basket: 'bin', recycling: 'recycling', information: 'info', telephone: 'phone', campsite: 'campsite',
  shelter: 'shelter', picnic_site: 'picnic', escape_game: 'escapeGame', ice_rink: 'iceRink', dog_park: 'dogPark',
  car: 'carDealer', motorcycle_parking: 'motoParking', bicycle_parking: 'bikeParking', gate: 'gate',
  sports_centre: 'gym', aquarium: 'aquarium', music: 'music', casino: 'casino', hackerspace: 'hackerspace',
  yoga: 'yoga',
};
// OpenMapTiles poi `subclass` (the raw OSM tag value) -> our class, where `class` is too coarse; wins over POI
const POI_SUB = {
  ice_cream: 'icecream', bakery: 'bakery', nightclub: 'nightclub', post_office: 'post', artwork: 'artwork',
  subway_entrance: 'subway',
};
// pitch POIs: `subclass` is the OSM sport tag ("tennis", "soccer;basketball"); the first sport picks the emoji.
// ponytail: unknown, missing or "multi" sport = no POI, the pitch area shows the generic sport emoji
const SPORT = {
  tennis: '🎾', padel: '🎾', soccer: '⚽', futsal: '⚽', basketball: '🏀', table_tennis: '🏓', handball: '🤾',
  skateboard: '🛹', field_hockey: '🏑', baseball: '⚾', softball: '⚾', volleyball: '🏐', beachvolleyball: '🏐',
  american_football: '🏈', rugby_union: '🏉', rugby_league: '🏉', cricket: '🏏', golf: '⛳', boules: '🎳',
  equestrian: '🏇', athletics: '🏃', running: '🏃', swimming: '🏊', climbing: '🧗', badminton: '🏸',
  ice_hockey: '🏒', boxing: '🥊', martial_arts: '🥋', judo: '🥋', karate: '🥋', taekwondo: '🥋', skiing: '🎿',
  ice_skating: '⛸️', curling: '🥌', fishing: '🎣', scuba_diving: '🤿', shooting: '🎯', archery: '🏹', darts: '🎯',
  billiards: '🎱', chess: '♟️', bowling: '🎳', '10pin': '🎳', cycling: '🚴', bmx: '🚴', horse_racing: '🏇',
  karting: '🏎️', motor: '🏎️', rowing: '🚣', canoe: '🛶', sailing: '⛵', surfing: '🏄', gymnastics: '🤸',
  fitness: '🏋️', yoga: '🧘', lacrosse: '🥍',
};
// shop POIs: `subclass` is the OSM shop tag; unlisted kinds keep the generic shop emoji; a list = one per shop
const CLOTHES = ['👗', '👕', '👖', '👔', '👚', '🧥', '👘', '🧣', '🩳'];
const SHOP = {
  supermarket: '🛒', convenience: '🏪', kiosk: '📰', newsagent: '📰', mall: '🏬', department_store: '🏬', general: '🏪',
  clothes: CLOTHES, boutique: CLOTHES, fashion: CLOTHES, shoes: ['👟', '👠', '👞', '🥾', '👡'], bag: ['👜', '🎒'],
  jewelry: ['💍', '💎'], watches: '⌚', tailor: ['🪡', '✂️'], hat: ['🎩', '🧢'], fabric: ['🧵', '🧶'], craft: '🧶',
  second_hand: '♻️', charity: '♻️', gift: ['🎁', '🛍️'], toys: ['🧸', '🧩', '🪀'], games: '🎲', baby_goods: '🍼',
  books: ['📚', '📖'], stationery: ['✏️', '📝', '🖊️'], copyshop: '🖨️', beauty: '💅', cosmetics: '💄',
  perfumery: '💄', chemist: '🧴', optician: ['👓', '🕶️'], courier: '📦', car_repair: '🔧', tyres: '🛞',
  lighting: '💡', money_lender: '🪙', pawnbroker: '🪙', lottery: '🎟️', party: '🎈', religion: '📿',
  hearing_aids: '🦻', florist: '💐', garden_centre: '🪴', tobacco: '🚬', confectionery: '🍬', chocolate: '🍫',
  coffee: '🫘', tea: '🍵', wine: '🍷', alcohol: '🍷', beverages: '🥤', butcher: '🥩', seafood: '🐟', cheese: '🧀',
  greengrocer: '🥦', deli: '🥓', frozen_food: '🧊', bakery: '🥐', pastry: '🥐', furniture: '🛋️', bed: '🛏️',
  interior_decoration: '🖼️', kitchen: '🍳', antiques: '🏺', art: '🎨', paint: '🎨', hardware: ['🔨', '🧰'],
  doityourself: ['🔨', '🧰'], locksmith: '🔑', mobile_phone: ['📱', '📲'], computer: ['💻', '🖥️'],
  electronics: ['🔌', '📺'], hifi: '📻', camera: '📷', photo: '📷', video: '📼', video_games: '🎮', music: '🎵',
  musical_instrument: ['🎸', '🎹', '🎻', '🥁'], sports: '🎽', outdoor: '🏕️', bicycle: '🚲',
  motorcycle: '🏍️', car: '🚗', pet: '🐾', travel_agency: '🧳', ticket: '🎟️', tattoo: '🖋️', massage: '💆',
  weapons: '🗡️', erotic: '💋',
};
// restaurants, fast food, cafes, bars: the tiles have no cuisine tag, so guess it from words in the name; first match
// wins (a list = one per POI); no match = the class emoji
// ponytail: keyword guess (Spanish/English/Italian words), misses names without a hint
const FOOD_WORDS = [
  [/pizz|trattoria|osteria/i, '🍕'], [/sushi|sashimi/i, '🍣'], [/bento/i, '🍱'], [/onigiri/i, '🍙'],
  [/japo|japan|izakaya/i, ['🍣', '🍱', '🍙', '🍚']], [/tempura|gamba|prawn|shrimp/i, '🍤'], [/\bsake\b/i, '🍶'],
  [/ramen|noodle|wok|thai|vietnam|\bpho\b|udon/i, '🍜'], [/bubble|boba/i, '🧋'],
  [/burger|hamburg|goiko|foster/i, '🍔'], [/burrito/i, '🌯'], [/taco|mexic|cantina|taquer/i, ['🌮', '🌯']],
  [/falafel/i, '🧆'], [/kebab|d[öo]ner|shawarma|l[íi]bano|leban|turk/i, '🥙'], [/paella|arroz|arroc|\brice/i, '🥘'],
  [/curry|india|tandoor|nepal/i, '🍛'], [/take ?away|chinese|china|chino/i, ['🥟', '🥡']], [/dim ?sum|dumpling|asia/i, '🥟'],
  [/poke|vegan|vegetar|salad|ensalad|veggie|green/i, '🥗'], [/bbq|barbecue|barbacoa/i, '🍖'],
  [/steak|grill|asador|parrill|brasa|churrasc|carne/i, '🥩'],
  [/marisc|seafood|pescad|\bfish|ostra|oyster|\bmar\b/i, '🦞'], [/chips|fries|frites|patat/i, '🍟'],
  [/stew|guiso|cocido|potaje|\bolla\b/i, '🍲'], [/fondue|raclette/i, '🫕'], [/bagel/i, '🥯'],
  [/waffle|gofre/i, '🧇'], [/cr[eê]pe|pancake|tortiter/i, '🥞'], [/pretzel|german|alem[aá]n|brauhaus|biergarten/i, '🥨'],
  [/donut|doughnut|rosquill/i, '🍩'], [/cake|pastel|tarta|cupcake|reposter|pastisser|p[aâ]tisser/i, ['🍰', '🧁']],
  [/cocktail|c[oó]ctel/i, '🍸'], [/\bpub\b|tavern|brew|cervec/i, '🍻'],
  [/tapa|taberna|tasca|pintxo|pincho|bodega/i, '🫒'], [/sandw|bocadill|\bdeli\b|baguet/i, '🥪'],
  [/pollo|chicken|kfc|wings/i, '🍗'], [/hot ?dog|frankfurt/i, '🌭'], [/horchat/i, '🥛'], [/pasta|italian|ristorante/i, '🍝'],
];
const foodEmoji = (name) => FOOD_WORDS.find(([re]) => re.test(name))?.[1];
// Famous monuments that have their own emoji, by the tile POI's English name (exact, as in the tiles). Only landmark
// classes match (the bus stop "Tower Bridge" stays a bus stop). They fill the polygon under their point (buildingsAt).
// No Eiffel Tower: 🗼 is Tokyo Tower. Not in the tiles as a named POI: Sydney Opera House, Angkor Wat, Osaka Castle.
const FAMOUS = {
  'Tokyo Tower': '🗼', 'Statue of Liberty': '🗽', Colosseum: '🏟️', Parthenon: '🏛️', Pantheon: '🏛️',
  'Taj Mahal': '🕌', 'Hagia Sophia': '🕌', 'Sheikh Zayed Grand Mosque': '🕌', Kaaba: '🕋', 'Himeji Castle': '🏯',
  'Neuschwanstein Castle': '🏰', 'The Great Torii': '⛩️', '10,000 Torii Gates': '⛩️', 'London Eye': '🎡',
  'Golden Gate Bridge': '🌉', 'Tower Bridge': '🌉', 'Basilica of the Holy Family': '⛪', 'Cathedral of Notre Dame': '⛪',
  "St. Peter's Dome": '⛪', Stonehenge: '🪨', 'Great Pyramid of Giza': '🔺', 'Pyramid of Khafre': '🔺',
  'Pyramid of Menkaure': '🔺', 'Trevi Fountain': '⛲',
};
const FAMOUS_CLASSES = new Set(['attraction', 'monument', 'castle', 'place_of_worship', 'museum']);
const famousEmoji = (p) => FAMOUS_CLASSES.has(p.class) && FAMOUS[p['name:en'] || p.name];
// emoji of a POI feature; lists pick one per POI by its position (stable across redraws)
function poiEmoji(p, lng, lat) {
  const kind = POI_SUB[p.subclass] || POI[p.class];
  let e = famousEmoji(p) || sportEmoji(p) || (kind === 'shop' && SHOP[p.subclass])
    || (['food', 'fastfood', 'cafe', 'bar'].includes(kind) && foodEmoji(p.name || ''))
    || (kind === 'castle' && /城|-j[oō]\b/.test(p.name || '') && '🏯') || CLASSES[kind].emoji;
  if (Array.isArray(e)) e = e[cellHash(Math.round(lng * 1e6), Math.round(lat * 1e6)) % e.length];
  return e;
}
const sportEmoji = (p) => p.class === 'pitch' && SPORT[(p.subclass || '').split(';')[0]];

const POI_FILTER = ['any', ['in', ['get', 'class'], ['literal', Object.keys(POI)]],
  ['in', ['get', 'subclass'], ['literal', Object.keys(POI_SUB)]], ['==', ['get', 'class'], 'pitch']];

let poiPts = [], poiDirty = true; // [lng, lat, emoji, name, kind, buildings]: kind = our class key, 'sport' for pitches;
// buildings = the building polygons (rings) the POI fills (buildingsAt); most important (lowest rank) first

// POIs of the loaded tiles near the view (tiles reach well beyond the screen: keep half a screen around it)
function queryPois() {
  poiDirty = false;
  const b = map.getBounds(), dx = (b.getEast() - b.getWest()) / 2, dy = (b.getNorth() - b.getSouth()) / 2;
  const seen = new Set(); // features repeat in neighbouring tiles' buffers
  poiPts = map.querySourceFeatures('omt', { sourceLayer: 'poi', filter: POI_FILTER })
    .filter((f) => {
      const [lng, lat] = f.geometry.coordinates, k = lng + ',' + lat;
      if (seen.has(k) || (f.properties.class === 'pitch' && !sportEmoji(f.properties)) || lng < b.getWest() - dx || lng > b.getEast() + dx || lat < b.getSouth() - dy || lat > b.getNorth() + dy) return false;
      seen.add(k); return true;
    })
    .sort((a, b) => (a.properties.rank ?? 99) - (b.properties.rank ?? 99))
    .map(({ geometry: { coordinates: [lng, lat] }, properties: p }) =>
      [lng, lat, poiEmoji(p, lng, lat), p['name:latin'] || p.name || '',
        famousEmoji(p) ? 'famous' : sportEmoji(p) ? 'sport' : POI_SUB[p.subclass] || POI[p.class]]);
  // 🎣 at both ends of each pier's longest line (marinas map their pontoons as one pier of many lines);
  // draw() keeps only ends next to water (the tip)
  for (const f of map.querySourceFeatures('omt', { sourceLayer: 'transportation', filter: ['==', ['get', 'class'], 'pier'] })) {
    const g = f.geometry, lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    const len = (l) => metres(l[0], l[l.length - 1]);
    const line = lines.reduce((a, l) => (!a || len(l) > len(a) ? l : a), null);
    if (line) for (const [lng, lat] of [line[0], line[line.length - 1]]) poiPts.push([lng, lat, '🎣', f.properties.name || '', 'pier']);
  }
  const homes = buildingsAt(poiPts);
  poiPts.forEach((pt, i) => pt.push(homes[i]));
  queryAreas();
}

// Named areas, for hover: the tiles carry the area and its name separately.
// - parks and gardens: green area (landcover, subclass park/garden) + name on a poi point inside it
// - squares: pedestrian area (transportation, path/pedestrian polygon) + name on a path line through it
//   (transportation_name)
// Each name goes to the smallest such area holding its point (or any vertex of its line); hovering anywhere in the
// area shows the name. Smallest first, so a garden inside a park keeps its own name.
// ponytail: an area cut by a tile border is two pieces, only the piece holding the point/line gets the name
let namedAreas = []; // [name, rings], smallest area first
const polygonsOf = (feats) => feats.flatMap(({ geometry: g }) => (g.type === 'Polygon' ? [g.coordinates]
  : g.type === 'MultiPolygon' ? g.coordinates : [])).map((rings) => {
  let a = 0; const ring = rings[0];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  const xs = ring.map((v) => v[0]), ys = ring.map((v) => v[1]);
  rings.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; // cheap test before inside()
  return [Math.abs(a), rings];
}).sort((x, y) => x[0] - y[0]);
const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function queryAreas() {
  const q = (sourceLayer, filter) => map.querySourceFeatures('omt', { sourceLayer, filter });
  const greens = polygonsOf(q('landcover', ['in', ['get', 'subclass'], ['literal', ['park', 'garden']]]));
  const squares = polygonsOf(q('transportation', ['all', ['==', ['get', 'class'], 'path'],
    ['in', ['get', 'subclass'], ['literal', ['pedestrian', 'footway']]]]));
  const found = new Map(); // rings -> [area, name]
  const claim = (areas, name, pts) => {
    if (!name) return;
    const hit = areas.find(([, rings]) => pts.some(([x, y]) => inside(x, y, rings)));
    if (hit && !found.has(hit[1])) found.set(hit[1], [hit[0], name]);
  };
  for (const f of q('poi', ['in', ['get', 'class'], ['literal', ['park', 'garden']]])) {
    claim(greens, f.properties['name:latin'] || f.properties.name, [f.geometry.coordinates]);
  }
  // squares: the name whose line lies most inside (at least half its points), not a street just crossing it
  const best = new Map(); // rings -> [share inside, name]
  for (const f of q('transportation_name', ['==', ['get', 'class'], 'path'])) {
    const name = f.properties['name:latin'] || f.properties.name, g = f.geometry;
    const pts = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.flat() : [];
    if (!name || !pts.length) continue;
    for (const [, rings] of squares) {
      if (!pts.some(([x, y]) => inBox(x, y, rings.bbox))) continue;
      const share = pts.filter(([x, y]) => inside(x, y, rings)).length / pts.length;
      if (share >= 0.5 && share > (best.get(rings)?.[0] ?? 0)) best.set(rings, [share, name]);
    }
  }
  for (const [a, rings] of squares) if (best.has(rings) && !found.has(rings)) found.set(rings, [a, best.get(rings)[1]]);
  namedAreas = [...found].sort((x, y) => x[1][0] - y[1][0]).map(([rings, [, name]]) => [name, rings]);
}
// Name of the named area under a grid cell, or undefined
function areaNameAt(idx) {
  if (idx < 0 || map.getZoom() < SPORT_MINZOOM) return;
  const ll = map.unproject([cellX(idx % cols), cellY(Math.floor(idx / cols))]);
  return namedAreas.find(([, rings]) => inBox(ll.lng, ll.lat, rings.bbox) && inside(ll.lng, ll.lat, rings))?.[0];
}

// Point in polygon (even-odd, so holes work); rings = [[[x, y], ...], ...] in any one coordinate system
function inside(x, y, rings) {
  let c = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Buildings (rings, lng/lat) each [lng, lat, emoji, name, kind] point fills, [] if none; buildings bucketed by bbox.
// Most POIs: the building they are in, if under MAX_BUILDING m² (a whole city block or mall mapped as one building
// would turn all of it into one shop). Landmarks: any size, plus every building with a corner within LANDMARK_M (a
// palace or monastery is often many buildings round a courtyard, with the point in the courtyard). Monuments: only
// the building they are in, any size (most are statues on squares).
// ponytail: a building cut by a tile border is two pieces, the POI fills only the piece it is in
const MAX_BUILDING = 2000, LANDMARK_M = 40;
const LANDMARKS = new Set(['castle', 'museum', 'worship', 'townHall']), ANY_SIZE = new Set([...LANDMARKS, 'monument']);
function buildingsAt(pts) {
  const B = 0.0005, grid = new Map(); // ~50 m buckets
  for (const { geometry: g } of map.querySourceFeatures('omt', { sourceLayer: 'building' })) {
    for (const rings of g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = 0;
      const ring = rings[0];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x, y] = ring[i];
        a += (ring[j][0] - x) * (ring[j][1] + y); // shoelace, degrees²
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      rings.m2 = Math.abs(a) / 2 * M_LAT * mLng(y0); // area on the rings array itself (same object for every lookup)
      for (let i = Math.floor(x0 / B); i <= Math.floor(x1 / B); i++) for (let j = Math.floor(y0 / B); j <= Math.floor(y1 / B); j++) {
        const k = i + ',' + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(rings);
      }
    }
  }
  return pts.map(([lng, lat, , , kind]) => {
    const bx = Math.floor(lng / B), by = Math.floor(lat / B), here = grid.get(bx + ',' + by) || [];
    if (kind === 'famous') { // every building under it (towers and domes are mapped as stacked parts), else the site
      const under = here.filter((rings) => inside(lng, lat, rings));
      return under.length ? under : siteAt(lng, lat);
    }
    const home = here.find((rings) => inside(lng, lat, rings));
    if (!LANDMARKS.has(kind)) return home && (ANY_SIZE.has(kind) || home.m2 <= MAX_BUILDING) ? [home] : [];
    const found = new Set(home ? [home] : []);
    for (let i = bx - 1; i <= bx + 1; i++) for (let j = by - 1; j <= by + 1; j++) {
      for (const rings of grid.get(i + ',' + j) || []) {
        if (!found.has(rings) && rings[0].some((v) => metres([lng, lat], v) < LANDMARK_M)) found.add(rings);
      }
    }
    return [...found];
  });
}
// Smallest historic site (Stonehenge) or bridge (Golden Gate) outline under a famous POI with no building: [rings] or []
// ponytail: a bridge cut by tile borders is several pieces, only the piece under the point fills
function siteAt(lng, lat) {
  const q = (sourceLayer, cls) => polygonsOf(map.querySourceFeatures('omt', { sourceLayer, filter: ['==', ['get', 'class'], cls] }));
  const hit = [...q('park', 'historic'), ...q('transportation', 'bridge')].sort((a, b) => a[0] - b[0])
    .find(([, rings]) => inBox(lng, lat, rings.bbox) && inside(lng, lat, rings));
  return hit ? [hit[1]] : [];
}
// Query again only when the view moved (the kept margin shifts) or a tile arrived; done once the loads settle
map.on('moveend', () => { poiDirty = true; });
map.on('sourcedata', (e) => { if (e.sourceId === 'omt' && e.tile) poiDirty = true; });

// Map(cellIndex -> [emoji, name, kind, buildings]) for the POIs on screen
// POIs just off the grid still fill the part of their building that is on it (else the fill blinks at the edge)
// ponytail: only building fills; sport/school/hospital grounds flood from the POI cell, so they still need it on screen
const POI_FILL_MARGIN = 30; // cells around the grid
let offscreenPois = []; // [col, row, emoji, name, kind, buildings], col/row outside the grid
function computePois() {
  if (poiDirty && map.areTilesLoaded()) queryPois();
  const out = new Map();
  offscreenPois = [];
  const sportOnly = map.getZoom() < POI_MINZOOM, street = map.getZoom() < STREET_MINZOOM, noShops = map.getZoom() < SHOP_MINZOOM;
  for (const [lng, lat, emoji, name, kind, buildings] of poiPts) {
    if ((sportOnly && kind !== 'sport' && kind !== 'famous') || (street && STREET.has(kind)) || (noShops && SHOPS.has(kind))) continue;
    const p = map.project([lng, lat]), col = cellCol(p.x), r = cellRow(p.y);
    if (col < 0 || col >= cols || r < 0 || r >= rows) {
      const m = POI_FILL_MARGIN;
      if (buildings && col >= -m && col < cols + m && r >= -m && r < rows + m) offscreenPois.push([col, r, emoji, name, kind, buildings]);
      continue;
    }
    const idx = r * cols + col;
    if (!out.has(idx)) out.set(idx, [emoji, name, kind, buildings]); // more important POI keeps the cell
  }
  return out;
}
