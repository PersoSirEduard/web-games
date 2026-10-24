// Canvas rendering: tilted hex prisms with procedural decorations and landmarks.
import { hexToPixel, pixelToHex, mulberry32, key } from './hex.js';
import { BIOMES, KINDS, MEGAS } from './data.js';
import { edgeAt, structureProgress } from './game.js';

export const TILT = 0.7;
const THICK = 0.22;
const RAD = Math.PI / 180;

// ---------- colour helpers ----------
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(h, amt) {
  const [r, g, b] = hexToRgb(h);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const f = (c) => Math.round((t - c) * p + c);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
const WILD_COLORS = ['#ff6b6b', '#ffb347', '#ffe66d', '#7ee081', '#5ec8ff', '#b28dff'];

export function kindColor(kind, variant, i = 0) {
  if (kind === '*') return WILD_COLORS[i % 6];
  return BIOMES[variant || 'temperate'].colors[kind];
}

// Unit hex corner j sits at angle 30 - 60j; edge i spans corners i and i+1.
const CORNERS = Array.from({ length: 6 }, (_, j) => [Math.cos((30 - 60 * j) * RAD), Math.sin((30 - 60 * j) * RAD)]);

function hexPath(ctx, cx, cy, s, rad = 1) {
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const [x, y] = CORNERS[j];
    ctx.lineTo(cx + x * s * rad, cy + y * s * rad * TILT);
  }
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx, pts, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

// ---------- prism body ----------
function drawSides(ctx, cx, cy, s, colorFor) {
  const h = s * THICK;
  const c = (j) => [cx + CORNERS[j][0] * s, cy + CORNERS[j][1] * s * TILT];
  // Visible side faces are edges 4 (lower-left), 5 (lower-right) plus 3/0 slivers.
  const faces = [[3, 4, -0.38], [4, 5, -0.3], [5, 0, -0.18]];
  for (const [a, b, amt] of faces) {
    const edge = a;
    const [x1, y1] = c(a), [x2, y2] = c(b);
    poly(ctx, [[x1, y1], [x2, y2], [x2, y2 + h], [x1, y1 + h]], shade(colorFor(edge), amt));
  }
  // a soil stripe along the bottom
  const [x4, y4] = c(4), [x5, y5] = c(5), [x0, y0] = c(0), [x3, y3] = c(3);
  ctx.fillStyle = 'rgba(120, 70, 40, 0.18)';
  ctx.beginPath();
  ctx.moveTo(x3, y3 + h * 0.55);
  ctx.lineTo(x4, y4 + h * 0.55);
  ctx.lineTo(x5, y5 + h * 0.55);
  ctx.lineTo(x0, y0 + h * 0.55);
  ctx.lineTo(x0, y0 + h);
  ctx.lineTo(x5, y5 + h);
  ctx.lineTo(x4, y4 + h);
  ctx.lineTo(x3, y3 + h);
  ctx.closePath();
  ctx.fill();
}

// ---------- decorations ----------
const D = {
  shadow(ctx, x, y, s, w = 0.08) { ellipse(ctx, x, y, s * w, s * w * 0.4, 'rgba(0,0,0,0.16)'); },
  roundTree(ctx, x, y, s, col) {
    const r = s * 0.085;
    D.shadow(ctx, x, y, s, 0.075);
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(x - s * 0.012, y - s * 0.07, s * 0.024, s * 0.07);
    ellipse(ctx, x, y - s * 0.07 - r * 0.8, r, r, col);
    ellipse(ctx, x - r * 0.3, y - s * 0.07 - r * 1.1, r * 0.5, r * 0.5, shade(col, 0.25));
  },
  pine(ctx, x, y, s, col, snow) {
    const h = s * 0.27, w = s * 0.075;
    D.shadow(ctx, x, y, s, 0.07);
    ctx.fillStyle = '#7a4e2d';
    ctx.fillRect(x - s * 0.01, y - s * 0.04, s * 0.02, s * 0.04);
    poly(ctx, [[x, y - h * 0.72], [x - w * 1.25, y - h * 0.1], [x + w * 1.25, y - h * 0.1]], col);
    poly(ctx, [[x, y - h * 0.72], [x + w * 1.25, y - h * 0.1], [x, y - h * 0.1]], shade(col, -0.18));
    poly(ctx, [[x, y - h], [x - w, y - h * 0.42], [x + w, y - h * 0.42]], col);
    poly(ctx, [[x, y - h], [x + w, y - h * 0.42], [x, y - h * 0.42]], shade(col, -0.18));
    if (snow) {
      poly(ctx, [[x, y - h], [x - w * 0.5, y - h * 0.72], [x + w * 0.5, y - h * 0.72]], '#ffffff');
      poly(ctx, [[x, y - h * 0.62], [x - w * 0.9, y - h * 0.32], [x + w * 0.9, y - h * 0.32], [x + w * 0.4, y - h * 0.4], [x, y - h * 0.36]], 'rgba(255,255,255,0.85)');
    }
  },
  palm(ctx, x, y, s, rng) {
    D.shadow(ctx, x, y, s, 0.06);
    const lean = (rng() - 0.5) * s * 0.12, top = [x + lean, y - s * 0.24];
    ctx.strokeStyle = '#a0703f';
    ctx.lineWidth = s * 0.022;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x, y - s * 0.12, top[0], top[1]);
    ctx.stroke();
    ctx.strokeStyle = '#2f9e4f';
    ctx.lineWidth = s * 0.03;
    for (let k = 0; k < 5; k++) {
      const a = (-170 + k * 40) * RAD;
      const ex = top[0] + Math.cos(a) * s * 0.11, ey = top[1] + Math.sin(a) * s * 0.06 + s * 0.04;
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      ctx.quadraticCurveTo((top[0] + ex) / 2, top[1] - s * 0.04, ex, ey);
      ctx.stroke();
    }
    ellipse(ctx, top[0], top[1] + s * 0.01, s * 0.015, s * 0.015, '#6b4423');
  },
  house(ctx, x, y, s, variant, rng) {
    const w = s * 0.11, h = s * 0.07, d = s * 0.04, rh = s * 0.055;
    let wall = '#fff4ec', roof = '#f2895b';
    if (variant === 'snowy') { wall = '#f1e6df'; roof = '#ffffff'; }
    if (variant === 'tropical') {
      wall = ['#ffd6e0', '#c8ecff', '#fff0a8', '#d4f5cf'][Math.floor(rng() * 4)];
      roof = ['#ff8a65', '#ff6f91', '#f9a03f'][Math.floor(rng() * 3)];
    }
    D.shadow(ctx, x + d * 0.5, y, s, 0.1);
    const L = x - w / 2, R = x + w / 2;
    poly(ctx, [[R, y], [R + d, y - d * 0.6], [R + d, y - h - d * 0.6], [R, y - h]], shade(wall.startsWith('#') ? wall : '#ffffff', -0.2));
    ctx.fillStyle = wall;
    ctx.fillRect(L, y - h, w, h);
    poly(ctx, [[L - s * 0.008, y - h], [R + s * 0.008, y - h], [x, y - h - rh]], shade(wall, -0.06));
    poly(ctx, [[x, y - h - rh], [R + s * 0.008, y - h], [R + d + s * 0.008, y - h - d * 0.6], [x + d, y - h - rh - d * 0.6]], roof);
    if (variant === 'snowy') {
      ctx.strokeStyle = '#c6d2e2';
      ctx.lineWidth = s * 0.006;
      ctx.beginPath();
      ctx.moveTo(R + s * 0.008, y - h);
      ctx.lineTo(R + d + s * 0.008, y - h - d * 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = '#5b7bb5';
    ctx.fillRect(x - w * 0.25, y - h * 0.62, w * 0.2, h * 0.3);
    ctx.fillStyle = '#9b6a44';
    ctx.fillRect(x + w * 0.1, y - h * 0.55, w * 0.18, h * 0.55);
  },
  tower(ctx, x, y, s, variant) {
    const w = s * 0.1, h = s * 0.26, d = s * 0.05;
    const front = variant === 'tropical' ? '#ffe0b8' : variant === 'snowy' ? '#d6dcef' : '#b9cdf0';
    D.shadow(ctx, x + d * 0.5, y, s, 0.1);
    poly(ctx, [[x + w / 2, y], [x + w / 2 + d, y - d * 0.6], [x + w / 2 + d, y - h - d * 0.6], [x + w / 2, y - h]], shade(front, -0.22));
    ctx.fillStyle = front;
    ctx.fillRect(x - w / 2, y - h, w, h);
    poly(ctx, [[x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2 + d, y - h - d * 0.6], [x - w / 2 + d, y - h - d * 0.6]], shade(front, 0.3));
    ctx.fillStyle = 'rgba(70,100,160,0.45)';
    for (let k = 1; k < 6; k++) ctx.fillRect(x - w * 0.35, y - h + k * h / 6, w * 0.7, h * 0.05);
  },
  peak(ctx, x, y, s, variant, sc) {
    const w = s * 0.4 * sc, h = s * 0.36 * sc;
    let light = '#a39588', dark = '#7f7368';
    if (variant === 'snowy') { light = '#b9c3d6'; dark = '#8e9ab2'; }
    if (variant === 'tropical') { light = '#7a675e'; dark = '#5b4b44'; }
    ellipse(ctx, x, y, w * 0.55, w * 0.18, 'rgba(0,0,0,0.15)');
    poly(ctx, [[x, y - h], [x - w / 2, y], [x + w * 0.08, y]], light);
    poly(ctx, [[x, y - h], [x + w * 0.08, y], [x + w / 2, y]], dark);
    if (variant === 'tropical') {
      poly(ctx, [[x - w * 0.09, y - h * 0.82], [x + w * 0.09, y - h * 0.82], [x, y - h * 1.02]], '#ff7a3d');
      ellipse(ctx, x, y - h * 0.86, w * 0.07, w * 0.03, '#ffb347');
    } else {
      const cap = variant === 'snowy' ? 0.5 : 0.36;
      poly(ctx, [
        [x, y - h], [x - w * 0.5 * cap, y - h * (1 - cap)], [x - w * 0.12 * cap, y - h * (1 - cap * 0.75)],
        [x + w * 0.05 * cap, y - h * (1 - cap)], [x + w * 0.5 * cap, y - h * (1 - cap)],
      ], '#ffffff');
    }
  },
  bush(ctx, x, y, s, col) {
    ellipse(ctx, x, y, s * 0.045, s * 0.02, 'rgba(0,0,0,0.12)');
    ellipse(ctx, x, y - s * 0.025, s * 0.04, s * 0.032, col);
    ellipse(ctx, x - s * 0.012, y - s * 0.035, s * 0.018, s * 0.014, shade(col, 0.25));
  },
  flower(ctx, x, y, s, rng) {
    ellipse(ctx, x, y, s * 0.012, s * 0.009, ['#ffffff', '#ffd23f', '#ff7aa2', '#c38bff'][Math.floor(rng() * 4)]);
  },
  rock(ctx, x, y, s, col = '#9aa3b5') {
    ellipse(ctx, x, y - s * 0.01, s * 0.035, s * 0.022, col);
    ellipse(ctx, x - s * 0.01, y - s * 0.017, s * 0.014, s * 0.008, 'rgba(255,255,255,0.6)');
  },
  tuft(ctx, x, y, s) {
    ctx.strokeStyle = '#8cb84a';
    ctx.lineWidth = s * 0.01;
    ctx.beginPath();
    for (const dx of [-1, 0, 1]) { ctx.moveTo(x, y); ctx.lineTo(x + dx * s * 0.02, y - s * 0.04); }
    ctx.stroke();
  },
  hay(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.04, s * 0.016, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = '#e9b949';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.035, s * 0.04, 0, Math.PI, 0);
    ctx.fill();
    ellipse(ctx, x - s * 0.01, y - s * 0.025, s * 0.01, s * 0.008, '#f8dc86');
  },
  wave(ctx, x, y, s, col = 'rgba(255,255,255,0.55)') {
    ctx.strokeStyle = col;
    ctx.lineWidth = s * 0.014;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.05, y);
    ctx.quadraticCurveTo(x - s * 0.025, y - s * 0.022, x, y);
    ctx.quadraticCurveTo(x + s * 0.025, y - s * 0.022, x + s * 0.05, y);
    ctx.stroke();
  },
  floe(ctx, x, y, s, rng) {
    const r = s * (0.04 + rng() * 0.03);
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = k * 60 * RAD + rng() * 0.6;
      pts.push([x + Math.cos(a) * r * (0.7 + rng() * 0.4), y + Math.sin(a) * r * 0.55]);
    }
    poly(ctx, pts.map(([a, b]) => [a, b + s * 0.008]), 'rgba(80,140,190,0.5)');
    poly(ctx, pts, '#f4fbff');
  },
};

