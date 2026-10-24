// UI controller: level map, gameplay input, HUD and modals.
import { LEVELS, KINDS, BIOMES, MEGAS, SCORE, RATING, CRATE_TILES } from './data.js';
import { Game, openSlots, evalPlacement, evalMega, ratingFor, computeScore } from './game.js';
import { Board3D } from './board3d.js';
import { renderTileIcon, renderBlueprintIcon } from './icons.js';
import { key, parseKey } from './hex.js';

const $ = (id) => document.getElementById(id);

// ---------- progress ----------
const STORE = 'land-builder-progress-v1';
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE));
    if (p && p.best) return p;
  } catch { /* ignore */ }
  return { best: {}, seenHelp: false };
}
let progress = loadProgress();
function saveProgress() {
  try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch { /* ignore */ }
}
const bestOf = (id) => progress.best[id] || { score: 0, stars: 0 };
const isUnlocked = (i) => i === 0 || bestOf(LEVELS[i - 1].id).stars > 0;
const totalStars = () => LEVELS.reduce((a, l) => a + bestOf(l.id).stars, 0);
const thresholds = (quota) => RATING.map((m) => Math.ceil(quota * m));

function biomeClass(level) {
  return level.biomes.length > 1 ? 'mixed' : level.biomes[0];
}

// What a level introduces compared with all earlier levels.
function newStuff(i) {
  const seenK = new Set(), seenB = new Set(), seenM = new Set();
  for (let j = 0; j < i; j++) {
    Object.keys(LEVELS[j].kinds).forEach((k) => seenK.add(k));
    LEVELS[j].biomes.forEach((b) => seenB.add(b));
    LEVELS[j].megas.forEach((m) => seenM.add(m));
  }
  const L = LEVELS[i];
  return {
    kinds: i === 0 ? [] : Object.keys(L.kinds).filter((k) => !seenK.has(k)),
    biomes: i === 0 ? [] : L.biomes.filter((b) => !seenB.has(b)),
    megas: L.megas.filter((m) => !seenM.has(m)),
    mixed: L.biomes.length > 1 && (i === 0 || LEVELS[i - 1].biomes.length === 1),
  };
}

// ---------- screens ----------
function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
  $(name + '-screen').classList.add('active');
  board.active = name === 'game';
  $('labels').classList.toggle('hidden', name !== 'game');
  if (name === 'map') buildMap();
}

// ---------- modal ----------
function openModal(html, onMount) {
  $('modal').innerHTML = html;
  $('overlay').classList.remove('hidden');
  if (onMount) onMount($('modal'));
}
function closeModal() {
  $('overlay').classList.add('hidden');
  $('modal').innerHTML = '';
}
$('overlay').addEventListener('pointerdown', (e) => {
  if (e.target === $('overlay') && $('overlay').dataset.dismissable === '1') closeModal();
});
function modal(html, { dismissable = true, onMount } = {}) {
  $('overlay').dataset.dismissable = dismissable ? '1' : '0';
  openModal(html, onMount);
}

function starsHtml(n, total = 3) {
  let h = '';
  for (let i = 0; i < total; i++) h += i < n ? '⭐' : '<span class="off">⭐</span>';
  return h;
}

