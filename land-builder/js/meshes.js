// Low-poly 3D geometry: tiles, decorations, construction sites and landmarks.
// Everything is built from primitives with baked vertex colours and merged into
// a single geometry per object, so each tile is one draw call.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { BIOMES, KINDS } from './data.js';
import { mulberry32 } from './hex.js';

export const H = 0.3;          // tile height (top surface)
const RAD = Math.PI / 180;
const TILE_R = 1;              // tiles touch so matching terrain reads as one landscape

// Unit hex corner j sits at screen angle 30 - 60j; world (x, z) = (cos, sin).
export const CORNERS = Array.from({ length: 6 }, (_, j) => {
  const a = (30 - 60 * j) * RAD;
  return [Math.cos(a), Math.sin(a)];
});

const WILD_COLORS = ['#ff6b6b', '#ffb347', '#ffe66d', '#7ee081', '#5ec8ff', '#b28dff'];
const SOIL = { temperate: '#f2b97c', snowy: '#b7c3d9', tropical: '#efcf92' };

export function kindColor(kind, variant, i = 0) {
  if (kind === '*') return WILD_COLORS[i % 6];
  return BIOMES[variant || 'temperate'].colors[kind];
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}

// ---------- geometry builder ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function prep(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export class Parts {
  constructor() { this.list = []; }

  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = prep(geo, color);
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')), _s.set(...scale));
    g.applyMatrix4(_m);
    this.list.push(g);
    return this;
  }

  // Positions are given at the base (y = bottom) of each primitive.
  box(w, h, d, color, x, y, z, ry = 0, rx = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], [rx, ry, rz]);
  }
  cyl(rt, rb, h, seg, color, x, y, z, rot = [0, 0, 0]) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, [x, y + h / 2, z], rot);
  }
  cone(r, h, seg, color, x, y, z, ry = 0) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, [x, y + h / 2, z], [0, ry, 0]);
  }
  ico(r, color, x, y, z, scale = [1, 1, 1], detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, [x, y, z], [0, 0, 0], scale);
  }

  // Triangle / quad facing roughly along `out`.
  tri(a, b, c, color, out) {
    const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
    const ac = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a));
    const n = ab.cross(ac);
    if (n.dot(new THREE.Vector3(...out)) < 0) [b, c] = [c, b];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    this.list.push(prep(g, color));
    return this;
  }
  quad(a, b, c, d, color, out) {
    return this.tri(a, b, c, color, out).tri(a, c, d, color, out);
  }

  merge() {
    if (!this.list.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.list, false);
    this.list.forEach((x) => x.dispose());
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- decorations ----------
function triPoint(j, rng, lo = 0.25, hi = 0.85) {
  let u = rng(), v = rng();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  const t = lo + (hi - lo) * (u + v), sum = u + v || 1;
  const a = (u / sum) * t, b = (v / sum) * t;
  const A = CORNERS[j], B = CORNERS[(j + 1) % 6];
  return [A[0] * a + B[0] * b, A[1] * a + B[1] * b];
}

const D = {
  roundTree(P, x, y, z, col, s = 1) {
    s *= 1.35;
    P.cyl(0.018 * s, 0.024 * s, 0.07 * s, 5, '#8a5a35', x, y, z);
    P.ico(0.075 * s, col, x, y + 0.12 * s, z, [1, 1.1, 1]);
  },
  pine(P, x, y, z, col, snow, s = 1) {
    s *= 1.3;
    P.cyl(0.015 * s, 0.02 * s, 0.05 * s, 5, '#7a4e2d', x, y, z);
    P.cone(0.075 * s, 0.17 * s, 6, col, x, y + 0.04 * s, z);
    P.cone(0.055 * s, 0.13 * s, 6, col, x, y + 0.13 * s, z);
    if (snow) P.cone(0.03 * s, 0.055 * s, 6, '#ffffff', x, y + 0.205 * s, z);
  },
  palm(P, x, y, z, rng) {
    const lean = (rng() - 0.5) * 0.5, ry = rng() * Math.PI * 2;
    const h = 0.24;
    P.add(new THREE.CylinderGeometry(0.012, 0.02, h, 5), '#a0703f', [x + Math.sin(ry) * lean * h * 0.5, y + h / 2, z + Math.cos(ry) * lean * h * 0.5], [Math.cos(ry) * lean, 0, -Math.sin(ry) * lean]);
    const tx = x + Math.sin(ry) * lean * h, tz = z + Math.cos(ry) * lean * h, ty = y + h * 0.98;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add(new THREE.BoxGeometry(0.13, 0.008, 0.035), '#2f9e4f',
        [tx + Math.cos(a) * 0.055, ty - 0.015, tz - Math.sin(a) * 0.055], [0, a, -0.45]);
    }
    P.ico(0.015, '#6b4423', tx, ty - 0.01, tz);
  },
  house(P, x, y, z, variant, rng) {
    const w = 0.17 + rng() * 0.05, h = 0.12 + rng() * 0.04, d = 0.14, ry = rng() * Math.PI;
    let wall = '#fff4ec', roof = '#f2895b';
    if (variant === 'snowy') { wall = '#f1e6df'; roof = '#ffffff'; }
    if (variant === 'tropical') {
      wall = ['#ffd6e0', '#c8ecff', '#fff0a8', '#d4f5cf'][Math.floor(rng() * 4)];
      roof = ['#ff8a65', '#ff6f91', '#f9a03f'][Math.floor(rng() * 3)];
    }
    P.box(w, h, d, wall, x, y, z, ry);
    P.add(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 0.12, 4), roof, [x, y + h + 0.06, z], [0, ry + Math.PI / 4, 0], [w / Math.max(w, d), 1, d / Math.max(w, d)]);
  },
  tower(P, x, y, z, variant, rng) {
    const palette = variant === 'tropical' ? ['#ffe0b8', '#ffc6d9', '#bfe8ff'] : variant === 'snowy' ? ['#d6dcef', '#e8e3f2'] : ['#b9cdf0', '#e6bfd6', '#c8d6f5', '#d9cbe8'];
    const col = palette[Math.floor(rng() * palette.length)];
    const h = 0.36 + rng() * 0.22, w = 0.15, ry = rng() * 0.6;
    P.box(w, h, w, col, x, y, z, ry);
    P.box(w * 1.08, 0.025, w * 1.08, shade(col, 0.12), x, y + h, z, ry);
    for (let f = 1; f < 5; f++) P.box(w * 1.03, 0.012, w * 1.03, shade(col, -0.18), x, y + (h * f) / 5, z, ry);
    if (rng() < 0.5) P.box(w * 0.4, 0.05, w * 0.4, '#9aa3b5', x, y + h + 0.025, z, ry);
  },
  peak(P, x, y, z, variant, sc, rng) {
    const r = 0.34 * sc, h = 0.62 * sc, ry = rng() * Math.PI;
    let rock = '#a39588';
    if (variant === 'snowy') rock = '#a3afc4';
    if (variant === 'tropical') rock = '#6e5c55';
    P.add(new THREE.ConeGeometry(r, h, 5), rock, [x, y + h / 2, z], [0, ry, 0]);
    if (variant === 'tropical') {
      P.add(new THREE.ConeGeometry(r * 0.3, h * 0.3, 5), '#ff7a3d', [x, y + h * 0.86, z], [0, ry, 0]);
    } else {
      const cap = variant === 'snowy' ? 0.5 : 0.36;
      P.add(new THREE.ConeGeometry(r * cap * 1.06, h * cap, 5), '#ffffff', [x, y + h - (h * cap) / 2 + 0.002, z], [0, ry, 0]);
    }
  },
  bush(P, x, y, z, col) { P.ico(0.05, col, x, y + 0.02, z, [1, 0.8, 1]); },
  flower(P, x, y, z, rng) {
    P.box(0.018, 0.012, 0.018, ['#ffffff', '#ffd23f', '#ff7aa2', '#c38bff'][Math.floor(rng() * 4)], x, y, z);
  },
  rock(P, x, y, z, col = '#9aa3b5') { P.add(new THREE.DodecahedronGeometry(0.03), col, [x, y + 0.012, z], [0, 0, 0], [1, 0.6, 1]); },
  tuft(P, x, y, z) {
    for (const dx of [-0.012, 0, 0.012]) P.cone(0.006, 0.04, 3, '#8cb84a', x + dx, y, z + dx * 0.5);
  },
  hay(P, x, y, z) {
    P.cyl(0.05, 0.05, 0.05, 8, '#e9b949', x, y, z, [Math.PI / 2, 0, 0]);
  },
  floe(P, x, y, z, rng) {
    P.cyl(0.04 + rng() * 0.03, 0.045 + rng() * 0.03, 0.015, 6, '#f4fbff', x, y - 0.005, z, [0, rng() * 3, 0]);
  },
  sheep(P, x, y, z, rng) {
    const ry = rng() * Math.PI * 2;
    P.box(0.07, 0.045, 0.05, '#ffffff', x, y + 0.015, z, ry);
    P.box(0.025, 0.028, 0.028, '#3b3346', x + Math.cos(ry) * 0.045, y + 0.035, z - Math.sin(ry) * 0.045, ry);
  },
  sailboat(P, x, y, z, rng) {
    const ry = rng() * Math.PI * 2;
    P.box(0.13, 0.03, 0.05, '#ffffff', x, y, z, ry);
    P.add(new THREE.ConeGeometry(0.05, 0.16, 3), '#ffffff', [x, y + 0.11, z], [0, ry, 0], [0.25, 1, 1]);
  },
  wave(P, x, y, z, rng) {
    P.box(0.06, 0.004, 0.012, '#d9f4ff', x, y + 0.002, z, rng() * 0.6 - 0.3);
  },
};

