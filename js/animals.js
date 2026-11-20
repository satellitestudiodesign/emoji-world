// --- Animals: a few natural cells show an animal that lives there (data/animals.json, built by tools/animals) ---
// Wild animals: GBIF occurrence counts per 2° cell, the most characteristic land and water taxa of each cell.
// Domestic animals: on farmland, no data needed.
const ANIMAL_MINZOOM = 15, ANIMAL_MAXZOOM = 24;
const ANIMAL_SHARE = 0.03; // share of eligible cells that show an animal
const DOMESTIC = [['🐄', 'Cow'], ['🐄', 'Cow'], ['🐑', 'Sheep'], ['🐑', 'Sheep'], ['🐐', 'Goat'], ['🐖', 'Pig'],
  ['🐓', 'Chicken'], ['🐎', 'Horse']];
const classIdx = (k) => classList.indexOf(CLASSES[k]);
const WILD_LAND = new Set(['land', 'ground', 'wood', 'grass', 'sand', 'ice', 'rock', 'marsh'].map(classIdx));
classList.forEach((cls, i) => { if (cls.biome) WILD_LAND.add(i); });
const FARM = classIdx('farmland');
// town animals (zoomed in): pets around homes, rats among big buildings, water birds on lakes/rivers;
// homes 1/3 and big buildings 1/6 of ANIMAL_SHARE (they fill the screen in a city)
const TOWN = new Set(['residential', 'house'].map(classIdx)), CITY = new Set(['building', 'tower', 'commercial'].map(classIdx));
const PETS = [['🐈', 'Cat'], ['🐈', 'Cat'], ['🐈‍⬛', 'Cat'], ['🐕', 'Dog'], ['🐕', 'Dog']];
const LAKE_IDX = classIdx('lake');
const BIRDS = [['🦆', 'Duck'], ['🦆', 'Duck'], ['🦢', 'Swan']];

let animals = null; // { grid, land: Map(cell -> [[emoji, name, weight]]), water: same }
fetch('data/animals.json').then((r) => r.json()).then(({ grid, animals: list, cells }) => {
  const land = new Map(), water = new Map();
  for (const [cell, pairs] of Object.entries(cells)) for (let k = 0; k < pairs.length; k += 2) {
    const [emoji, name, realm] = list[pairs[k]], m = realm === 'land' ? land : water;
    if (!m.has(+cell)) m.set(+cell, []);
    m.get(+cell).push([emoji, name, pairs[k + 1]]);
  }
  animals = { grid, land, water };
  map.triggerRepaint();
});

// [emoji, name] of the animal for a cell of class `best` at Mercator (mx, my), or null (most cells)
function animalAt(best, hash, mx, my) {
  if (cellHash(hash, 7) % 1000 >= ANIMAL_SHARE * 1000) return null;
  if (best === FARM) return DOMESTIC[cellHash(hash, 13) % DOMESTIC.length];
  if (TOWN.has(best)) return cellHash(hash, 17) % 3 ? null : PETS[cellHash(hash, 13) % PETS.length];
  if (CITY.has(best)) return cellHash(hash, 17) % 6 ? null : ['🐀', 'Rat'];
  if (best === LAKE_IDX) return BIRDS[cellHash(hash, 13) % BIRDS.length];
  const where = best === WATER ? animals.water : WILD_LAND.has(best) ? animals.land : null;
  if (!where) return null;
  const lng = mx * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180 / Math.PI;
  const W = 360 / animals.grid;
  const list = where.get(Math.floor((90 - lat) / animals.grid) * W + Math.floor((((lng + 180) % 360 + 360) % 360) / animals.grid));
  if (!list) return null;
  // weighted pick: an animal with twice the score shows up twice as often
  let r = cellHash(hash, 13) % list.reduce((s, a) => s + a[2], 0);
  for (const a of list) if ((r -= a[2]) < 0) return a;
}