function helpHtml() {
  return `
    <h2>How to play</h2>
    <ul class="help">
      <li>Tap a <b>＋</b> slot next to your land to preview the current tile there. Tap it again (or use ⟲ ⟳, <b>Q</b>/<b>E</b>) to rotate, then press <b>✓</b>.</li>
      <li>Every side that touches the same terrain earns stars. Coloured edges show the result:
        <div class="legend"><span><i style="background:#3ee07a"></i>match +${SCORE.exact}</span><span><i style="background:#ffd23f"></i>same kind, other climate +${SCORE.partial}</span><span><i style="background:#ff5a5a"></i>no match</span></div></li>
      <li>Surround a tile with six matching sides for a <b>Perfect ✨ +${SCORE.perfect}</b>.</li>
      <li>The next tiles are shown top-right. You only have a limited number — reach the ⭐ goal before you run out.</li>
      <li><b>Megastructures</b>: place a blueprint over land whose main terrain matches, or on empty space to create 🚧 construction sites. Fill each site with a tile whose main terrain matches (+${SCORE.part} each) and finish the whole structure for a big bonus 🏆.</li>
      <li>Tools: 🚜 clear a tile, 🌈 turn the current tile into a wildcard, 📦 get ${CRATE_TILES} extra tiles. ↶ ↷ undo / redo.</li>
      <li><b>Camera</b>: drag to pan · pinch or scroll to zoom · twist two fingers (or right-drag / Shift-drag) to orbit · drag two fingers up/down to tilt. Buttons on the right orbit ⤺ ⤻, tilt ⛰ and reset 🧭 the view.</li>
    </ul>
    <div class="actions"><button class="btn green" data-close>Got it!</button></div>`;
}
function showHelp() {
  modal(helpHtml(), { onMount: (m) => m.querySelector('[data-close]').onclick = closeModal });
}
$('btn-help-map').onclick = showHelp;
$('btn-help').onclick = showHelp;

// ---------- level map ----------
function buildMap() {
  $('map-total-stars').textContent = `${totalStars()} / ${LEVELS.length * 3}`;
  const track = $('map-track');
  track.querySelectorAll('.node, .zone').forEach((n) => n.remove());
  const spacing = 132, padTop = 190, padBot = 110;
  const height = padTop + padBot + (LEVELS.length - 1) * spacing;
  track.style.height = height + 'px';
  const width = track.clientWidth || Math.min(520, window.innerWidth);
  const pts = LEVELS.map((_, i) => [width / 2 + Math.sin(i * 1.15) * width * 0.27, height - padBot - i * spacing]);

  // biome zones (bottom-up)
  let start = 0;
  for (let i = 1; i <= LEVELS.length; i++) {
    if (i === LEVELS.length || biomeClass(LEVELS[i]) !== biomeClass(LEVELS[start])) {
      const cls = biomeClass(LEVELS[start]);
      const top = i === LEVELS.length ? 0 : pts[i - 1][1] - spacing / 2;
      const bottom = start === 0 ? height : pts[start][1] + spacing / 2;
      const z = document.createElement('div');
      z.className = 'zone';
      const bg = { temperate: 'rgba(130,210,90,0.16)', snowy: 'rgba(255,255,255,0.2)', tropical: 'rgba(60,225,210,0.16)', mixed: 'rgba(255,207,51,0.13)' }[cls];
      z.style.cssText = `top:${top}px;height:${bottom - top}px;background:${bg}`;
      const label = cls === 'mixed' ? '🌍 Mixed climates' : `${BIOMES[cls].emoji} ${BIOMES[cls].name}`;
      z.innerHTML = `<div class="zone-label">${label}</div>`;
      track.appendChild(z);
      start = i;
    }
  }

  // path
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    d += ` C ${x0} ${(y0 + y1) / 2}, ${x1} ${(y0 + y1) / 2}, ${x1} ${y1}`;
  }
  $('map-path').innerHTML = `<path d="${d}" fill="none" stroke="rgba(40,20,100,0.25)" stroke-width="16" stroke-linecap="round" transform="translate(0,5)"/>
    <path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22"/>`;

  let currentIdx = 0;
  LEVELS.forEach((L, i) => {
    const unlocked = isUnlocked(i);
    const best = bestOf(L.id);
    if (unlocked) currentIdx = i;
    const n = document.createElement('button');
    n.className = `node ${biomeClass(L)}${unlocked ? '' : ' locked'}`;
    n.style.left = pts[i][0] + 'px';
    n.style.top = pts[i][1] + 'px';
    const ns = newStuff(i);
    const chip = ns.kinds.length ? `NEW ${KINDS[ns.kinds[0]].emoji}` : ns.biomes.length ? `NEW ${BIOMES[ns.biomes[0]].emoji}` : ns.megas.length ? `NEW ${MEGAS[ns.megas[0]].emoji}` : '';
    n.innerHTML = `
      ${chip && unlocked && !best.stars ? `<span class="new-chip">${chip}</span>` : ''}
      <div class="hex-wrap"><div class="hex">${unlocked ? L.id : '🔒'}</div></div>
      <div class="stars">${unlocked ? starsHtml(best.stars) : ''}</div>
      <div class="need">${L.quota} ⭐</div>`;
    n.onclick = () => unlocked ? showLevelCard(i) : toast(`Earn at least 1 star on level ${LEVELS[i - 1].id} first`, true);
    track.appendChild(n);
  });
  track.querySelectorAll('.node')[currentIdx].classList.add('current');
  requestAnimationFrame(() => {
    $('map-scroll').scrollTop = pts[currentIdx][1] - window.innerHeight * 0.55;
  });
}

