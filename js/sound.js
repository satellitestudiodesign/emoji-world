// --- Ambient sound: synthesized from what's on screen, no audio files ----------------------------------------------
// draw() counts the classes of the visible cells and calls soundMix(); each channel's level follows its share of the
// screen. One looped white-noise buffer feeds filtered channels (waves, wind, traffic); crickets are a pulsed sine,
// birds are random chirps. Off until 🔊 is clicked (browsers only start audio after a user gesture).
// ponytail: rain/storm channel comes with the weather layer (PLAN.md)
const SOUND_GREEN = new Set(['grass', 'wood', 'forest', 'conifer', 'jungle', 'savanna', 'steppe', 'wetland', 'marsh',
  'farmland', 'orchard', 'vineyard', 'golf'].map(classIdx));
const SOUND_WATER = new Set([WATER, LAKE]);
const SOUND_GLOBE_ZOOM = [2, 4]; // silent with the whole globe in view (zoom <= 2), full sound from zoom 4
const SOUND_GAIN = 0.3, SOUND_EVERY_MS = 500, SOUND_RAMP_S = 1; // master volume, mix updates, crossfade time constant
let actx = null, chans = null, soundAt = 0, noiseBuf = null, cityLevel = 0; // soundOn lives in ui.js: draw() reads it before this file loads

const clamp01 = (v) => Math.min(1, Math.max(0, v));
function startSound() {
  actx = new AudioContext();
  const master = actx.createGain();
  master.gain.value = SOUND_GAIN;
  master.connect(actx.destination);
  const buf = noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const level = () => { const g = actx.createGain(); g.gain.value = 0; g.connect(master); return g; };
  // slow oscillator added to an AudioParam: param = its value ± depth
  const lfo = (param, hz, depth, type = 'sine') => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = hz; g.gain.value = depth;
    o.connect(g).connect(param); o.start();
  };
  const noise = (type, freq, q = 1) => {
    const src = actx.createBufferSource(), f = actx.createBiquadFilter();
    src.buffer = buf; src.loop = true; src.playbackRate.value = 0.9 + Math.random() * 0.2; // channels don't phase-lock
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); src.start();
    return f;
  };
  const waves = level(), swell = actx.createGain(); // waves swell in and out every ~10 s
  swell.gain.value = 0.6; lfo(swell.gain, 0.1, 0.4);
  noise('lowpass', 500).connect(swell).connect(waves);
  const wind = level(), windF = noise('bandpass', 800, 0.7);
  lfo(windF.frequency, 0.05, 300); // gusts
  windF.connect(wind);
  const traffic = level();
  noise('lowpass', 200).connect(traffic);
  const crickets = level(), pulse = actx.createGain(), trill = actx.createGain(), tone = actx.createOscillator();
  tone.frequency.value = 4500; tone.start();
  pulse.gain.value = 0.5; lfo(pulse.gain, 30, 0.5, 'square'); // fast chirp
  trill.gain.value = 0.5; lfo(trill.gain, 1.5, 0.5, 'square'); // chirps come in bursts
  tone.connect(pulse).connect(trill).connect(crickets);
  const birds = level(), city = level();
  chans = { waves, wind, traffic, crickets, birds, city };
  chirp(); cityEvent();
}

