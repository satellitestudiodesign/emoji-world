// --- Agents moving along lines (cars on roads, people on footpaths) -----------
// Agents follow the line features MapLibre has rendered for some layers (queried after each move and every 2s).
// Lines come cut into pieces at tile edges, with a small overlap. When an agent runs off the end of its piece it
// hands over to the nearest point on another piece within HANDOFF_M that heads roughly the same way; failing that
// it turns onto the nearest crossing line (the way with more line ahead), and only U-turns if nothing is close.
// Off screen, "nothing close" is the edge of the loaded lines, so the agent respawns instead of piling up there.
// ponytail: approximate, no real junction choice or lanes. Full fix: snap ends and chain pieces into roads.
const HANDOFF_M = 10; // how far a piece end may be from the next piece
const HANDOFF_COS = 0.7; // straight on = next piece within ~45° of the heading
const M_LAT = 110540, mLng = (lat) => Math.cos(lat * RAD) * 111320; // metres per degree
const metres = (a, b) => Math.hypot((b[0] - a[0]) * mLng(a[1]), (b[1] - a[1]) * M_LAT);

// Point and segment index at distance d along a line
function pointAt(line, d) {
  let i = 1; while (i < line.pts.length - 1 && line.cum[i] < d) i++;
  const a = line.pts[i - 1], b = line.pts[i], f = (d - line.cum[i - 1]) / ((line.cum[i] - line.cum[i - 1]) || 1);
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i };
}
// Unit heading (east, north metres) of an agent: its segment times its direction
function heading(ag) {
  const { i } = pointAt(ag.line, ag.d), a = ag.line.pts[i - 1], b = ag.line.pts[i];
  const x = (b[0] - a[0]) * mLng(a[1]) * ag.dir, y = (b[1] - a[1]) * M_LAT * ag.dir, n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
}
// Nearest point on any of `lines` not in `exclude` within HANDOFF_M of p, heading along h, with at least
// `ahead` metres left in that direction -> { line, d, dir } or null.
// minCos 0 = turns allowed: lines across the heading go whichever way has more line ahead.
function nearestOnLines(lines, p, h, exclude = [], ahead = 0, minCos = HANDOFF_COS) {
  let best = null, bestDist = HANDOFF_M;
  const kx = mLng(p[1]);
  for (const line of lines) {
    if (exclude.includes(line)) continue;
    for (let i = 1; i < line.pts.length; i++) {
      const a = line.pts[i - 1], b = line.pts[i];
      const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * M_LAT, dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * M_LAT;
      const len2 = dx * dx + dy * dy; if (!len2) continue;
      const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2));
      const dist = Math.hypot(ax + t * dx, ay + t * dy);
      if (dist >= bestDist) continue;
      const cos = (dx * h[0] + dy * h[1]) / Math.sqrt(len2);
      if (Math.abs(cos) < minCos) continue; // a crossing line, not the continuation
      const d = line.cum[i - 1] + t * (line.cum[i] - line.cum[i - 1]);
      const dir = Math.abs(cos) >= HANDOFF_COS ? (cos > 0 ? 1 : -1) : (line.len - d > d ? 1 : -1);
      if ((dir > 0 ? line.len - d : d) < ahead) continue; // overlapping piece ending here too: would ping-pong
      bestDist = dist;
      best = { line, d, dir };
    }
  }
  return best;
}

// Point inside a ring (ray casting)
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Straight walking lines across an area: chords between edge points that stay inside the ring
// (checked at 1/4, 1/2, 3/4). Picks come from a hash of the ring, so a refetch gives the same lines.
// ponytail: holes ignored; about one chord per 40 m of edge, max 8.
function areaChords(ring) {
  const n = ring.length - 1; // last point repeats the first
  if (n < 3) return [];
  let perim = 0; for (let i = 1; i <= n; i++) perim += metres(ring[i - 1], ring[i]);
  const k = Math.min(8, Math.max(1, Math.round(perim / 40)));
  const seed = cellHash(Math.round(ring[0][0] * 1e5), Math.round(ring[0][1] * 1e5));
  const chords = [];
  for (let j = 0; j < k * 3 && chords.length < k; j++) { // a few tries per chord
    const h = cellHash(seed, j), a = ring[h % n], b = ring[(h >>> 12) % n];
    if (metres(a, b) < 10) continue;
    const at = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    if ([0.25, 0.5, 0.75].every((f) => inRing(at(f), ring))) chords.push([a, b]);
  }
  return chords;
}