function showLevelCard(i) {
  const L = LEVELS[i];
  const ns = newStuff(i);
  const best = bestOf(L.id);
  const [t1, t2, t3] = thresholds(L.quota);
  const biomeChips = L.biomes.map((b) => `<span class="chip${ns.biomes.includes(b) ? ' new' : ''}">${BIOMES[b].emoji} ${BIOMES[b].name}</span>`).join('');
  const kindChips = Object.keys(L.kinds).map((k) => `<span class="chip${ns.kinds.includes(k) ? ' new' : ''}">${KINDS[k].emoji} ${KINDS[k].name}</span>`).join('');
  const megaCards = L.megas.map((m, j) => `<div class="mega-card"><canvas data-mega="${m}" data-i="${j}"></canvas>${MEGAS[m].emoji} ${MEGAS[m].name}<br><small>+${MEGAS[m].bonus} bonus</small></div>`).join('');
  modal(`
    <h2>${L.id}. ${L.name}</h2>
    <div class="row">${biomeChips}</div>
    ${L.biomes.length > 1 ? '<p class="sub">Mixed climates: same terrain from a different climate only scores half.</p>' : ''}
    <div class="goal">Reach <b>${L.quota} ⭐</b> with <b>${L.tiles} tiles</b></div>
    <div class="row"><span class="chip">⭐ ${t1}</span><span class="chip">⭐⭐ ${t2}</span><span class="chip">⭐⭐⭐ ${t3}</span></div>
    <div class="section">Terrain</div>
    <div class="row" style="justify-content:flex-start">${kindChips}</div>
    ${L.megas.length ? `<div class="section">Megastructures</div><div class="megas">${megaCards}</div>` : ''}
    ${best.score ? `<p class="sub" style="margin-top:12px">Best: ${best.score} ⭐ ${starsHtml(best.stars)}</p>` : ''}
    <div class="actions">
      <button class="btn ghost" data-close>Close</button>
      <button class="btn green" data-play>Play</button>
    </div>`, {
    onMount: (m) => {
      m.querySelector('[data-close]').onclick = closeModal;
      m.querySelector('[data-play]').onclick = () => { closeModal(); startLevel(i); };
      m.querySelectorAll('canvas[data-mega]').forEach((c) => renderBlueprintIcon(c, c.dataset.mega, L.biomes[0]));
    },
  });
}

