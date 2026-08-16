/* ============================================================
 *  方块世界 MineWorld — Kids Edition
 *  A self-contained voxel sandbox game (three.js r149, no build step)
 *  Sections:
 *   1. Utils & noise
 *   2. Texture atlas (procedural pixel art)
 *   3. Block registry
 *   4. World (chunks, generation, edits, saves)
 *   5. Chunk meshing (instanced boxes)
 *   6. Player (physics, flying, swimming, input)
 *   7. Block interaction (raycast, break/place, particles)
 *   8. Animals & clouds & day/night
 *   9. Star rewards, toast, HUD, minimap
 *   10. Sound
 *   11. Game state machine (menu / playing / pause)
 *   12. Main loop & boot
 * ============================================================ */
(function () {
'use strict';

// ============================== 1. Utils & noise ==============================
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function hash2(x, y, seed) {
  var h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function hash3(x, y, z, seed) {
  var h = (x * 374761393 + y * 668265263 + z * 2147483629 + seed * 1442695041) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise2(x, y, seed) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  var u = smooth(xf), v = smooth(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm2(x, y, seed, oct) {
  var s = 0, amp = 1, freq = 1, norm = 0;
  for (var i = 0; i < oct; i++) {
    s += valueNoise2(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return s / norm;
}
function rand01(seedArr) { // deterministic LCG, mutates seedArr[0]
  var t = (seedArr[0] = (seedArr[0] * 1664525 + 1013904223) | 0);
  return ((t ^ (t >> 13)) >>> 0) / 4294967295;
}

// ============================== 2. Texture atlas ==============================
// 4x4 tiles of 16px = 64x64 canvas atlas
var TILE = 16, ATLAS_TILES = 4, ATLAS_PX = TILE * ATLAS_TILES;
var T = { GRASS_TOP:0, GRASS_SIDE:1, DIRT:2, STONE:3, SAND:4, WOOD_SIDE:5, WOOD_TOP:6,
          LEAVES:7, PLANKS:8, BRICK:9, GLASS:10, WATER:11, LAMP:12, SNOW_TOP:13, SNOW_SIDE:14 };

function makeAtlas() {
  var c = document.createElement('canvas');
  c.width = ATLAS_PX; c.height = ATLAS_PX;
  var ctx = c.getContext('2d');
  var rng = [123456789];
  function px(tile, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect((tile % ATLAS_TILES) * TILE + x, Math.floor(tile / ATLAS_TILES) * TILE + y, 1, 1);
  }
  function fillNoise(tile, base, spread) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      var n = (rand01(rng) - 0.5) * 2 * spread;
      px(tile, x, y, 'rgb(' + clamp(base[0]+n|0,0,255) + ',' + clamp(base[1]+n|0,0,255) + ',' + clamp(base[2]+n|0,0,255) + ')');
    }
  }
  // grass top
  fillNoise(T.GRASS_TOP, [94, 178, 66], 26);
  // dirt
  fillNoise(T.DIRT, [134, 96, 67], 22);
  // grass side = dirt with green strip
  fillNoise(T.GRASS_SIDE, [134, 96, 67], 22);
  for (var x = 0; x < TILE; x++) {
    var h = 3 + (rand01(rng) < 0.5 ? 1 : 0);
    for (var y = 0; y < h; y++) px(T.GRASS_SIDE, x, y, 'rgb(' + (80+rand01(rng)*30|0) + ',' + (160+rand01(rng)*30|0) + ',' + (60+rand01(rng)*20|0) + ')');
  }
  // stone
  fillNoise(T.STONE, [128, 128, 132], 14);
  for (var i = 0; i < 10; i++) px(T.STONE, rand01(rng)*16|0, rand01(rng)*16|0, 'rgb(100,100,106)');
  // sand
  fillNoise(T.SAND, [222, 208, 160], 16);
  // wood side: vertical stripes
  for (y = 0; y < TILE; y++) for (x = 0; x < TILE; x++) {
    var v = 40 * Math.sin(x * 1.1 + Math.sin(y*0.7)*0.8) + (rand01(rng)-0.5)*18;
    px(T.WOOD_SIDE, x, y, 'rgb(' + (120+v|0) + ',' + (86+v*0.6|0) + ',' + (50+v*0.3|0) + ')');
  }
  // wood top: rings
  for (y = 0; y < TILE; y++) for (x = 0; x < TILE; x++) {
    var d = Math.sqrt(Math.pow(x-7.5,2)+Math.pow(y-7.5,2));
    var ring = (Math.sin(d*1.8)+1)*20;
    px(T.WOOD_TOP, x, y, 'rgb(' + (150+ring|0) + ',' + (110+ring*0.7|0) + ',' + (70+ring*0.4|0) + ')');
  }
  // leaves
  fillNoise(T.LEAVES, [52, 122, 40], 30);
  for (i = 0; i < 12; i++) px(T.LEAVES, rand01(rng)*16|0, rand01(rng)*16|0, 'rgb(38,96,30)');
  // planks: horizontal boards
  for (y = 0; y < TILE; y++) for (x = 0; x < TILE; x++) {
    var board = (y >> 2); // 4px boards
    var edge = (y & 3) === 3 ? -28 : 0;
    var seam = (x === (board % 2 === 0 ? 4 : 11) && (y&3)!==3) ? -24 : 0;
    var v = (rand01(rng)-0.5)*14 + edge + seam;
    px(T.PLANKS, x, y, 'rgb(' + (176+v|0) + ',' + (134+v*0.8|0) + ',' + (84+v*0.5|0) + ')');
  }
  // brick
  for (y = 0; y < TILE; y++) for (x = 0; x < TILE; x++) {
    var row = y >> 2;
    var off = (row % 2) * 4;
    var mort = (y & 3) === 0 || (x + off) % 8 === 0;
    if (mort) px(T.BRICK, x, y, 'rgb(188,178,168)');
    else { var v2 = (rand01(rng)-0.5)*16; px(T.BRICK, x, y, 'rgb(' + (168+v2|0) + ',' + (74+v2*0.5|0) + ',' + (60+v2*0.5|0) + ')'); }
  }
  // glass: transparent with border + streaks
  for (var yy = 0; yy < TILE; yy++) for (var xx = 0; xx < TILE; xx++) {
    var border = (xx === 0 || yy === 0 || xx === 15 || yy === 15);
    var streak = (xx + yy) % 9 === 0 && xx > 2 && xx < 13;
    var col = border ? [200, 220, 235, 230] : (streak ? [210, 230, 245, 150] : [190, 215, 235, 40]);
    px(T.GLASS, xx, yy, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + col[3] + ')');
  }
  // water
  for (yy = 0; yy < TILE; yy++) for (xx = 0; xx < TILE; xx++) {
    var wv = (Math.sin(xx * 0.9 + yy * 1.3) + 1) * 10 + (rand01(rng)-0.5)*10;
    px(T.WATER, xx, yy, 'rgba(' + (40+wv*0.3|0) + ',' + (110+wv*0.6|0) + ',' + (200+wv|0) + ',' + 185 + ')');
  }
  // lamp: warm glow
  for (yy = 0; yy < TILE; yy++) for (xx = 0; xx < TILE; xx++) {
    var d2 = Math.sqrt(Math.pow(xx-7.5,2)+Math.pow(yy-7.5,2));
    var g = clamp(255 - d2*22, 90, 255);
    px(T.LAMP, xx, yy, 'rgb(' + g + ',' + (g*0.82|0) + ',' + (g*0.45|0) + ')');
  }
  // snow top
  fillNoise(T.SNOW_TOP, [240, 246, 250], 8);
  // snow side
  fillNoise(T.SNOW_SIDE, [134, 96, 67], 22);
  for (xx = 0; xx < TILE; xx++) {
    var sh = 4 + (rand01(rng) < 0.5 ? 1 : 0);
    for (yy = 0; yy < sh; yy++) px(T.SNOW_SIDE, xx, yy, 'rgb(238,244,248)');
  }

  var tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// block-face UVs for the atlas region of a tile
function tileUV(tile) {
  var col = tile % ATLAS_TILES, row = Math.floor(tile / ATLAS_TILES);
  var e = 1.5 / ATLAS_PX; // half-texel inset (must be smaller than half a tile!)
  var u0 = col / ATLAS_TILES, v0 = 1 - (row + 1) / ATLAS_TILES;
  var u1 = (col + 1) / ATLAS_TILES, v1 = 1 - row / ATLAS_TILES;
  return { u0: u0 + e, v0: v0 + e, u1: u1 - e, v1: v1 - e };
}

// one block geometry, 24 verts, per-face UVs from a [top, bottom, +x, -x, +z, -z] tile list
// every face is wound counter-clockwise seen from outside; side faces ordered bottomA,bottomB,topB,topA
function makeBlockGeometry(tiles) {
  var uv = tiles.map(tileUV);
  // 6 faces, each 4 vertices wound COUNTER-CLOCKWISE when viewed from outside
  // (three.js front face = CCW). Order: top, bottom, +x, -x, +z, -z.
  var POS = [
    [0,1,0,  0,1,1,  1,1,1,  1,1,0],  // +y top  -> normal +y
    [0,0,0,  1,0,0,  1,0,1,  0,0,1],  // -y bottom -> normal -y
    [1,0,1,  1,0,0,  1,1,0,  1,1,1],  // +x
    [0,0,0,  0,0,1,  0,1,1,  0,1,0],  // -x
    [0,0,1,  1,0,1,  1,1,1,  0,1,1],  // +z
    [1,0,0,  0,0,0,  0,1,0,  1,1,0]   // -z
  ];
  var NORM = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
  var P = [], U = [], N = [], idx = [];
  for (var f = 0; f < 6; f++) {
    var o = f * 4, t = uv[f];
    // UV corners matched to the 4 positions above. Top uses a top-down v layout;
    // all other faces use bottom-edge-first. Solid, non-flipped faces.
    var uvc = (f === 0)
      ? [[t.u0,t.v0],[t.u0,t.v1],[t.u1,t.v1],[t.u1,t.v0]]
      : [[t.u0,t.v0],[t.u1,t.v0],[t.u1,t.v1],[t.u0,t.v1]];
    idx.push(o, o+1, o+2, o, o+2, o+3);
    for (var k = 0; k < 4; k++) {
      P.push(POS[f][k*3], POS[f][k*3+1], POS[f][k*3+2]);
      U.push(uvc[k][0], uvc[k][1]);
      N.push(NORM[f][0], NORM[f][1], NORM[f][2]);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(idx);
  return g;
}

// ============================== 3. Block registry ==============================
var AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, WOOD = 5, LEAVES = 6,
    PLANKS = 7, BRICK = 8, GLASS = 9, WATER = 10, LAMP = 11, SNOW = 12;
var BLOCKS = {};
function defBlock(id, name, nameZh, tiles, opts) {
  opts = opts || {};
  BLOCKS[id] = { id: id, name: name, nameZh: nameZh, tiles: tiles,
    solid: opts.solid !== false, opaque: opts.opaque !== false,
    emissive: !!opts.emissive, breakable: opts.breakable !== false };
}
defBlock(GRASS, 'Grass', '草地', [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_SIDE]);
defBlock(DIRT, 'Dirt', '泥土', [T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT]);
defBlock(STONE, 'Stone', '石头', [T.STONE, T.STONE, T.STONE, T.STONE, T.STONE, T.STONE]);
defBlock(SAND, 'Sand', '沙子', [T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SAND]);
defBlock(WOOD, 'Wood', '木头', [T.WOOD_TOP, T.WOOD_TOP, T.WOOD_SIDE, T.WOOD_SIDE, T.WOOD_SIDE, T.WOOD_SIDE]);
defBlock(LEAVES, 'Leaves', '树叶', [T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES, T.LEAVES], { opaque: true });
defBlock(PLANKS, 'Planks', '木板', [T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS, T.PLANKS]);
defBlock(BRICK, 'Brick', '砖块', [T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
defBlock(GLASS, 'Glass', '玻璃', [T.GLASS, T.GLASS, T.GLASS, T.GLASS, T.GLASS, T.GLASS], { opaque: false });
defBlock(WATER, 'Water', '水', [T.WATER, T.WATER, T.WATER, T.WATER, T.WATER, T.WATER], { opaque: false, solid: false, breakable: false });
defBlock(LAMP, 'Lamp', '灯笼', [T.LAMP, T.LAMP, T.LAMP, T.LAMP, T.LAMP, T.LAMP], { emissive: true, opaque: false });
defBlock(SNOW, 'Snow', '雪块', [T.SNOW_TOP, T.SNOW_TOP, T.SNOW_SIDE, T.SNOW_SIDE, T.SNOW_SIDE, T.SNOW_SIDE]);

var HOTBAR = [PLANKS, BRICK, GLASS, LAMP, WOOD, LEAVES, STONE, SAND, DIRT, SNOW];
var WATER_LEVEL = 28;

// ============================== 4. World ==============================
var CHUNK = 16, HEIGHT = 128;
var world = {
  seed: (Math.random() * 1e9) | 0,
  chunks: {},          // "cx,cz" -> chunk
  edits: {}            // "x,y,z" -> blockId (persistent player edits)
};

function terrainHeight(wx, wz) {
  var s = world.seed;
  var n = fbm2(wx * 0.012, wz * 0.012, s, 4);       // big hills
  var n2 = fbm2(wx * 0.05, wz * 0.05, s + 777, 3);  // detail
  var h = 26 + n * 42 + n2 * 8;
  return clamp(Math.floor(h), 4, HEIGHT - 30);
}
function biomeOf(wx, wz) {
  var m = fbm2(wx * 0.008 + 100, wz * 0.008 + 100, world.seed + 4242, 2);
  if (m < 0.42) return 'beach';
  if (m > 0.62) return 'snow';
  return 'grass';
}
function treeAt(wx, wz) {
  // deterministic: one tree per 8x8 cell, chance-based
  var cx = Math.floor(wx / 8), cz = Math.floor(wz / 8);
  var r = hash2(cx, cz, world.seed + 99);
  if (r > 0.16) return null;
  var ox = Math.floor(hash2(cx * 3 + 1, cz * 7 + 2, world.seed) * 8);
  var oz = Math.floor(hash2(cx * 5 + 3, cz * 2 + 1, world.seed) * 8);
  return { x: cx * 8 + ox, z: cz * 8 + oz, h: 4 + Math.floor(hash2(cx, cz, world.seed + 5) * 3) };
}

function makeChunk(cx, cz) {
  return { cx: cx, cz: cz, data: new Uint8Array(CHUNK * CHUNK * HEIGHT), dirty: true,
           meshes: null, waterMesh: null };
}
function ckey(cx, cz) { return cx + ',' + cz; }
function getChunk(cx, cz, gen) {
  var k = ckey(cx, cz);
  var ch = world.chunks[k];
  if (!ch) {
    ch = makeChunk(cx, cz);
    world.chunks[k] = ch;
    if (gen !== false) genChunk(ch);
  }
  return ch;
}
function chunkGet(ch, lx, ly, lz) {
  if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) return AIR;
  return ch.data[(ly * CHUNK + lz) * CHUNK + lx];
}
function chunkSet(ch, lx, ly, lz, id) {
  if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) return;
  ch.data[(ly * CHUNK + lz) * CHUNK + lx] = id;
  ch.dirty = true;
}
function getBlock(wx, wy, wz) {
  if (wy < 0) return STONE;
  if (wy >= HEIGHT) return AIR;
  var ch = getChunk(Math.floor(wx / CHUNK), Math.floor(wz / CHUNK), true);
  return chunkGet(ch, wx - Math.floor(wx / CHUNK) * CHUNK, wy, wz - Math.floor(wz / CHUNK) * CHUNK);
}
function setBlock(wx, wy, wz, id, record) {
  if (wy < 0 || wy >= HEIGHT) return;
  var cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
  var ch = getChunk(cx, cz, true);
  var lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
  chunkSet(ch, lx, wy, lz, id);
  // neighbor chunks if on edge
  if (lx === 0) { var n = world.chunks[ckey(cx-1, cz)]; if (n) n.dirty = true; }
  if (lx === CHUNK-1) { n = world.chunks[ckey(cx+1, cz)]; if (n) n.dirty = true; }
  if (lz === 0) { n = world.chunks[ckey(cx, cz-1)]; if (n) n.dirty = true; }
  if (lz === CHUNK-1) { n = world.chunks[ckey(cx, cz+1)]; if (n) n.dirty = true; }
  if (record) world.edits[wx + ',' + wy + ',' + wz] = id;
}
function isSolidAt(wx, wy, wz) {
  var b = getBlock(wx, wy, wz);
  return b !== AIR && BLOCKS[b].solid;
}

function genChunk(ch) {
  var baseX = ch.cx * CHUNK, baseZ = ch.cz * CHUNK;
  var s = world.seed;
  // first fill columns (terrain)
  for (var lz = 0; lz < CHUNK; lz++) for (var lx = 0; lx < CHUNK; lx++) {
    var wx = baseX + lx, wz = baseZ + lz;
    var h = terrainHeight(wx, wz);
    var biome = biomeOf(wx, wz);
    for (var y = 0; y < HEIGHT; y++) {
      var id;
      if (y === 0) id = STONE;
      else if (y > h) { id = (y <= WATER_LEVEL) ? WATER : AIR; }
      else if (y === h) {
        if (biome === 'beach') id = SAND;
        else if (biome === 'snow') id = SNOW;
        else id = GRASS;
      } else if (y > h - 4) {
        id = (biome === 'beach') ? SAND : DIRT;
      } else id = STONE;
      // player edits win
      var e = world.edits[wx + ',' + y + ',' + wz];
      if (e !== undefined) id = e;
      ch.data[(y * CHUNK + lz) * CHUNK + lx] = id;
    }
  }
  // trees: scan a margin so crowns crossing borders land in the right chunk
  var cells = Math.ceil(CHUNK / 8) + 2;
  for (var cz2 = Math.floor(baseZ / 8) - 1; cz2 <= Math.floor((baseZ + CHUNK - 1) / 8) + 1; cz2++)
  for (var cx2 = Math.floor(baseX / 8) - 1; cx2 <= Math.floor((baseX + CHUNK - 1) / 8) + 1; cx2++) {
    var r = hash2(cx2, cz2, s + 99);
    if (r > 0.16) continue;
    var tx = cx2 * 8 + Math.floor(hash2(cx2 * 3 + 1, cz2 * 7 + 2, s) * 8);
    var tz = cx2 * 8 + Math.floor(hash2(cx2 * 5 + 3, cz2 * 2 + 1, s) * 8);
    var th = 4 + Math.floor(hash2(cx2, cz2, s + 5) * 3);
    var gh = terrainHeight(tx, tz);
    if (biomeOf(tx, tz) === 'beach' || biomeOf(tx, tz) === 'snow' || gh <= WATER_LEVEL + 1) continue;
    // trunk
    for (y = gh + 1; y <= gh + th; y++) {
      var lx2 = tx - baseX, lz2 = tz - baseZ;
      if (lx2 >= 0 && lx2 < CHUNK && lz2 >= 0 && lz2 < CHUNK) {
        var eid = world.edits[tx + ',' + y + ',' + tz];
        if (eid === undefined) chunkSetRaw(ch, lx2, y, lz2, WOOD);
      }
    }
    // crown
    for (var dy = -1; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) {
      if (dx === 0 && dz === 0 && dy < 1) continue; // keep trunk
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (dy === 2 && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
      var bx = tx + dx, by = gh + th + dy, bz = tz + dz;
      var lx3 = bx - baseX, lz3 = bz - baseZ;
      if (lx3 < 0 || lx3 >= CHUNK || lz3 < 0 || lz3 >= CHUNK) continue;
      var cur = chunkGet(ch, lx3, by, lz3);
      var eid2 = world.edits[bx + ',' + by + ',' + bz];
      if (eid2 !== undefined) continue;
      if (cur === AIR || cur === WATER) chunkSetRaw(ch, lx3, by, lz3, LEAVES);
    }
  }
  ch.dirty = true;
}
function chunkSetRaw(ch, lx, ly, lz, id) {
  if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) return;
  ch.data[(ly * CHUNK + lz) * CHUNK + lx] = id;
  ch.dirty = true;
}

// ============================== 5. Chunk meshing ==============================
var scene, atlasTex, materials = {};
function buildMaterials() {
  materials = {};
  for (var id in BLOCKS) {
    var b = BLOCKS[id];
    var m = new THREE.MeshLambertMaterial({ map: atlasTex });
    if (!b.opaque) { m.transparent = true; }
    if (b.emissive) m.emissive = new THREE.Color(0xffcc66);
    materials[b.id] = m;
  }
}
function isExposed(id, n1, n2, n3, n4, n5, n6) {
  if (id === AIR) return false;
  var b = BLOCKS[id];
  if (!b.opaque) return true; // glass/water/lamp: always draw
  return (n1 !== id && !(n1 && BLOCKS[n1].opaque)) ||
         (n2 !== id && !(n2 && BLOCKS[n2].opaque)) ||
         (n3 !== id && !(n3 && BLOCKS[n3].opaque)) ||
         (n4 !== id && !(n4 && BLOCKS[n4].opaque)) ||
         (n5 !== id && !(n5 && BLOCKS[n5].opaque)) ||
         (n6 !== id && !(n6 && BLOCKS[n6].opaque));
}
var _mat4 = new THREE.Matrix4();
function rebuildChunkMeshes(ch) {
  // remove old
  removeChunkMeshes(ch);
  if (!ch.dirty) { ch.meshes = []; return; }
  ch.dirty = false;
  var baseX = ch.cx * CHUNK, baseZ = ch.cz * CHUNK;
  var byType = {};
  var wx, wz, y;
  for (y = 0; y < HEIGHT; y++) for (var lz = 0; lz < CHUNK; lz++) for (var lx = 0; lx < CHUNK; lx++) {
    var id = ch.data[(y * CHUNK + lz) * CHUNK + lx];
    if (id === AIR) continue;
    wx = baseX + lx; wz = baseZ + lz;
    var n1 = neighborVal(ch, wx, y+1, wz), n2 = neighborVal(ch, wx, y-1, wz),
        n3 = neighborVal(ch, wx, y, wz+1), n4 = neighborVal(ch, wx, y, wz-1),
        n5 = neighborVal(ch, wx+1, y, wz), n6 = neighborVal(ch, wx-1, y, wz);
    if (!isExposed(id, n1, n2, n3, n4, n5, n6)) continue;
    (byType[id] = byType[id] || []).push([wx, y, wz]);
  }
  ch.meshes = [];
  for (var tid in byType) {
    var list = byType[tid];
    var t = parseInt(tid, 10);
    if (t === WATER) { ch.waterMesh = makeInstanced(t, list); if (ch.waterMesh) { ch.waterMesh.visible = true; scene.add(ch.waterMesh); } continue; }
    var im = makeInstanced(t, list);
    if (im) { scene.add(im); ch.meshes.push(im); }
  }
}
function neighborVal(ch, wx, wy, wz) {
  if (wy < 0) return STONE;
  if (wy >= HEIGHT) return AIR;
  var cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
  var lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
  if (cx === ch.cx && cz === ch.cz) return chunkGet(ch, lx, wy, lz);
  var other = world.chunks[ckey(cx, cz)];
  if (!other) return AIR;
  return chunkGet(other, lx, wy, lz);
}
function makeInstanced(blockId, list) {
  if (!list.length || !BLOCKS[blockId] || !BLOCKS[blockId].geo) return null;
  var im = new THREE.InstancedMesh(BLOCKS[blockId].geo, materials[blockId], list.length);
  for (var i = 0; i < list.length; i++) {
    _mat4.makeTranslation(list[i][0] + 0.5, list[i][1] + 0.5, list[i][2] + 0.5);
    im.setMatrixAt(i, _mat4);
  }
  im.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false; // r149: instance offsets excluded from bounding sphere -> would cull whole chunk
  return im;
}
function removeChunkMeshes(ch) {
  if (ch.waterMesh) { scene.remove(ch.waterMesh); ch.waterMesh.dispose(); ch.waterMesh = null; }
  if (ch.meshes) { for (var i = 0; i < ch.meshes.length; i++) { scene.remove(ch.meshes[i]); ch.meshes[i].dispose(); } }
  ch.meshes = [];
}
var RENDER_RADIUS = 4;
function updateChunks() {
  var pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  var needed = {};
  for (var dz = -RENDER_RADIUS; dz <= RENDER_RADIUS; dz++)
    for (var dx = -RENDER_RADIUS; dx <= RENDER_RADIUS; dx++) needed[ckey(pcx+dx, pcz+dz)] = true;
  // unload far
  for (var k in world.chunks) {
    if (!needed[k]) { var c = world.chunks[k]; removeChunkMeshes(c); delete world.chunks[k]; }
  }
  // (re)build dirty, nearest first
  var list = [];
  for (k in needed) {
    var pk = parseKey(k);
    var ch = world.chunks[k] || getChunk(pk[0], pk[1], true);
    if (ch && ch.dirty) list.push(ch);
  }
  list.sort(function (a, b) {
    var da = (a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz);
    var db = (b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz);
    return da - db;
  });
  var budget = 3;
  for (var i = 0; i < list.length && budget > 0; i++) { rebuildChunkMeshes(list[i]); budget--; }
}
// fix: parse key properly (k can be negative)
function parseKey(k) { var p = k.split(','); return [parseInt(p[0], 10), parseInt(p[1], 10)]; }

// ============================== 6. Player ==============================
var player = {
  pos: new THREE.Vector3(8.5, 60, 8.5),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  onGround: false, fly: false,
  eye: 1.62, halfW: 0.3, height: 1.8,
  spawn: new THREE.Vector3(8.5, 60, 8.5),
  inWater: false, headInWater: false,
  sprint: false
};
var keys = {};
// ---- virtual touch input (iPad / tablet) ----
var touchStick = { f: 0, r: 0, up: 0 };
var touchJumpHeld = false;
var touchEnabled = false;
var GRAVITY = 26, JUMP_V = 8.6, WALK = 5.4, FLY_V = 11;

function spawnPlayer() {
  var sp = findLand(8, 8) || [8.5, terrainHeight(8, 8) + 1.01, 8.5];
  player.spawn.set(sp[0], sp[1], sp[2]);
  player.pos.copy(player.spawn);
  player.vel.set(0, 0, 0);
  player.fly = false; player.yaw = 0; player.pitch = 0;
}
function collides(px, py, pz) {
  var minX = Math.floor(px - player.halfW), maxX = Math.floor(px + player.halfW);
  var minY = Math.floor(py), maxY = Math.floor(py + player.height - 0.01);
  var minZ = Math.floor(pz - player.halfW), maxZ = Math.floor(pz + player.halfW);
  for (var x = minX; x <= maxX; x++)
    for (var y = minY; y <= maxY; y++)
      for (var z = minZ; z <= maxZ; z++)
        if (isSolidAt(x, y, z)) return true;
  return false;
}
function updatePlayer(dt) {
  // input direction from yaw (keyboard + virtual joystick)
  var f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) + touchStick.f;
  var r = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0) + touchStick.r;
  f = clamp(f, -1, 1); r = clamp(r, -1, 1);
  var len = Math.sqrt(f * f + r * r) || 1;
  f /= len; r /= len;
  var sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // forward vector: (-sin, -cos)
  var mx = (-sin * f + cos * r), mz = (-cos * f - sin * r);
  var speed = player.fly ? FLY_V : (player.inWater ? WALK * 0.65 : WALK);
  player.vel.x = mx * speed;
  player.vel.z = mz * speed;

  if (player.fly) {
    var up = (keys['Space'] ? 1 : 0) - (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0) + touchStick.up;
    up = clamp(up, -1, 1);
    player.vel.y = up * FLY_V;
  } else {
    if (player.inWater) {
      player.vel.y -= GRAVITY * 0.35 * dt;
      player.vel.y = Math.max(player.vel.y, -3.2);
      if (keys['Space'] || touchJumpHeld) player.vel.y = 4.2;
    } else {
      player.vel.y -= GRAVITY * dt;
      player.vel.y = Math.max(player.vel.y, -48);
      if ((keys['Space'] || touchJumpHeld) && player.onGround) {
        player.vel.y = JUMP_V;
        player.onGround = false;
        sfxJump();
      }
    }
  }

  // move axis by axis
  var p = player.pos, v = player.vel;
  // X
  p.x += v.x * dt;
  if (collides(p.x, p.y, p.z)) {
    var dir = Math.sign(v.x);
    p.x = dir > 0 ? Math.floor(p.x + player.halfW) - player.halfW - 0.001
                  : Math.floor(p.x - player.halfW) + 1 + player.halfW + 0.001;
    if (collides(p.x, p.y, p.z)) p.x = p.x - dir * 0.02;
    v.x = 0;
  }
  // Z
  p.z += v.z * dt;
  if (collides(p.x, p.y, p.z)) {
    dir = Math.sign(v.z);
    p.z = dir > 0 ? Math.floor(p.z + player.halfW) - player.halfW - 0.001
                  : Math.floor(p.z - player.halfW) + 1 + player.halfW + 0.001;
    if (collides(p.x, p.y, p.z)) p.z = p.z - dir * 0.02;
    v.z = 0;
  }
  // Y
  p.y += v.y * dt;
  player.onGround = false;
  if (collides(p.x, p.y, p.z)) {
    dir = Math.sign(v.y);
    p.y = dir > 0 ? Math.floor(p.y + player.height) - player.height - 0.001
                  : Math.floor(p.y) + 1 + 0.001;
    if (dir < 0) player.onGround = true;
    v.y = 0;
  }
  if (p.y < -10) { p.copy(player.spawn); v.set(0,0,0); }

  // water state
  var feetBlock = getBlock(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
  var headBlock = getBlock(Math.floor(p.x), Math.floor(p.y + player.eye), Math.floor(p.z));
  var wasInWater = player.inWater;
  player.inWater = feetBlock === WATER;
  player.headInWater = headBlock === WATER;
  if (player.inWater && !wasInWater) sfxSplash();
}

// ============================== 7. Block interaction ==============================
function raycastVoxel(origin, dir, maxDist) {
  var x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  var stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
  var tDX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e30;
  var tDY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e30;
  var tDZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e30;
  var tMaxX = dir.x > 0 ? (x + 1 - origin.x) / dir.x : (x - origin.x) / dir.x;
  var tMaxY = dir.y > 0 ? (y + 1 - origin.y) / dir.y : (y - origin.y) / dir.y;
  var tMaxZ = dir.z > 0 ? (z + 1 - origin.z) / dir.z : (z - origin.z) / dir.z;
  var nx = 0, ny = 0, nz = 0;
  var t = 0;
  for (var i = 0; i < 256 && t <= maxDist; i++) {
    var b = getBlock(x, y, z);
    if (b !== AIR) return { x: x, y: y, z: z, id: b, nx: nx, ny: ny, nz: nz, t: t };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDX; nx = -stepX; ny = 0; nz = 0; }
    else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; t = tMaxZ; tMaxZ += tDZ; nx = 0; ny = 0; nz = -stepZ; }
  }
  return null;
}
var REACH = 6;
var mouseL = false, mouseR = false, breakTimer = 0, placeTimer = 0;
function eyeDir() {
  var cp = Math.cos(player.pitch);
  return new THREE.Vector3(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
}
function tryBreak() {
  var d = eyeDir();
  var o = player.pos.clone().add(new THREE.Vector3(0, player.eye, 0));
  var hit = raycastVoxel(o, d, REACH);
  if (!hit || !BLOCKS[hit.id].breakable) return;
  var old = hit.id;
  setBlock(hit.x, hit.y, hit.z, AIR, true);
  stats.broke++;
  spawnBreakParticles(hit.x, hit.y, hit.z, old);
  sfxBreak();
  starCheck();
}
function tryPlace() {
  var d = eyeDir();
  var o = player.pos.clone().add(new THREE.Vector3(0, player.eye, 0));
  var hit = raycastVoxel(o, d, REACH);
  if (!hit) return;
  var tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
  if (ty < 1) return;
  var cur = getBlock(tx, ty, tz);
  if (cur !== AIR && cur !== WATER) return;
  // don't place inside player
  var p = player.pos;
  if (tx + 1 > p.x - player.halfW && tx < p.x + player.halfW &&
      ty + 1 > p.y && ty < p.y + player.height &&
      tz + 1 > p.z - player.halfW && tz < p.z + player.halfW) return;
  setBlock(tx, ty, tz, HOTBAR[hotbarIdx], true);
  stats.placed++;
  spawnBreakParticles(tx, ty, tz, HOTBAR[hotbarIdx], true);
  sfxPlace();
  starCheck();
}

// particles
var particles = [];
var particleMat = new THREE.SpriteMaterial({ sizeAttenuation: true, depthWrite: false });
function spawnBreakParticles(x, y, z, blockId, soft) {
  if (!BLOCKS[blockId]) return;
  var tile = BLOCKS[blockId].tiles[2];
  var col = tileColor(tile);
  var n = soft ? 5 : 10;
  for (var i = 0; i < n; i++) {
    var c = document.createElement('canvas'); c.width = 8; c.height = 8;
    var ctx = c.getContext('2d');
    var v = (Math.random() - 0.5) * 40;
    ctx.fillStyle = 'rgb(' + clamp(col[0]+v|0,0,255) + ',' + clamp(col[1]+v|0,0,255) + ',' + clamp(col[2]+v|0,0,255) + ')';
    ctx.fillRect(0, 0, 8, 8);
    var tex = new THREE.CanvasTexture(c);
    var spr = new THREE.Sprite(particleMat.clone());
    spr.material.map = tex;
    var s = 0.12 + Math.random() * 0.1;
    spr.scale.set(s, s, 1);
    spr.position.set(x + 0.5, y + 0.5, z + 0.5);
    particles.push({ spr: spr, vel: new THREE.Vector3((Math.random()-0.5)*4, Math.random()*4+1, (Math.random()-0.5)*4),
                     life: 0.5 + Math.random() * 0.3, tex: tex, mat: spr.material });
    scene.add(spr);
  }
}
var _tileColors = {};
function tileColor(tile) {
  if (_tileColors[tile]) return _tileColors[tile];
  var c = document.createElement('canvas'); c.width = 1; c.height = 1;
  var ctx = c.getContext('2d');
  var img = atlasTex.image.getContext('2d').getImageData(tile * TILE + 8, 8, 1, 1).data;
  return (_tileColors[tile] = [img[0], img[1], img[2]]);
}
function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      scene.remove(p.spr); p.mat.dispose(); p.tex.dispose();
      particles.splice(i, 1); continue;
    }
    p.vel.y -= 12 * dt;
    p.spr.position.addScaledVector(p.vel, dt);
    p.spr.material.opacity = clamp(p.life * 2, 0, 1);
  }
}

// ============================== 8. Animals, clouds, day/night ==============================
var animals = [];
function makeCow(x, y, z) {
  var g = new THREE.Group();
  var white = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  var black = new THREE.MeshLambertMaterial({ color: 0x3a2e24 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.8), white);
  body.position.y = 0.95; g.add(body);
  var spot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.92, 0.82), black);
  spot.position.set(0.2, 0.95, 0); g.add(spot);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), white);
  head.position.set(0.95, 1.25, 0); g.add(head);
  var snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.45), black);
  snout.position.set(1.3, 1.12, 0); g.add(snout);
  var legs = [];
  var lg = new THREE.BoxGeometry(0.25, 0.6, 0.25);
  [[-0.5, -0.25], [-0.5, 0.25], [0.5, -0.25], [0.5, 0.25]].forEach(function (o) {
    var l = new THREE.Mesh(lg, o[0] < 0 ? white : black);
    l.position.set(o[0], 0.3, o[1]); g.add(l); legs.push(l);
  });
  g.position.set(x, y, z);
  scene.add(g);
  var a = { g: g, head: head, legs: legs, dir: Math.random() * TAU, speed: 0.9 + Math.random() * 0.5,
            t: Math.random() * 10, pause: 0 };
  animals.push(a);
  return a;
}
function findLand(x, z) {
  // return [x, y, z] of nearest walkable land (spiral search), or null
  var cx = Math.floor(x), cz = Math.floor(z);
  var check = function (wx, wz) {
    var h = terrainHeight(wx, wz);
    if (h <= WATER_LEVEL + 1) return null;
    return [wx + 0.5, h + 1.01, wz + 0.5];
  };
  var r0 = check(cx, cz); if (r0) return r0;
  for (var rad = 1; rad <= 30; rad++) {
    for (var a = 0; a < rad * 4; a++) {
      var ang = a / (rad * 4) * TAU;
      var r = check(cx + Math.round(Math.cos(ang) * rad), cz + Math.round(Math.sin(ang) * rad));
      if (r) return r;
    }
  }
  return null;
}
function placeAnimals() {
  for (var i = 0; i < animals.length; i++) { scene.remove(animals[i].g); }
  animals.length = 0;
  var rng = [(world.seed ^ 0x5f3759df) | 0];
  var baseX = player.spawn.x, baseZ = player.spawn.z;
  for (i = 0; i < 24 && animals.length < 8; i++) {
    var ang = rand01(rng) * TAU, dist = 8 + rand01(rng) * 70;
    var sp = findLand(baseX + Math.cos(ang) * dist, baseZ + Math.sin(ang) * dist);
    if (!sp) continue;
    if (sp[1] < WATER_LEVEL + 2) continue; // avoid shallow water edges
    makeCow(sp[0], sp[1], sp[2]);
  }
}
function updateAnimals(dt) {
  for (var i = 0; i < animals.length; i++) {
    var a = animals[i];
    a.t += dt;
    if (a.pause > 0) {
      a.pause -= dt;
      if (a.pause <= 0) a.dir += (Math.random() - 0.5) * 2;
    } else {
      var nx = a.g.position.x + Math.cos(a.dir) * a.speed * dt;
      var nz = a.g.position.z + Math.sin(a.dir) * a.speed * dt;
      var h = terrainHeight(Math.floor(nx), Math.floor(nz));
      var biome = biomeOf(Math.floor(nx), Math.floor(nz));
      if (biome === 'beach' || h <= WATER_LEVEL + 1 || Math.abs(h + 1 - a.g.position.y) > 2.2) {
        a.dir += Math.PI * (0.5 + Math.random() * 0.5);
        a.pause = 0.5 + Math.random() * 2;
      } else {
        a.g.position.x = nx; a.g.position.z = nz;
        a.g.position.y = lerp(a.g.position.y, h + 0.01, 1 - Math.pow(0.001, dt));
      }
      // leg swing
      var sw = Math.sin(a.t * 6) * 0.4;
      a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw;
      a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
      a.head.rotation.z = Math.sin(a.t * 1.7) * 0.15;
    }
    a.g.rotation.y = -a.dir;
  }
}
var clouds = [];
function makeClouds() {
  var m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (var i = 0; i < 12; i++) {
    var g = new THREE.BoxGeometry(6 + Math.random() * 10, 1.2, 4 + Math.random() * 6);
    var c = new THREE.Mesh(g, m);
    c.position.set((Math.random() - 0.5) * 300, 85 + Math.random() * 20, (Math.random() - 0.5) * 300);
    scene.add(c); clouds.push(c);
  }
}
function updateClouds(dt) {
  for (var i = 0; i < clouds.length; i++) {
    clouds[i].position.x += dt * 0.8;
    if (clouds[i].position.x > 180) clouds[i].position.x = -180;
  }
}

