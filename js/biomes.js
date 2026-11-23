// Low-zoom land cover: Copernicus LC100 + terrain relief, pre-painted in class colours (tools/landcover/build.mjs).

const BIOME_MAXZOOM = 6; // above this OpenMapTiles landcover/landuse take over
const BIOME_FADE = 2; // biome cells dither out to ground over this many zoom levels

// Map layers spliced into the style (style.js), below the OpenMapTiles landcover
const BIOME_LAYERS = [
    // nearest + no fade: pixels keep their exact class colour (classAt ignores anything off the colour grid)
    { id: 'biome', type: 'raster', source: 'landcover', maxzoom: BIOME_MAXZOOM + BIOME_FADE,
      paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
    // ice sheets fill gaps in the land cover (Antarctica, far north)
    { id: 'glacier', type: 'fill', source: 'omt', 'source-layer': 'landcover', maxzoom: BIOME_MAXZOOM,
      filter: ['==', ['get', 'class'], 'ice'], paint: { 'fill-antialias': false, 'fill-color': c.ice } },
];