// A fleet of agents on the rendered lines of `layers`. Returns compute() -> Map(cellIndex -> html);
// agents heading right on screen are mirrored (emoji cars and walkers face left).
// emojis(kind, lngLat) gives the emoji choices for a new agent on a line from layer `kind`, at lngLat.
// Polygons in `layers` are walked across along areaChords.
// scale() multiplies speed and spacing (boats/trains: faster and sparser when zoomed out, so they visibly move).
function createFleet({ layers, spacing, speed, emojis, max = 400, scale = () => 1 }) {
  let lines = [], queried = 0, agents = [], lastStep = 0;

  function spawn() {
    const maxLen = Math.max(...lines.map((l) => l.len)); // pick a line weighted by length (rejection sampling)
    let line; do line = lines[Math.floor(Math.random() * lines.length)]; while (Math.random() * maxLen > line.len);
    const d = Math.random() * line.len, v = emojis(line.kind, pointAt(line, d).p);
    return { line, d, dir: Math.random() < 0.5 ? 1 : -1,
      speed: speed * (0.6 + Math.random() * 0.8), emoji: v[Math.floor(Math.random() * v.length)] };
  }

  function query() {
    queried = Date.now();
    lines = [];
    for (const f of map.queryRenderedFeatures({ layers })) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const paths = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates
        : polys.flatMap((rings) => areaChords(rings[0]));
      for (const pts of paths) {
        if (pts.length < 2) continue;
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + metres(pts[i - 1], pts[i]));
        lines.push({ pts, cum, len: cum[cum.length - 1], kind: f.layer.id });
      }
    }
    // move agents onto the new line objects (same lines, new arrays); drop those whose line is gone
    agents = agents.map((ag) => {
      const n = nearestOnLines(lines, pointAt(ag.line, ag.d).p, heading(ag));
      return n && { ...ag, ...n };
    }).filter(Boolean);
    if (!lines.length) return;
    const target = Math.min(max, Math.round(lines.reduce((s, l) => s + l.len, 0) / (spacing * scale())));
    while (agents.length < target) agents.push(spawn());
    agents.length = Math.min(agents.length, Math.ceil(target * 1.2));
  }
  map.on('moveend', query);

  // Advance every agent by dt seconds, handing over to the next piece at piece ends
  function step(dt) {
    const f = scale();
    for (let k = 0; k < agents.length; k++) {
      const ag = agents[k];
      ag.d += ag.dir * ag.speed * f * dt;
      if (ag.d >= 0 && ag.d <= ag.line.len) continue;
      const over = ag.d < 0 ? -ag.d : ag.d - ag.line.len;
      ag.d = Math.min(ag.line.len, Math.max(0, ag.d)); // at the piece end
      const p = pointAt(ag.line, ag.d).p, h = heading(ag), ex = [ag.line, ag.prev];
      const n = nearestOnLines(lines, p, h, ex, over + 1) || nearestOnLines(lines, p, h, ex, over + 1, 0); // straight on, else turn
      if (n) Object.assign(ag, n, { d: n.d + n.dir * over, prev: ag.line });
      else {
        const q = map.project(p);
        if (q.x < 0 || q.y < 0 || q.x > innerWidth || q.y > innerHeight) agents[k] = spawn(); // edge of loaded lines
        else ag.dir = -ag.dir; // a real dead end on screen: U-turn
      }
    }
  }

  return function compute() {
    if (Date.now() - queried > 2000) query(); // tiles that finished loading since
    const now = Date.now() / 1000;
    step(Math.min(1, now - (lastStep || now))); // cap dt: no jumps after a pause
    lastStep = now;
    const out = new Map();
    for (const ag of agents) {
      const { p: ll, i } = pointAt(ag.line, ag.d);
      const p = map.project(ll);
      const col = Math.floor(p.x / cell), r = Math.floor(p.y / cell);
      if (col < 0 || col >= cols || r < 0 || r >= rows) continue;
      const pa = map.project(ag.line.pts[i - 1]), pb = map.project(ag.line.pts[i]);
      out.set(r * cols + col, (pb.x - pa.x) * ag.dir > 0 ? 'f:' + ag.emoji : ag.emoji);
    }
    return out;
  };
}
