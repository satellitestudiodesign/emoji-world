# Time scrub, weather layer, ambient sound

## Context
Emoji World is a web toy. Ideas to make people stay and play: drag time to watch night/stars/weather move, see real weather as emojis, hear the place you're looking at. Choices made: ±7 days driving sky + weather; Open-Meteo for weather; synthesized Web Audio (no files).

All three hook into existing patterns: a toggle cell in `TOGGLES` ([js/ui.js:23](js/ui.js#L23)), a per-cell value in `draw()` ([js/draw.js:43](js/draw.js#L43)), and a plain global-scope script in [index.html](index.html).

## 1. Time scrub ⏰ — DONE, changed: last 24 h only (−24 h…now); ISS hidden in the past; past clouds = Open-Meteo hourly cloud_cover grid (js/clouds.js)
- **One clock.** In [js/sky.js](js/sky.js) add `let timeOffset = 0; const simNow = () => Date.now() + timeOffset;`. Use it in:
  - `subsolar` default ([js/sky.js:79](js/sky.js#L79)) and `computeStars` `now` ([js/sky.js:109](js/sky.js#L109))
  - `cloudAt` drift ([js/clouds.js:28](js/clouds.js#L28))
  - Leave as real time: agents, `draw` tick animation, search cursor. ISS: hide when `|timeOffset| > 10 min` (it's extrapolated from live fixes, so it's only valid near now).
  - Clouds: when `|timeOffset| > 3 h`, `cloudAt` uses the weather layer's hourly `cloud_cover` instead of the live image (fallback: no clouds if weather isn't loaded).
- **UI.** New toggle `['time', '⏰', 'Time', 'BACK TO NOW', 'TIME TRAVEL']`. While on, a bottom strip of cells (drawn in `computeUi`, like the search line) shows the date/time in letter cells plus a `▶️/⏸️` cell.
  - Input: one native `<input type="range" class="ctl">` over the strip (min −168 h, max +168 h, step 0.25 h). It's invisible like the other `.ctl` controls, so drag, keyboard and touch work and screen readers announce the value. `input` sets `timeOffset` and calls `map.triggerRepaint()`.
  - ▶️ = a button that advances time 1 h per real second (in `requestAnimationFrame`), and stops at the end of the range.
  - Turning it off resets `timeOffset = 0`. Save the offset in the hash as `t=<hours>` next to `hide=` (reuse `hashParts`/`saveToggles`).
- Don't use letter keys: any printable key opens the search ([js/ui.js:231](js/ui.js#L231)).

## 2. Weather layer 🌦️ — new [js/weather.js](js/weather.js)
- **Fetch.** On `moveend` (debounced 500 ms), only when zoom < `CLOUD_MAXZOOM`, run one Open-Meteo request for a ~10×6 grid of lat/lng over the visible bounds (comma-separated `latitude=`/`longitude=` lists, which return an array):
  `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=weather_code,cloud_cover&past_days=7&forecast_days=7&timezone=GMT`
  Keep the results as `weather = { pts: [[lng, lat, codes[], cover[]]], t0 }`. Skip the refetch if the bounds haven't moved by more than half a grid step. On error, keep the old data.
- **Look-up.** `weatherAt(ll)` = nearest grid point, hour index `floor((simNow() - t0) / 3600e3)` → code → emoji: 51–67/80–82 🌧️, 71–77/85–86 🌨️, 95–99 ⛈️, 45–48 🌫️, otherwise null. `weatherCover(ll)` gives `cloud_cover` 0–100 for the time-travel fallback above.
- **Draw.** In `draw()` ([js/draw.js:244](js/draw.js#L244)), a cloudy cell with a weather emoji gets an overlay kind in the bits above the cloud opacity (`WEATHER_SHIFT = 24`, 2 bits: none/rain/snow/storm, fog). `paintGrid` ([js/map.js:137](js/map.js#L137)) picks that glyph instead of `cloudGlyph` (pre-render with `glyphId` like `cloudGlyph` at [js/map.js:114](js/map.js#L114)).
- New toggle `['weather', '🌦️', 'Weather', 'HIDE WEATHER', 'SHOW WEATHER']`, on by default (new keys start on via `hide=`).
- Credit "Weather: Open-Meteo.com (CC-BY 4.0)" in the commented credits block in [index.html](index.html).

## 3. Ambient sound 🔊 — DONE (plus city events: cars, motorbikes, honks, sirens; silent at globe zoom) — new [js/sound.js](js/sound.js)
- **Mix input.** In `draw()`, count the classes of visible cells into a small object as cells are computed: `{ water, green (wood/grass/farmland/marsh), urban (residential/commercial/industrial + cars), total }`. Also record `night` and the weather code at the screen centre (`map.getCenter()`), plus zoom. Hand it to `soundMix(mix)`, throttled to ~2 Hz.
- **Engine** (created on the first 🔊 click, which is the user gesture browsers require): one `AudioContext`, one 2-second white-noise buffer looped into a few filtered channels, each with a `GainNode` ramped by `setTargetAtTime` (≈1 s, no clicks):
  - waves: lowpass ~500 Hz noise, gain × slow 0.1 Hz LFO, ∝ water share
  - wind: bandpass ~800 Hz, swept slowly; strong in space / low zoom
  - rain: highpass ~2 kHz, on when the centre weather is rain/storm; storm adds a random low thump
  - traffic hum: lowpass ~200 Hz, ∝ urban share at zoom ≥ `CAR_MINZOOM`
  - birds (day, green): short sine chirps with a frequency sweep at random intervals
  - crickets (night, green): a ~4.5 kHz sine pulsed by a 30 Hz square LFO
- Master gain 0.3. Toggle `['sound', '🔊', 'Sound', 'MUTE', 'SOUND ON', '🔇']`, **off by default** (`hide=sound` on first load, and never autoplay). Suspend the `AudioContext` when muted or the tab is hidden (`visibilitychange`).

## Files
- edit: [js/sky.js](js/sky.js), [js/clouds.js](js/clouds.js), [js/draw.js](js/draw.js), [js/map.js](js/map.js), [js/ui.js](js/ui.js), [index.html](index.html) (add `weather.js` after `clouds.js`, `sound.js` after `ui.js`)
- new: [js/weather.js](js/weather.js), [js/sound.js](js/sound.js)
- Toggle column grows from 7 to 10 cells. Check that it fits short phone screens (`toggleBox` at [js/ui.js:175](js/ui.js#L175)).

## Order
1 → 2 → 3, as separate commits. Time first, since weather reads `simNow()`.

## Verification
Serve statically (`python3 -m http.server` in the repo), then open it in a browser:
- ⏰: drag the slider and watch the terminator and stars move. Dragging +12 h flips the hemisphere's night, the ISS disappears, and clouds switch to forecast cover. Reload keeps `t=`. Turning the toggle off snaps back to now.
- 🌦️: Network tab shows one Open-Meteo call per settled move. Rain/snow emojis appear where a weather site shows precipitation now. Scrubbing ±days changes them.
- 🔊: silent until clicked. Ocean view = waves, a forest at night = crickets, a city zoomed in = hum, panning crossfades smoothly. Muting or switching tabs stops the audio.
- Watch the FPS counter (`#fps`) stays roughly where it was before.

## Notes
- Open-Meteo's free API is for **non-commercial use only**, with a limit of about 10k calls a day. Fine for a toy; check its terms if GFW will host it publicly.
- Skipped: per-cell weather sounds, wind direction, a radar layer. Add them if the basics land well.