// Point inside triangle (center, corner i, corner i+1), in unit hex coords.
function triPoint(i, rng, lo = 0.25, hi = 0.85) {
  let u = rng(), v = rng();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const t = lo + (hi - lo) * (u + v), sum = u + v || 1;
  const a = (u / sum) * t, b = (v / sum) * t;
  const A = CORNERS[i], B = CORNERS[(i + 1) % 6];
  return [A[0] * a + B[0] * b, A[1] * a + B[1] * b];
}

function triangleTexture(ctx, cx, cy, s, i, kind, variant, rng) {
  const A = CORNERS[i], B = CORNERS[(i + 1) % 6];
  const P = (u, v) => [cx + (A[0] * u + B[0] * v) * s, cy + (A[1] * u + B[1] * v) * s * TILT];
  if (kind === 'farm') {
    const base = kindColor(kind, variant);
    ctx.strokeStyle = variant === 'tropical' ? 'rgba(80,170,210,0.45)' : shade(base, -0.12);
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = 'butt';
    for (const f of [0.3, 0.5, 0.7, 0.9]) {
      const [x1, y1] = P(f, 0), [x2, y2] = P(0, f);
      ctx.beginPath();
      ctx.moveTo(x1 + (x2 - x1) * 0.04, y1 + (y2 - y1) * 0.04);
      ctx.lineTo(x2 + (x1 - x2) * 0.04, y2 + (y1 - y2) * 0.04);
      ctx.stroke();
    }
  } else if (kind === 'city') {
    const [x1, y1] = P(0.55, 0.05), [x2, y2] = P(0.05, 0.55);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else if (kind === 'plains' && rng() < 0.7) {
    const [x, y] = P(0.25 + rng() * 0.3, 0.2 + rng() * 0.25);
    ellipse(ctx, x, y, s * 0.09, s * 0.04, shade(kindColor(kind, variant), variant === 'snowy' ? -0.04 : 0.12));
  }
}

function decorFor(kind, variant, i, rng, list, cx, cy, s, small) {
  const at = (lo, hi) => {
    const [px, py] = triPoint(i, rng, lo, hi);
    return [cx + px * s, cy + py * s * TILT];
  };
  const add = (pt, fn) => list.push({ x: pt[0], y: pt[1], fn });
  switch (kind) {
    case 'forest': {
      const n = small ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const pt = at(0.2, 0.92);
        if (variant === 'snowy') add(pt, (c) => D.pine(c, pt[0], pt[1], s, '#2f7d5b', true));
        else if (variant === 'tropical') {
          if (rng() < 0.5) add(pt, (c) => D.palm(c, pt[0], pt[1], s, mulberry32(pt[0] * 13 + pt[1] * 7)));
          else add(pt, (c) => D.roundTree(c, pt[0], pt[1], s, '#1f9a52'));
        } else if (rng() < 0.65) {
          const tc = ['#3f9c35', '#4cae3b', '#5bb84a'][Math.floor(rng() * 3)];
          add(pt, (c) => D.roundTree(c, pt[0], pt[1], s, tc));
        } else add(pt, (c) => D.pine(c, pt[0], pt[1], s, '#2f8a3a', false));
      }
      break;
    }
    case 'city': {
      const n = small ? 1 : 2 + (rng() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const pt = at(0.3, 0.85);
        if (rng() < 0.18 && variant !== 'snowy') add(pt, (c) => D.tower(c, pt[0], pt[1], s, variant));
        else {
          const seed = rng() * 1e6;
          add(pt, (c) => D.house(c, pt[0], pt[1], s, variant, mulberry32(seed)));
        }
      }
      break;
    }
    case 'mountain': {
      const pt = at(0.45, 0.55);
      add(pt, (c) => D.peak(c, pt[0], pt[1], s, variant, 1));
      if (!small && rng() < 0.5) {
        const p2 = at(0.7, 0.9);
        add(p2, (c) => D.peak(c, p2[0], p2[1], s, variant, 0.55));
      }
      break;
    }
    case 'plains': {
      if (variant === 'snowy') {
        const pt = at(0.3, 0.85);
        if (rng() < 0.5) add(pt, (c) => D.rock(c, pt[0], pt[1], s));
        else add(pt, (c) => D.pine(c, pt[0], pt[1], s * 0.7, '#3d8a66', true));
      } else if (variant === 'tropical') {
        for (let k = 0; k < 2; k++) { const pt = at(0.3, 0.9); add(pt, (c) => D.tuft(c, pt[0], pt[1], s)); }
      } else {
        const pt = at(0.3, 0.85);
        add(pt, (c) => D.bush(c, pt[0], pt[1], s, '#62b33c'));
        for (let k = 0; k < 3; k++) {
          const p = at(0.2, 0.9), seed = rng() * 1e6;
          add(p, (c) => D.flower(c, p[0], p[1], s, mulberry32(seed)));
        }
      }
      break;
    }
    case 'farm': {
      if (variant !== 'tropical' && rng() < 0.35) { const pt = at(0.4, 0.8); add(pt, (c) => D.hay(c, pt[0], pt[1], s)); }
      break;
    }
    case 'water': {
      for (let k = 0; k < 2; k++) {
        const pt = at(0.25, 0.85);
        if (variant === 'snowy' && k === 0 && rng() < 0.6) {
          const seed = rng() * 1e6;
          list.push({ x: pt[0], y: pt[1] - 1e4, fn: (c) => D.floe(c, pt[0], pt[1], s, mulberry32(seed)) });
        } else list.push({ x: pt[0], y: pt[1] - 1e4, fn: (c) => D.wave(c, pt[0], pt[1], s) });
      }
      break;
    }
    case '*': {
      const pt = at(0.4, 0.6);
      list.push({ x: pt[0], y: pt[1], fn: (c) => sparkle(c, pt[0], pt[1], s * 0.05) });
      break;
    }
    default: break;
  }
}