// day/night
var DAY_LEN = 8 * 60, NIGHT_LEN = 2.5 * 60, CYCLE = DAY_LEN + NIGHT_LEN;
var gameClock = DAY_LEN * 0.25; // start mid-morning
var sun, moon, sunLight, ambLight, dayColor, nightColor, dayFog, nightFog;
var nightSurvived = false;
function setupSky() {
  dayColor = new THREE.Color(0x8fd0f5);
  nightColor = new THREE.Color(0x0b1026);
  dayFog = new THREE.Fog(0x8fd0f5, 60, 130);
  nightFog = new THREE.Fog(0x0b1026, 30, 90);
  scene.background = dayColor.clone();
  scene.fog = dayFog.clone();
  sunLight = new THREE.DirectionalLight(0xfff2d0, 1.0);
  sunLight.position.set(50, 80, 30);
  scene.add(sunLight);
  ambLight = new THREE.AmbientLight(0xffffff, 0.62);
  scene.add(ambLight);
  // sun & moon disks
  var disk = document.createElement('canvas'); disk.width = 64; disk.height = 64;
  var dctx = disk.getContext('2d');
  var grad = dctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.5, 'rgba(255,220,120,0.9)'); grad.addColorStop(1, 'rgba(255,200,80,0)');
  dctx.fillStyle = grad; dctx.fillRect(0, 0, 64, 64);
  var diskTex = new THREE.CanvasTexture(disk);
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: diskTex, depthWrite: false, transparent: true }));
  sun.scale.set(16, 16, 1); scene.add(sun);
  var disk2 = disk.cloneNode(); var dctx2 = disk2.getContext('2d');
  var grad2 = dctx2.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad2.addColorStop(0, 'rgba(230,235,255,1)'); grad2.addColorStop(0.5, 'rgba(200,210,250,0.9)'); grad2.addColorStop(1, 'rgba(180,190,240,0)');
  dctx2.clearRect(0,0,64,64); dctx2.fillStyle = grad2; dctx2.fillRect(0, 0, 64, 64);
  moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(disk2), depthWrite: false, transparent: true }));
  moon.scale.set(12, 12, 1); scene.add(moon);
}
function updateSky(dt) {
  var prev = gameClock;
  gameClock = (gameClock + dt) % CYCLE;
  var t = gameClock;
  var isNight = t >= DAY_LEN;
  // sun/moon angle: 0..1 across the sky
  var f;
  if (!isNight) f = t / DAY_LEN; else f = (t - DAY_LEN) / NIGHT_LEN;
  var ang = (1 - f) * Math.PI;
  var center = new THREE.Vector3(player.pos.x, 0, player.pos.z);
  sun.position.set(center.x + Math.cos(ang) * 120, Math.sin(ang) * 110 + 5, center.z + 30);
  moon.position.set(center.x - Math.cos(ang) * 120, Math.sin(ang) * 110 + 5, center.z - 30);
  sun.visible = !isNight || f > 0.95;
  moon.visible = isNight;
  // darkness factor
  var dark = 0;
  if (t > DAY_LEN - 60 && !isNight) dark = (t - (DAY_LEN - 60)) / 60 * 0.85; // dusk
  else if (isNight && t < DAY_LEN + 60) dark = 0.85 - ((t - DAY_LEN) / 60) * 0.85; // dawn
  else if (isNight) dark = 0.85;
  dark = clamp(dark, 0, 0.92);
  scene.background = dayColor.clone().lerp(nightColor, dark);
  if (scene.fog) scene.fog.color.copy(scene.background);
  scene.fog.near = lerp(60, 30, dark);
  scene.fog.far = lerp(130, 90, dark);
  sunLight.intensity = lerp(1.0, 0.12, dark);
  ambLight.intensity = lerp(0.62, 0.22, dark);
  // night survived star
  if (prev < DAY_LEN && gameClock >= DAY_LEN) { /* entered night */ }
  if (prev >= DAY_LEN && gameClock < DAY_LEN && stars.night === 0) awardStar('night', '熬过了黑夜！You survived the night! 🌙', 15);
}