// --- City: random vehicles over the traffic hum. Each event builds its own nodes into chans.city and stops them.
// A pass-by: gain swells and fades, pan sweeps across, pitch drops as it passes (Doppler).
function passBy(nodes, dur, peak, pitch = []) {
  const t = actx.currentTime, g = actx.createGain(), p = actx.createStereoPanner(), dir = Math.random() < 0.5 ? -1 : 1;
  p.pan.setValueAtTime(-dir * 0.9, t); p.pan.linearRampToValueAtTime(dir * 0.9, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur / 2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [param, f] of pitch) { // f: frequency at the closest point
    param.setValueAtTime(f * 1.06, t); param.linearRampToValueAtTime(f * 1.06, t + dur * 0.4);
    param.linearRampToValueAtTime(f * 0.94, t + dur * 0.6);
  }
  g.connect(p).connect(chans.city);
  for (const n of nodes) { n.connect(g); n.start?.(t); }
  return { t, end: t + dur, out: g, stop: () => nodes.forEach((n) => n.stop?.(t + dur)) };
}
const osc = (type, f) => { const o = actx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
const filtered = (src, type, f) => { const flt = actx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; src.connect(flt); flt.start = (t) => src.start(t); flt.stop = (t) => src.stop(t); return flt; };
const tyres = (f) => { const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return filtered(s, 'bandpass', f); };
const rnd = (a, b) => a + Math.random() * (b - a);

const CITY_EVENTS = [ // [weight, play]
  [50, () => { // car: low engine + tyre noise; fast cars pass quicker and louder
    const speed = Math.random(), f = rnd(45, 80), e = osc('sawtooth', f);
    passBy([filtered(e, 'lowpass', 300), tyres(rnd(600, 1200))], 8 - 4 * speed, 0.15 + 0.25 * speed, [[e.frequency, f]]).stop();
  }],
  [20, () => { // motorbike: higher, buzzier, revs up on the way past
    const f = rnd(100, 170), a = osc('sawtooth', f), b = osc('sawtooth', f * 1.01);
    const pb = passBy([filtered(a, 'lowpass', 1500), filtered(b, 'lowpass', 1500)], rnd(3.5, 6), 0.25, []);
    for (const o of [a, b]) { o.frequency.setValueAtTime(f, pb.t); o.frequency.exponentialRampToValueAtTime(f * 1.4, pb.end); }
    pb.stop();
  }],
  [18, () => { // honk: two horn notes a minor third apart, soft edges (no clicks), near or far
    const t = actx.currentTime, f = rnd(380, 460), n = Math.random() < 0.3 ? 2 : 1, far = Math.random();
    const g = actx.createGain(), p = actx.createStereoPanner(), tone = actx.createBiquadFilter();
    p.pan.value = rnd(-0.8, 0.8); g.gain.value = 0;
    tone.type = 'lowpass'; tone.frequency.value = 3000 - 2000 * far; tone.Q.value = 2; // far horns sound duller
    tone.connect(g).connect(p).connect(chans.city);
    const peak = 0.1 - 0.06 * far;
    let end = t;
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.3, len = n === 2 ? 0.18 : rnd(0.3, 0.7);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
      g.gain.setValueAtTime(peak, t0 + len); g.gain.linearRampToValueAtTime(0, t0 + len + 0.04);
      end = t0 + len + 0.05;
    }
    for (const r of [1, 1.19]) { const o = osc('sawtooth', f * r); o.connect(tone); o.start(t); o.stop(end); }
  }],
  [3, () => { // ambulance: two-tone (hi-lo) or wailing siren passing by
    const dur = rnd(7, 11), o = osc('triangle', 800), pb = passBy([filtered(o, 'lowpass', 3000)], dur, 0.2);
    const dop = (t) => (t - pb.t < dur / 2 ? 1.05 : 0.95);
    if (Math.random() < 0.5) for (let t = pb.t, hi = true; t < pb.end; t += 0.5, hi = !hi) o.frequency.setValueAtTime((hi ? 900 : 650) * dop(t), t);
    else {
      o.frequency.setValueAtTime(650, pb.t); // wail: ramps start from here
      for (let t = pb.t, up = true; t < pb.end; t += 1.5, up = !up) o.frequency.linearRampToValueAtTime((up ? 1300 : 650) * dop(t), t + 1.5);
    }
    pb.stop();
  }],
];
const CITY_WEIGHT = CITY_EVENTS.reduce((s, [w]) => s + w, 0);
// busier city on screen = events closer together; no nodes made while silent or suspended (they'd pile up)
function cityEvent() {
  if (cityLevel > 0.02 && actx.state === 'running') {
    let r = Math.random() * CITY_WEIGHT;
    for (const [w, play] of CITY_EVENTS) if ((r -= w) < 0) { play(); break; }
  }
  setTimeout(cityEvent, rnd(400, 2500) / Math.max(0.3, cityLevel * 2));
}
// a bird: 2-4 short rising chirps, then another bird after a random wait (silent while the birds channel is at 0)
function chirp() {
  if (actx.state !== 'running') { setTimeout(chirp, 1000); return; } // suspended: don't queue chirps for later
  const t = actx.currentTime, f = 2000 + Math.random() * 2000, n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const o = actx.createOscillator(), g = actx.createGain(), t0 = t + i * 0.15;
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.3, t0 + 0.08);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.02); g.gain.linearRampToValueAtTime(0, t0 + 0.1);
    o.connect(g).connect(chans.birds); o.start(t0); o.stop(t0 + 0.12);
  }
  setTimeout(chirp, 600 + Math.random() * 2500);
}

