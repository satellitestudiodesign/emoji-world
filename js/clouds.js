// Live clouds: equirectangular image, cloud cover in alpha, rebuilt every 3h from EUMETSAT data
const CLOUD_URL = 'https://clouds.matteason.co.uk/images/1024x512/clouds-alpha.png';
const CLOUD_MAXZOOM = 8, CLOUD_FADE = 2; // clouds fade out linearly over zoom 6 -> 8
const CLOUD_MIN = 200; // alpha 0-255 from which a cell gets a ☁️ (median is ~220)
const CLOUD_LEVELS = 4; // opacity steps from CLOUD_MIN to 255: 25%, 50%, 75%, 100% (1: every cloud solid)
let clouds = null; // { w, h, a: Uint8Array alpha, time: ms when the image was made }
async function loadClouds() {
  const res = await fetch(CLOUD_URL + '?' + Math.floor(Date.now() / 3600e3)); // bust cache hourly
  const time = Date.parse(res.headers.get('Last-Modified')) || Date.now(); // CORS-safelisted header
  const img = await createImageBitmap(await res.blob());
  const cv = new OffscreenCanvas(img.width, img.height);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
  const a = new Uint8Array(img.width * img.height);
  for (let i = 0; i < a.length; i++) a[i] = rgba[i * 4 + 3];
  clouds = { w: img.width, h: img.height, a, time };
  map.triggerRepaint();
}
// Clouds drift with the prevailing winds since the image was made (degrees of longitude per hour).
// ponytail: crude zonal model (trade winds west, westerlies east); real winds vary, drift resets each new image.
const windDegPerHour = (lat) => { const l = Math.abs(lat); return l < 30 ? -0.15 : l < 60 ? 0.3 : 0; };
loadClouds().catch(() => {}); // no clouds if the service is down
setInterval(() => loadClouds().catch(() => {}), 3 * 3600e3);
// Bilinear sample, so zoomed-in views don't show the image's pixel blocks
const cloudAt = (ll) => {
  const { w, h, a, time } = clouds;
  const lng = ll.lng - windDegPerHour(ll.lat) * (Date.now() - time) / 3600e3; // look upwind
  const fx = (lng + 180) / 360 * w - 0.5, fy = Math.min(h - 1, Math.max(0, (90 - ll.lat) / 180 * h - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w, ya = y0 * w, yb = Math.min(h - 1, y0 + 1) * w;
  return (a[ya + xa] * (1 - tx) + a[ya + xb] * tx) * (1 - ty) + (a[yb + xa] * (1 - tx) + a[yb + xb] * tx) * ty;
};
