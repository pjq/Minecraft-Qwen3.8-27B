# ⛏ MineWorld — Minecraft-style Voxel Game (Qwen 3.8 27B)

A fully self-contained, **offline-capable** Minecraft-style voxel game built
entirely from scratch in a single `game.js` file using a locally-bundled
three.js. No build step, no CDN, no internet required.

## Play

```bash
python3 -m http.server 8377
# → open http://localhost:8377
```

Or just double-click `index.html` in your browser.

## Controls
- **W A S D** move · **mouse** look · **Space** jump
- **F** toggle fly (Space↑ / Shift↓)
- **Left click** break block · **Right click** place block
- **1–9 / wheel** pick block · **R** respawn · **E** pause

## Features
- Infinite procedural world (hills, beaches, snow, lakes, trees)
- 12 block types with hand-drawn pixel textures
- Breaking & placing with particle effects
- Day/night cycle
- Animated cows to befriend
- 7-star achievement system
- Biome minimap, auto-save, sound effects
- Chinese + English UI

## Files
```
index.html          UI, menus, HUD, hotbar
lib/three.min.js    three.js r149 (local, offline)
src/game.js         full game engine
```

See [STATUS.md](STATUS.md) for the full build/verification report.

Built with Qwen 3.8 27B (MTPLX). Enjoy! 🎮