// ---------- toast ----------
let toastTimer = 0;
function toast(msg, onMap = false) {
  let el = $('toast');
  if (onMap) {
    el = document.querySelector('#map-screen .toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      $('map-screen').appendChild(el);
    }
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- gameplay ----------
const ui = {
  game: null, level: null, index: 0,
  mode: 'place',            // 'place' | 'mega' | 'bulldoze'
  preview: null,            // { q, r, k, ev }
  mega: null,               // mega preview
  rot: 0, megaRot: 0,
  hover: null,              // { q, r, k } under the mouse
  slots: new Map(),
  dropKey: null, celebrate: null,
  quotaShown: false, ended: false, bpType: null,
};

const board = new Board3D($('board'), $('labels'), {
  onTap: (q, r) => onTap(q, r),
  onHover: (h) => {
    if (!ui.game || (h && h.k) === (ui.hover && ui.hover.k)) return;
    ui.hover = h;
    const target = h && (ui.slots.has(h.k) || ui.game.s.cons[h.k] || (ui.mode === 'bulldoze' && ui.game.s.tiles[h.k]) || ui.mode === 'mega');
    $('board').style.cursor = target ? 'pointer' : 'grab';
    syncBoard();
  },
  onCamera: (cam) => { $('compass-needle').style.transform = `rotate(${cam.yaw}rad)`; },
});

const haptic = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ } };

function startLevel(i) {
  ui.index = i;
  ui.level = LEVELS[i];
  ui.game = new Game(ui.level);
  Object.assign(ui, { mode: 'place', preview: null, mega: null, rot: 0, megaRot: 0, hover: null, dropKey: null, celebrate: null, quotaShown: false, ended: false, bpType: null });
  $('hud-level').textContent = `Level ${ui.level.id} · ${ui.level.name}`;
  showScreen('game');
  board.resize();
  board.setGame();
  refresh();
  fitView({ intro: true });
  if (!progress.seenHelp) {
    progress.seenHelp = true;
    saveProgress();
    showHelp();
  }
}

function playArea() {
  const w = board.w, h = board.h2;
  const top = w < 600 ? 170 : 130, bottom = w < 600 ? 120 : 130;
  return { x: 16, y: top, w: w - 32, h: Math.max(120, h - top - bottom) };
}

function fitView(opts = {}) {
  const s = ui.game.s;
  const cells = [...Object.values(s.tiles).map((t) => [t.q, t.r]), ...Object.values(s.cons).map((c) => [c.q, c.r])];
  const pad = cells.length < 4 ? 1.5 : 0.6;
  const ext = [];
  for (const [q, r] of cells) ext.push([q - pad, r], [q + pad, r], [q, r - pad], [q, r + pad]);
  board.fit(cells.concat(ext), { ...opts, area: playArea() });
}

function previewTile() {
  const t = ui.game.tile;
  return t ? { ...t, rot: ui.rot } : null;
}

function refresh() {
  const g = ui.game, s = g.s;
  ui.slots = openSlots(s);
  if (ui.preview) {
    if (!g.tile) ui.preview = null;
    else ui.preview.ev = evalPlacement(s, ui.preview.q, ui.preview.r, ui.rot);
  }
  if (ui.mode === 'mega' && ui.mega) {
    const bp = g.blueprint;
    if (!bp || !bp.ready) { ui.mode = 'place'; ui.mega = null; }
    else ui.mega = { ...evalMega(s, bp.type, ui.mega.q, ui.mega.r, ui.megaRot), type: bp.type, q: ui.mega.q, r: ui.mega.r };
  }
  updateHud();
  syncBoard();
}

function syncBoard() {
  const g = ui.game;
  board.sync(g.s, {
    slots: ui.slots,
    preview: ui.mode === 'place' && ui.preview && ui.preview.ev && g.tile ? { ...ui.preview, tile: previewTile() } : null,
    mega: ui.mode === 'mega' ? ui.mega : null,
    mode: ui.mode,
    hover: ui.hover,
    dropKey: ui.dropKey,
    celebrate: ui.celebrate,
  });
  ui.dropKey = ui.celebrate = null;
}