function sparkle(ctx, x, y, r) {
  poly(ctx, [[x, y - r], [x + r * 0.25, y - r * 0.25], [x + r, y], [x + r * 0.25, y + r * 0.25], [x, y + r], [x - r * 0.25, y + r * 0.25], [x - r, y], [x - r * 0.25, y - r * 0.25]], '#ffffff');
}

// Draw a full tile prism. tile: { base, rot, variant, id, wild }.
export function drawTile(ctx, cx, cy, s, tile, opts = {}) {
  const small = s < 30;
  const edges = Array.from({ length: 6 }, (_, d) => edgeAt(tile, d));
  const colorFor = (d) => kindColor(edges[d], tile.variant, d);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  drawSides(ctx, cx, cy, s, colorFor);
  // top triangles
  for (let i = 0; i < 6; i++) {
    const A = CORNERS[i], B = CORNERS[(i + 1) % 6];
    const col = colorFor(i);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + A[0] * s, cy + A[1] * s * TILT);
    ctx.lineTo(cx + B[0] * s, cy + B[1] * s * TILT);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const list = [];
  for (let i = 0; i < 6; i++) {
    const baseIdx = (i + tile.rot) % 6;
    const rng = mulberry32(tile.id * 977 + baseIdx * 131 + 7);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + CORNERS[i][0] * s, cy + CORNERS[i][1] * s * TILT);
    ctx.lineTo(cx + CORNERS[(i + 1) % 6][0] * s, cy + CORNERS[(i + 1) % 6][1] * s * TILT);
    ctx.closePath();
    ctx.clip();
    triangleTexture(ctx, cx, cy, s, i, edges[i], tile.variant, rng);
    ctx.restore();
    decorFor(edges[i], tile.variant, i, rng, list, cx, cy, s, small);
  }
  hexPath(ctx, cx, cy, s);
  ctx.strokeStyle = 'rgba(60,40,90,0.14)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.fn(ctx);
  ctx.restore();
}

