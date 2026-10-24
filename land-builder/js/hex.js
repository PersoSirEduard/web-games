// Axial hex math for a pointy-top grid.
// Direction i points at screen angle -60*i degrees (0 = east, 1 = north-east, ...).
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const SQRT3 = Math.sqrt(3);

export const key = (q, r) => q + ',' + r;
export const parseKey = (k) => k.split(',').map(Number);
export const neighbor = (q, r, i) => [q + DIRS[i][0], r + DIRS[i][1]];
export const opposite = (i) => (i + 3) % 6;

export function hexToPixel(q, r, size) {
  return [size * SQRT3 * (q + r / 2), size * 1.5 * r];
}

export function pixelToHex(x, y, size) {
  const q = (SQRT3 / 3 * x - y / 3) / size;
  const r = (2 / 3 * y) / size;
  return hexRound(q, r);
}

export function hexRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// Rotate an axial offset clockwise (on screen) by n * 60 degrees.
// Direction i maps to direction i - n, matching tile rotation.
export function rotateAxial(q, r, n) {
  let x = q, z = r, y = -q - r;
  for (let i = 0; i < ((n % 6) + 6) % 6; i++) [x, y, z] = [-z, -x, -y];
  return [x + 0, z + 0];
}

export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Small deterministic PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