function updateHud() {
  const g = ui.game, s = g.s, L = ui.level;
  const sc = computeScore(s).total;
  const [t1, t2, t3] = thresholds(L.quota);
  $('hud-score').textContent = sc;
  $('hud-quota').textContent = L.quota;
  $('hud-bar').style.width = Math.min(100, (sc / t3) * 100) + '%';
  $('hud-bar').style.background = sc >= t1 ? '#5bd23c' : '';
  $('hud-mark2').style.left = (t1 / t3) * 100 + '%';
  $('hud-mark3').style.left = (t2 / t3) * 100 + '%';
  $('hud-tiles').textContent = g.tilesLeft;
  $('q-count').textContent = g.tilesLeft;

  renderTileIcon($('q0'), previewTile());
  renderTileIcon($('q1'), s.deck[s.deckIndex + 1] || null);
  renderTileIcon($('q2'), s.deck[s.deckIndex + 2] || null);

  for (const t of ['bulldozer', 'rainbow', 'crate']) {
    $('cnt-' + t).textContent = s.tools[t];
    $('tool-' + t).disabled = s.tools[t] <= 0 || (t === 'rainbow' && (!g.tile || g.tile.wild)) || (t === 'bulldozer' && Object.keys(s.tiles).length < 2);
  }
  $('tool-bulldozer').classList.toggle('active', ui.mode === 'bulldoze');

  // blueprint
  const btn = $('btn-blueprint');
  if (!L.megas.length) btn.classList.add('hidden');
  else {
    btn.classList.remove('hidden');
    const bp = g.blueprint;
    const type = bp ? bp.type : null;
    if (type !== ui.bpType) {
      ui.bpType = type;
      if (type) renderBlueprintIcon($('bp-icon'), type, L.biomes[0]);
      else $('bp-icon').getContext('2d').clearRect(0, 0, 999, 999);
    }
    $('bp-name').textContent = type ? `${MEGAS[type].emoji} ${MEGAS[type].name}` : 'All placed';
    $('bp-state').textContent = !bp ? `${s.structs.length}/${L.megas.length}` : bp.ready ? 'TAP TO PLACE' : `in ${bp.cooldown} tile${bp.cooldown > 1 ? 's' : ''}`;
    btn.classList.toggle('ready', !!bp && bp.ready && ui.mode !== 'mega');
    btn.classList.toggle('active', ui.mode === 'mega');
    btn.disabled = !bp;
  }

  $('btn-undo').disabled = !g.undoStack.length;
  $('btn-redo').disabled = !g.redoStack.length;

  const confirming = (ui.mode === 'place' && ui.preview) || ui.mode === 'mega' || ui.mode === 'bulldoze';
  $('confirm-bar').classList.toggle('hidden', !confirming);
  document.querySelector('.tools').classList.toggle('hidden', !!confirming);
  $('btn-confirm').classList.toggle('hidden', ui.mode === 'bulldoze');
  $('btn-rot-cw').classList.toggle('hidden', ui.mode === 'bulldoze');
  $('btn-rot-ccw').classList.toggle('hidden', ui.mode === 'bulldoze');
  const ok = ui.mode === 'mega' ? ui.mega && ui.mega.ok : ui.preview && ui.preview.ev && ui.preview.ev.ok;
  $('btn-confirm').disabled = !ok;
}

function setPreview(q, r) {
  ui.preview = { q, r, k: key(q, r) };
  refresh();
}

function rotate(dir) {
  if (ui.mode === 'mega' && ui.mega) {
    ui.megaRot = (ui.megaRot + dir + 6) % 6;
  } else {
    ui.rot = (ui.rot + dir + 6) % 6;
  }
  refresh();
}

function cancel() {
  ui.preview = null;
  ui.mega = null;
  ui.mode = 'place';
  refresh();
}

function addFloat(q, r, text, color, delay = 0) {
  board.float(q, r, text, color, delay);
}
function addBurst(q, r) {
  board.burst(q, r);
}

