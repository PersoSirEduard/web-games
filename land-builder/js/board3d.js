// WebGL board: scene sync, orbit camera with mouse/touch gestures, picking and effects.
import * as THREE from 'three';
import { hexToPixel, pixelToHex, key, DIRS } from './hex.js';
import { MEGAS, KINDS } from './data.js';
import { structureProgress } from './game.js';
import * as M from './meshes.js';

const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const TAU = Math.PI * 2;
const PITCH_MIN = 0.42, PITCH_MAX = 1.48;
const TILT_PRESETS = [0.6, 0.86, 1.32];
const DIST_MIN = 3.5, DIST_MAX = 40;

const world = (q, r) => hexToPixel(q, r, 1);   // [x, z]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const easeOutBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

export class Board3D {
  constructor(canvas, labels, handlers) {
    this.canvas = canvas;
    this.labelsEl = labels;
    this.h = handlers;
    this.active = false;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.75 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#8a7fdc');
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);

    scene.add(new THREE.HemisphereLight('#ffffff', '#9d8fe8', 1.55));
    const sun = this.sun = new THREE.DirectionalLight('#fff3dc', 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    // soft shadow of the island on the background
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.18 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.001;
    catcher.receiveShadow = true;
    scene.add(catcher);

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.35, depthWrite: false });
    this.badMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#ff9a9a', transparent: true, opacity: 0.75 });
    this.okGhostMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#a9ffbf', transparent: true, opacity: 0.8 });
    this.badGhostMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: '#ff8a8a', transparent: true, opacity: 0.8 });
    this.cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.92 });

    this.groups = {};
    for (const g of ['tiles', 'cons', 'marks', 'rings', 'preview', 'mega', 'fx', 'clouds']) {
      this.groups[g] = new THREE.Group();
      scene.add(this.groups[g]);
    }
    this.tiles = new Map();
    this.cons = new Map();
    this.structs = new Map();
    this.rotors = [];
    this.anims = [];
    this.labels = new Map();
    this.floats = [];

    // slot plates + plus markers as instanced meshes (one draw call each)
    const CAP = 512;
    this.slotPlates = new THREE.InstancedMesh(M.slotGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false }), CAP);
    this.slotPlus = new THREE.InstancedMesh(M.plusGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }), CAP);
    this.slotPlates.count = this.slotPlus.count = 0;
    this.slotKeys = [];
    this.slotPlates.setColorAt(0, new THREE.Color('#ffffff'));
    scene.add(this.slotPlates, this.slotPlus);

    this.ringGeo = M.ringGeometry();
    this.edgeGeo = new THREE.BoxGeometry(0.55, 0.05, 0.08);

    // camera state (current + goal for smooth motion)
    this.cam = { x: 0, z: 0, yaw: 0, pitch: 0.86, dist: 10 };
    this.goal = { ...this.cam };
    this.camSpeed = 9;
    this.bounds = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -M.H);

    this.preview = null;
    this.previewMesh = null;
    this.previewSig = '';
    this.megaSig = '';
    this.dirty = true;
    this.last = performance.now();

    this.initInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- lifecycle ----------
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.w = w;
    this.h2 = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  setGame() {
    for (const m of this.tiles.values()) this.groups.tiles.remove(m);
    for (const m of this.cons.values()) this.groups.cons.remove(m);
    for (const s of this.structs.values()) this.removeStruct(s);
    this.tiles.clear();
    this.cons.clear();
    this.structs.clear();
    this.rotors = [];
    this.anims = [];
    for (const f of this.floats) f.el.remove();
    this.floats = [];
    for (const g of ['marks', 'rings', 'preview', 'mega', 'fx']) this.groups[g].clear();
    this.previewMesh = null;
    this.previewSig = this.megaSig = '';
    M.clearTileCache();
    this.spawnClouds();
    this.dirty = true;
  }

  spawnClouds() {
    const g = this.groups.clouds;
    g.clear();
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(M.cloudGeometry(i * 17 + 3), this.cloudMat);
      c.castShadow = true;
      const s = 0.8 + Math.random() * 0.8;
      c.scale.set(s, s, s);
      c.userData = { speed: 0.12 + Math.random() * 0.15, y: 2.2 + Math.random() * 1.2 };
      c.position.set((Math.random() - 0.5) * 20, c.userData.y, (Math.random() - 0.5) * 16);
      g.add(c);
    }
  }

  // ---------- camera ----------
  applyCamera() {
    const { x, z, yaw, pitch, dist } = this.cam;
    const cp = Math.cos(pitch);
    this.camera.position.set(x + Math.sin(yaw) * cp * dist, M.H + Math.sin(pitch) * dist, z + Math.cos(yaw) * cp * dist);
    this.camera.lookAt(x, M.H * 0.5, z);
    this.camera.updateMatrixWorld();
  }

  stepCamera(dt) {
    const k = 1 - Math.exp(-dt * this.camSpeed);
    let moving = false;
    for (const p of ['x', 'z', 'yaw', 'pitch', 'dist']) {
      const d = this.goal[p] - this.cam[p];
      if (Math.abs(d) > 1e-4) { this.cam[p] += d * k; moving = true; } else this.cam[p] = this.goal[p];
    }
    if (!moving && this.camSpeed !== 9) this.camSpeed = 9;
    this.applyCamera();
    if (moving && this.h.onCamera) this.h.onCamera(this.cam);
    return moving;
  }

  setNow(patch) {
    Object.assign(this.cam, patch);
    Object.assign(this.goal, patch);
    this.applyCamera();
    this.dirty = true;
    if (this.h.onCamera) this.h.onCamera(this.cam);
  }

  clampTarget() {
    const b = this.bounds, m = 3;
    for (const o of [this.cam, this.goal]) {
      o.x = clamp(o.x, b.minX - m, b.maxX + m);
      o.z = clamp(o.z, b.minZ - m, b.maxZ + m);
    }
  }

  // Frame a set of cells, leaving room for the HUD.
  fit(cells, { animate = true, intro = false, area } = {}) {
    if (!cells.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [q, r] of cells) {
      const [x, z] = world(q, r);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const rad = Math.max(maxX - minX, (maxZ - minZ) * 1.15) / 2 + 1.4;
    const vf = (this.camera.fov * Math.PI) / 180;
    const frac = area ? area.h / this.h2 : 0.7;
    const fracW = area ? area.w / this.w : 0.92;
    const vfov = 2 * Math.atan(Math.tan(vf / 2) * frac);
    const hfov = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect * fracW);
    const dist = clamp(rad / Math.tan(Math.min(vfov, hfov) / 2) * 0.78, 4.5, DIST_MAX);
    // shift the look-at point so the board sits in the middle of the free area
    let offZ = 0;
    if (area) {
      const shiftPx = (area.y + area.h / 2) - this.h2 / 2;
      offZ = -(shiftPx / this.h2) * 2 * Math.tan(vf / 2) * dist / Math.sin(this.goal.pitch);
    }
    const yaw = this.goal.yaw;
    const goal = { x: cx + Math.sin(yaw) * offZ, z: cz + Math.cos(yaw) * offZ, dist };
    if (intro) {
      this.setNow({ x: goal.x, z: goal.z, yaw: yaw - 1.1, pitch: 1.42, dist: dist * 2.3 });
      Object.assign(this.goal, goal, { yaw, pitch: TILT_PRESETS[1] });
      this.camSpeed = 2.4;
    } else if (animate) {
      Object.assign(this.goal, goal);
      this.camSpeed = 4;
    } else this.setNow(goal);
    this.dirty = true;
  }

  orbit(dir) {
    this.goal.yaw += dir * (Math.PI / 3);
    this.camSpeed = 6;
    this.dirty = true;
  }
  cycleTilt() {
    const i = TILT_PRESETS.findIndex((p) => p > this.goal.pitch + 0.05);
    this.goal.pitch = TILT_PRESETS[i === -1 ? 0 : i];
    this.camSpeed = 6;
    this.dirty = true;
  }
  resetYaw() {
    this.goal.yaw = Math.round(this.goal.yaw / TAU) * TAU;
    this.goal.pitch = TILT_PRESETS[1];
    this.camSpeed = 5;
  }
  zoom(f) {
    this.goal.dist = clamp(this.goal.dist * f, DIST_MIN, DIST_MAX);
    this.camSpeed = 8;
    this.dirty = true;
  }

  groundPoint(x, y) {
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h2) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? p : null;
  }

  // Keep `anchor` (a ground point) under screen point (x, y).
  grab(anchor, x, y) {
    if (!anchor) return;
    const p = this.groundPoint(x, y);
    if (!p) return;
    this.cam.x += anchor.x - p.x;
    this.cam.z += anchor.z - p.z;
    this.goal.x = this.cam.x;
    this.goal.z = this.cam.z;
    this.clampTarget();
    this.applyCamera();
    this.dirty = true;
  }

  toScreen(q, r, y = M.H) {
    const [x, z] = world(q, r);
    return this.project(x, y, z);
  }
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x + 1) / 2 * this.w, (1 - v.y) / 2 * this.h2, v.z];
  }

  // ---------- input ----------
  initInput() {
    const c = this.canvas;
    const pts = new Map();
    let g = null;   // gesture state

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const two = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, a, b };
    };

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      pts.set(e.pointerId, { ...p, sx: p.x, sy: p.y });
      this.camSpeed = 9;
      if (pts.size === 1) {
        const orbit = e.button === 2 || e.button === 1 || e.shiftKey || e.altKey;
        g = { mode: orbit ? 'orbit' : 'pan', anchor: orbit ? null : this.groundPoint(p.x, p.y), lx: p.x, ly: p.y, sx: p.x, sy: p.y, moved: false, t: performance.now() };
      } else if (pts.size === 2) {
        const t = two();
        g = { mode: 'two', lock: null, d0: t.d, a0: t.ang, my0: t.my, ld: t.d, la: t.ang, lmy: t.my, anchor: this.groundPoint(t.mx, t.my), moved: true };
      }
    });

    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pts.has(e.pointerId)) Object.assign(pts.get(e.pointerId), p);
      if (!g) {
        if (e.pointerType === 'mouse' && this.h.onHover) this.h.onHover(this.pick(p.x, p.y));
        return;
      }
      if (g.mode === 'two' && pts.size === 2) {
        const t = two();
        if (!g.lock) {
          const [a, b] = [t.a, t.b];
          const dyA = a.y - a.sy, dyB = b.y - b.sy, dxA = a.x - a.sx, dxB = b.x - b.sx;
          const travel = Math.max(Math.hypot(dxA, dyA), Math.hypot(dxB, dyB));
          if (travel > 12) {
            const parallelVertical = Math.sign(dyA) === Math.sign(dyB) && Math.abs(dyA) > Math.abs(dxA) * 1.4 && Math.abs(dyB) > Math.abs(dxB) * 1.4;
            g.lock = parallelVertical && Math.abs(t.d - g.d0) / g.d0 < 0.15 ? 'tilt' : 'xf';
            g.ld = t.d; g.la = t.ang; g.lmy = t.my;
            g.anchor = this.groundPoint(t.mx, t.my);
          }
          return;
        }
        if (g.lock === 'tilt') {
          this.setNow({ pitch: clamp(this.cam.pitch + (t.my - g.lmy) * 0.006, PITCH_MIN, PITCH_MAX) });
        } else {
          let da = t.ang - g.la;
          if (da > Math.PI) da -= TAU;
          if (da < -Math.PI) da += TAU;
          this.setNow({ dist: clamp(this.cam.dist * (g.ld / t.d), DIST_MIN, DIST_MAX), yaw: this.cam.yaw + da });
          this.grab(g.anchor, t.mx, t.my);
        }
        g.ld = t.d; g.la = t.ang; g.lmy = t.my;
        return;
      }
      if (pts.size !== 1) return;
      const dx = p.x - g.lx, dy = p.y - g.ly;
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 8) g.moved = true;
      if (g.moved) {
        if (g.mode === 'pan') this.grab(g.anchor, p.x, p.y);
        else this.setNow({ yaw: this.cam.yaw - dx * 0.008, pitch: clamp(this.cam.pitch + dy * 0.006, PITCH_MIN, PITCH_MAX) });
      }
      g.lx = p.x; g.ly = p.y;
    });

    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e);
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (g && !g.moved && e.type === 'pointerup' && performance.now() - g.t < 600 && this.h.onTap) {
          const hit = this.pick(p.x, p.y);
          if (hit) this.h.onTap(hit.q, hit.r);
        }
        g = null;
      } else if (pts.size === 1) {
        const [q] = [...pts.values()];
        g = { mode: 'pan', anchor: this.groundPoint(q.x, q.y), lx: q.x, ly: q.y, sx: q.x, sy: q.y, moved: true };
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.h.onHover) this.h.onHover(null); });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      if (e.ctrlKey && Math.abs(e.deltaY) < 50) { // trackpad pinch
        this.zoomAt(p.x, p.y, Math.exp(e.deltaY * 0.01));
        return;
      }
      this.zoomAt(p.x, p.y, Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  }

  zoomAt(x, y, f) {
    const anchor = this.groundPoint(x, y);
    this.setNow({ dist: clamp(this.cam.dist * f, DIST_MIN, DIST_MAX) });
    this.grab(anchor, x, y);
  }

  pick(x, y) {
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h2) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const objs = [...this.tiles.values(), ...this.cons.values(), this.slotPlates];
    if (this.previewMesh && this.previewMesh.visible) objs.unshift(this.previewMesh);
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      if (h.object === this.slotPlates) {
        const k = this.slotKeys[h.instanceId];
        if (k) return k;
        continue;
      }
      let o = h.object;
      while (o && !o.userData.cell) o = o.parent;
      if (o) return o.userData.cell;
    }
    const p = this.groundPoint(x, y);
    if (!p) return null;
    const [q, r] = pixelToHex(p.x, p.z, 1);
    return { q, r, k: key(q, r) };
  }

  // ---------- scene sync ----------
  sync(s, view) {
    this.state = s;
    // tiles
    const seen = new Set();
    for (const k in s.tiles) {
      const t = s.tiles[k];
      seen.add(k);
      let m = this.tiles.get(k);
      const sig = t.id + ':' + t.rot;
      if (!m || m.userData.sig !== sig) {
        if (m) this.groups.tiles.remove(m);
        m = new THREE.Mesh(M.tileGeometry(t), this.mat);
        m.castShadow = m.receiveShadow = true;
        const [x, z] = world(t.q, t.r);
        m.position.set(x, 0, z);
        m.rotation.y = -t.rot * Math.PI / 3;
        m.userData = { sig, cell: { q: t.q, r: t.r, k } };
        this.groups.tiles.add(m);
        this.tiles.set(k, m);
        if (view.dropKey === k) this.anims.push({ type: 'drop', obj: m, start: performance.now(), dur: 420 });
      }
    }
    for (const [k, m] of this.tiles) if (!seen.has(k)) { this.groups.tiles.remove(m); this.tiles.delete(k); }

    // construction sites
    const seenC = new Set();
    for (const k in s.cons) {
      const c = s.cons[k];
      seenC.add(k);
      const sig = c.req + ':' + c.sid;
      let g = this.cons.get(k);
      if (!g || g.userData.sig !== sig) {
        if (g) this.groups.cons.remove(g);
        g = this.makeConstruction(c.req, this.mat);
        const [x, z] = world(c.q, c.r);
        g.position.set(x, 0, z);
        g.userData = { sig, cell: { q: c.q, r: c.r, k } };
        this.groups.cons.add(g);
        this.cons.set(k, g);
      }
      g.visible = !(view.preview && view.preview.k === k);
    }
    for (const [k, g] of this.cons) if (!seenC.has(k)) { this.groups.cons.remove(g); this.cons.delete(k); }

    // megastructures
    const seenS = new Set();
    for (const st of s.structs) {
      seenS.add(st.sid);
      let e = this.structs.get(st.sid);
      if (!e) {
        e = this.makeStruct(st);
        this.structs.set(st.sid, e);
      }
      const prog = structureProgress(s, st);
      e.objs.forEach((o, i) => {
        let solid = prog.complete;
        if (MEGAS[st.type].draw === 'each') {
          const c = st.cells[i], t = s.tiles[key(c.q, c.r)];
          solid = solid || (t && t.mega === st.sid);
        }
        o.traverse((m) => { if (m.isMesh) { m.material = solid ? this.mat : this.ghostMat; m.castShadow = solid; } });
      });
      if (prog.complete && !e.complete && view.celebrate === st.sid) {
        for (const o of e.objs) this.anims.push({ type: 'pop', obj: o, start: performance.now(), dur: 700 });
      }
      e.complete = prog.complete;
      const lbl = this.label('st' + st.sid, 'badge');
      lbl.textContent = `${MEGAS[st.type].emoji} ${prog.done}/${prog.total}`;
      lbl.style.display = prog.complete ? 'none' : '';
      lbl._world = e.top;
    }
    for (const [sid, e] of this.structs) if (!seenS.has(sid)) { this.removeStruct(e); this.structs.delete(sid); }
    this.rotors = [];
    for (const e of this.structs.values()) if (e.complete) this.rotors.push(...e.rotors);

    // rings: unfinished structure parts, bulldoze hover
    this.groups.rings.clear();
    const ring = (q, r, color, y = M.H + 0.012) => {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
      const [x, z] = world(q, r);
      m.position.set(x, y, z);
      m.renderOrder = 5;
      this.groups.rings.add(m);
    };
    for (const st of s.structs) {
      if (structureProgress(s, st).complete) continue;
      for (const c of st.cells) {
        const t = s.tiles[key(c.q, c.r)];
        if (t && t.mega === st.sid) ring(c.q, c.r, '#ffd650', t.base.includes('farm') ? M.H * 1.3 + 0.012 : M.H + 0.012);
      }
    }
    if (view.mode === 'bulldoze' && view.hover && s.tiles[view.hover.k]) ring(view.hover.q, view.hover.r, '#ff5a5a', M.H * 1.35);

    // slots
    const slots = view.mode === 'mega' ? [] : [...view.slots.entries()];
    this.slotKeys = [];
    const mtx = new THREE.Matrix4();
    const hot = new THREE.Color('#fff6b0'), cold = new THREE.Color('#ffffff');
    slots.slice(0, 512).forEach(([k, [q, r]], i) => {
      const [x, z] = world(q, r);
      mtx.makeTranslation(x, 0, z);
      this.slotPlates.setMatrixAt(i, mtx);
      this.slotPlus.setMatrixAt(i, mtx);
      this.slotPlates.setColorAt(i, view.hover && view.hover.k === k ? hot : cold);
      this.slotKeys[i] = { q, r, k };
    });
    this.slotPlates.count = this.slotPlus.count = Math.min(512, slots.length);
    this.slotPlates.instanceMatrix.needsUpdate = this.slotPlus.instanceMatrix.needsUpdate = true;
    if (this.slotPlates.instanceColor) this.slotPlates.instanceColor.needsUpdate = true;
    this.slotPlates.computeBoundingSphere();
    this.slotPlus.computeBoundingSphere();

    this.syncPreview(view.preview);
    this.syncMega(view.mega);
    this.updateBounds();
    this.dirty = true;
  }

  makeConstruction(req, mat) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(M.constructionGeometry(), mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    const sp = M.kindSprite(req);
    sp.position.set(0, M.H + 0.45, 0.1);
    g.add(sp);
    return g;
  }

  makeStruct(st) {
    const def = MEGAS[st.type];
    const parts = M.landmarkParts(st.type);
    const pts = st.cells.map((c) => world(c.q, c.r));
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const objs = [], rotors = [];
    const build = (x, z) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(parts.geo, this.ghostMat);
      g.add(m);
      if (parts.rotor) {
        const rm = new THREE.Mesh(parts.rotor.geo, this.ghostMat);
        rm.position.set(...parts.rotor.pos);
        g.add(rm);
        rotors.push(rm);
      }
      g.position.set(x, M.H + 0.005, z);
      g.scale.setScalar(def.draw === 'each' ? 1.35 : 1.6);
      this.groups.marks.add(g);
      objs.push(g);
    };
    if (def.draw === 'each') pts.forEach(([x, z]) => build(x, z));
    else build(cx, cz);
    return { sid: st.sid, objs, rotors, complete: false, top: [cx, M.H + 2.1, cz] };
  }

  removeStruct(e) {
    for (const o of e.objs) this.groups.marks.remove(o);
    const l = this.labels.get('st' + e.sid);
    if (l) { l.remove(); this.labels.delete('st' + e.sid); }
  }

  syncPreview(p) {
    const g = this.groups.preview;
    this.preview = p;
    const lbl = this.label('preview', 'badge big');
    if (!p) {
      g.visible = false;
      lbl.style.display = 'none';
      if (this.previewMesh) this.previewMesh.visible = false;
      return;
    }
    g.visible = true;
    const [x, z] = world(p.q, p.r);
    if (!this.previewMesh || this.previewMesh.userData.tileId !== p.tile.id) {
      if (this.previewMesh) g.remove(this.previewMesh);
      this.previewMesh = new THREE.Mesh(M.tileGeometry(p.tile), this.mat);
      this.previewMesh.castShadow = true;
      this.previewMesh.userData = { tileId: p.tile.id, angle: -p.tile.rot * Math.PI / 3 };
      this.previewMesh.rotation.y = this.previewMesh.userData.angle;
      g.add(this.previewMesh);
    }
    const pm = this.previewMesh;
    pm.visible = true;
    pm.userData.cell = { q: p.q, r: p.r, k: p.k };
    // rotate along the shortest path toward the new orientation
    const target = -p.tile.rot * Math.PI / 3;
    let d = target - pm.userData.angle;
    d = ((d % TAU) + TAU + Math.PI) % TAU - Math.PI;
    pm.userData.targetAngle = pm.userData.angle + d;
    pm.userData.angle = pm.userData.targetAngle;
    pm.material = p.ev.ok ? this.mat : this.badMat;
    pm.userData.base = [x, z];
    if (pm.userData.lastCell !== p.k) {
      pm.position.set(x, 0.35, z);
      pm.userData.lastCell = p.k;
    }

    // side match markers
    const sig = p.k + JSON.stringify(p.ev.sides || []);
    if (sig !== this.previewSig) {
      this.previewSig = sig;
      for (const c of [...g.children]) if (c !== pm) g.remove(c);
      if (p.ev.ok) {
        p.ev.sides.forEach((st, dir) => {
          if (!st) return;
          const a = -60 * dir * Math.PI / 180;
          const color = st === 'exact' ? '#3ee07a' : st === 'partial' ? '#ffd23f' : '#ff5a5a';
          const m = new THREE.Mesh(this.edgeGeo, new THREE.MeshBasicMaterial({ color }));
          m.position.set(x + Math.cos(a) * 0.86, M.H + 0.36, z + Math.sin(a) * 0.86);
          m.rotation.y = -(a + Math.PI / 2);
          m.userData.edge = true;
          g.add(m);
        });
      }
    }
    lbl.style.display = '';
    if (p.ev.ok) {
      const extra = (p.ev.newPerfects ? ' ✨' : '') + (p.ev.completed ? ' 🏆' : '');
      lbl.textContent = `+${p.ev.delta} ⭐${extra}`;
      lbl.classList.remove('bad');
    } else {
      lbl.textContent = p.ev.reason === 'construction' ? `Needs ${KINDS[p.ev.req].emoji} tile` : p.ev.reason;
      lbl.classList.add('bad');
    }
    lbl._world = [x, M.H + 1.25, z];
  }

  syncMega(mp) {
    const g = this.groups.mega;
    const lbl = this.label('mega', 'badge big');
    if (!mp) {
      g.clear();
      this.megaSig = '';
      lbl.style.display = 'none';
      return;
    }
    const sig = `${mp.type}:${mp.q}:${mp.r}:${mp.cells.map((c) => c.status).join()}`;
    if (sig !== this.megaSig) {
      this.megaSig = sig;
      g.clear();
      for (const c of mp.cells) {
        const [x, z] = world(c.q, c.r);
        if (this.state.tiles[key(c.q, c.r)]) {
          const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: c.status === 'bad' ? '#ff5a5a' : '#4ef08a', depthWrite: false, transparent: true }));
          m.position.set(x, M.H * 1.32, z);
          m.renderOrder = 6;
          g.add(m);
          const sp = M.kindSprite(c.req, 0.38);
          sp.position.set(x, M.H + 0.5, z);
          g.add(sp);
        } else {
          const cg = this.makeConstruction(c.req, c.status === 'bad' ? this.badGhostMat : this.okGhostMat);
          cg.position.set(x, 0.12, z);
          g.add(cg);
        }
      }
      const pts = mp.cells.map((c) => world(c.q, c.r));
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const parts = M.landmarkParts(mp.type);
      const place = (x, z) => {
        const m = new THREE.Mesh(parts.geo, this.ghostMat);
        m.position.set(x, M.H + 0.15, z);
        m.scale.setScalar(MEGAS[mp.type].draw === 'each' ? 1.35 : 1.6);
        g.add(m);
      };
      if (MEGAS[mp.type].draw === 'each') pts.forEach(([x, z]) => place(x, z));
      else place(cx, cz);
      lbl._world = [cx, M.H + 2.5, cz];
    }
    lbl.style.display = '';
    lbl.textContent = mp.ok ? (mp.delta ? `+${mp.delta} ⭐ now` : `Place ${MEGAS[mp.type].name}`) : mp.connected ? 'Blocked' : 'Must touch land';
    lbl.classList.toggle('bad', !mp.ok);
  }

  updateBounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const add = (q, r) => {
      const [x, z] = world(q, r);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    };
    for (const k in this.state.tiles) add(this.state.tiles[k].q, this.state.tiles[k].r);
    for (const k in this.state.cons) add(this.state.cons[k].q, this.state.cons[k].r);
    if (minX === Infinity) { minX = maxX = minZ = maxZ = 0; }
    this.bounds = { minX, maxX, minZ, maxZ };
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const rad = Math.max(maxX - minX, maxZ - minZ) / 2 + 3;
    const sun = this.sun;
    sun.position.set(cx - 6, 12, cz + 7);
    sun.target.position.set(cx, 0, cz);
    const sc = sun.shadow.camera;
    sc.left = -rad - 2; sc.right = rad + 2; sc.top = rad + 2; sc.bottom = -rad - 2;
    sc.near = 1; sc.far = 40;
    sc.updateProjectionMatrix();
  }

  // ---------- labels & effects ----------
  label(id, cls) {
    let el = this.labels.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'lbl ' + cls;
      this.labelsEl.appendChild(el);
      this.labels.set(id, el);
    }
    return el;
  }

  float(q, r, text, color = '#ffe066', delay = 0) {
    const el = document.createElement('div');
    el.className = 'lbl float';
    el.textContent = text;
    el.style.color = color;
    el.style.animationDelay = delay + 'ms';
    this.labelsEl.appendChild(el);
    const [x, z] = world(q, r);
    const f = { el, world: [x, M.H + 0.8, z], end: performance.now() + 1400 + delay };
    this.floats.push(f);
    this.dirty = true;
  }

  burst(q, r) {
    const n = 40;
    const geo = new THREE.BufferGeometry();
    const posA = new Float32Array(n * 3), colA = new Float32Array(n * 3), vel = [];
    const palette = ['#ffcf33', '#ff6b9d', '#5ec8ff', '#7ee081', '#ffffff'].map((c) => new THREE.Color(c));
    const [x, z] = world(q, r);
    for (let i = 0; i < n; i++) {
      posA.set([x, M.H + 0.3, z], i * 3);
      const c = palette[i % palette.length];
      colA.set([c.r, c.g, c.b], i * 3);
      const a = Math.random() * TAU, sp = 1 + Math.random() * 2;
      vel.push([Math.cos(a) * sp, 2.5 + Math.random() * 2.5, Math.sin(a) * sp]);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true }));
    this.groups.fx.add(pts);
    this.anims.push({ type: 'burst', obj: pts, vel, start: performance.now(), dur: 1200, origin: [x, M.H + 0.3, z] });
  }

  updateLabels() {
    const place = (el, w) => {
      const [sx, sy, sz] = this.project(...w);
      if (sz > 1) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = '';
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    };
    for (const el of this.labels.values()) if (el._world && el.style.display !== 'none') place(el, el._world);
    const now = performance.now();
    this.floats = this.floats.filter((f) => {
      if (now > f.end) { f.el.remove(); return false; }
      place(f.el, f.world);
      return true;
    });
  }

  // ---------- frame loop ----------
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (!this.active) return;
    let busy = this.stepCamera(dt);

    // animations
    this.anims = this.anims.filter((a) => {
      const p = Math.min(1, (t - a.start) / a.dur);
      if (p < 0) return true;
      if (a.type === 'drop') a.obj.position.y = (1 - easeOutBounce(p)) * 1.4;
      else if (a.type === 'pop') { a.base = a.base || a.obj.scale.x; a.obj.scale.setScalar(Math.max(0.01, easeOutBack(p)) * a.base); }
      else if (a.type === 'burst') {
        const arr = a.obj.geometry.attributes.position.array, el = (t - a.start) / 1000;
        a.vel.forEach((v, i) => {
          arr[i * 3] = a.origin[0] + v[0] * el;
          arr[i * 3 + 1] = a.origin[1] + v[1] * el - 4.9 * el * el;
          arr[i * 3 + 2] = a.origin[2] + v[2] * el;
        });
        a.obj.geometry.attributes.position.needsUpdate = true;
        a.obj.material.opacity = 1 - p;
        if (p >= 1) this.groups.fx.remove(a.obj);
      }
      busy = true;
      return p < 1;
    });

    // preview hover + smooth rotation
    if (this.preview && this.previewMesh && this.previewMesh.visible) {
      const pm = this.previewMesh, [bx, bz] = pm.userData.base;
      const k = 1 - Math.exp(-dt * 14);
      pm.rotation.y += (pm.userData.targetAngle - pm.rotation.y) * k;
      pm.position.x += (bx - pm.position.x) * k;
      pm.position.z += (bz - pm.position.z) * k;
      pm.position.y = 0.35 + Math.sin(t / 300) * 0.05;
      for (const c of this.groups.preview.children) if (c.userData.edge) c.position.y = M.H + pm.position.y + 0.02;
      busy = true;
    }

    // windmills and clouds
    for (const r of this.rotors) r.rotation.z += dt * 2.2;
    if (this.rotors.length) busy = true;
    this.cloudMat.opacity = clamp((this.cam.dist - 5) / 7, 0, 0.92);
    this.groups.clouds.visible = this.cloudMat.opacity > 0.02;
    for (const c of this.groups.clouds.children) {
      c.castShadow = this.cloudMat.opacity > 0.4;
      c.position.x += c.userData.speed * dt;
      if (c.position.x > this.bounds.maxX + 12) c.position.x = this.bounds.minX - 12;
    }
    if (this.groups.clouds.children.length) busy = true;

    if (busy || this.dirty || this.floats.length) {
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
      this.dirty = false;
    }
  }
}
