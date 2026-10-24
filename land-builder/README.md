# Land Builder

A cozy hexagonal tile-placement game. Build a landscape one hex at a time, match the
terrain on every side to earn ⭐ stars, and reach each level's goal before your stack
of tiles runs out.

## Run it

The game is plain HTML/CSS/JS modules with no build step. The board is rendered in
3D with [Three.js](https://threejs.org) (vendored in `vendor/`, MIT licence), so it
works offline. Serve the repository root with any static server (ES modules don't
load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/land-builder/
```

## How it plays

- **Placing tiles** – tap a `+` slot next to your land to preview the current tile.
  Tap the preview again (or ⟲ ⟳ / `Q` `E`) to rotate, then confirm with ✓ (`Enter`).
  The next two tiles are shown top-right, with the number of tiles left.
- **Scoring** – each side touching the same terrain scores +2. In mixed-climate
  levels, the same terrain from another climate (e.g. snowy vs. temperate forest)
  only scores +1. A tile with six matching neighbours is **Perfect** (+6).
  Edges light up green / yellow / red in the preview, with the star delta shown.
- **Megastructures** – multi-hex blueprints (lines, L-shapes, triangles and sparse
  layouts). Place them over existing tiles whose main terrain matches, or on empty
  space to create 🚧 construction sites. Fill a site with a tile whose main terrain
  matches (+4 per part); finishing the whole structure pays a big bonus and raises
  a landmark. A new blueprint unlocks a few tiles after the previous one is placed.
- **3D camera** – drag to pan, pinch / scroll to zoom, twist two fingers (or
  right-drag / Shift-drag with a mouse) to orbit, and drag two fingers up/down to
  tilt. The buttons on the right orbit ⤺ ⤻ in 60° steps, cycle the tilt ⛰ and reset
  the view (compass). Keys: `A`/`D` orbit, `T` tilt, `F` re-frame, `+`/`-` zoom.
- **Mobile** – touch-first controls, safe-area aware layout for notched phones,
  portrait and landscape layouts, haptic feedback, and installable to the home
  screen (web app manifest).
- **Tools** – 🚜 clear a tile, 🌈 turn the current tile into a wildcard,
  📦 add 4 tiles. Undo / redo any move.
- **Level map** – 12 levels across temperate, snowy, tropical and mixed-climate
  zones. Star goals rise and new terrain (water, fields, mountains), climates and
  megastructures unlock as you progress. 1–3 stars per level; progress is saved
  in `localStorage`.

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Terrain kinds, climate palettes, megastructures, levels, scoring constants |
| `js/game.js` | Pure game rules (no DOM): tile generation, placement, scoring, undo/redo |
| `js/meshes.js` | Low-poly geometry: tile prisms with merged decorations, construction sites, landmarks, clouds |
| `js/board3d.js` | Three.js scene, orbit camera + touch gestures, picking, previews, world-anchored labels, effects |
| `js/icons.js` | 3D tile previews for the queue and blueprint footprint icons |
| `js/main.js` | Level map, HUD, game flow, buttons/keyboard, modals |
| `js/hex.js` | Axial hex math and a seeded PRNG |
| `tools/sim.mjs` | Balance check: greedy bot plays each level (`node land-builder/tools/sim.mjs 50`) |
