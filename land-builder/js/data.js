// Static game content: terrain kinds, biome variants, megastructures and levels.

export const KINDS = {
  plains:   { name: 'Plains',    emoji: '🌿' },
  forest:   { name: 'Forest',    emoji: '🌲' },
  city:     { name: 'Town',      emoji: '🏘️' },
  water:    { name: 'Water',     emoji: '💧' },
  farm:     { name: 'Fields',    emoji: '🌾' },
  mountain: { name: 'Mountains', emoji: '⛰️' },
};

export const BIOMES = {
  temperate: {
    name: 'Temperate', emoji: '🍃',
    colors: {
      plains: '#a8dc4c', forest: '#6cbf45', city: '#cfc8d6', water: '#3aa6f0',
      farm: '#f7da74', mountain: '#b3a597',
    },
  },
  snowy: {
    name: 'Snowy', emoji: '❄️',
    colors: {
      plains: '#eef4fb', forest: '#dbe8ee', city: '#c3c9dc', water: '#79c6ef',
      farm: '#ece2bd', mountain: '#a9b4c6',
    },
  },
  tropical: {
    name: 'Tropical', emoji: '🌴',
    colors: {
      plains: '#f6e2a0', forest: '#3fbf6a', city: '#f1d2c4', water: '#2fd3d3',
      farm: '#b4e45f', mountain: '#8b7468',
    },
  },
};

// Megastructures: footprint cells as axial offsets with the terrain kind each part needs.
// draw: 'centroid' draws one landmark over the footprint, 'each' draws one per cell.
export const MEGAS = {
  sawmill: {
    name: 'Sawmill', emoji: '🪵', bonus: 25, draw: 'centroid',
    cells: [[-1, 0, 'forest'], [0, 0, 'city'], [1, 0, 'forest']],
  },
  tower: {
    name: 'Grand Tower', emoji: '🗼', bonus: 30, draw: 'centroid',
    cells: [[0, 0, 'city'], [1, 0, 'city'], [0, 1, 'city']],
  },
  windfarm: {
    name: 'Wind Farm', emoji: '🌬️', bonus: 35, draw: 'each',
    cells: [[0, 0, 'plains'], [2, -1, 'plains'], [1, 1, 'plains']],
  },
  harbor: {
    name: 'Harbor', emoji: '⚓', bonus: 30, draw: 'centroid',
    cells: [[0, 0, 'city'], [1, 0, 'water'], [1, 1, 'water']],
  },
  skilodge: {
    name: 'Ski Lodge', emoji: '🎿', bonus: 35, draw: 'centroid',
    cells: [[0, 0, 'city'], [0, -1, 'mountain'], [1, -2, 'mountain']],
  },
  observatory: {
    name: 'Observatory', emoji: '🔭', bonus: 30, draw: 'each',
    cells: [[0, 0, 'mountain'], [2, -1, 'mountain']],
  },
  pyramid: {
    name: 'Pyramid', emoji: '🔺', bonus: 30, draw: 'centroid',
    cells: [[0, 0, 'plains'], [1, 0, 'plains'], [0, 1, 'plains']],
  },
  dam: {
    name: 'Great Dam', emoji: '🌊', bonus: 40, draw: 'centroid',
    cells: [[-1, 0, 'water'], [0, 0, 'mountain'], [1, 0, 'water']],
  },
  castle: {
    name: 'Castle', emoji: '🏰', bonus: 50, draw: 'centroid',
    cells: [[0, 0, 'city'], [1, 0, 'city'], [0, 1, 'plains'], [1, 1, 'forest']],
  },
};

// Scoring constants.
export const SCORE = {
  exact: 2,      // matching edge, same kind and same biome variant
  partial: 1,    // same kind, different biome variant (mixed levels)
  perfect: 6,    // every side of a tile touches a matching neighbour
  part: 4,       // each finished megastructure part
};

// Ratings: 1 star at the quota, more stars for exceeding it.
export const RATING = [1, 1.3, 1.6];

// kinds: weighted terrain pool for tile generation.
export const LEVELS = [
  { id: 1, name: 'Green Meadows', biomes: ['temperate'], tiles: 20, quota: 65,
    kinds: { plains: 3, forest: 3, city: 2 }, megas: [] },
  { id: 2, name: 'Woodcutters', biomes: ['temperate'], tiles: 22, quota: 90,
    kinds: { plains: 3, forest: 3, city: 2 }, megas: ['sawmill'] },
  { id: 3, name: 'Riverside', biomes: ['temperate'], tiles: 24, quota: 95,
    kinds: { plains: 3, forest: 3, city: 2, water: 2 }, megas: ['tower'] },
  { id: 4, name: 'Harvest Valley', biomes: ['temperate'], tiles: 26, quota: 115,
    kinds: { plains: 2, forest: 3, city: 2, water: 2, farm: 3 }, megas: ['windfarm', 'harbor'] },
  { id: 5, name: 'First Frost', biomes: ['snowy'], tiles: 26, quota: 125,
    kinds: { plains: 3, forest: 3, city: 2, water: 2 }, megas: ['harbor', 'tower'] },
  { id: 6, name: 'Frozen Peaks', biomes: ['snowy'], tiles: 28, quota: 130,
    kinds: { plains: 2, forest: 3, city: 2, water: 1, mountain: 3 }, megas: ['skilodge', 'observatory'] },
  { id: 7, name: 'Island Shores', biomes: ['tropical'], tiles: 28, quota: 135,
    kinds: { plains: 3, forest: 3, city: 2, water: 3 }, megas: ['harbor', 'pyramid'] },
  { id: 8, name: 'Volcano Isle', biomes: ['tropical'], tiles: 30, quota: 140,
    kinds: { plains: 2, forest: 3, city: 2, water: 2, farm: 2, mountain: 2 }, megas: ['dam', 'pyramid', 'windfarm'] },
  { id: 9, name: 'Borderlands', biomes: ['temperate', 'snowy'], tiles: 32, quota: 165,
    kinds: { plains: 3, forest: 3, city: 2, water: 2 }, megas: ['castle', 'tower', 'sawmill'] },
  { id: 10, name: 'Tropic Frontier', biomes: ['temperate', 'tropical'], tiles: 34, quota: 170,
    kinds: { plains: 2, forest: 3, city: 2, water: 2, farm: 2 }, megas: ['harbor', 'windfarm', 'castle'] },
  { id: 11, name: 'Three Climates', biomes: ['temperate', 'snowy', 'tropical'], tiles: 38, quota: 200,
    kinds: { plains: 2, forest: 3, city: 2, water: 2, mountain: 2 }, megas: ['castle', 'observatory', 'dam', 'skilodge'] },
  { id: 12, name: 'Grand Continent', biomes: ['temperate', 'snowy', 'tropical'], tiles: 45, quota: 270,
    kinds: { plains: 2, forest: 3, city: 2, water: 2, farm: 2, mountain: 2 },
    megas: ['tower', 'harbor', 'castle', 'dam', 'windfarm', 'skilodge', 'pyramid'] },
];

// Starting tool counts for every level.
export const START_TOOLS = { bulldozer: 1, rainbow: 1, crate: 1 };
export const CRATE_TILES = 4;
export const BLUEPRINT_COOLDOWN = 4;
