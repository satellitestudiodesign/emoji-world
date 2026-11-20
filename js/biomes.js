// Biomes: RESOLVE Ecoregions 2017 + Natural Earth mountain ranges (data/biomes.json), low zooms only.

const BIOME_MAXZOOM = 6; // above this OpenMapTiles landcover/landuse take over
const BIOME_FADE = 2; // biome cells dither out to ground over this many zoom levels

// Map layers spliced into the style (style.js), below the OpenMapTiles landcover
const BIOME_LAYERS = [
    { id: 'biome', type: 'fill', source: 'biomes', maxzoom: BIOME_MAXZOOM + BIOME_FADE, filter: ['!=', ['get', 'b'], 0],
      paint: { 'fill-antialias': false, 'fill-color': ['match', ['get', 'b'],
        [1, 14], c.jungle, [2, 4], c.forest, [3, 5, 6], c.conifer, 7, c.savanna, 8, c.steppe,
        9, c.wetland, 10, c.mountain, 11, c.tundra, 12, c.olive, 13, c.desert, 15, c.rockice, c.forest] } },
    { id: 'mountain', type: 'fill', source: 'biomes', maxzoom: BIOME_MAXZOOM + BIOME_FADE, filter: ['==', ['get', 'b'], 0],
      paint: { 'fill-antialias': false, 'fill-color': c.mountain } },
    // ice sheets fill gaps in the biome data (inner Antarctica)
    { id: 'glacier', type: 'fill', source: 'omt', 'source-layer': 'landcover', maxzoom: BIOME_MAXZOOM,
      filter: ['==', ['get', 'class'], 'ice'], paint: { 'fill-antialias': false, 'fill-color': c.ice } },
];