function decorate(P, kind, variant, j, rng, top) {
  const at = (lo, hi) => triPoint(j, rng, lo, hi);
  switch (kind) {
    case 'forest':
      for (let k = 0; k < 7; k++) {
        const [x, z] = at(0.12, 0.93), s = 1.05 + rng() * 0.45;
        if (variant === 'snowy') D.pine(P, x, top, z, '#2f7d5b', true, s);
        else if (variant === 'tropical') {
          if (rng() < 0.5) D.palm(P, x, top, z, rng);
          else D.roundTree(P, x, top, z, '#1f9a52', s);
        } else if (rng() < 0.65) D.roundTree(P, x, top, z, ['#3f9c35', '#4cae3b', '#5bb84a'][Math.floor(rng() * 3)], s);
        else D.pine(P, x, top, z, '#2f8a3a', false, s);
      }
      break;
    case 'city': {
      // dense neighbourhood: a few big houses, sometimes an apartment block near the centre
      if (rng() < 0.4) { const [x, z] = at(0.2, 0.42); D.tower(P, x, top, z, variant, rng); }
      for (let k = 0; k < 4; k++) {
        const [x, z] = at(0.32, 0.92);
        D.house(P, x, top, z, variant, rng);
      }
      break;
    }
    case 'mountain': {
      const [x, z] = at(0.45, 0.55);
      D.peak(P, x, top, z, variant, 1, rng);
      if (rng() < 0.7) { const [x2, z2] = at(0.72, 0.9); D.peak(P, x2, top, z2, variant, 0.6, rng); }
      break;
    }
    case 'plains':
      if (variant === 'snowy') {
        const [x, z] = at(0.3, 0.85);
        if (rng() < 0.5) D.rock(P, x, top, z);
        else D.pine(P, x, top, z, '#3d8a66', true, 0.7);
      } else if (variant === 'tropical') {
        for (let k = 0; k < 2; k++) { const [x, z] = at(0.3, 0.9); D.tuft(P, x, top, z); }
      } else {
        const [x, z] = at(0.3, 0.85);
        D.bush(P, x, top, z, '#62b33c');
        if (rng() < 0.5) { const [bx, bz] = at(0.3, 0.9); D.bush(P, bx, top, bz, '#55a832'); }
        if (rng() < 0.45) { const [sx, sz] = at(0.3, 0.8); D.sheep(P, sx, top, sz, rng); }
        for (let k = 0; k < 3; k++) { const [fx, fz] = at(0.2, 0.9); D.flower(P, fx, top, fz, rng); }
      }
      break;
    case 'farm': {
      // raised wheat slabs with a couple of cracks, like stacked hay plates
      const A = CORNERS[j], B = CORNERS[(j + 1) % 6];
      const crack = variant === 'tropical' ? '#6cbfd8' : shade(kindColor('farm', variant), -0.2);
      for (const f of [0.45, 0.78]) {
        const ax = A[0] * f, az = A[1] * f, bx = B[0] * f, bz = B[1] * f;
        const len = Math.hypot(bx - ax, bz - az) * 0.97;
        const ang = Math.atan2(bz - az, bx - ax);
        P.box(len, 0.006, 0.02, crack, (ax + bx) / 2, top - 0.004, (az + bz) / 2, -ang);
      }
      if (variant !== 'tropical' && rng() < 0.3) { const [x, z] = at(0.45, 0.7); D.hay(P, x, top, z); }
      break;
    }
    case 'water':
      for (let k = 0; k < 2; k++) {
        const [x, z] = at(0.25, 0.85);
        if (variant === 'snowy' && k === 0 && rng() < 0.6) D.floe(P, x, top, z, rng);
        else D.wave(P, x, top, z, rng);
      }
      if (variant !== 'snowy' && rng() < 0.22) { const [x, z] = at(0.4, 0.6); D.sailboat(P, x, top, z, rng); }
      break;
    case '*': {
      const [x, z] = at(0.45, 0.6);
      P.add(new THREE.OctahedronGeometry(0.03), '#ffffff', [x, top + 0.05, z]);
      break;
    }
    default: break;
  }
}

