// Pure game logic: no DOM access, so it can run in Node for balancing.
import { DIRS, key, neighbor, opposite, rotateAxial, mulberry32 } from './hex.js';
import { MEGAS, SCORE, RATING, START_TOOLS, CRATE_TILES, BLUEPRINT_COOLDOWN } from './data.js';

const WILD = '*';

export function edgeAt(tile, dir) {
  return tile.base[(dir + tile.rot) % 6];
}

// 'exact' | 'partial' | null for the edge between tile a (side dir) and its neighbour b.
export function edgeMatch(a, dir, b) {
  const ea = edgeAt(a, dir), eb = edgeAt(b, opposite(dir));
  if (ea === WILD || eb === WILD) return 'exact';
  if (ea !== eb) return null;
  return a.variant === b.variant ? 'exact' : 'partial';
}

// Kinds with the highest edge count; a tile "is" any of these for megastructures.
export function dominantKinds(tile) {
  if (tile.wild) return null; // matches anything
  const counts = {};
  for (const k of tile.base) counts[k] = (counts[k] || 0) + 1;
  const max = Math.max(...Object.values(counts));
  return Object.keys(counts).filter((k) => counts[k] === max);
}

export function tileSatisfies(tile, req) {
  const dom = dominantKinds(tile);
  return dom === null || dom.includes(req);
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let x = rng() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}

const PATTERNS = [
  { w: 14, runs: [6] },
  { w: 10, runs: [5, 1] },
  { w: 14, runs: [4, 2] },
  { w: 14, runs: [3, 3] },
  { w: 10, runs: [4, 1, 1] },
  { w: 12, runs: [3, 2, 1] },
  { w: 8, runs: [2, 2, 2] },
  { w: 8, runs: [2, 1, 2, 1], alternate: true },
];

export function generateTile(rng, level, id) {
  const pattern = PATTERNS[+pickWeighted(rng, Object.fromEntries(PATTERNS.map((p, i) => [i, p.w])))];
  const kinds = [];
  const needed = pattern.alternate ? 2 : pattern.runs.length;
  let guard = 0;
  while (kinds.length < needed && guard++ < 50) {
    const k = pickWeighted(rng, level.kinds);
    if (!kinds.includes(k)) kinds.push(k);
  }
  while (kinds.length < needed) kinds.push(kinds[0]);
  const base = [];
  pattern.runs.forEach((len, i) => {
    const k = pattern.alternate ? kinds[i % 2] : kinds[i];
    for (let j = 0; j < len; j++) base.push(k);
  });
  const shift = Math.floor(rng() * 6);
  const rotated = base.map((_, i) => base[(i + shift) % 6]);
  const variant = level.biomes[Math.floor(rng() * level.biomes.length)];
  return { id, base: rotated, variant };
}

export function makeWildTile(id) {
  return { id, base: [WILD, WILD, WILD, WILD, WILD, WILD], variant: null, wild: true };
}

export function createState(level, seed) {
  const rng = mulberry32(seed);
  let nextId = 1;
  const deck = [];
  for (let i = 0; i < level.tiles; i++) deck.push(generateTile(rng, level, nextId++));
  const reserve = [];
  for (let i = 0; i < CRATE_TILES * 3; i++) reserve.push(generateTile(rng, level, nextId++));
  // The starting tile always shows several terrains so the first move has options.
  let start;
  do start = generateTile(rng, level, nextId++); while (new Set(start.base).size < Math.min(3, Object.keys(level.kinds).length));
  const s = {
    seed,
    tiles: {},
    cons: {},
    structs: [],
    deck,
    reserve,
    deckIndex: 0,
    tools: { ...START_TOOLS },
    bp: { idx: 0, cooldown: 0 },
    nextId,
    placed: 0,
  };
  s.tiles[key(0, 0)] = { ...start, q: 0, r: 0, rot: 0 };
  return s;
}

export function computeScore(s) {
  let edges = 0, perfects = 0, parts = 0, bonus = 0, perfectCount = 0, completed = 0;
  const tiles = s.tiles;
  for (const k in tiles) {
    const t = tiles[k];
    let filled = 0, matched = 0;
    for (let d = 0; d < 6; d++) {
      const n = tiles[key(t.q + DIRS[d][0], t.r + DIRS[d][1])];
      if (!n) continue;
      filled++;
      const m = edgeMatch(t, d, n);
      if (m) {
        matched++;
        if (d < 3) edges += m === 'exact' ? SCORE.exact : SCORE.partial;
      }
    }
    if (filled === 6 && matched === 6) { perfects += SCORE.perfect; perfectCount++; }
  }
  for (const st of s.structs) {
    let done = 0;
    for (const c of st.cells) {
      const t = tiles[key(c.q, c.r)];
      if (t && t.mega === st.sid) done++;
    }
    parts += done * SCORE.part;
    if (done === st.cells.length) { bonus += MEGAS[st.type].bonus; completed++; }
  }
  return { total: edges + perfects + parts + bonus, edges, perfects, parts, bonus, perfectCount, completed };
}