// ============================== 9. Stars, toast, HUD, minimap ==============================
var stats = { broke: 0, placed: 0, maxH: 0 };
var stars = { firstBreak: 0, firstPlace: 0, broke50: 0, place100: 0, height70: 0, cow: 0, night: 0, master: 0 };
var starTotal = 0;
function awardStar(key, text, pts) {
  if (stars[key]) return;
  stars[key] = 1;
  starTotal += pts;
  sfxStar();
  showToast(text + '  +' + pts + '⭐');
  updateHUD();
  save();
}
function starCheck() {
  if (stats.broke >= 1) awardStar('firstBreak', '挖到第一个方块！Broke your first block! ⛏', 10);
  if (stats.broke >= 50) awardStar('broke50', '挖掘大师在成长！50 blocks broken! ⛏', 20);
  if (stats.placed >= 1) awardStar('firstPlace', '放下了第一个方块！Builder mode! 🧱', 5);
  if (stats.placed >= 100) awardStar('place100', '小小建筑师！100 blocks placed! 🏗', 20);
  if (player.pos.y >= 70) awardStar('height70', '飞得好高！Sky high! 🚀', 15);
  if (stats.broke >= 50 && stats.placed >= 100) awardStar('master', '方块世界大师！MINEWORLD MASTER! 🏆', 50);
  // cow proximity
  for (var i = 0; i < animals.length; i++) {
    if (animals[i].g.position.distanceTo(player.pos) < 8) {
      awardStar('cow', '交到新朋友小牛！Made a cow friend! 🐮', 10);
      break;
    }
  }
}
var toastEl, toastTimer = 0;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.style.opacity = 0; }, 3200);
}
var topbarEl, starsEl, hotbarEl, minimap, mctx;
function buildHotbar() {
  hotbarEl.innerHTML = '';
  for (var i = 0; i < HOTBAR.length; i++) {
    var b = BLOCKS[HOTBAR[i]];
    var div = document.createElement('div');
    div.className = 'slot';
    div.dataset.i = i;
    var cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    var cctx = cv.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(atlasTex.image, b.tiles[0] * TILE, 0, TILE, TILE, 0, 0, 32, 32);
    div.appendChild(cv);
    var nm = document.createElement('div'); nm.className = 'name'; nm.textContent = b.nameZh;
    var ky = document.createElement('div'); ky.className = 'key';
    ky.textContent = (i < 9 ? i + 1 : '0');
    div.appendChild(nm); div.appendChild(ky);
    div.title = b.name + ' ' + b.nameZh;
    hotbarEl.appendChild(div);
  }
  updateHotbarSel();
}
var hotbarIdx = 0;
function updateHotbarSel() {
  var slots = hotbarEl.children;
  for (var i = 0; i < slots.length; i++) slots[i].className = 'slot' + (i === hotbarIdx ? ' active' : '');
}
var fps = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
function updateHUD() {
  var t = gameClock;
  var isNight = t >= DAY_LEN;
  var mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  topbarEl.innerHTML =
    '<div class="big">⛏ 方块世界 MineWorld</div>' +
    (isNight ? '🌙 夜晚 Night' : '☀️ 白天 Day') + '   ' + mm + ':' + (ss < 10 ? '0' : '') + ss +
    (player.fly ? '   ✈️ 飞行 Flying' : '') +
    '<br>X ' + player.pos.x.toFixed(0) + '  Y ' + player.pos.y.toFixed(0) + '  Z ' + player.pos.z.toFixed(0) +
    '<br>FPS ' + fps + '  ·  挖 ' + stats.broke + ' 放 ' + stats.placed;
  starsEl.textContent = '⭐ ' + starTotal;
}
function drawMinimap() {
  var S = 120, RES = 60, cell = S / RES;
  var pcx = Math.floor(player.pos.x), pcz = Math.floor(player.pos.z);
  var img = mctx.createImageData(S, S);
  for (var j = 0; j < RES; j++) for (var i = 0; i < RES; i++) {
    var wx = pcx - RES / 2 + i, wz = pcz - RES / 2 + j;
    var h = terrainHeight(wx, wz);
    var biome = biomeOf(wx, wz);
    var r, g, b;
    if (h < WATER_LEVEL) { r = 50; g = 120; b = 220; }
    else if (biome === 'beach') { r = 222; g = 208; b = 160; }
    else if (biome === 'snow') { r = 235; g = 240; b = 245; }
    else { var sh = clamp((h - 20) / 30, 0, 1); r = 90 - sh * 40; g = 175 - sh * 60; b = 66 - sh * 30; }
    var idx = (j * S + i) * 4;
    img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
  }
  mctx.putImageData(img, 0, 0);
  // player arrow
  mctx.fillStyle = '#ffd75e';
  mctx.save();
  mctx.translate(S / 2, S / 2);
  mctx.rotate(-player.yaw);
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill();
  mctx.restore();
  // cows
  mctx.fillStyle = '#fff';
  for (var a = 0; a < animals.length; a++) {
    var dx = (animals[a].g.position.x - pcx) * cell, dy = (animals[a].g.position.z - pcz) * cell;
    if (Math.abs(dx) < S / 2 && Math.abs(dy) < S / 2) mctx.fillRect(S / 2 + dx - 1.5, S / 2 + dy - 1.5, 3, 3);
  }
}

