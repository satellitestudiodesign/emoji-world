// Class table: the single source of truth. Each class gets a unique flat color
// (auto-assigned below) painted by the hidden map; `emoji` is what the cell shows;
// `emoji` can be a list: each cell picks one by its grid position (repeat = more often).
// `priority` multiplies the pixel count so small things (POIs, city dots) can win a
// cell over the area around them.
const CLASSES = {
  // area
  water:       { emoji: '💦', priority: 1 },  // sea: waves, boats, sea animals
  lake:        { emoji: '💦', priority: 1 },  // lakes, rivers, ponds, pools, docks: calm, no animals
  land:        { emoji: '🌳', priority: 1 },  // background, low zoom (like v0)
  ground:      { emoji: '🌱', priority: 1 },  // background, higher zoom
  ice:         { emoji: '🧊', priority: 1 },
  wood:        { emoji: '🌲', priority: 1 },
  grass:       { emoji: '🌿', priority: 1 },
  farmland:    { emoji: '🌾', priority: 1 },
  sand:        { emoji: '🏖️', priority: 1 },  // beaches only: inland sand shows as desert (draw.js)
  residential: { emoji: '🏘️', priority: 1 },
  industrial:  { emoji: '🏭', priority: 1 },
  commercial:  { emoji: '🏬', priority: 1 },
  school:      { emoji: '🏫', priority: 1.5 },
  hospital:    { emoji: '🏥', priority: 1.5 },
  cemetery:    { emoji: '🪦', priority: 1.5 },
  sport:       { emoji: '🏟️', priority: 1.5 },
  playArea:    { emoji: '🛝', priority: 1.5 },  // playground grounds (the 🛝 POI is `playground` below)
  airport:     { emoji: '✈️', priority: 2 },
  rock:        { emoji: '🪨', priority: 1 },  // bare rock, scree
  marsh:       { emoji: ['🌿', '🌿', '🪷'], priority: 1 },
  vineyard:    { emoji: '🍇', priority: 1 },
  orchard:     { emoji: ['🍎', '🍐', '🫒'], priority: 1 },
  golf:        { emoji: ['🌿', '🌿', '🌿', '⛳'], priority: 1 },
  flowerbed:   { emoji: '🌷', priority: 1 },
  allotments:  { emoji: ['🥬', '🥕'], priority: 1 },
  quarry:      { emoji: ['🪨', '⛏️'], priority: 1.5 },
  military:    { emoji: '🪖', priority: 1.5 },
  themePark:   { emoji: '🎡', priority: 1.5 },
  zoo:         { emoji: ['🦁', '🐘', '🦒', '🌳'], priority: 1.5 },
  // land cover tiles (data/landcover, tools/landcover/build.mjs), low zoom only; fade out to ground above BIOME_MAXZOOM
  forest:      { emoji: ['🌳', '🌳', '🌳', '🌲'], priority: 1, biome: true },
  conifer:     { emoji: ['🌲', '🌲', '🌲', '🌳'], priority: 1, biome: true },
  rockice:     { emoji: '🧊', priority: 1, biome: true },
  jungle:      { emoji: ['🌴', '🌴', '🌳'], priority: 1, biome: true },
  savanna:     { emoji: ['🌾', '🌾', '🌾', '🌳'], priority: 1, biome: true },
  steppe:      { emoji: ['🌿', '🌿', '🌾', '🌱'], priority: 1, biome: true },
  wetland:     { emoji: ['🌿', '🌿', '🪷'], priority: 1, biome: true },
  tundra:      { emoji: ['🌱', '🌱', '🌿', '🪨'], priority: 1, biome: true },
  scrub:       { emoji: ['🌿', '🌿', '🌱', '🌳'], priority: 1, biome: true },  // shrubland (mediterranean maquis etc.)
  desert:      { emoji: ['🏜️', '🏜️', '🏜️', '🏜️', '🏜️', '🏜️', '🏜️', '🏜️', '🌵', '🪨'], priority: 1, biome: true },
  mountain:    { emoji: ['⛰️', '⛰️', '⛰️', '🪨'], priority: 1, biome: true },
  peaks:       { emoji: ['🏔️', '🏔️', '⛰️'], priority: 1, biome: true },  // above ~3800 m
  crops:       { emoji: ['🌾', '🌾', '🌾', '🌱', '🌳'], priority: 1, biome: true },
  town:        { emoji: ['🏘️', '🏘️', '🏢'], priority: 1, biome: true },
  // buildings, by height (OpenMapTiles has no building type)
  house:       { emoji: '🏠', priority: 1.2 },
  building:    { emoji: '🏫', priority: 1.2 },
  tower:       { emoji: '🏢', priority: 1.2 },
  // lines
  road:        { emoji: '🌑', priority: 3 },  // cars are drawn moving along the road lines (computeCars)
  pavement:    { emoji: '🪨', priority: 1 },  // people walk on footpaths (people.js)  // open space in town at street zoom
  highway:     { emoji: '🌑', priority: 3 },
  rail:        { emoji: '🛤️', priority: 3 },  // trains move along it (transit.js)
  tram:        { emoji: '🛤️', priority: 3 },
  // points
  city:        { emoji: '🏫', priority: 50 },
  food:        { emoji: '🍽️', priority: 20 },  // restaurants with no food hint in the name (pois.js)
  fastfood:    { emoji: '🍔', priority: 20 },
  cafe:        { emoji: '☕', priority: 20 },
  bar:         { emoji: '🍺', priority: 20 },
  shop:        { emoji: '🛒', priority: 20 },
  worship:     { emoji: '⛪', priority: 20 },
  poiSchool:   { emoji: '🏫', priority: 20 },
  poiHospital: { emoji: '🏥', priority: 20 },
  bank:        { emoji: '🏦', priority: 20 },
  hotel:       { emoji: '🏨', priority: 20 },
  museum:      { emoji: '🏛️', priority: 20 },
  station:     { emoji: '🚉', priority: 20 },
  bus:         { emoji: '🚏', priority: 20 },
  fuel:        { emoji: '⛽', priority: 20 },
  parking:     { emoji: '🚙', priority: 20 },
  pharmacy:    { emoji: '💊', priority: 20 },
  hairdresser: { emoji: ['💇', '💈'], priority: 20 },
  bicycle:     { emoji: '🚲', priority: 20 },
  swimming:    { emoji: '🏊', priority: 20 },
  playground:  { emoji: '🛝', priority: 20 },
  toilets:     { emoji: '🚻', priority: 20 },
  subway:      { emoji: '🚇', priority: 20 },
  icecream:    { emoji: '🍦', priority: 20 },
  bakery:      { emoji: '🥐', priority: 20 },
  cinema:      { emoji: '🎬', priority: 20 },
  theatre:     { emoji: '🎭', priority: 20 },
  police:      { emoji: '🚓', priority: 20 },
  fireStation: { emoji: '🚒', priority: 20 },
  attraction:  { emoji: '📸', priority: 20 },
  stadium:     { emoji: '🏟️', priority: 20 },
  atm:         { emoji: '🏧', priority: 20 },
  drinking:    { emoji: '🚰', priority: 20 },
  nightclub:   { emoji: '🪩', priority: 20 },
  post:        { emoji: '🏤', priority: 20 },
  artwork:     { emoji: '🗿', priority: 20 },
  library:     { emoji: '📚', priority: 20 },
  office:      { emoji: '💼', priority: 20 },
  dentist:     { emoji: '🦷', priority: 20 },
  doctors:     { emoji: '🩺', priority: 20 },
  vet:         { emoji: '🐕', priority: 20 },
  harbour:     { emoji: '⚓', priority: 20 },
  ferryTerminal: { emoji: '⛴️', priority: 20 },
  pier:        { emoji: '🎣', priority: 20 },  // someone fishing at the tip of a pier (pois.js)
  castle:      { emoji: '🏰', priority: 20 },
  monument:    { emoji: '🗽', priority: 20 },
  townHall:    { emoji: '🏛️', priority: 20 },
  laundry:     { emoji: '🧺', priority: 20 },
  bin:         { emoji: '🗑️', priority: 20 },
  recycling:   { emoji: '♻️', priority: 20 },
  info:        { emoji: 'ℹ️', priority: 20 },
  phone:       { emoji: '☎️', priority: 20 },
  campsite:    { emoji: '⛺', priority: 20 },
  shelter:     { emoji: '🛖', priority: 20 },
  picnic:      { emoji: '🧺', priority: 20 },
  escapeGame:  { emoji: '🔐', priority: 20 },
  iceRink:     { emoji: '⛸️', priority: 20 },
  dogPark:     { emoji: '🐩', priority: 20 },
  carDealer:   { emoji: '🚘', priority: 20 },
  motoParking: { emoji: '🛵', priority: 20 },
  gate:        { emoji: '🚧', priority: 20 },
  bikeParking: { emoji: '🚲', priority: 20 },
  gym:         { emoji: '🏋️', priority: 20 },
  aquarium:    { emoji: '🐠', priority: 20 },
  music:       { emoji: '🎵', priority: 20 },
  casino:      { emoji: '🎰', priority: 20 },
  hackerspace: { emoji: '🖥️', priority: 20 },
  yoga:        { emoji: '🧘', priority: 20 },
  peak:        { emoji: '🏔️', priority: 20 },
  volcano:     { emoji: '🌋', priority: 20 },
  hill:        { emoji: '⛰️', priority: 20 },  // summit below PEAK_SNOW_ELE (style.js); appended last: land cover tiles bake class colours
};