function confirm() {
  const g = ui.game;
  if (ui.mode === 'mega') {
    if (!ui.mega || !ui.mega.ok) return;
    const { q, r, type } = ui.mega;
    const before = computeScore(g.s);
    const res = g.placeMega(q, r, ui.megaRot);
    if (!res.ok) return toast(res.reason);
    const after = computeScore(g.s);
    const cells = res.ev.cells;
    const c0 = cells[Math.floor(cells.length / 2)];
    if (after.total > before.total) addFloat(c0.q, c0.r, `+${after.total - before.total} ⭐`);
    if (after.completed > before.completed) {
      addBurst(c0.q, c0.r);
      ui.celebrate = res.sid;
      haptic([20, 40, 30]);
      toast(`🏆 ${MEGAS[type].name} complete!`);
    } else {
      toast(`🚧 Fill the construction sites with matching tiles`);
    }
    ui.mode = 'place';
    ui.mega = null;
    refresh();
    checkProgress();
    return;
  }
  if (!ui.preview || !ui.preview.ev || !ui.preview.ev.ok) return;
  const { q, r, k, ev } = ui.preview;
  const before = computeScore(g.s);
  const res = g.place(q, r, ui.rot);
  if (!res.ok) return toast(res.reason);
  const after = computeScore(g.s);
  ui.dropKey = k;
  haptic(12);
  const delta = after.total - before.total;
  addFloat(q, r, delta > 0 ? `+${delta} ⭐` : '+0', delta > 0 ? '#ffe066' : '#ffffff');
  if (ev.newPerfects) addFloat(q, r, 'Perfect! ✨', '#9effc0', 350);
  if (after.completed > before.completed) {
    const st = g.s.structs.find((x) => x.sid === res.tile.mega);
    addBurst(q, r);
    if (st) {
      ui.celebrate = st.sid;
      haptic([20, 40, 30]);
      toast(`🏆 ${MEGAS[st.type].name} complete! +${MEGAS[st.type].bonus}`);
    }
  } else if (ev.fillsPart) {
    toast('🚧 Construction part finished!');
  }
  ui.preview = null;
  ui.rot = 0;
  refresh();
  keepInView(q, r);
  checkProgress();
}

// Re-frame the board when the land grows past the visible play area.
function keepInView(q, r) {
  const a = playArea(), [x, y] = board.toScreen(q, r), m = 50;
  if (x < a.x + m || x > a.x + a.w - m || y < a.y + m || y > a.y + a.h - m) fitView();
}

function recordBest() {
  const sc = computeScore(ui.game.s).total;
  const stars = ratingFor(sc, ui.level.quota);
  const prev = bestOf(ui.level.id);
  progress.best[ui.level.id] = { score: Math.max(prev.score, sc), stars: Math.max(prev.stars, stars) };
  saveProgress();
}

function checkProgress() {
  const g = ui.game;
  const sc = computeScore(g.s).total;
  if (g.tilesLeft === 0 && !ui.ended) {
    ui.ended = true;
    recordBest();
    showResults();
  } else if (sc >= ui.level.quota && !ui.quotaShown) {
    ui.quotaShown = true;
    recordBest();
    const stars = ratingFor(sc, ui.level.quota);
    modal(`
      <h2>Goal reached! 🎉</h2>
      <div class="big-stars">${starsHtml(stars)}</div>
      <p class="sub">You have ${g.tilesLeft} tile${g.tilesLeft === 1 ? '' : 's'} left. Keep building to earn more stars, or finish now.</p>
      <div class="actions">
        <button class="btn ghost" data-finish>Finish</button>
        <button class="btn green" data-keep>Keep building</button>
      </div>`, {
      dismissable: false,
      onMount: (m) => {
        m.querySelector('[data-keep]').onclick = closeModal;
        m.querySelector('[data-finish]').onclick = () => { closeModal(); ui.ended = true; showResults(); };
      },
    });
  }
}