// ============================== 10. Sound ==============================
var AC = null, soundOn = true;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, slideTo) {
  if (!soundOn) return;
  var a = ac(); if (!a) return;
  var o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  g.gain.value = vol || 0.08;
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g); g.connect(a.destination);
  o.start(); o.stop(a.currentTime + dur);
}
function sfxBreak() { tone(140, 0.09, 'square', 0.1, 60); }
function sfxPlace() { tone(180, 0.07, 'square', 0.09, 240); }
function sfxJump() { tone(240, 0.1, 'sine', 0.06, 380); }
function sfxSplash() { tone(300, 0.18, 'sine', 0.07, 90); }
function sfxStar() {
  tone(660, 0.12, 'triangle', 0.1);
  setTimeout(function () { tone(880, 0.12, 'triangle', 0.1); }, 110);
  setTimeout(function () { tone(1320, 0.2, 'triangle', 0.1); }, 220);
}
function sfxClick() { tone(520, 0.05, 'triangle', 0.07); }

// ============================== Saves ==============================
var SAVE_KEY = 'mineworld-kids-v1';
function save() {
  try {
    var editsArr = [];
    for (var k in world.edits) editsArr.push(k + ':' + world.edits[k]);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      seed: world.seed, edits: editsArr, stars: stars, starTotal: starTotal,
      stats: stats, clock: gameClock,
      pos: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw, pitch: player.pitch
    }));
  } catch (e) {}
}
function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
function loadSave() {
  try {
    var d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d) return false;
    world.seed = d.seed | 0;
    world.edits = {};
    (d.edits || []).forEach(function (s) {
      var p = s.split(':'); world.edits[p[0]] = parseInt(p[1], 10);
    });
    stars = d.stars || stars; starTotal = d.starTotal || 0;
    stats = d.stats || stats; gameClock = (d.clock || 0) % CYCLE;
    world.chunks = {};
    spawnPlayer();
    if (d.pos) {
      var p = d.pos;
      // safety: make sure saved pos isn't inside solid
      var cand = new THREE.Vector3(p[0], p[1], p[2]);
      getChunk(Math.floor(cand.x / CHUNK), Math.floor(cand.z / CHUNK), true);
      if (!collides(cand.x, cand.y, cand.z)) player.pos.copy(cand);
    }
    player.yaw = d.yaw || 0; player.pitch = d.pitch || 0;
    return true;
  } catch (e) { return false; }
}
function newGame() {
  world.seed = (Math.random() * 1e9) | 0;
  world.edits = {};
  world.chunks = {};
  stars = { firstBreak:0, firstPlace:0, broke50:0, place100:0, height70:0, cow:0, night:0, master:0 };
  starTotal = 0; stats = { broke:0, placed:0, maxH:0 };
  gameClock = DAY_LEN * 0.25;
  spawnPlayer();
  placeAnimals();
  save();
}