export function drawSlot(ctx, cx, cy, s, hot) {
  hexPath(ctx, cx, cy, s, 0.9);
  ctx.fillStyle = hot ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.lineCap = 'round';
  const a = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(cx - a, cy);
  ctx.lineTo(cx + a, cy);
  ctx.moveTo(cx, cy - a * TILT);
  ctx.lineTo(cx, cy + a * TILT);
  ctx.stroke();
}

export function drawConstruction(ctx, cx, cy, s, req, opts = {}) {
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  const base = opts.tint || '#c4bfd3';
  drawSides(ctx, cx, cy, s, () => '#a49fb6');
  hexPath(ctx, cx, cy, s);
  ctx.fillStyle = base;
  ctx.fill();
  // hazard ring
  ctx.save();
  hexPath(ctx, cx, cy, s);
  ctx.clip();
  ctx.beginPath();
  for (let j = 0; j < 6; j++) ctx.lineTo(cx + CORNERS[j][0] * s, cy + CORNERS[j][1] * s * TILT);
  ctx.closePath();
  for (let j = 5; j >= 0; j--) ctx.lineTo(cx + CORNERS[j][0] * s * 0.82, cy + CORNERS[j][1] * s * 0.82 * TILT);
  ctx.closePath();
  ctx.clip('evenodd');
  ctx.fillStyle = '#ffcf33';
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  ctx.strokeStyle = '#3b3346';
  ctx.lineWidth = s * 0.08;
  for (let k = -12; k <= 12; k++) {
    ctx.beginPath();
    ctx.moveTo(cx + k * s * 0.18 - s, cy + s);
    ctx.lineTo(cx + k * s * 0.18 + s, cy - s);
    ctx.stroke();
  }
  ctx.restore();
  // requirement badge
  ellipse(ctx, cx, cy, s * 0.3, s * 0.3 * TILT, 'rgba(255,255,255,0.85)');
  ctx.font = `${Math.round(s * 0.34)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#333';
  ctx.fillText(KINDS[req].emoji, cx, cy + s * 0.02);
  ctx.restore();
}

// Coloured band along one side of a hex (placement feedback).
export function drawEdgeMark(ctx, cx, cy, s, dir, color) {
  const A = CORNERS[dir], B = CORNERS[(dir + 1) % 6];
  const k = 0.92;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, s * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + A[0] * s * k + (B[0] - A[0]) * s * 0.18, cy + (A[1] * k + (B[1] - A[1]) * 0.18) * s * TILT);
  ctx.lineTo(cx + B[0] * s * k + (A[0] - B[0]) * s * 0.18, cy + (B[1] * k + (A[1] - B[1]) * 0.18) * s * TILT);
  ctx.stroke();
}

export function drawHexOutline(ctx, cx, cy, s, color, width = 3) {
  hexPath(ctx, cx, cy, s, 0.96);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// ---------- landmarks ----------
export function drawLandmark(ctx, type, x, y, s, t = 0) {
  const L = LANDMARKS[type];
  if (L) L(ctx, x, y, s, t);
}

const LANDMARKS = {
  tower(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.42, s * 0.14, 'rgba(0,0,0,0.18)');
    const pink = '#e98bd9', dark = '#c46bb6';
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.34, y);
    ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.45, x - s * 0.035, y - s * 1.0);
    ctx.lineTo(x + s * 0.035, y - s * 1.0);
    ctx.quadraticCurveTo(x + s * 0.12, y - s * 0.45, x + s * 0.34, y);
    ctx.lineTo(x + s * 0.2, y);
    ctx.quadraticCurveTo(x, y - s * 0.32, x - s * 0.2, y);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = dark;
    ctx.fillRect(x, y - s * 1.1, s * 0.5, s * 1.2);
    ctx.restore();
    ctx.fillStyle = shade('#e98bd9', 0.2);
    ctx.fillRect(x - s * 0.23, y - s * 0.34, s * 0.46, s * 0.05);
    ctx.fillRect(x - s * 0.12, y - s * 0.64, s * 0.24, s * 0.04);
    ctx.strokeStyle = dark;
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 1.0);
    ctx.lineTo(x, y - s * 1.25);
    ctx.stroke();
  },
  harbor(ctx, x, y, s) {
    // lighthouse
    const lx = x - s * 0.3, ly = y;
    ellipse(ctx, lx, ly, s * 0.12, s * 0.05, 'rgba(0,0,0,0.2)');
    const H = s * 0.7;
    for (let k = 0; k < 4; k++) {
      const y1 = ly - (H * k) / 4, y2 = ly - (H * (k + 1)) / 4;
      const w1 = s * 0.08 - (s * 0.03 * k) / 4, w2 = s * 0.08 - (s * 0.03 * (k + 1)) / 4;
      poly(ctx, [[lx - w1, y1], [lx + w1, y1], [lx + w2, y2], [lx - w2, y2]], k % 2 ? '#ffffff' : '#ee4b4b');
    }
    ellipse(ctx, lx, ly - H - s * 0.04, s * 0.05, s * 0.05, '#ffe066');
    poly(ctx, [[lx - s * 0.07, ly - H - s * 0.07], [lx + s * 0.07, ly - H - s * 0.07], [lx, ly - H - s * 0.17]], '#ee4b4b');
    // container ship
    const sx = x + s * 0.18, sy = y + s * 0.05;
    ellipse(ctx, sx, sy + s * 0.02, s * 0.32, s * 0.06, 'rgba(0,40,80,0.25)');
    poly(ctx, [[sx - s * 0.32, sy - s * 0.1], [sx + s * 0.34, sy - s * 0.1], [sx + s * 0.26, sy], [sx - s * 0.28, sy]], '#e2504a');
    poly(ctx, [[sx - s * 0.32, sy - s * 0.1], [sx + s * 0.34, sy - s * 0.1], [sx + s * 0.33, sy - s * 0.07], [sx - s * 0.31, sy - s * 0.07]], '#ffffff');
    const cols = ['#3d7be0', '#f2c94c', '#56c271', '#f2994a', '#9b6be0'];
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = cols[k];
      ctx.fillRect(sx - s * 0.18 + k * s * 0.08, sy - s * 0.18, s * 0.07, s * 0.08);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - s * 0.29, sy - s * 0.26, s * 0.09, s * 0.16);
    ctx.fillStyle = '#5b7bb5';
    ctx.fillRect(sx - s * 0.27, sy - s * 0.23, s * 0.05, s * 0.03);
  },
  windfarm(ctx, x, y, s, t) {
    ellipse(ctx, x, y, s * 0.08, s * 0.03, 'rgba(0,0,0,0.15)');
    const H = s * 0.6;
    poly(ctx, [[x - s * 0.018, y], [x + s * 0.018, y], [x + s * 0.008, y - H], [x - s * 0.008, y - H]], '#f4f6fb');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.03;
    ctx.lineCap = 'round';
    const a0 = t * 0.0025;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * 2 * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x, y - H);
      ctx.lineTo(x + Math.cos(a) * s * 0.28, y - H + Math.sin(a) * s * 0.28);
      ctx.stroke();
    }
    ellipse(ctx, x, y - H, s * 0.025, s * 0.025, '#dfe5f0');
  },
  observatory(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.2, s * 0.07, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#e9edf5';
    ctx.fillRect(x - s * 0.15, y - s * 0.2, s * 0.3, s * 0.2);
    ctx.fillStyle = '#c9d0de';
    ctx.fillRect(x + s * 0.04, y - s * 0.2, s * 0.11, s * 0.2);
    ctx.fillStyle = '#f7f9fc';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.2, s * 0.17, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#c9d0de';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.2, s * 0.17, -Math.PI / 2.6, 0);
    ctx.lineTo(x, y - s * 0.2);
    ctx.fill();
    ctx.strokeStyle = '#4a5578';
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.03, y - s * 0.3);
    ctx.lineTo(x - s * 0.1, y - s * 0.42);
    ctx.stroke();
  },
  castle(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.5, s * 0.15, 'rgba(0,0,0,0.2)');
    const stone = '#cfc8c0', dark = '#a9a097';
    const tower = (tx, h, w) => {
      ctx.fillStyle = stone;
      ctx.fillRect(tx - w / 2, y - h, w, h);
      ctx.fillStyle = dark;
      ctx.fillRect(tx + w * 0.1, y - h, w * 0.4, h);
      poly(ctx, [[tx - w * 0.62, y - h], [tx + w * 0.62, y - h], [tx, y - h - w * 1.3]], '#4f7fd9');
      poly(ctx, [[tx, y - h - w * 1.3], [tx + w * 0.62, y - h], [tx + w * 0.1, y - h]], '#3b62b0');
    };
    // wall
    ctx.fillStyle = stone;
    ctx.fillRect(x - s * 0.4, y - s * 0.22, s * 0.8, s * 0.22);
    ctx.fillStyle = dark;
    ctx.fillRect(x - s * 0.4, y - s * 0.06, s * 0.8, s * 0.06);
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = stone;
      ctx.fillRect(x - s * 0.4 + k * s * 0.1, y - s * 0.26, s * 0.05, s * 0.04);
    }
    ctx.fillStyle = '#6b4a35';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.07, s * 0.06, Math.PI, 0);
    ctx.lineTo(x + s * 0.06, y);
    ctx.lineTo(x - s * 0.06, y);
    ctx.fill();
    tower(x - s * 0.4, s * 0.4, s * 0.13);
    tower(x + s * 0.4, s * 0.4, s * 0.13);
    tower(x - s * 0.12, s * 0.6, s * 0.15);
    tower(x + s * 0.14, s * 0.5, s * 0.12);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.12, y - s * 0.79);
    ctx.lineTo(x - s * 0.12, y - s * 0.95);
    ctx.stroke();
    poly(ctx, [[x - s * 0.12, y - s * 0.95], [x + s * 0.0, y - s * 0.91], [x - s * 0.12, y - s * 0.87]], '#ee4b4b');
  },
  dam(ctx, x, y, s) {
    ellipse(ctx, x, y + s * 0.02, s * 0.6, s * 0.12, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = '#bdb6aa';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.62, y - s * 0.05);
    ctx.quadraticCurveTo(x, y + s * 0.18, x + s * 0.62, y - s * 0.05);
    ctx.lineTo(x + s * 0.62, y - s * 0.3);
    ctx.quadraticCurveTo(x, y - s * 0.07, x - s * 0.62, y - s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e1dbd0';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.62, y - s * 0.3);
    ctx.quadraticCurveTo(x, y - s * 0.07, x + s * 0.62, y - s * 0.3);
    ctx.lineTo(x + s * 0.62, y - s * 0.36);
    ctx.quadraticCurveTo(x, y - s * 0.13, x - s * 0.62, y - s * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.85)';
    ctx.lineWidth = s * 0.035;
    for (const dx of [-0.12, 0, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * s, y - s * 0.17);
      ctx.lineTo(x + dx * s, y + s * 0.06);
      ctx.stroke();
    }
  },
  pyramid(ctx, x, y, s) {
    ellipse(ctx, x + s * 0.08, y, s * 0.5, s * 0.14, 'rgba(0,0,0,0.2)');
    poly(ctx, [[x, y - s * 0.62], [x - s * 0.48, y], [x + s * 0.1, y + s * 0.04]], '#f5d68e');
    poly(ctx, [[x, y - s * 0.62], [x + s * 0.1, y + s * 0.04], [x + s * 0.48, y - s * 0.04]], '#d8b263');
    ctx.strokeStyle = 'rgba(150,110,50,0.35)';
    ctx.lineWidth = s * 0.01;
    for (let k = 1; k < 6; k++) {
      const f = k / 6;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.48 * f, y - s * 0.62 * (1 - f));
      ctx.lineTo(x + s * 0.1 * f, y - s * 0.62 * (1 - f) + s * 0.04 * f);
      ctx.lineTo(x + s * 0.48 * f, y - s * 0.62 * (1 - f) - s * 0.04 * f);
      ctx.stroke();
    }
  },
  skilodge(ctx, x, y, s) {
    // lift line
    ctx.strokeStyle = '#4a4a5a';
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y - s * 0.3);
    ctx.lineTo(x + s * 0.55, y - s * 0.95);
    ctx.stroke();
    for (const f of [0.3, 0.65]) {
      const px = x + s * 0.15 + s * 0.4 * f, py = y - s * 0.3 - s * 0.65 * f;
      ctx.fillStyle = '#ee4b4b';
      ctx.fillRect(px - s * 0.03, py + s * 0.03, s * 0.06, s * 0.04);
    }
    ellipse(ctx, x, y, s * 0.3, s * 0.09, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#a0673d';
    ctx.fillRect(x - s * 0.24, y - s * 0.22, s * 0.48, s * 0.22);
    ctx.fillStyle = '#7d4e2c';
    ctx.fillRect(x + s * 0.08, y - s * 0.22, s * 0.16, s * 0.22);
    poly(ctx, [[x - s * 0.3, y - s * 0.21], [x + s * 0.3, y - s * 0.21], [x, y - s * 0.48]], '#ffffff');
    poly(ctx, [[x, y - s * 0.48], [x + s * 0.3, y - s * 0.21], [x + s * 0.12, y - s * 0.21]], '#d9e3f0');
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(x - s * 0.17, y - s * 0.15, s * 0.07, s * 0.06);
    ctx.fillRect(x - s * 0.04, y - s * 0.15, s * 0.07, s * 0.06);
  },
  sawmill(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.34, s * 0.1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = '#c0493d';
    ctx.fillRect(x - s * 0.22, y - s * 0.24, s * 0.36, s * 0.24);
    ctx.fillStyle = '#9b372e';
    ctx.fillRect(x + s * 0.05, y - s * 0.24, s * 0.09, s * 0.24);
    poly(ctx, [[x - s * 0.26, y - s * 0.23], [x + s * 0.18, y - s * 0.23], [x - s * 0.04, y - s * 0.42]], '#5d4037');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - s * 0.1, y - s * 0.14, s * 0.1, s * 0.14);
    // logs
    for (const [dx, dy] of [[0.24, 0], [0.32, 0], [0.28, -0.06]]) {
      ctx.fillStyle = '#8d5b34';
      ctx.fillRect(x + s * dx - s * 0.06, y + s * dy - s * 0.05, s * 0.1, s * 0.05);
      ellipse(ctx, x + s * dx + s * 0.04, y + s * dy - s * 0.025, s * 0.02, s * 0.025, '#e7c08a');
    }
    // saw blade
    ellipse(ctx, x - s * 0.3, y - s * 0.1, s * 0.07, s * 0.07, '#cfd6e0');
    ellipse(ctx, x - s * 0.3, y - s * 0.1, s * 0.02, s * 0.02, '#7b8494');
  },
};

// ---------- board renderer ----------
export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 46 };
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }

  toScreen(q, r) {
    const [x, y] = hexToPixel(q, r, 1);
    return [this.cam.x + x * this.cam.zoom, this.cam.y + y * this.cam.zoom * TILT];
  }

  toHex(sx, sy) {
    return pixelToHex((sx - this.cam.x) / this.cam.zoom, (sy - this.cam.y) / (this.cam.zoom * TILT), 1);
  }

  // Centre the camera on a set of cells, fitting them into the free area.
  fit(cells, area, animate = false) {
    if (!cells.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [q, r] of cells) {
      const [x, y] = hexToPixel(q, r, 1);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const spanX = maxX - minX + 2.4, spanY = (maxY - minY + 2.6) * TILT;
    const zoom = Math.max(22, Math.min(84, Math.min(area.w / spanX, area.h / spanY)));
    const target = {
      zoom,
      x: area.x + area.w / 2 - ((minX + maxX) / 2) * zoom,
      y: area.y + area.h / 2 - ((minY + maxY) / 2) * zoom * TILT,
    };
    if (animate) this.target = target;
    else { this.target = null; Object.assign(this.cam, target); }
  }

  // Ease the camera toward a pending fit target.
  step() {
    const t = this.target;
    if (!t) return;
    const k = 0.15;
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
    this.cam.zoom += (t.zoom - this.cam.zoom) * k;
    if (Math.abs(t.x - this.cam.x) < 0.5 && Math.abs(t.y - this.cam.y) < 0.5 && Math.abs(t.zoom - this.cam.zoom) < 0.05) {
      Object.assign(this.cam, t);
      this.target = null;
    }
  }

  zoomAt(sx, sy, factor) {
    this.target = null;
    const z = Math.max(18, Math.min(110, this.cam.zoom * factor));
    const f = z / this.cam.zoom;
    this.cam.x = sx - (sx - this.cam.x) * f;
    this.cam.y = sy - (sy - this.cam.y) * f;
    this.cam.zoom = z;
  }

  render(view) {
    const { ctx } = this;
    const { game, preview, megaPreview, hover, anims, time, mode } = view;
    const s = this.cam.zoom;
    const st = game.s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const visible = (x, y) => x > -s * 2 && x < this.w + s * 2 && y > -s * 2 && y < this.h + s * 3;

    // slots (flat, drawn first)
    if (mode !== 'mega') {
      for (const [k, [q, r]] of view.slots) {
        const [x, y] = this.toScreen(q, r);
        if (!visible(x, y)) continue;
        drawSlot(ctx, x, y, s, hover === k);
      }
    }

    // gather prisms in painter's order
    const items = [];
    for (const k in st.tiles) {
      const t = st.tiles[k];
      items.push({ q: t.q, r: t.r, kind: 'tile', t, k });
    }
    for (const k in st.cons) {
      const c = st.cons[k];
      if (preview && preview.k === k) continue;
      items.push({ q: c.q, r: c.r, kind: 'con', c, k });
    }
    if (megaPreview) {
      for (const c of megaPreview.cells) {
        if (c.status === 'empty' || (c.status === 'bad' && !st.tiles[key(c.q, c.r)])) {
          items.push({ q: c.q, r: c.r, kind: 'ghostcon', c });
        }
      }
    }
    items.sort((a, b) => a.r - b.r || a.q - b.q);

    const dropOffset = (k) => {
      const a = anims.find((x) => x.type === 'drop' && x.k === k);
      if (!a) return 0;
      const p = Math.min(1, (time - a.start) / a.dur);
      return -s * 0.6 * (1 - p) * (1 - p);
    };

    for (const it of items) {
      const [x, y0] = this.toScreen(it.q, it.r);
      if (!visible(x, y0)) continue;
      if (it.kind === 'tile') {
        const y = y0 + dropOffset(it.k);
        drawTile(ctx, x, y, s, it.t);
        if (it.t.mega !== undefined) {
          const stc = st.structs.find((z) => z.sid === it.t.mega);
          if (stc && !structureProgress(st, stc).complete) drawHexOutline(ctx, x, y, s, 'rgba(255,214,80,0.95)', Math.max(2, s * 0.06));
        }
        if (mode === 'bulldoze' && hover === it.k) drawHexOutline(ctx, x, y, s, '#ff5a5a', Math.max(3, s * 0.08));
      } else if (it.kind === 'con') {
        drawConstruction(ctx, x, y0, s, it.c.req);
      } else if (it.kind === 'ghostcon') {
        drawConstruction(ctx, x, y0 - s * 0.1, s, it.c.req, {
          alpha: 0.85, tint: it.c.status === 'bad' ? '#f29a9a' : '#b9f0c6',
        });
      }
    }

    // landmarks
    const marks = [];
    for (const stc of st.structs) {
      const prog = structureProgress(st, stc);
      const def = MEGAS[stc.type];
      const pts = stc.cells.map((c) => this.toScreen(c.q, c.r));
      const pop = anims.find((a) => a.type === 'complete' && a.sid === stc.sid);
      const scale = pop ? 0.6 + 0.4 * Math.min(1, (time - pop.start) / 400) : 1;
      const alpha = prog.complete ? 1 : 0.32;
      if (def.draw === 'each') {
        stc.cells.forEach((c, i) => {
          const t = st.tiles[key(c.q, c.r)];
          const done = t && t.mega === stc.sid;
          marks.push({ y: pts[i][1], fn: () => {
            ctx.save();
            ctx.globalAlpha = prog.complete ? 1 : done ? 0.85 : 0.3;
            drawLandmark(ctx, stc.type, pts[i][0], pts[i][1] + s * 0.05, s * scale, time);
            ctx.restore();
          } });
        });
      } else {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        marks.push({ y: cy, fn: () => {
          ctx.save();
          ctx.globalAlpha = alpha;
          drawLandmark(ctx, stc.type, cx, cy + s * 0.15, s * 1.15 * scale, time);
          ctx.restore();
        } });
      }
      if (!prog.complete) {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const top = Math.min(...pts.map((p) => p[1]));
        marks.push({ y: 1e9, fn: () => badge(ctx, cx, top - s * 0.55, `${def.emoji} ${prog.done}/${prog.total}`, s) });
      }
    }
    marks.sort((a, b) => a.y - b.y);
    for (const m of marks) m.fn();

    // mega placement preview: outlines over existing tiles + ghost landmark
    if (megaPreview) {
      for (const c of megaPreview.cells) {
        const [x, y] = this.toScreen(c.q, c.r);
        if (st.tiles[key(c.q, c.r)]) {
          drawHexOutline(ctx, x, y, s, c.status === 'bad' ? '#ff5a5a' : '#4ef08a', Math.max(3, s * 0.09));
          ctx.font = `${Math.round(s * 0.38)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(KINDS[c.req].emoji, x, y - s * 0.3);
        }
      }
      const pts = megaPreview.cells.map((c) => this.toScreen(c.q, c.r));
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      ctx.save();
      ctx.globalAlpha = 0.55;
      if (MEGAS[megaPreview.type].draw === 'each') pts.forEach((p) => drawLandmark(ctx, megaPreview.type, p[0], p[1], s, time));
      else drawLandmark(ctx, megaPreview.type, cx, cy + s * 0.1, s * 1.15, time);
      ctx.restore();
      const top = Math.min(...pts.map((p) => p[1]));
      const label = megaPreview.ok ? (megaPreview.delta ? `+${megaPreview.delta} ⭐` : 'Place blueprint') : megaPreview.connected ? 'Blocked' : 'Must touch land';
      badge(ctx, cx, top - s * 1.1, label, s, megaPreview.ok ? '#ffffff' : '#ffd6d6');
    }

    // tile placement preview
    if (preview) {
      const [x, y0] = this.toScreen(preview.q, preview.r);
      const lift = s * 0.22 + Math.sin(time / 260) * s * 0.03;
      ellipse(ctx, x, y0 + s * 0.1, s * 0.85, s * 0.85 * TILT * 0.9, 'rgba(40,20,90,0.22)');
      const y = y0 - lift;
      drawTile(ctx, x, y, s, preview.tile, { alpha: preview.ev.ok ? 1 : 0.6 });
      if (preview.ev.ok) {
        preview.ev.sides.forEach((st2, d) => {
          if (!st2) return;
          drawEdgeMark(ctx, x, y, s, d, st2 === 'exact' ? '#3ee07a' : st2 === 'partial' ? '#ffd23f' : '#ff5a5a');
        });
        const extra = [];
        if (preview.ev.newPerfects) extra.push('✨');
        if (preview.ev.completed) extra.push('🏆');
        badge(ctx, x, y - s * 0.95, `+${preview.ev.delta} ⭐ ${extra.join('')}`, s);
      } else {
        drawHexOutline(ctx, x, y, s, '#ff5a5a', Math.max(3, s * 0.08));
        const label = preview.ev.reason === 'construction' ? `Needs ${KINDS[preview.ev.req].emoji} tile` : preview.ev.reason;
        badge(ctx, x, y - s * 0.95, label, s, '#ffd6d6');
      }
    }

    // floating texts & particles
    for (const a of anims) {
      const p = (time - a.start) / a.dur;
      if (p < 0 || p > 1) continue;
      if (a.type === 'float') {
        const [x, y] = this.toScreen(a.q, a.r);
        ctx.save();
        ctx.globalAlpha = 1 - p * p;
        ctx.font = `800 ${Math.round(Math.max(16, s * 0.42))}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(60,30,120,0.75)';
        ctx.fillStyle = a.color || '#ffe066';
        const yy = y - s * 0.8 - p * s * 1.2;
        ctx.strokeText(a.text, x, yy);
        ctx.fillText(a.text, x, yy);
        ctx.restore();
      } else if (a.type === 'burst') {
        const [x, y] = this.toScreen(a.q, a.r);
        for (const pt of a.parts) {
          const px = x + pt.vx * p * s * 2, py = y - s * 0.4 + pt.vy * p * s * 2 + p * p * s * 1.5;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = pt.c;
          ctx.fillRect(px, py, s * 0.08, s * 0.08);
          ctx.restore();
        }
      }
    }
  }
}

function badge(ctx, x, y, text, s, bg = '#ffffff') {
  const fs = Math.round(Math.max(13, Math.min(22, s * 0.36)));
  ctx.save();
  ctx.font = `800 ${fs}px Nunito, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + fs * 1.1, h = fs * 1.6;
  ctx.fillStyle = 'rgba(40,20,90,0.25)';
  roundRect(ctx, x - w / 2, y - h / 2 + 3, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#4b2fa0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small standalone render of a tile for HUD widgets.
export function renderTileIcon(canvas, tile, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!tile) return;
  const s = Math.min(w / 2.05, h / (2 * TILT + THICK * 2 + 0.25)) * (opts.scale || 1);
  drawTile(ctx, w / 2, h / 2 - s * 0.05, s, { ...tile, rot: tile.rot || 0 });
}

// Footprint preview of a megastructure for the blueprint button / level card.
export function renderBlueprintIcon(canvas, type, variant = 'temperate') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cells = MEGAS[type].cells;
  const pts = cells.map(([q, r]) => hexToPixel(q, r, 1));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1] * TILT);
  const spanX = Math.max(...xs) - Math.min(...xs) + 2, spanY = Math.max(...ys) - Math.min(...ys) + 2 * TILT + 0.6;
  const s = Math.min(w / spanX, h / spanY) * 0.95;
  const ox = w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * s;
  const oy = h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * s + s * 0.1;
  const order = cells.map((c, i) => i).sort((a, b) => cells[a][1] - cells[b][1]);
  for (const i of order) {
    const [q, r, req] = cells[i];
    const [x, y] = hexToPixel(q, r, 1);
    const cx = ox + x * s, cy = oy + y * s * TILT;
    drawSides(ctx, cx, cy, s * 0.94, () => kindColor(req, variant));
    hexPath(ctx, cx, cy, s * 0.94);
    ctx.fillStyle = kindColor(req, variant);
    ctx.fill();
    ctx.font = `${Math.round(s * 0.7)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(KINDS[req].emoji, cx, cy + s * 0.04);
  }
}
