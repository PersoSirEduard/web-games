// HUD widgets: 3D tile previews for the queue and 2D blueprint footprints.
import * as THREE from 'three';
import { hexToPixel } from './hex.js';
import { KINDS, MEGAS } from './data.js';
import { tileGeometry, kindColor, shade, H } from './meshes.js';

let icon = null;
function iconRenderer() {
  if (icon) return icon;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(220, 190, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9d8fe8', 1.6));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 220 / 190, 0.1, 50);
  camera.position.set(0, 3.1, 3.0);
  camera.lookAt(0, H * 0.6, 0);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(mesh);
  icon = { renderer, scene, camera, mesh, canvas };
  return icon;
}

export function renderTileIcon(canvas, tile) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 100, h = canvas.clientHeight || 90;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!tile) return;
  const I = iconRenderer();
  I.mesh.geometry = tileGeometry(tile);
  I.mesh.rotation.y = -(tile.rot || 0) * Math.PI / 3;
  I.renderer.render(I.scene, I.camera);
  const sw = I.canvas.width, sh = I.canvas.height;
  const s = Math.min(canvas.width / sw, canvas.height / sh);
  ctx.drawImage(I.canvas, (canvas.width - sw * s) / 2, (canvas.height - sh * s) / 2, sw * s, sh * s);
}

// Footprint diagram of a megastructure (emoji per required terrain).
export function renderBlueprintIcon(canvas, type, variant = 'temperate') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const T = 0.7, cells = MEGAS[type].cells;
  const pts = cells.map(([q, r]) => hexToPixel(q, r, 1));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1] * T);
  const spanX = Math.max(...xs) - Math.min(...xs) + 2, spanY = Math.max(...ys) - Math.min(...ys) + 2 * T + 0.5;
  const s = Math.min(w / spanX, h / spanY) * 0.95;
  const ox = w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * s;
  const oy = h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * s - s * 0.1;
  const order = cells.map((_, i) => i).sort((a, b) => cells[a][1] - cells[b][1]);
  const corner = (j) => { const a = (30 - 60 * j) * Math.PI / 180; return [Math.cos(a), Math.sin(a) * T]; };
  for (const i of order) {
    const [, , req] = cells[i];
    const cx = ox + pts[i][0] * s, cy = oy + pts[i][1] * T * s, r = s * 0.94, th = s * 0.25;
    const col = kindColor(req, variant);
    // side
    ctx.fillStyle = shade(col, -0.18);
    ctx.beginPath();
    for (const j of [4, 5, 0]) { const [x, y] = corner(j); ctx.lineTo(cx + x * r, cy + y * r); }
    for (const j of [0, 5, 4]) { const [x, y] = corner(j); ctx.lineTo(cx + x * r, cy + y * r + th); }
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) { const [x, y] = corner(j); ctx.lineTo(cx + x * r, cy + y * r); }
    ctx.fill();
    ctx.font = `${Math.round(s * 0.7)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(KINDS[req].emoji, cx, cy + s * 0.04);
  }
}