const topOf = (k) => (k === 'water' ? H * 0.68 : k === 'farm' ? H * 1.3 : H);

// Tile prism in its base orientation (rotate the mesh by -rot * 60deg).
export function buildTileGeometry(tile) {
  const P = new Parts();
  const variant = tile.variant || 'temperate';
  const soil = tile.wild ? '#e8e2ff' : SOIL[variant];
  for (let j = 0; j < 6; j++) {
    const k = tile.base[j], col = kindColor(k, variant, j), h = topOf(k);
    const A = CORNERS[j], B = CORNERS[(j + 1) % 6];
    const a = [A[0] * TILE_R, h, A[1] * TILE_R], b = [B[0] * TILE_R, h, B[1] * TILE_R];
    P.tri([0, h, 0], a, b, col, [0, 1, 0]);
    const out = [(A[0] + B[0]) / 2, 0, (A[1] + B[1]) / 2];
    const band = h - 0.08;
    P.quad([a[0], band, a[2]], [b[0], band, b[2]], b, a, shade(col, -0.12), out);
    P.quad([a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], band, b[2]], [a[0], band, a[2]], soil, out);
    // inner walls where a neighbouring segment sits lower (water)
    for (const [nj, C, other] of [[(j + 5) % 6, A, B], [(j + 1) % 6, B, A]]) {
      const hn = topOf(tile.base[nj]);
      if (h > hn) {
        const c = [C[0] * TILE_R, 0, C[1] * TILE_R];
        P.quad([0, hn, 0], [c[0], hn, c[2]], [c[0], h, c[2]], [0, h, 0], shade(col, -0.18), [-other[0], 0, -other[1]]);
      }
    }
    const rng = mulberry32(tile.id * 977 + j * 131 + 7);
    decorate(P, k, variant, j, rng, h);
  }
  if (tile.wild) P.add(new THREE.OctahedronGeometry(0.12), '#ffffff', [0, H + 0.28, 0], [0, 0.4, 0], [1, 1.4, 1]);
  return P.merge();
}

