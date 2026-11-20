// --- People: walking along footpaths, pedestrian streets and across squares (see agents.js) -----
const PEOPLE_MINZOOM = 15;
const PEOPLE = ['🚶', '🚶', '🚶‍♀️', '🚶‍♂️'];
const computePeople = createFleet({
  layers: ['footpath', 'square'],
  spacing: 15, // metres of path per person on average
  speed: 1.4, // m/s, each person gets 0.6x-1.4x
  emojis: () => PEOPLE,
  max: 600,
});