export function currentTile(s) {
  return s.deck[s.deckIndex] || null;
}

export function tilesLeft(s) {
  return s.deck.length - s.deckIndex;
}

// Empty cells next to the map (tiles or construction sites).
export function openSlots(s) {
  const out = new Map();
  const add = (q, r) => {
    const k = key(q, r);
    if (!s.tiles[k] && !s.cons[k] && !out.has(k)) out.set(k, [q, r]);
  };
  const visit = (q, r) => { for (let d = 0; d < 6; d++) add(...neighbor(q, r, d)); };
  for (const k in s.tiles) visit(s.tiles[k].q, s.tiles[k].r);
  for (const k in s.cons) visit(s.cons[k].q, s.cons[k].r);
  return out;
}

export function canPlaceTile(s, tile, q, r) {
  const k = key(q, r);
  if (!tile) return { ok: false, reason: 'No tiles left' };
  if (s.tiles[k]) return { ok: false, reason: 'Occupied' };
  const con = s.cons[k];
  if (con) {
    if (!tileSatisfies(tile, con.req)) return { ok: false, reason: 'construction', req: con.req };
    return { ok: true, con };
  }
  for (let d = 0; d < 6; d++) {
    const nk = key(...neighbor(q, r, d));
    if (s.tiles[nk] || s.cons[nk]) return { ok: true };
  }
  return { ok: false, reason: 'Not connected' };
}

// Preview a placement: score delta and per-side match info.
export function evalPlacement(s, q, r, rot, tile = currentTile(s)) {
  const check = canPlaceTile(s, tile, q, r);
  if (!check.ok) return check;
  const before = computeScore(s);
  const k = key(q, r);
  const placed = { ...tile, q, r, rot };
  if (check.con) placed.mega = check.con.sid;
  const savedCon = s.cons[k];
  s.tiles[k] = placed;
  delete s.cons[k];
  const after = computeScore(s);
  const sides = [];
  for (let d = 0; d < 6; d++) {
    const n = s.tiles[key(...neighbor(q, r, d))];
    sides.push(n ? (edgeMatch(placed, d, n) || 'miss') : null);
  }
  delete s.tiles[k];
  if (savedCon) s.cons[k] = savedCon;
  return {
    ok: true,
    delta: after.total - before.total,
    sides,
    newPerfects: after.perfectCount - before.perfectCount,
    completed: after.completed - before.completed,
    fillsPart: !!check.con,
  };
}

export function placeTile(s, q, r, rot) {
  const tile = currentTile(s);
  const check = canPlaceTile(s, tile, q, r);
  if (!check.ok) return check;
  const k = key(q, r);
  const placed = { ...tile, q, r, rot };
  if (check.con) {
    placed.mega = check.con.sid;
    delete s.cons[k];
  }
  s.tiles[k] = placed;
  s.deckIndex++;
  s.placed++;
  if (s.bp.cooldown > 0) s.bp.cooldown--;
  return { ok: true, tile: placed };
}

export function megaCells(type, q, r, rot) {
  return MEGAS[type].cells.map(([dq, dr, req]) => {
    const [oq, or] = rotateAxial(dq, dr, rot);
    return { q: q + oq, r: r + or, req };
  });
}

export function availableBlueprint(s, level) {
  if (s.bp.idx >= level.megas.length) return null;
  return { type: level.megas[s.bp.idx], ready: s.bp.cooldown <= 0, cooldown: s.bp.cooldown };
}

export function evalMega(s, type, q, r, rot) {
  const cells = megaCells(type, q, r, rot).map((c) => {
    const k = key(c.q, c.r);
    const t = s.tiles[k];
    let status;
    if (s.cons[k]) status = 'bad';
    else if (t) status = t.mega === undefined && tileSatisfies(t, c.req) ? 'filled' : 'bad';
    else status = 'empty';
    return { ...c, status };
  });
  const ok = cells.every((c) => c.status !== 'bad');
  const connected = cells.some((c) => {
    if (c.status === 'filled') return true;
    for (let d = 0; d < 6; d++) if (s.tiles[key(...neighbor(c.q, c.r, d))]) return true;
    return false;
  });
  const filled = cells.filter((c) => c.status === 'filled').length;
  let delta = filled * SCORE.part;
  if (filled === cells.length) delta += MEGAS[type].bonus;
  return { ok: ok && connected, connected, cells, delta, filled };
}

