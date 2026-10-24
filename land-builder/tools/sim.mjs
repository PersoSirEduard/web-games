// Balance check: plays every level with a greedy bot and reports score spread vs quota.
// Usage: node land-builder/tools/sim.mjs [games-per-level]
import { LEVELS } from '../js/data.js';
import {
  Game, openSlots, evalPlacement, evalMega, availableBlueprint, computeScore, ratingFor,
} from '../js/game.js';
import { parseKey } from '../js/hex.js';

const GAMES = +(process.argv[2] || 100);

function bestTileMove(s) {
  let best = null;
  const cells = [...openSlots(s).values(), ...Object.values(s.cons).map((c) => [c.q, c.r])];
  for (const [q, r] of cells) {
    for (let rot = 0; rot < 6; rot++) {
      const ev = evalPlacement(s, q, r, rot);
      if (!ev.ok) continue;
      const v = ev.delta + Math.random() * 0.1;
      if (!best || v > best.v) best = { q, r, rot, v };
    }
  }
  return best;
}

function bestMegaMove(s, level) {
  const bp = availableBlueprint(s, level);
  if (!bp || !bp.ready) return null;
  let best = null;
  const anchors = new Set([...Object.keys(s.tiles), ...openSlots(s).keys()]);
  for (const k of anchors) {
    const [q, r] = parseKey(k);
    for (let rot = 0; rot < 6; rot++) {
      const ev = evalMega(s, bp.type, q, r, rot);
      if (!ev.ok) continue;
      const v = ev.filled + Math.random() * 0.1;
      if (!best || v > best.v) best = { q, r, rot, v };
    }
  }
  return best;
}

function play(level, useMegas) {
  const g = new Game(level);
  while (g.tilesLeft > 0) {
    if (useMegas) {
      const m = bestMegaMove(g.s, level);
      if (m) g.placeMega(m.q, m.r, m.rot);
    }
    const mv = bestTileMove(g.s);
    if (!mv) break;
    g.place(mv.q, mv.r, mv.rot);
  }
  return computeScore(g.s).total;
}

const stats = (arr) => {
  arr.sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean: Math.round(mean), p10: arr[Math.floor(arr.length * 0.1)], p50: arr[Math.floor(arr.length / 2)], p90: arr[Math.floor(arr.length * 0.9)] };
};

console.log('lvl quota | greedy mean p10 p50 p90 | +megas mean p10 p50 p90 | pass% avg-rating');
for (const level of LEVELS) {
  const plain = [], megas = [];
  for (let i = 0; i < GAMES; i++) {
    plain.push(play(level, false));
    if (level.megas.length) megas.push(play(level, true));
  }
  const a = stats(plain), b = megas.length ? stats(megas) : a;
  const src = megas.length ? megas : plain;
  const pass = src.filter((x) => x >= level.quota).length / src.length;
  const rating = src.reduce((acc, x) => acc + ratingFor(x, level.quota), 0) / src.length;
  console.log(
    `${String(level.id).padStart(3)} ${String(level.quota).padStart(5)} | ${a.mean} ${a.p10} ${a.p50} ${a.p90} | ${b.mean} ${b.p10} ${b.p50} ${b.p90} | ${Math.round(pass * 100)}% ${rating.toFixed(2)}`,
  );
}