// ============================== 11. Game state ==============================
var state = 'menu'; // menu | playing | pause
var overlay, pauseEl, helpEl, hudEl, loadingEl, canvas;
function setState(s) {
  state = s;
  overlay.classList.toggle('hidden', s !== 'menu');
  pauseEl.classList.toggle('hidden', s !== 'pause');
  hudEl.style.display = (s === 'menu') ? 'none' : 'block';
  hudEl.classList.remove('hidden');
  if (s === 'menu') {
    document.exitPointerLock && document.exitPointerLock();
    document.getElementById('btn-continue').style.display = hasSave() ? 'block' : 'none';
  }
  if (s === 'playing' && !touchEnabled) {
    try { canvas.requestPointerLock(); } catch (e) {}
  }
  sfxClick();
}

// ============================== 12. Boot & main loop ==============================
function initThree() {
  canvas = document.getElementById('game-canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.rotation.order = 'YXZ';
  window.camera = camera;
  window.resizeListener = function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', window.resizeListener);
  atlasTex = makeAtlas();
  buildMaterials();
  for (var id in BLOCKS) {
    BLOCKS[id].geo = makeBlockGeometry(BLOCKS[id].tiles);
  }
  setupSky();
  makeClouds();
  return renderer;
}

var renderer, lastT = 0;
function boot() {
  if (!window.THREE) {
    document.getElementById('loading-text').textContent = '错误：无法加载 three.js（离线？请检查 lib/three.min.js）';
    return;
  }
  try {
    renderer = initThree();
  } catch (e) {
    document.getElementById('loading-text').textContent = '错误：WebGL 初始化失败 ' + e.message;
    return;
  }
  // HUD refs
  topbarEl = document.getElementById('topbar');
  starsEl = document.getElementById('stars');
  toastEl = document.getElementById('toast');
  hotbarEl = document.getElementById('hotbar');
  minimap = document.createElement('canvas');
  minimap.width = 120; minimap.height = 120;
  minimap.style.cssText = 'position:absolute;top:130px;left:12px;image-rendering:pixelated;border:2px solid rgba(255,255,255,.3);border-radius:8px;';
  hudEl.appendChild(minimap);
  mctx = minimap.getContext('2d');
  buildHotbar();
  bindInput();
  bindButtons();
  newGame();
  updateHUD();
  drawMinimap();
  document.getElementById('loading').classList.add('hidden');
  window.__GAME = {
    state: function () { return state; },
    stats: function () { return { stars: starTotal, broke: stats.broke, placed: stats.placed,
      fps: fps, chunks: Object.keys(world.chunks).length, animals: animals.length,
      player: [player.pos.x, player.pos.y, player.pos.z], seed: world.seed, clock: gameClock,
      inWater: player.inWater, fly: player.fly }; },
    api: { save: save, newGame: newGame, loadSave: loadSave,
      setFly: function (v) { player.fly = v; },
      breakAt: function (x, y, z) { tryBreak(); },
      placeAt: function (x, y, z) { tryPlace(); },
      teleport: function (x, y, z) { player.pos.set(x, y, z); },
      look: function (yaw, pitch) { player.yaw = yaw; player.pitch = pitch; },
      screenshot: function () {
        var c = document.getElementById('game-canvas');
        return c.toDataURL('image/png');
      },
      diag: function () {
        var inst = 0, minP = null, meshCount = 0;
        scene.traverse(function (o) { if (o.isInstancedMesh) { inst++; meshCount++; } });
        var cam = window.camera;
        return { sceneChildren: scene.children.length, instanced: inst, meshCount: meshCount,
          cam: [cam.position.x, cam.position.y, cam.position.z],
          drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          fog: scene.fog ? [scene.fog.near, scene.fog.far] : null,
          chunks: Object.keys(world.chunks).length, hasRenderer: !!renderer };
      } }
  };
  requestAnimationFrame(loop);
}

var mmT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  var dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
  lastT = t;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  if (state === 'playing') {
    updatePlayer(dt);
    // continuous break/place
    breakTimer -= dt; placeTimer -= dt;
    if (mouseL && breakTimer <= 0) { tryBreak(); breakTimer = 0.32; }
    if (mouseR && placeTimer <= 0) { tryPlace(); placeTimer = 0.28; }
  }
  updateChunks();
  updateAnimals(state === 'playing' ? dt : dt);
  updateClouds(dt);
  updateParticles(dt);
  updateSky(dt);
  if (state !== 'menu') {
    var cam = window.camera;
    cam.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
    cam.rotation.set(player.pitch, player.yaw, 0);
    // underwater tint
    var fogCol = player.headInWater ? 0x1a4f9e : scene.background;
    if (player.headInWater) { scene.background = new THREE.Color(0x1a4f9e); scene.fog.color.set(0x1a4f9e); }
  }
  renderer.render(scene, window.camera);
  // HUD throttled
  fpsT += dt; mmT += dt;
  if (fpsT > 0.25) { fpsT = 0; updateHUD(); }
  if (mmT > 0.4) { mmT = 0; drawMinimap(); }
}