// seen: visible cells per class index, space: cells off the globe. Called by draw() while sound is on.
function soundMix(seen, space) {
  if (!chans || Date.now() - soundAt < SOUND_EVERY_MS) return;
  soundAt = Date.now();
  let total = space, water = 0, green = 0, urban = 0;
  seen.forEach((n, i) => {
    total += n;
    if (SOUND_WATER.has(i)) water += n; else if (SOUND_GREEN.has(i)) green += n; else if (URBAN.has(i)) urban += n;
  });
  if (!total) return;
  const z = map.getZoom(), night = isNight(map.getCenter(), subsolar()), close = clamp01((z - 10) / 4);
  const levels = {
    waves: 0.8 * water / total * clamp01((z - WAVE_MINZOOM) / 3), // fades in with the 🌊 (draw.js), full 3 levels later
    wind: 0.5 * (0.1 + 0.5 * space / total + 0.3 * clamp01((10 - z) / 8)) * clamp01(z - 5), // from zoom 5 (in over 1 level), windier higher up
    traffic: 0.3 * urban / total * clamp01((z - 12) / 3), // distant hum under the city events
    city: (cityLevel = urban / total * clamp01((z - 12) / 3)),
    birds: night ? 0 : green / total * close,
    crickets: night ? 0.3 * green / total * close : 0,
  };
  const [z0, z1] = SOUND_GLOBE_ZOOM, globe = solarOpen ? 0 : clamp01((z - z0) / (z1 - z0)); // silent in space
  for (const k in levels) chans[k].gain.setTargetAtTime(levels[k] * globe, actx.currentTime, SOUND_RAMP_S);
  radioMix(cityLevel * globe);
}

// --- Local radio: a nearby station bleeds in, faint, when zoomed into a city ---------------------------------------
// Stations from radio-browser.info (free, no key, CORS open). The <audio> runs through actx: a compressor levels loud
// and quiet stations. That needs CORS on the stream (~2/3 send it); the rest fail to load and are skipped (onerror).
// ponytail: skipping costs stations; a second plain <audio> for no-CORS streams (unleveled) if cities come up empty
const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/search?is_https=true&hidebroken=true' +
  '&order=clickcount&reverse=true&limit=20&geo_distance=50000'; // ponytail: one mirror, fail over via all.api DNS if de1 flaky
const RADIO_GAIN = 0.5; // radio volume relative to SOUND_GAIN, at full city (after the compressor)
const RADIO_NAME_MAX = 24; // station name cells shown left of 🔊 (ui.js)
const radio = Object.assign(new Audio(), { crossOrigin: 'anonymous' }); // no CORS = error = next station
let radioList = [], radioCell = '', radioOut = null;
// play the next nearest station; called again when a stream is dead or unsupported
function radioNext() {
  const s = radioList.shift();
  if (s) { radio.src = s.url_resolved; radio.title = s.name; } else radio.removeAttribute('src');
}
radio.onerror = radioNext;
radio.onplaying = radio.onpause = () => map.triggerRepaint(); // station name shows only while playing
// level: city share of the screen (0-1). Looks up stations once per ~0.5° cell, after the map settles.
function radioMix(level) {
  if (!radioOut) { // element -> leveler -> volume; built on first mix (actx exists by then)
    const comp = new DynamicsCompressorNode(actx, { threshold: -40, knee: 10, ratio: 12, attack: 0.01, release: 0.5 });
    radioOut = actx.createGain();
    actx.createMediaElementSource(radio).connect(comp).connect(radioOut).connect(actx.destination);
  }
  const c = map.getCenter(), cell = `${Math.round(c.lat * 2)},${Math.round(c.lng * 2)}`;
  if (radioCell && cell !== radioCell) { // left the station's area: cut it now, not after the next lookup lands
    radioCell = ''; radioList = [];
    radio.removeAttribute('src'); radio.load(); // load() with no src stops the stream and its download
  }
  if (level > 0 && !map.isMoving()) {
    if (cell !== radioCell) {
      radioCell = cell;
      fetch(`${RADIO_API}&geo_lat=${c.lat.toFixed(2)}&geo_long=${c.lng.toFixed(2)}`).then((r) => r.json()).then((list) => {
        if (cell !== radioCell) return; // moved on meanwhile
        radioList = list.filter((s) => !/\.m3u8?(\?|$)/.test(s.url_resolved)); // HLS: no native <audio> outside Safari
        radioNext();
      }).catch(() => { radioCell = ''; }); // retry next mix
    }
  }
  const vol = SOUND_GAIN * RADIO_GAIN * level;
  radioOut.gain.setTargetAtTime(vol, actx.currentTime, SOUND_RAMP_S);
  if (vol > 0.005 && radio.getAttribute('src')) { if (radio.paused) radio.play().catch(() => {}); }
  else if (!radio.paused) radio.pause();
}

function toggleSound() {
  soundOn = !soundOn;
  if (!actx) startSound();
  if (soundOn) actx.resume(); else { actx.suspend(); radio.pause(); } // soundMix plays it again once sound is on
  map.triggerRepaint();
}
// silent in background tabs
document.addEventListener('visibilitychange', () => {
  if (actx && soundOn) { if (document.hidden) { actx.suspend(); radio.pause(); } else actx.resume(); }
});