function showResults() {
  const g = ui.game, L = ui.level;
  const sc = computeScore(g.s);
  const stars = ratingFor(sc.total, L.quota);
  const passed = stars > 0;
  const hasNext = ui.index + 1 < LEVELS.length;
  const canCrate = !passed && g.s.tools.crate > 0;
  modal(`
    <h2>${passed ? 'Level complete!' : 'Out of tiles'}</h2>
    <div class="big-stars">${starsHtml(stars)}</div>
    <p class="sub">${sc.total} / ${L.quota} ⭐</p>
    <div class="breakdown">
      <span>Matching edges</span><span>${sc.edges}</span>
      <span>Perfect tiles ✨ ×${sc.perfectCount}</span><span>${sc.perfects}</span>
      <span>Construction parts</span><span>${sc.parts}</span>
      <span>Megastructures 🏆 ×${sc.completed}</span><span>${sc.bonus}</span>
    </div>
    <div class="actions">
      ${canCrate ? `<button class="btn green" data-crate>📦 +${CRATE_TILES} tiles</button>` : ''}
      ${!passed ? '<button class="btn ghost" data-undo>↶ Undo</button>' : ''}
      <button class="btn ghost" data-map>Map</button>
      <button class="btn ${passed ? 'ghost' : ''}" data-retry>Retry</button>
      ${passed && hasNext ? '<button class="btn green" data-next>Next level</button>' : ''}
    </div>`, {
    dismissable: false,
    onMount: (m) => {
      m.querySelector('[data-map]').onclick = () => { closeModal(); showScreen('map'); };
      m.querySelector('[data-retry]').onclick = () => { closeModal(); startLevel(ui.index); };
      const next = m.querySelector('[data-next]');
      if (next) next.onclick = () => { closeModal(); startLevel(ui.index + 1); };
      const crate = m.querySelector('[data-crate]');
      if (crate) crate.onclick = () => { closeModal(); useCrate(); };
      const undo = m.querySelector('[data-undo]');
      if (undo) undo.onclick = () => { closeModal(); doUndo(); };
    },
  });
}

function useCrate() {
  const res = ui.game.crate();
  if (!res.ok) return toast(res.reason);
  ui.ended = false;
  toast(`📦 +${res.added} tiles added to your stack`);
  refresh();
}

function doUndo() {
  if (!ui.game.undo()) return;
  ui.preview = null; ui.mega = null; ui.mode = 'place'; ui.rot = 0;
  if (ui.game.tilesLeft > 0) ui.ended = false;
  refresh();
}
function doRedo() {
  if (!ui.game.redo()) return;
  ui.preview = null; ui.mega = null; ui.mode = 'place'; ui.rot = 0;
  refresh();
  checkProgress();
}

function enterMega() {
  const g = ui.game, bp = g.blueprint;
  if (!bp) return toast('All megastructures placed!');
  if (ui.mode === 'mega') return cancel();
  if (!bp.ready) return toast(`Place ${bp.cooldown} more tile${bp.cooldown > 1 ? 's' : ''} to unlock the blueprint`);
  ui.mode = 'mega';
  ui.preview = null;
  // start at the best spot so the player sees a valid option right away
  let best = null;
  const anchors = new Set([...Object.keys(g.s.tiles), ...ui.slots.keys()]);
  for (const k of anchors) {
    const [q, r] = parseKey(k);
    for (let rot = 0; rot < 6; rot++) {
      const ev = evalMega(g.s, bp.type, q, r, rot);
      if (!ev.ok) continue;
      const v = ev.filled * 10 - Math.abs(q) - Math.abs(r);
      if (!best || v > best.v) best = { q, r, rot, v };
    }
  }
  if (!best) best = { q: 0, r: 0, rot: 0 };
  ui.megaRot = best.rot;
  ui.mega = { q: best.q, r: best.r };
  toast(`Drag the map and tap to move the ${MEGAS[bp.type].name}. Tap it again to rotate.`);
  refresh();
}

function enterBulldoze() {
  if (ui.mode === 'bulldoze') return cancel();
  ui.mode = 'bulldoze';
  ui.preview = null;
  ui.mega = null;
  toast('🚜 Tap a tile to clear it');
  refresh();
}