function bindInput() {
  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (state === 'playing') {
      if (e.code === 'KeyF') { player.fly = !player.fly; showToast(player.fly ? '✈️ 飞行开 Fly ON（空格↑ / Shift↓）' : '🚶 走路模式 Walk'); sfxClick(); }
      if (e.code === 'KeyR') { player.pos.copy(player.spawn); player.vel.set(0,0,0); showToast('🏠 回到出生点 Home'); }
      if (e.code === 'KeyE') setState(state === 'playing' ? 'pause' : 'pause');
      if (e.code.indexOf('Digit') === 0) {
        var d = parseInt(e.code.slice(5), 10);
        var idx = d === 0 ? 9 : d - 1;
        if (idx < HOTBAR.length) { hotbarIdx = idx; updateHotbarSel(); sfxClick(); }
      }
    }
    if (['Space', 'ArrowUp', 'ArrowDown'].indexOf(e.code) >= 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });

  canvas.addEventListener('click', function () {
    if (!touchEnabled && state === 'playing' && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch (e) {}
    }
  });
  document.addEventListener('pointerlockchange', function () {
    if (touchEnabled) return;
    if (state === 'playing' && document.pointerLockElement !== canvas) setState('pause');
    if (document.pointerLockElement === canvas && state === 'pause') setState('playing');
  });
  document.addEventListener('mousemove', function (e) {
    if (state === 'playing' && document.pointerLockElement === canvas) {
      player.yaw -= e.movementX * 0.0022;
      player.pitch -= e.movementY * 0.0022;
      player.pitch = clamp(player.pitch, -1.55, 1.55);
    }
  });
  canvas.addEventListener('mousedown', function (e) {
    if (state !== 'playing') return;
    if (e.button === 0) { mouseL = true; breakTimer = 0; }
    if (e.button === 2) { mouseR = true; placeTimer = 0; }
  });
  document.addEventListener('mouseup', function (e) {
    if (e.button === 0) mouseL = false;
    if (e.button === 2) mouseR = false;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  setupTouch();
  document.addEventListener('wheel', function (e) {
    if (state !== 'playing') return;
    hotbarIdx = (hotbarIdx + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
    updateHotbarSel();
  }, { passive: true });
  window.addEventListener('blur', function () { for (var k in keys) keys[k] = false; mouseL = mouseR = false; });
}

// ============================== 11b. Touch controls (iPad/tablet) ==============================
function setupTouch() {
  var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var isTouch = ('ontouchstart' in window) || (window.navigator.maxTouchPoints > 0) || isCoarse;
  if (!isTouch) return; // desktop keeps keyboard+mouse

  var hud = hudEl;
  // --- look overlay: drag anywhere to look around ---
  var look = document.createElement('div');
  look.id = 'touch-look';
  hud.appendChild(look);
  var lookId = null, lx = 0, ly = 0;
  look.addEventListener('pointerdown', function (e) {
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { look.setPointerCapture(e.pointerId); } catch (x) {}
  });
  look.addEventListener('pointermove', function (e) {
    if (lookId !== e.pointerId) return;
    var dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    player.yaw -= dx * 0.005;
    player.pitch = clamp(player.pitch - dy * 0.005, -1.55, 1.55);
  });
  function lookEnd(e) { if (lookId === e.pointerId) lookId = null; }
  look.addEventListener('pointerup', lookEnd);
  look.addEventListener('pointercancel', lookEnd);

  // --- movement joystick (bottom-left) ---
  var joy = document.createElement('div'); joy.id = 't-joy';
  var knob = document.createElement('div'); knob.id = 't-knob';
  joy.appendChild(knob);
  hud.appendChild(joy);
  var joyId = null, R = 52, C = 60;
  function joyCenter() { var b = joy.getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; }
  joy.addEventListener('pointerdown', function (e) {
    e.stopPropagation(); joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (x) {}
    joyMove(e);
  });
  function joyMove(e) {
    if (joyId !== e.pointerId) return;
    var c = joyCenter(), dx = e.clientX - c.cx, dy = e.clientY - c.cy;
    var d = Math.sqrt(dx * dx + dy * dy); if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = 'translate(' + (dx - C / 2 + 30) + 'px,' + (dy - C / 2 + 30) + 'px)';
    touchStick.r = dx / R; touchStick.f = -dy / R; touchStick.up = 0;
  }
  joy.addEventListener('pointermove', joyMove);
  function joyEnd(e) { if (joyId !== e.pointerId) return; joyId = null; knob.style.transform = 'translate(30px,30px)'; touchStick.f = touchStick.r = touchStick.up = 0; }
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

  // --- action buttons (bottom-right) ---
  function mkBtn(cls, label, z) {
    var b = document.createElement('button'); b.className = 'tbtn ' + cls; b.innerHTML = label;
    b.style.zIndex = z; hud.appendChild(b);
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); b.setPointerCapture && b.setPointerCapture(e.pointerId); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }
  var jb = mkBtn('t-jump', '⬆ 跳', 13); jb.style.touchAction = 'none';
  jb.addEventListener('pointerdown', function (e) { e.stopPropagation(); touchJumpHeld = true; });
  jb.addEventListener('pointerup', function () { touchJumpHeld = false; });
  jb.addEventListener('pointercancel', function () { touchJumpHeld = false; });

  var flb = mkBtn('t-fly', '✈ 飞', 13); flb.style.touchAction = 'none';
  flb.addEventListener('click', function (e) { e.stopPropagation(); player.fly = !player.fly; showToast(player.fly ? '✈️ 飞行开 Fly ON' : '🚶 走路 Walk'); sfxClick(); });

  var bb = mkBtn('t-break', '⛏ 挖', 13); bb.style.touchAction = 'none';
  bb.addEventListener('pointerdown', function (e) { e.stopPropagation(); mouseL = true; breakTimer = 0; });
  bb.addEventListener('pointerup', function () { mouseL = false; });
  bb.addEventListener('pointercancel', function () { mouseL = false; });

  var pb = mkBtn('t-place', '🧱 放', 13); pb.style.touchAction = 'none';
  pb.addEventListener('pointerdown', function (e) { e.stopPropagation(); mouseR = true; placeTimer = 0; });
  pb.addEventListener('pointerup', function () { mouseR = false; });
  pb.addEventListener('pointercancel', function () { mouseR = false; });

  // hotbar prev/next arrows (touch) + tap-to-select on slots
  var navL = mkBtn('t-hl', '◀', 13); navL.style.touchAction = 'none';
  navL.addEventListener('click', function (e) { e.stopPropagation(); hotbarIdx = (hotbarIdx - 1 + HOTBAR.length) % HOTBAR.length; updateHotbarSel(); sfxClick(); });
  var navR = mkBtn('t-hr', '▶', 13); navR.style.touchAction = 'none';
  navR.addEventListener('click', function (e) { e.stopPropagation(); hotbarIdx = (hotbarIdx + 1) % HOTBAR.length; updateHotbarSel(); sfxClick(); });
  // allow tapping existing hotbar slots on touch
  for (var i = 0; i < hotbarEl.children.length; i++) {
    (function (idx) {
      hotbarEl.children[idx].addEventListener('pointerdown', function (e) { e.stopPropagation(); hotbarIdx = idx; updateHotbarSel(); sfxClick(); });
    })(i);
  }

  document.body.classList.add('touch-mode');
  touchEnabled = true;
  showToast('📱 触屏模式 Touch controls ON：左摇杆移动 · 拖动看四周');
}

function bindButtons() {
  document.getElementById('btn-newgame').onclick = function () { newGame(); setState('playing'); };
  document.getElementById('btn-continue').onclick = function () { if (loadSave()) { placeAnimals(); setState('playing'); } };
  document.getElementById('btn-resume').onclick = function () { setState('playing'); };
  document.getElementById('btn-quit').onclick = function () { save(); setState('menu'); };
  document.getElementById('btn-help').onclick = function () {
    if (state === 'playing') document.exitPointerLock();
    helpEl.classList.remove('hidden');
  };
  document.getElementById('btn-help-close').onclick = function () { helpEl.classList.add('hidden'); if (state === 'playing' && !touchEnabled) try { canvas.requestPointerLock(); } catch (e) {} };
  document.getElementById('btn-save').onclick = function () { save(); showToast('💾 已保存 Saved!'); sfxStar(); };
  var newArm = 0;
  document.getElementById('btn-newmap').onclick = function () {
    var btn = document.getElementById('btn-newmap');
    if (Date.now() - newArm < 2500) {
      newGame(); newArm = 0; btn.textContent = '🗺 新地图';
      showToast('🗺 新地图！New world generated!');
    } else {
      newArm = Date.now(); btn.textContent = '确定？Sure?';
    }
  };
  var sndOn = true;
  document.getElementById('btn-sound').onclick = function () {
    soundOn = !soundOn;
    this.textContent = soundOn ? '🔊 声音' : '🔇 静音';
    if (soundOn) sfxClick();
  };
}

// wire up overlay/help/pause refs & start
function bootIfReady() {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startBoot);
  } else {
    startBoot();
  }
}
function startBoot() {
  overlay = document.getElementById('overlay');
  pauseEl = document.getElementById('pause');
  helpEl = document.getElementById('help');
  hudEl = document.getElementById('hud');
  loadingEl = document.getElementById('loading');
  try {
    boot();
  } catch (e) {
    window.__pageError = 'BOOT: ' + e.message + '\n' + (e.stack || '');
    document.getElementById('loading-text').textContent = '错误 ' + e.message;
  }
}
bootIfReady();
// expose for debug
window.__debug = { world: function () { return world; }, player: function () { return player; }, stars: function () { return stars; } };

})();