export function placeMega(s, level, q, r, rot) {
  const bp = availableBlueprint(s, level);
  if (!bp || !bp.ready) return { ok: false, reason: 'No blueprint ready' };
  const ev = evalMega(s, bp.type, q, r, rot);
  if (!ev.ok) return { ok: false, reason: ev.connected ? 'Blocked' : 'Not connected' };
  const sid = s.structs.length ? Math.max(...s.structs.map((x) => x.sid)) + 1 : 1;
  for (const c of ev.cells) {
    const k = key(c.q, c.r);
    if (c.status === 'filled') s.tiles[k].mega = sid;
    else s.cons[k] = { q: c.q, r: c.r, req: c.req, sid };
  }
  s.structs.push({ sid, type: bp.type, cells: ev.cells.map(({ q, r, req }) => ({ q, r, req })) });
  s.bp.idx++;
  s.bp.cooldown = BLUEPRINT_COOLDOWN;
  return { ok: true, sid, ev };
}

export function structureProgress(s, st) {
  let done = 0;
  for (const c of st.cells) {
    const t = s.tiles[key(c.q, c.r)];
    if (t && t.mega === st.sid) done++;
  }
  return { done, total: st.cells.length, complete: done === st.cells.length };
}

export function bulldoze(s, q, r) {
  const k = key(q, r);
  const t = s.tiles[k];
  if (!t) return { ok: false, reason: 'Nothing to clear' };
  if (s.tools.bulldozer <= 0) return { ok: false, reason: 'No bulldozers left' };
  if (Object.keys(s.tiles).length <= 1 && !Object.keys(s.cons).length) return { ok: false, reason: 'Keep at least one tile' };
  delete s.tiles[k];
  if (t.mega !== undefined) {
    const st = s.structs.find((x) => x.sid === t.mega);
    const cell = st.cells.find((c) => c.q === q && c.r === r);
    s.cons[k] = { q, r, req: cell.req, sid: st.sid };
  }
  s.tools.bulldozer--;
  return { ok: true };
}

export function useRainbow(s) {
  if (s.tools.rainbow <= 0) return { ok: false, reason: 'No rainbow tiles left' };
  if (!currentTile(s)) return { ok: false, reason: 'No tiles left' };
  if (currentTile(s).wild) return { ok: false, reason: 'Already a rainbow tile' };
  s.deck[s.deckIndex] = makeWildTile(s.nextId++);
  s.tools.rainbow--;
  return { ok: true };
}

export function useCrate(s) {
  if (s.tools.crate <= 0) return { ok: false, reason: 'No crates left' };
  const extra = s.reserve.splice(0, CRATE_TILES);
  s.deck.push(...extra);
  s.tools.crate--;
  return { ok: true, added: extra.length };
}

export function ratingFor(score, quota) {
  let stars = 0;
  for (const m of RATING) if (score >= Math.ceil(quota * m)) stars++;
  return stars;
}

// Wraps the state with undo/redo history.
export class Game {
  constructor(level, seed = (Math.random() * 2 ** 32) >>> 0) {
    this.level = level;
    this.s = createState(level, seed);
    this.undoStack = [];
    this.redoStack = [];
  }

  act(fn) {
    const snap = JSON.stringify(this.s);
    const res = fn(this.s);
    if (res && res.ok) {
      this.undoStack.push(snap);
      this.redoStack.length = 0;
    }
    return res;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(JSON.stringify(this.s));
    this.s = JSON.parse(this.undoStack.pop());
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(JSON.stringify(this.s));
    this.s = JSON.parse(this.redoStack.pop());
    return true;
  }

  get score() { return computeScore(this.s); }
  get tile() { return currentTile(this.s); }
  get tilesLeft() { return tilesLeft(this.s); }
  get blueprint() { return availableBlueprint(this.s, this.level); }

  place(q, r, rot) { return this.act((s) => placeTile(s, q, r, rot)); }
  placeMega(q, r, rot) { return this.act((s) => placeMega(s, this.level, q, r, rot)); }
  bulldoze(q, r) { return this.act((s) => bulldoze(s, q, r)); }
  rainbow() { return this.act((s) => useRainbow(s)); }
  crate() { return this.act((s) => useCrate(s)); }
}
