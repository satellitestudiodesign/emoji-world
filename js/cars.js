// --- Cars: driving along roads (see agents.js) ---------------------------------
const CAR_MINZOOM = 15;
const CARS = { road: ['🚗', '🚗', '🚕', '🚙', '🚐'], highway: ['🚗', '🚙', '🚌', '🚚', '🚛', '🚛'] };
// near their station (POI kind) a new car is often a service vehicle; next to farmland a road car is often a tractor
const SERVICE = [['poiHospital', '🚑'], ['police', '🚔'], ['fireStation', '🚒']], SERVICE_M = 250, SERVICE_SHARE = 0.1;
const TRACTOR_SHARE = 0.4, FARM_IDX = classList.indexOf(CLASSES.farmland);
// farmland on the hidden map one cell around lngLat?
function nearFarm(ll) {
  if (!pixels) return false;
  const q = map.project(ll), sx = pixW / vw, sy = pixH / vh;
  return [[-cell, 0], [cell, 0], [0, -cell], [0, cell]].some(([dx, dy]) => {
    const x = Math.floor((q.x + dx) * sx), y = Math.floor((q.y + dy) * sy);
    if (x < 0 || y < 0 || x >= pixW || y >= pixH) return false;
    const p = ((pixH - 1 - y) * pixW + x) * 4;
    return pixels[p + 3] === 255 && classAt(pixels, p) === FARM_IDX;
  });
}
function carEmojis(kind, ll) {
  for (const [k, e] of SERVICE) {
    if (Math.random() < SERVICE_SHARE && poiPts.some((q) => q[4] === k && metres(ll, q) < SERVICE_M)) return [e];
  }
  if (kind === 'road' && Math.random() < TRACTOR_SHARE && nearFarm(ll)) return ['🚜'];
  return CARS[kind];
}
const computeCars = createFleet({
  layers: ['road', 'highway'],
  spacing: 120, // metres of road per car on average
  speed: 8, // m/s, each car gets 0.6x-1.4x
  emojis: carEmojis,
});