// Try icons without editing code: ?road=⬛&pavement=▫️ (comma = list, e.g. ?pavement=⬜,⬜,🧱)
for (const [k, v] of new URLSearchParams(location.search)) if (CLASSES[k]) CLASSES[k].emoji = v.includes(',') ? v.split(',') : v;

const FONT_SIZE = 14; // px; bigger = fewer cells = faster
const GAP = -3; // px added between emojis, horizontally and vertically; negative = emojis overlap their neighbours
// Hidden map resolution. 0.5 would mean 1/4 of the pixels to draw and read back, but MapLibre antialiases edges,
// so lines and POI dots under ~1 device px turn into blended (ignored) colours: POIs and z13 streets vanish.
const MAP_PIXEL_RATIO = 1;
const SAMPLE_STEP = 2; // sample every Nth map pixel in each direction (use 1 with MAP_PIXEL_RATIO 0.5)

// Auto-assign a unique color per class on a 6-level RGB grid (step 51).
// The land cover tiles bake these colours: rerun tools/landcover/build.mjs after inserting or reordering classes.
// ponytail: 215 classes max; blended line/circle edges can rarely land on a grid color.
const classList = Object.values(CLASSES);
classList.forEach((cls, i) => {
  const n = i + 1; // skip pure black
  cls.rgb = [(n % 6) * 51, (Math.floor(n / 6) % 6) * 51, (Math.floor(n / 36) % 6) * 51];
});
const c = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, `rgb(${v.rgb})`]));
const debug = new URLSearchParams(location.search).has('debug');
if (debug) document.body.classList.add('debug');
// Space toggles the raw class-color map under the emojis (debugging); not in the search box or on a focused control (space presses it)
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); document.body.classList.toggle('raw'); }
});