const tileCache = new Map();
export function tileGeometry(tile) {
  const k = tile.id;
  let g = tileCache.get(k);
  if (!g) { g = buildTileGeometry(tile); tileCache.set(k, g); }
  return g;
}
export function clearTileCache() {
  for (const g of tileCache.values()) g.dispose();
  tileCache.clear();
}

// ---------- construction site ----------
let conGeo = null;
export function constructionGeometry() {
  if (conGeo) return conGeo;
  const P = new Parts();
  const h = H * 0.6;
  P.add(new THREE.CylinderGeometry(TILE_R, TILE_R, h, 6), '#bdb8cc', [0, h / 2, 0]);
  // hazard stripes along each edge
  for (let j = 0; j < 6; j++) {
    const A = CORNERS[j], B = CORNERS[(j + 1) % 6];
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    for (let k = 0; k < 6; k++) {
      const f = (k + 0.5) / 6, r = 0.9;
      const x = (A[0] + (B[0] - A[0]) * f) * r, z = (A[1] + (B[1] - A[1]) * f) * r;
      P.box(0.16, 0.02, 0.09, k % 2 ? '#3b3346' : '#ffcf33', x, h, z, -ang);
    }
  }
  // scaffold + crane
  for (const [x, z] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.25], [0.35, 0.25]]) P.box(0.03, 0.35, 0.03, '#f2a93b', x, h, z);
  P.box(0.74, 0.03, 0.03, '#f2a93b', 0, h + 0.33, -0.2);
  P.box(0.74, 0.03, 0.03, '#f2a93b', 0, h + 0.33, 0.25);
  P.box(0.04, 0.85, 0.04, '#ffcf33', 0.5, h, -0.45);
  P.box(0.75, 0.04, 0.04, '#ffcf33', 0.28, h + 0.85, -0.45);
  P.box(0.12, 0.08, 0.08, '#6d6a7c', 0.85, h + 0.8, -0.45);
  P.box(0.008, 0.3, 0.008, '#3b3346', 0.0, h + 0.55, -0.45);
  conGeo = P.merge();
  return conGeo;
}

