// --- Boats on ferry routes, trains on railways and trams on tram lines, moving along them (see agents.js) ----
const BOAT_MINZOOM = 8, TRAIN_MINZOOM = 11;
// Real speeds are invisible from far away: below FAST_MAXZOOM speed and spacing double per zoom level out
const FAST_MAXZOOM = 15;
const zoomScale = () => 2 ** Math.max(0, FAST_MAXZOOM - map.getZoom());
const computeBoats = createFleet({
  layers: ['ferry'],
  spacing: 1000, // metres of route per boat at FAST_MAXZOOM
  speed: 10, // m/s at FAST_MAXZOOM, each boat gets 0.6x-1.4x
  emojis: () => ['⛴️', '⛴️', '⛴️', '🚢', '🛳️'],
  scale: zoomScale,
});
const computeTrains = createFleet({
  layers: ['rail', 'tram'],
  spacing: 600,
  speed: 20,
  emojis: (kind) => (kind === 'tram' ? ['🚋'] : ['🚆', '🚆', '🚄']),
  scale: zoomScale,
});
