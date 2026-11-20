let landData, land, cloudData, clouds, canvas, context, angle, distance, pos, p, s, i, fps, globe;
let projectionLand, pathLand, projectionClouds, pathClouds;
// Vendored copies of the original gists (simplified https://unpkg.com/world-atlas@1/world/110m.json)
let landUrl = 'data/world-110m.json';
let cloudsUrl = 'data/clouds.json';
var spinSpeed = 3;
var padding = 2.5;
var res = Math.floor((window.innerHeight) / 12);
var imagePixels = 4 * res * res;

function preload() {
  landData = loadJSON(landUrl);
  cloudData = loadJSON(cloudsUrl);
}

function setup() {
  pixelDensity(1);
  frameRate(10);
  noStroke();

  createCanvas(res, res).parent('ref');

  land = topojson.feature(landData, landData.objects.land);
  clouds = topojson.feature(cloudData, cloudData.objects.clouds);

  canvas = d3.select('canvas');
  // willReadFrequently: loadPixels() reads the canvas every frame
  context = canvas.node().getContext('2d', { willReadFrequently: true });
  angle = 0;

  projectionLand = d3.geoOrthographic()
    .scale(res / 2 - padding)
    .translate([res / 2, res / 2]);
  pathLand = d3.geoPath(projectionLand, context);

  projectionClouds = d3.geoOrthographic()
    .scale(res / 2)
    .translate([res / 2, res / 2]);
  pathClouds = d3.geoPath(projectionClouds, context);

  globe = document.getElementById('emojiGlobe');
  fps = document.getElementById('fps');

  var zoom = d3.zoom()
    .scaleExtent([res / 10, res]) // bound zoom
    .on('zoom', zoomed);

  // Start zoom at the current globe scale so the first wheel tick doesn't jump
  canvas.call(zoom).call(zoom.transform, d3.zoomIdentity.scale(res / 2 - padding));
}

// d3 v6+ removed the global d3.event; the event is passed to the handler
function zoomed(event) {
  projectionLand.scale(event.transform.k);
  projectionClouds.scale(event.transform.k + padding);
}

function draw() {
  background(0);

  // Rotate the earth.
  projectionLand.rotate([angle += spinSpeed, 0]);
  projectionClouds.rotate([angle * .2, angle * .2]);

  // Draw the sea.
  fill(0, 0, 255, 255);
  ellipse(width / 2, height / 2, projectionLand.scale() * 2, projectionLand.scale() * 2);

  // Draw the land.
  fill(0, 255, 0, 255);
  context.beginPath();
  pathLand(land);
  context.fill();

  // Draw the clouds.
  fill(255, 255, 0, 255);
  context.beginPath();
  pathClouds(clouds);
  context.fill();

  loadPixels();

  // Paint cities
  cities.forEach(function (city) {
    // see if the city is in the visible part of the globe
    distance = d3.geoDistance(
      [city.lon, city.lat],
      [-projectionLand.rotate()[0], projectionLand.rotate()[1]]
    );
    if (distance < Math.PI / 2 - .2) {
      pos = projectionLand([city.lon, city.lat]);
      p = Math.round(pos[1]) * (4 * res) + Math.round(pos[0]) * 4;
      pixels[p] = 255; // paint the pixel red
      pixels[p + 1] = pixels[p + 2] = 0;
    }
  });

  updatePixels();

  // convert pixels to emojis
  s = "";
  for (i = 0; i < imagePixels; i += 4) {
    if (i % (4 * width) === 0 && i != 0) s += "<br>"; // line break
    if (pixels[i + 0] >= 127.5) {
      if (pixels[i + 1] >= 127.5) s += "☁️"; // yellow
      else s += "🏠"; // red
    } else if (pixels[i + 1] >= 127.5) {
      s += "🌳"; // green
    } else if (pixels[i + 2] >= 127.5) {
      s += "💦"; // blue
    } else {
      s += "<span class='s'></span>"; // bg
    }
  }

  globe.innerHTML = s;

  fps.innerHTML = 'FPS: ' + Math.round(frameRate());
}

var cities = [
  { lat: 31.039, lon: 121.668 },
  { lat: 39.906, lon: 116.38 },
  { lat: 24.928, lon: 67.075 },
  { lat: 22.617, lon: 114.025 },
  { lat: 23.052, lon: 113.453 },
  { lat: 19.066, lon: 72.869 },
  { lat: 41.013, lon: 28.955 },
  { lat: 55.75, lon: 37.616 },
  { lat: -23.55, lon: -46.633 },
  { lat: -4.325, lon: 15.322 },
  { lat: 39.133, lon: 117.183 },
  { lat: 31.549, lon: 74.343 },
  { lat: 28.61, lon: 77.23 },
  { lat: -6.2, lon: 106.816 },
  { lat: 23.033, lon: 113.716667 },
  { lat: 6.455, lon: 3.384082 },
  { lat: 12.966, lon: 77.566 },
  { lat: 37.566, lon: 126.966 },
  { lat: 23.016, lon: 113.116 },
  { lat: 35.683, lon: 139.683 },
  { lat: 30.658, lon: 104.064 },
  { lat: -12.043, lon: -77.028 },
  { lat: 19.433, lon: -99.133 },
  { lat: 51.507, lon: -0.1275 },
  { lat: 35.689, lon: 51.388 },
  { lat: 40.7127, lon: -74.0059 },
  { lat: 23.7, lon: 90.366 },
  { lat: 30.583, lon: 114.283 },
  { lat: 4.711, lon: -74.072 },
  { lat: 30.044, lon: 31.235 },
  { lat: 13.752, lon: 100.494 },
  { lat: -33.45, lon: -70.666 },
  { lat: 1.283333, lon: 103.833 },
  { lat: -6.8, lon: 39.283 },
  { lat: 59.95, lon: 30.3 },
  { lat: -26.204, lon: 28.045 },
  { lat: 34.05, lon: -118.25 },
  { lat: 52.516, lon: 13.389 },
  { lat: 40.383, lon: -3.716 },
  { lat: -34.603, lon: -58.381 },
  { lat: -33.866, lon: 151.2 },
  { lat: 41.836, lon: -87.684 },
  { lat: 29.762, lon: -95.383 },
  { lat: 43.7, lon: -79.4 },
  { lat: 48.856, lon: 2.35 },
  { lat: 41.9, lon: 12.5 },
  { lat: -37.813, lon: 144.963 }
];