// ---------- slot plate & markers ----------
export function slotGeometry() {
  const g = new THREE.CylinderGeometry(0.9, 0.9, 0.03, 6);
  g.translate(0, 0.015, 0);
  return g;
}
export function plusGeometry() {
  const a = new THREE.BoxGeometry(0.34, 0.02, 0.07), b = new THREE.BoxGeometry(0.07, 0.02, 0.34);
  const g = mergeGeometries([a, b]);
  g.translate(0, 0.045, 0);
  return g;
}
export function ringGeometry(inner = 0.84, outer = 0.99) {
  const g = new THREE.RingGeometry(inner, outer, 6, 1, Math.PI / 6);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Emoji sprites (construction requirements, structure badges).
const texCache = new Map();
export function emojiTexture(emoji) {
  let t = texCache.get(emoji);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(emoji, t);
  return t;
}
export function kindSprite(kind, scale = 0.45) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(KINDS[kind].emoji), depthTest: false }));
  s.scale.set(scale, scale, 1);
  s.renderOrder = 10;
  return s;
}

// ---------- landmarks ----------
// Each builder returns { geo, rotor?: { geo, pos: [x,y,z] } } in a local frame where
// the footprint centroid (or the cell for 'each' types) is the origin at ground level.
const LANDMARKS = {
  tower() {
    const P = new Parts(), pink = '#e98bd9', dark = '#c46bb6';
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // splayed legs
      P.add(new THREE.BoxGeometry(0.07, 0.6, 0.07), pink, [sx * 0.2, 0.28, sz * 0.2], [sz * 0.32, 0, -sx * 0.32]);
    }
    P.box(0.5, 0.05, 0.5, dark, 0, 0.5, 0);
    P.add(new THREE.CylinderGeometry(0.07, 0.2, 0.55, 4), pink, [0, 0.82, 0], [0, Math.PI / 4, 0]);
    P.box(0.26, 0.04, 0.26, dark, 0, 1.08, 0);
    P.add(new THREE.CylinderGeometry(0.02, 0.07, 0.5, 4), pink, [0, 1.36, 0], [0, Math.PI / 4, 0]);
    P.cyl(0.008, 0.008, 0.18, 4, dark, 0, 1.6, 0);
    return { geo: P.merge() };
  },
  harbor() {
    const P = new Parts();
    const lx = -0.45;
    for (let k = 0; k < 4; k++) {
      const r0 = 0.11 - k * 0.012;
      P.cyl(r0 - 0.012, r0, 0.16, 10, k % 2 ? '#ffffff' : '#ee4b4b', lx, k * 0.16, 0);
    }
    P.cyl(0.06, 0.06, 0.08, 8, '#ffe066', lx, 0.64, 0);
    P.cone(0.09, 0.12, 8, '#ee4b4b', lx, 0.72, 0);
    // container ship
    const sx = 0.3, sz = 0.15;
    P.box(0.72, 0.1, 0.22, '#e2504a', sx, 0, sz, 0.4);
    P.box(0.73, 0.03, 0.225, '#ffffff', sx, 0.1, sz, 0.4);
    const cols = ['#3d7be0', '#f2c94c', '#56c271', '#f2994a', '#9b6be0'];
    for (let k = 0; k < 5; k++) {
      const t = -0.2 + k * 0.09;
      P.box(0.08, 0.08, 0.16, cols[k], sx + Math.cos(0.4) * t, 0.13, sz - Math.sin(0.4) * t, 0.4);
    }
    P.box(0.1, 0.16, 0.16, '#ffffff', sx - Math.cos(0.4) * 0.28, 0.13, sz + Math.sin(0.4) * 0.28, 0.4);
    return { geo: P.merge() };
  },
  windfarm() {
    const P = new Parts();
    P.cyl(0.02, 0.035, 0.75, 8, '#f4f6fb', 0, 0, 0);
    P.box(0.06, 0.06, 0.12, '#e4e8f0', 0, 0.74, 0.02);
    const R = new Parts();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      R.add(new THREE.BoxGeometry(0.03, 0.32, 0.01), '#ffffff', [Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0], [0, 0, -a]);
    }
    R.ico(0.03, '#dfe5f0', 0, 0, 0);
    return { geo: P.merge(), rotor: { geo: R.merge(), pos: [0, 0.77, 0.1] } };
  },
  observatory() {
    const P = new Parts();
    P.cyl(0.2, 0.22, 0.2, 12, '#e9edf5', 0, 0, 0);
    P.add(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#f7f9fc', [0, 0.2, 0]);
    P.box(0.06, 0.2, 0.05, '#4a5578', 0, 0.27, 0.13, 0, -0.6);
    return { geo: P.merge() };
  },
  castle() {
    const P = new Parts(), stone = '#d6cfc6', dark = '#b3aa9f';
    const s = 0.42;
    P.box(s * 2, 0.25, 0.08, stone, 0, 0, s);
    P.box(s * 2, 0.25, 0.08, stone, 0, 0, -s);
    P.box(0.08, 0.25, s * 2, stone, s, 0, 0);
    P.box(0.08, 0.25, s * 2, stone, -s, 0, 0);
    for (let k = -3; k <= 3; k++) {
      P.box(0.06, 0.05, 0.09, dark, k * 0.12, 0.25, s);
      P.box(0.06, 0.05, 0.09, dark, k * 0.12, 0.25, -s);
    }
    for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) {
      P.cyl(0.09, 0.1, 0.42, 8, stone, x, 0, z);
      P.cone(0.12, 0.2, 8, '#4f7fd9', x, 0.42, z);
    }
    P.box(0.3, 0.55, 0.3, stone, 0, 0, 0);
    P.cone(0.24, 0.28, 4, '#3b62b0', 0, 0.55, 0, Math.PI / 4);
    P.box(0.008, 0.18, 0.008, '#555555', 0, 0.83, 0);
    P.box(0.1, 0.06, 0.01, '#ee4b4b', 0.05, 0.94, 0);
    P.box(0.1, 0.14, 0.02, '#6b4a35', 0, 0, s + 0.04);
    return { geo: P.merge() };
  },
  dam() {
    const P = new Parts();
    const N = 9;
    for (let k = 0; k < N; k++) {
      const t = (k / (N - 1) - 0.5) * 1.6;
      const z = 0.2 - t * t * 0.18;
      P.box(0.22, 0.38, 0.14, k % 2 ? '#cfc8bc' : '#c2bbae', t * 0.95, 0, z, Math.atan(t * 0.36));
    }
    P.box(1.7, 0.03, 0.18, '#e6e0d5', 0, 0.38, 0.12);
    for (const x of [-0.18, 0, 0.18]) P.box(0.08, 0.3, 0.04, '#9fdcff', x, 0.02, 0.32);
    return { geo: P.merge() };
  },
  pyramid() {
    const P = new Parts();
    P.add(new THREE.ConeGeometry(0.62, 0.7, 4), '#f0cf86', [0, 0.35, 0], [0, Math.PI / 4, 0]);
    P.add(new THREE.ConeGeometry(0.1, 0.11, 4), '#ffe9a8', [0, 0.65, 0], [0, Math.PI / 4, 0]);
    return { geo: P.merge() };
  },
  skilodge() {
    const P = new Parts();
    P.box(0.5, 0.24, 0.32, '#a0673d', 0, 0, 0);
    P.add(new THREE.ConeGeometry(0.42, 0.24, 4), '#ffffff', [0, 0.36, 0], [0, Math.PI / 4, 0], [1.05, 1, 0.75]);
    for (const x of [-0.14, 0, 0.14]) P.box(0.06, 0.06, 0.01, '#ffd86b', x, 0.08, 0.165);
    // lift
    for (const [x, z, h] of [[0.4, -0.3, 0.45], [0.75, -0.9, 0.6], [1.0, -1.5, 0.7]]) P.box(0.03, h, 0.03, '#4a4a5a', x, 0, z);
    const len = Math.hypot(0.6, 1.2);
    P.add(new THREE.BoxGeometry(0.01, 0.01, len), '#333333', [0.7, 0.62, -0.9], [0.12, Math.atan2(0.6, -1.2) + Math.PI, 0]);
    for (const f of [0.3, 0.65]) P.box(0.07, 0.05, 0.05, '#ee4b4b', 0.4 + 0.6 * f, 0.5 + 0.12 * f, -0.3 - 1.2 * f);
    return { geo: P.merge() };
  },
  sawmill() {
    const P = new Parts();
    P.box(0.42, 0.26, 0.3, '#c0493d', -0.05, 0, 0);
    P.add(new THREE.ConeGeometry(0.34, 0.2, 4), '#5d4037', [-0.05, 0.36, 0], [0, Math.PI / 4, 0], [1.05, 1, 0.8]);
    P.box(0.12, 0.16, 0.01, '#ffffff', -0.05, 0, 0.155);
    for (const [x, y, z] of [[0.32, 0, 0.12], [0.32, 0, 0.0], [0.32, 0.06, 0.06]]) {
      P.cyl(0.03, 0.03, 0.3, 7, '#8d5b34', x, y + 0.03, z, [0, 0, Math.PI / 2]);
    }
    P.cyl(0.09, 0.09, 0.015, 14, '#cfd6e0', -0.36, 0.09, 0.1, [Math.PI / 2, 0, 0]);
    return { geo: P.merge() };
  },
};

// A puffy low-poly cloud.
export function cloudGeometry(seed) {
  const P = new Parts(), rng = mulberry32(seed);
  const n = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const r = 0.18 + rng() * 0.16;
    P.ico(r, '#ffffff', (k - n / 2) * 0.2 + rng() * 0.05, rng() * 0.08, (rng() - 0.5) * 0.25, [1, 0.8, 1], 1);
  }
  return P.merge();
}

const landmarkCache = new Map();
export function landmarkParts(type) {
  if (!landmarkCache.has(type)) landmarkCache.set(type, LANDMARKS[type]());
  return landmarkCache.get(type);
}