function onTap(q, r) {
  const g = ui.game, s = g.s;
  const k = key(q, r);
  if (ui.mode === 'mega') {
    if (ui.mega && ui.mega.q === q && ui.mega.r === r) rotate(1);
    else { ui.mega = { q, r }; refresh(); }
    return;
  }
  if (ui.mode === 'bulldoze') {
    if (!s.tiles[k]) return toast('Tap a placed tile');
    const res = g.bulldoze(q, r);
    if (!res.ok) return toast(res.reason);
    addBurst(q, r);
    ui.mode = 'place';
    refresh();
    return;
  }
  if (!g.tile) return;
  if (ui.preview && ui.preview.k === k) return rotate(1);
  if (ui.slots.has(k) || s.cons[k]) return setPreview(q, r);
  if (ui.preview) cancel();
}

// ---------- buttons ----------
$('btn-confirm').onclick = confirm;
$('btn-cancel').onclick = cancel;
$('btn-rot-cw').onclick = () => rotate(1);
$('btn-rot-ccw').onclick = () => rotate(-1);
$('q-current').onclick = () => rotate(1);
$('btn-undo').onclick = doUndo;
$('btn-redo').onclick = doRedo;
$('btn-zoom-in').onclick = () => board.zoom(1 / 1.25);
$('btn-zoom-out').onclick = () => board.zoom(1.25);
$('btn-cam-left').onclick = () => board.orbit(-1);
$('btn-cam-right').onclick = () => board.orbit(1);
$('btn-cam-tilt').onclick = () => board.cycleTilt();
$('btn-compass').onclick = () => { board.resetYaw(); fitView(); };
$('btn-blueprint').onclick = enterMega;
$('tool-bulldozer').onclick = enterBulldoze;
$('tool-rainbow').onclick = () => {
  const res = ui.game.rainbow();
  if (!res.ok) return toast(res.reason);
  toast('🌈 Rainbow tile: matches every terrain!');
  refresh();
};
$('tool-crate').onclick = useCrate;
$('btn-menu').onclick = () => {
  modal(`
    <h2>Leave level?</h2>
    <p class="sub">Your progress on this attempt will be lost.</p>
    <div class="actions">
      <button class="btn ghost" data-stay>Stay</button>
      <button class="btn" data-retry>Restart</button>
      <button class="btn green" data-leave>Level map</button>
    </div>`, {
    onMount: (m) => {
      m.querySelector('[data-stay]').onclick = closeModal;
      m.querySelector('[data-retry]').onclick = () => { closeModal(); startLevel(ui.index); };
      m.querySelector('[data-leave]').onclick = () => { closeModal(); showScreen('map'); };
    },
  });
};

window.addEventListener('keydown', (e) => {
  if (!$('game-screen').classList.contains('active') || !$('overlay').classList.contains('hidden')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return doRedo(); }
  if (k === 'e' || k === 'r' || k === 'arrowright') rotate(1);
  else if (k === 'q' || k === 'arrowleft') rotate(-1);
  else if (k === 'enter' || k === ' ') { e.preventDefault(); confirm(); }
  else if (k === 'escape') cancel();
  else if (k === 'b') enterMega();
  else if (k === '+' || k === '=') board.zoom(1 / 1.25);
  else if (k === '-') board.zoom(1.25);
  else if (k === ',' || k === 'a') board.orbit(-1);
  else if (k === '.' || k === 'd') board.orbit(1);
  else if (k === 't') board.cycleTilt();
  else if (k === 'f') fitView();
});

window.addEventListener('resize', () => {
  if ($('game-screen').classList.contains('active')) updateHud();
  else buildMap();
});

// Expose a tiny hook for automated testing.
window.__landBuilder = { ui, startLevel, progress: () => progress, toScreen: (q, r, y) => board.toScreen(q, r, y), board, select: (q, r) => onTap(q, r) };

showScreen('map');
