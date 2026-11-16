// Paints the tileset and the sprite atlas at boot. Everything is original pixel art,
// drawn in code from the palette, so there are no image assets to license or load.

import Phaser from 'phaser';
import { TILE } from '../config';
import {
  BERRY,
  BURLAP,
  CANVAS,
  DIRT,
  EYES,
  FIRE,
  FLOWERS,
  GLOW_SHROOM,
  GRASS,
  LEAVES,
  ORE,
  OUTLINE,
  PLAYER_COLORS,
  STONE,
  WATER,
  WOOD,
  type Shades,
} from './palette';
import { blob, makeCanvas, px, rect, shadow, sprite, type Ctx } from './pixels';
import { hash2 } from '../world/rng';

// ---------------------------------------------------------------------------
// Tileset
// ---------------------------------------------------------------------------

export const TILESET_COLS = 16;
export const T_GRASS = 0; // 0..7 grass variants
export const T_DIRT = 16; // 16..31 dirt, autotiled by which sides touch grass
export const T_WATER = 32; // 32..47 water, autotiled by which sides touch land
export const T_BLOCK = 48; // invisible collision tile
export const GRASS_VARIANTS = 8;

/** Side bits for autotiling: set when that neighbour is a different ground. */
export const N = 1,
  E = 2,
  S = 4,
  W = 8;

function grassTile(g: Ctx, ox: number, oy: number, v: number) {
  rect(g, ox, oy, TILE, TILE, GRASS[0]);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(hash2(i, v, 11) * TILE);
    const y = Math.floor(hash2(i, v, 12) * TILE);
    px(g, ox + x, oy + y, hash2(i, v, 13) < 0.55 ? GRASS[1] : GRASS[2]);
  }
  // Little grass tufts on some variants.
  const tufts = v >= 4 ? 3 : 1;
  for (let i = 0; i < tufts; i++) {
    const x = 1 + Math.floor(hash2(i, v, 14) * 13);
    const y = 3 + Math.floor(hash2(i, v, 15) * 11);
    px(g, ox + x, oy + y, GRASS[2]);
    px(g, ox + x + 1, oy + y - 1, GRASS[2]);
    px(g, ox + x, oy + y + 1, GRASS[1]);
    px(g, ox + x + 2, oy + y, GRASS[1]);
  }
}

function dirtTile(g: Ctx, ox: number, oy: number, mask: number) {
  rect(g, ox, oy, TILE, TILE, DIRT[0]);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash2(i, mask, 21) * TILE);
    const y = Math.floor(hash2(i, mask, 22) * TILE);
    const r = hash2(i, mask, 23);
    px(g, ox + x, oy + y, r < 0.5 ? DIRT[1] : r < 0.85 ? DIRT[2] : DIRT[3]);
  }
  // Pebbles.
  for (let i = 0; i < 2; i++) {
    const x = 2 + Math.floor(hash2(i, mask, 24) * 11);
    const y = 2 + Math.floor(hash2(i, mask, 25) * 11);
    px(g, ox + x, oy + y, STONE[2]);
    px(g, ox + x + 1, oy + y, STONE[1]);
  }
  // Ragged grass edges where the path meets the meadow. Depth depends only on the
  // position along the edge, so neighbouring tiles line up.
  const depth = (k: number, side: number) => 1 + Math.floor(hash2(k, side, 26) * 3);
  for (let k = 0; k < TILE; k++) {
    if (mask & N) for (let d = 0; d < depth(k, 1); d++) px(g, ox + k, oy + d, GRASS[d === 0 ? 0 : 1]);
    if (mask & S) for (let d = 0; d < depth(k, 3); d++) px(g, ox + k, oy + TILE - 1 - d, GRASS[d === 0 ? 0 : 2]);
    if (mask & W) for (let d = 0; d < depth(k, 4); d++) px(g, ox + d, oy + k, GRASS[d === 0 ? 0 : 1]);
    if (mask & E) for (let d = 0; d < depth(k, 2); d++) px(g, ox + TILE - 1 - d, oy + k, GRASS[d === 0 ? 0 : 2]);
  }
}

function waterTile(g: Ctx, ox: number, oy: number, mask: number) {
  rect(g, ox, oy, TILE, TILE, WATER[0]);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(hash2(i, mask, 31) * TILE);
    const y = Math.floor(hash2(i, mask, 32) * TILE);
    px(g, ox + x, oy + y, WATER[1]);
  }
  // Ripple glints.
  for (let i = 0; i < 2; i++) {
    const x = 2 + Math.floor(hash2(i, mask, 33) * 9);
    const y = 3 + Math.floor(hash2(i, mask, 34) * 10);
    rect(g, ox + x, oy + y, 3, 1, WATER[2]);
  }
  // Banks: a lip of grass, a dark waterline, then a pale foam line.
  const bank = [GRASS[0], GRASS[3], WATER[3], WATER[2]];
  for (let d = 0; d < bank.length; d++) {
    const c = bank[d];
    if (mask & N) rect(g, ox, oy + d, TILE, 1, c);
    if (mask & S) rect(g, ox, oy + TILE - 1 - d, TILE, 1, c);
    if (mask & W) rect(g, ox + d, oy, 1, TILE, c);
    if (mask & E) rect(g, ox + TILE - 1 - d, oy, 1, TILE, c);
  }
}

function buildTileset(scene: Phaser.Scene) {
  const [canvas, g] = makeCanvas(TILESET_COLS * TILE, 4 * TILE);
  const at = (i: number): [number, number] => [(i % TILESET_COLS) * TILE, Math.floor(i / TILESET_COLS) * TILE];
  for (let v = 0; v < GRASS_VARIANTS; v++) grassTile(g, ...at(T_GRASS + v), v);
  for (let m = 0; m < 16; m++) dirtTile(g, ...at(T_DIRT + m), m);
  for (let m = 0; m < 16; m++) waterTile(g, ...at(T_WATER + m), m);
  scene.textures.addCanvas('tiles', canvas);
}

// ---------------------------------------------------------------------------
// Sprite atlas
// ---------------------------------------------------------------------------

class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly g: Ctx;
  private x = 0;
  private y = 0;
  private rowH = 0;
  readonly frames: Array<{ name: string; x: number; y: number; w: number; h: number }> = [];

  constructor(readonly size: number) {
    [this.canvas, this.g] = makeCanvas(size, size);
  }

  /** Reserve a w x h cell, draw into it with local coordinates, and name the frame. */
  add(name: string, w: number, h: number, draw: (g: Ctx) => void) {
    if (this.x + w > this.size) {
      this.x = 0;
      this.y += this.rowH + 1;
      this.rowH = 0;
    }
    const fx = this.x;
    const fy = this.y;
    this.g.save();
    this.g.translate(fx, fy);
    this.g.beginPath();
    this.g.rect(0, 0, w, h);
    this.g.clip();
    draw(this.g);
    this.g.restore();
    this.frames.push({ name, x: fx, y: fy, w, h });
    this.x += w + 1;
    this.rowH = Math.max(this.rowH, h);
  }
}

function roundTree(g: Ctx, pal: Shades, seed: number, blossom: boolean) {
  // 32 x 40, foot at the bottom centre.
  shadow(g, 16, 37, 11, 2);
  for (let j = 0; j < 12; j++) {
    const y = 37 - j;
    px(g, 13, y, OUTLINE);
    px(g, 14, y, WOOD[2]);
    px(g, 15, y, WOOD[0]);
    px(g, 16, y, WOOD[0]);
    px(g, 17, y, WOOD[1]);
    px(g, 18, y, OUTLINE);
  }
  px(g, 12, 37, OUTLINE);
  px(g, 19, 37, OUTLINE);
  const r = 9.5 + hash2(seed, 1, 2) * 1.2;
  const cy = 15;
  blob(
    g,
    [
      [16 - r * 0.55, cy + r * 0.25, r * 0.68],
      [16 + r * 0.55, cy + r * 0.25, r * 0.68],
      [16, cy - r * 0.3, r * 0.82],
    ],
    pal,
    { seed, dots: blossom ? ['#f6b3c8', 0.06] : undefined },
  );
}

function pineTree(g: Ctx, pal: Shades, seed: number) {
  // 32 x 44 dark conifer for the Deepwild.
  shadow(g, 16, 41, 10, 2);
  rect(g, 14, 33, 4, 9, OUTLINE);
  rect(g, 15, 33, 2, 8, WOOD[1]);
  const tiers = 4;
  for (let t = 0; t < tiers; t++) {
    const top = 2 + t * 8;
    const bottom = top + 13;
    const half = 5 + t * 2.6 + hash2(seed, t, 3) * 1.2;
    const circles: Array<[number, number, number]> = [];
    for (let y = top; y <= bottom; y += 2) {
      const w = ((y - top) / (bottom - top)) * half;
      circles.push([16, y, Math.max(1.5, w * 0.62)]);
      circles.push([16 - w * 0.45, y, Math.max(1.2, w * 0.5)]);
      circles.push([16 + w * 0.45, y, Math.max(1.2, w * 0.5)]);
    }
    blob(g, circles, pal, { seed: seed + t });
  }
}

function rock(g: Ctx, ore: boolean, seed: number) {
  // 16 x 16.
  shadow(g, 8, 14, 7, 1.5, 0.25);
  blob(
    g,
    [
      [5.5, 9.5, 4.5],
      [10, 9, 4.6],
      [8, 7, 4],
    ],
    STONE,
    { seed },
  );
  if (ore) {
    for (let i = 0; i < 5; i++) {
      const x = 4 + Math.floor(hash2(i, seed, 7) * 8);
      const y = 5 + Math.floor(hash2(i, seed, 8) * 6);
      px(g, x, y, ORE[0]);
      px(g, x + 1, y, ORE[1]);
    }
  }
}

function berryBush(g: Ctx, seed: number) {
  shadow(g, 8, 14, 7, 1.5, 0.25);
  blob(
    g,
    [
      [5, 10, 4.6],
      [11, 10, 4.6],
      [8, 7, 4.8],
    ],
    LEAVES.meadow[0],
    { seed },
  );
  for (let i = 0; i < 6; i++) {
    const x = 3 + Math.floor(hash2(i, seed, 4) * 10);
    const y = 4 + Math.floor(hash2(i, seed, 5) * 8);
    px(g, x, y, BERRY);
    if (i % 2 === 0) px(g, x, y - 1, '#f5a0a6');
  }
}

function fallenLog(g: Ctx) {
  shadow(g, 8, 14, 8, 1.5, 0.25);
  rect(g, 0, 7, 16, 1, OUTLINE);
  rect(g, 0, 14, 16, 1, OUTLINE);
  rect(g, 0, 8, 16, 1, WOOD[2]);
  rect(g, 0, 9, 16, 3, WOOD[0]);
  rect(g, 0, 12, 16, 2, WOOD[1]);
  rect(g, 15, 7, 1, 8, OUTLINE);
  rect(g, 0, 7, 1, 8, OUTLINE);
  rect(g, 1, 8, 3, 6, '#d9b07a');
  px(g, 2, 10, '#a77b4b');
  px(g, 2, 11, '#a77b4b');
  px(g, 9, 7, GRASS[0]);
  px(g, 10, 6, GRASS[2]);
}

function mushroom(g: Ctx, glow: boolean) {
  const cap = glow ? GLOW_SHROOM[0] : '#cf4a3c';
  const capD = glow ? GLOW_SHROOM[1] : '#9a3226';
  const one = (x: number, y: number, s: number) => {
    rect(g, x, y - 3 * s, 2, 3 * s, '#efe3cf');
    rect(g, x - 2, y - 3 * s - 2, 6, 2, cap);
    rect(g, x - 1, y - 3 * s - 3, 4, 1, cap);
    rect(g, x - 2, y - 3 * s - 1, 6, 1, capD);
    px(g, x, y - 3 * s - 2, '#ffffff');
  };
  one(6, 14, 1);
  one(11, 13, 1);
}

function flowers(g: Ctx, seed: number) {
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(hash2(i, seed, 9) * 12);
    const y = 3 + Math.floor(hash2(i, seed, 10) * 10);
    const c = FLOWERS[Math.floor(hash2(i, seed, 11) * FLOWERS.length)];
    px(g, x, y + 1, GRASS[3]);
    px(g, x, y, c);
    px(g, x - 1, y, c);
    px(g, x + 1, y, c);
    px(g, x, y - 1, c);
    px(g, x, y, '#f4e27a');
  }
}

function tallGrass(g: Ctx, seed: number) {
  for (let i = 0; i < 7; i++) {
    const x = 1 + Math.floor(hash2(i, seed, 12) * 14);
    const h = 3 + Math.floor(hash2(i, seed, 13) * 4);
    for (let j = 0; j < h; j++) px(g, x + (j > h - 2 ? 1 : 0), 14 - j, j < 2 ? GRASS[3] : j < h - 1 ? GRASS[1] : GRASS[2]);
  }
}

function sticksOnGround(g: Ctx, seed: number) {
  const stick = (x: number, y: number, len: number, dir: number) => {
    for (let i = 0; i < len; i++) {
      const yy = y + Math.round(i * dir * 0.5);
      px(g, x + i, yy + 1, OUTLINE);
      px(g, x + i, yy, i % 3 === 0 ? WOOD[2] : WOOD[0]);
    }
  };
  stick(3, 9 + (seed % 2), 9, 0.4);
  stick(5, 12, 8, -0.5);
  px(g, 8, 10, GRASS[3]);
}

function pebbles(g: Ctx) {
  const p = (x: number, y: number, w: number) => {
    rect(g, x, y + 1, w, 2, STONE[3]);
    rect(g, x, y, w, 2, STONE[0]);
    px(g, x, y, STONE[2]);
  };
  p(4, 9, 3);
  p(9, 11, 3);
  p(7, 6, 2);
}

function choppedStump(g: Ctx) {
  shadow(g, 8, 14, 6, 1.5, 0.25);
  rect(g, 3, 9, 10, 5, OUTLINE);
  rect(g, 4, 10, 8, 4, WOOD[1]);
  rect(g, 4, 10, 2, 4, WOOD[0]);
  rect(g, 3, 6, 10, 4, OUTLINE);
  rect(g, 4, 7, 8, 2, '#d9b07a');
  px(g, 7, 7, '#a77b4b');
  px(g, 8, 8, '#a77b4b');
}

function bareBush(g: Ctx) {
  shadow(g, 8, 14, 7, 1.5, 0.25);
  blob(
    g,
    [
      [5, 10, 4.6],
      [11, 10, 4.6],
      [8, 7, 4.8],
    ],
    LEAVES.woods[1],
    { seed: 9 },
  );
}

// --- item icons -----------------------------------------------------------

function iconAxe(g: Ctx) {
  for (let i = 0; i < 10; i++) {
    px(g, 3 + i, 13 - i, OUTLINE);
    px(g, 4 + i, 13 - i, WOOD[0]);
  }
  rect(g, 8, 1, 6, 6, OUTLINE);
  rect(g, 9, 2, 4, 4, STONE[0]);
  rect(g, 9, 2, 4, 1, STONE[2]);
  rect(g, 12, 3, 1, 3, STONE[1]);
  rect(g, 9, 5, 2, 1, '#7a6a52');
}

function iconPick(g: Ctx) {
  for (let i = 0; i < 10; i++) {
    px(g, 7, 4 + i, OUTLINE);
    px(g, 8, 4 + i, WOOD[0]);
  }
  rect(g, 2, 2, 12, 3, OUTLINE);
  rect(g, 3, 3, 10, 1, STONE[0]);
  rect(g, 1, 4, 2, 2, STONE[1]);
  rect(g, 13, 4, 2, 2, STONE[1]);
  rect(g, 7, 2, 3, 3, '#7a6a52');
}

function iconWood(g: Ctx) {
  rect(g, 1, 4, 12, 5, OUTLINE);
  rect(g, 2, 5, 10, 3, WOOD[0]);
  rect(g, 2, 5, 10, 1, WOOD[2]);
  rect(g, 1, 4, 4, 5, OUTLINE);
  rect(g, 2, 5, 2, 3, '#d9b07a');
  rect(g, 3, 9, 12, 5, OUTLINE);
  rect(g, 4, 10, 10, 3, WOOD[1]);
  rect(g, 3, 9, 4, 5, OUTLINE);
  rect(g, 4, 10, 2, 3, '#d9b07a');
}

function iconStone(g: Ctx) {
  blob(g, [[8, 9, 5], [6, 8, 4]], STONE, { seed: 4 });
}

function iconOre(g: Ctx) {
  blob(g, [[8, 9, 5], [6, 8, 4]], STONE, { seed: 5 });
  px(g, 6, 7, ORE[0]);
  px(g, 7, 7, ORE[1]);
  px(g, 9, 10, ORE[0]);
  px(g, 10, 10, ORE[1]);
  px(g, 5, 10, ORE[0]);
}

function iconFiber(g: Ctx) {
  for (let i = 0; i < 5; i++) for (let j = 0; j < 11; j++) px(g, 3 + i * 2 + (j > 8 ? 1 : 0), 2 + j, i % 2 ? GRASS[0] : GRASS[2]);
  rect(g, 3, 7, 10, 2, '#a8873f');
}

function iconBerries(g: Ctx) {
  const b = (x: number, y: number) => {
    rect(g, x, y, 3, 3, BERRY);
    px(g, x, y, '#f5a0a6');
    px(g, x + 2, y + 2, '#b8333e');
  };
  b(4, 7);
  b(8, 8);
  b(6, 10);
  rect(g, 6, 3, 4, 2, LEAVES.meadow[0][0]);
  px(g, 7, 5, LEAVES.meadow[0][3]);
}

function iconMushroom(g: Ctx, glowy: boolean) {
  const cap = glowy ? GLOW_SHROOM[0] : '#cf4a3c';
  const capD = glowy ? GLOW_SHROOM[1] : '#9a3226';
  rect(g, 6, 8, 4, 6, '#efe3cf');
  rect(g, 2, 4, 12, 4, OUTLINE);
  rect(g, 3, 3, 10, 4, cap);
  rect(g, 3, 6, 10, 1, capD);
  rect(g, 5, 2, 6, 1, cap);
  px(g, 5, 4, '#ffffff');
  px(g, 9, 3, '#ffffff');
}

function targetCorners(g: Ctx) {
  // 18 x 18 bracket drawn around the tile you're about to use.
  const c = '#fff6dc';
  const L = 4;
  rect(g, 0, 0, L, 1, c);
  rect(g, 0, 0, 1, L, c);
  rect(g, 18 - L, 0, L, 1, c);
  rect(g, 17, 0, 1, L, c);
  rect(g, 0, 17, L, 1, c);
  rect(g, 0, 18 - L, 1, L, c);
  rect(g, 18 - L, 17, L, 1, c);
  rect(g, 17, 18 - L, 1, L, c);
}

// --- camp ---------------------------------------------------------------

function tent(g: Ctx) {
  // 56 x 44. Patched canvas A-frame with an open flap and guy ropes.
  const ax = 28,
    ay = 6,
    by = 40,
    hw = 22;
  shadow(g, 28, 41, 26, 2.5, 0.3);
  for (let i = 0; i <= 10; i++) {
    px(g, ax - 14 - i, ay + 18 + i * 2, '#7a6a52');
    px(g, ax + 14 + i, ay + 18 + i * 2, '#7a6a52');
  }
  rect(g, 1, 39, 2, 3, WOOD[1]);
  rect(g, 53, 39, 2, 3, WOOD[1]);
  rect(g, ax - 1, ay - 5, 2, 6, WOOD[1]);
  for (let y = ay; y <= by; y++) {
    const w = Math.round(((y - ay) / (by - ay)) * hw);
    for (let x = ax - w; x <= ax + w; x++) {
      const edge = x === ax - w || x === ax + w || y === by;
      let c = edge ? CANVAS[3] : x < ax ? (x < ax - w + 3 ? CANVAS[2] : CANVAS[0]) : CANVAS[1];
      if (!edge && (x === ax || x === ax - 1)) c = OUTLINE;
      px(g, x, y, c);
    }
  }
  for (let y = ay + 15; y < by; y++) {
    const w = Math.round(((y - ay - 15) / (by - ay - 15)) * 8);
    rect(g, ax - w, y, w * 2 + 1, 1, '#3b2a1e');
  }
  for (let y = ay + 21; y < by; y++) {
    const w = Math.round(((y - ay - 21) / (by - ay - 21)) * 5);
    rect(g, ax + 8 - w, y, w + 1, 1, CANVAS[2]);
    px(g, ax + 8 - w - 1, y, OUTLINE);
  }
  rect(g, ax - 15, ay + 26, 5, 4, '#8a9a6a');
  px(g, ax - 14, ay + 27, '#5e6b48');
  px(g, ax - 12, ay + 28, '#5e6b48');
}

function bedroll(g: Ctx) {
  // 28 x 14
  shadow(g, 14, 12, 13, 1.5, 0.25);
  rect(g, 1, 1, 26, 11, OUTLINE);
  rect(g, 2, 2, 24, 9, '#4f6f9a');
  rect(g, 2, 2, 24, 1, '#6f8fbb');
  rect(g, 8, 2, 1, 9, '#3d5a80');
  rect(g, 14, 2, 1, 9, '#3d5a80');
  rect(g, 20, 3, 5, 7, '#d9cbb0');
  rect(g, 20, 3, 5, 1, '#efe4cf');
}

function stump(g: Ctx) {
  // 16 x 22 with an axe stuck in the top.
  const x = 8,
    y = 20;
  shadow(g, 8, 20, 7, 1.5, 0.25);
  rect(g, x - 7, y - 5, 14, 5, OUTLINE);
  rect(g, x - 6, y - 5, 12, 4, WOOD[1]);
  rect(g, x - 6, y - 5, 3, 4, WOOD[0]);
  rect(g, x - 7, y - 11, 14, 7, OUTLINE);
  rect(g, x - 6, y - 10, 12, 5, '#d9b07a');
  rect(g, x - 3, y - 9, 6, 3, '#c49565');
  rect(g, x - 1, y - 8, 2, 1, '#a77b4b');
  for (let i = 0; i < 7; i++) px(g, x + 1 + i, y - 11 - i, '#8a5a36');
  rect(g, x - 2, y - 13, 4, 3, STONE[0]);
  rect(g, x - 2, y - 13, 4, 1, '#d6dadd');
}

function sack(g: Ctx) {
  shadow(g, 8, 14, 5, 1.2, 0.25);
  blob(
    g,
    [
      [8, 10, 4.6],
      [8, 6, 3],
    ],
    BURLAP,
  );
  rect(g, 6, 3, 4, 1, '#6b4f2e');
  px(g, 7, 2, BURLAP[2]);
}

function crate(g: Ctx) {
  shadow(g, 8, 14, 7, 1.2, 0.25);
  rect(g, 1, 3, 14, 11, OUTLINE);
  rect(g, 2, 4, 12, 9, WOOD[0]);
  rect(g, 2, 4, 12, 1, WOOD[2]);
  rect(g, 2, 8, 12, 1, WOOD[1]);
  for (let i = 0; i < 9; i++) px(g, 3 + i, 12 - i, WOOD[1]);
  rect(g, 2, 12, 12, 1, WOOD[1]);
}

function lantern(g: Ctx) {
  // 8 x 16: a pole with a hanging lantern.
  rect(g, 3, 2, 1, 14, WOOD[1]);
  rect(g, 3, 2, 4, 1, WOOD[1]);
  rect(g, 5, 3, 1, 1, OUTLINE);
  rect(g, 4, 4, 3, 4, OUTLINE);
  rect(g, 5, 5, 1, 2, FIRE[2]);
}

function campfire(g: Ctx, frame: number) {
  // 16 x 16. Ring of stones, crossed logs, flickering flames.
  const cx = 8,
    cy = 12;
  shadow(g, 8, 14, 8, 1.5, 0.3);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rect(g, Math.round(cx + Math.cos(a) * 6) - 1, Math.round(cy + Math.sin(a) * 2.5), 3, 2, i % 2 ? STONE[1] : STONE[0]);
  }
  for (let i = -4; i <= 4; i++) {
    rect(g, cx + i, cy - 1 + (i >> 2), 1, 2, WOOD[1]);
    rect(g, cx + i, cy - 1 - (i >> 2), 1, 2, WOOD[0]);
  }
  for (let dx = -3; dx <= 3; dx++) {
    const h = Math.max(1, Math.round(7 - Math.abs(dx) * 1.6 + hash2(dx, frame, 77) * 3));
    for (let j = 0; j < h; j++) {
      const c = j >= h - 1 ? FIRE[0] : Math.abs(dx) <= 1 && j < h - 2 ? FIRE[2] : FIRE[1];
      px(g, cx + dx, cy - 2 - j, c);
    }
  }
  if (frame % 2 === 0) px(g, cx - 2 + frame, cy - 11, '#ffd27a');
}

// --- player -------------------------------------------------------------

const HEAD_DOWN = [
  '....oooo....',
  '..ooHHHHoo..',
  '.oHHHHHHhho.',
  '.ohHssssshho',
  '.ohsesssesho',
  '.ohssssssho.',
  '..ossssssoo.',
];
const BODY_DOWN = ['..occCCcco..', '.occcCCccco.', 'oscccCCcccso', 'osccccccccso'];
const HEAD_UP = [
  '....oooo....',
  '..ooHHHHoo..',
  '.oHHHHHHHho.',
  '.ohHHHHHHhho',
  '.ohHHHHHHhho',
  '.ohhHHHHhho.',
  '..ohhhhhhoo.',
];
const BODY_UP = ['..okcCCcko..', '.okkkkkkkko.', 'oskKKkkkkkso', 'osckkkkkkcso'];
const LEGS_STAND = ['.oppppppppo.', '.opppoopppo.', '.oppo..oppo.', '.obbo..obbo.', '.oooo..oooo.'];
const LEGS_A = ['.oppppppppo.', '.opppoopppo.', '.obbo..oppo.', '.oooo..obbo.', '.......oooo.'];
const LEGS_B = ['.oppppppppo.', '.opppoopppo.', '.oppo..obbo.', '.obbo..oooo.', '.oooo.......'];

const HEAD_SIDE = [
  '...ooooo....',
  '..oHHHHHoo..',
  '.oHHHHHHHHo.',
  '.ohHHHHssso.',
  '.ohHHHssseo.',
  '.ohhHHsssso.',
  '..ohhsssso..',
];
const BODY_SIDE = ['...okcCCo...', '..okkcCCco..', '..okkcCCsso.', '..okkcccso..'];
const LEGS_SIDE_STAND = ['...oppppo...', '...oppppo...', '...oppppo...', '...obbbbo...', '...oooooo...'];
const LEGS_SIDE_A = ['...oppppo...', '..opppoppo..', '.oppo..oppo.', '.obbo..obbbo', '.oooo..ooooo'];
const LEGS_SIDE_B = ['...oppppo...', '...oppppo...', '..oppppo....', '..obbbbo....', '..oooooo....'];

const PLAYER_PAL = { ...PLAYER_COLORS, k: '#8a5a36', K: '#a87448' };

/** Directions in frame order. Left reuses the right-facing frames, flipped. */
export const PLAYER_DIRS = ['down', 'up', 'right'] as const;

function playerFrame(g: Ctx, dir: (typeof PLAYER_DIRS)[number], step: number) {
  const bob = step % 2 === 1 ? 1 : 0;
  const ox = 2;
  shadow(g, 8, 15, 5, 1, 0.3);
  const legs =
    dir === 'right'
      ? [LEGS_SIDE_STAND, LEGS_SIDE_A, LEGS_SIDE_STAND, LEGS_SIDE_B][step]
      : [LEGS_STAND, LEGS_A, LEGS_STAND, LEGS_B][step];
  const head = dir === 'down' ? HEAD_DOWN : dir === 'up' ? HEAD_UP : HEAD_SIDE;
  const body = dir === 'down' ? BODY_DOWN : dir === 'up' ? BODY_UP : BODY_SIDE;
  sprite(g, ox, 11, legs, PLAYER_PAL);
  sprite(g, ox, 7 - bob, body, PLAYER_PAL);
  sprite(g, ox, 0 - bob, head, PLAYER_PAL);
  if (dir === 'down') {
    // Backpack straps peeking over the shoulders.
    px(g, ox + 2, 7 - bob, PLAYER_PAL.k);
    px(g, ox + 9, 7 - bob, PLAYER_PAL.k);
  }
}

// --- effects ------------------------------------------------------------

function glow(g: Ctx, size: number) {
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,170,80,0.9)');
  grad.addColorStop(0.45, 'rgba(255,140,50,0.35)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
}

function eyes(g: Ctx) {
  px(g, 0, 0, EYES);
  px(g, 3, 0, EYES);
}

// ---------------------------------------------------------------------------

export const TREE_FRAMES = {
  meadow: ['tree_meadow_0', 'tree_meadow_1', 'tree_meadow_2'],
  woods: ['tree_woods_0', 'tree_woods_1'],
  deep: ['tree_deep_0', 'tree_deep_1'],
};

/** Build every texture the game uses. Call once, from the boot scene. */
export function buildTextures(scene: Phaser.Scene) {
  buildTileset(scene);

  const atlas = new Atlas(512);
  atlas.add('tree_meadow_0', 32, 40, (g) => roundTree(g, LEAVES.meadow[0], 1, false));
  atlas.add('tree_meadow_1', 32, 40, (g) => roundTree(g, LEAVES.meadow[1], 2, true));
  atlas.add('tree_meadow_2', 32, 40, (g) => roundTree(g, LEAVES.meadow[0], 3, true));
  atlas.add('tree_woods_0', 32, 40, (g) => roundTree(g, LEAVES.woods[0], 4, false));
  atlas.add('tree_woods_1', 32, 40, (g) => roundTree(g, LEAVES.woods[1], 5, false));
  atlas.add('tree_deep_0', 32, 44, (g) => pineTree(g, LEAVES.deep[0], 6));
  atlas.add('tree_deep_1', 32, 44, (g) => pineTree(g, LEAVES.deep[1], 7));
  atlas.add('rock', 16, 16, (g) => rock(g, false, 1));
  atlas.add('ore_rock', 16, 16, (g) => rock(g, true, 2));
  atlas.add('berry_bush', 16, 16, (g) => berryBush(g, 3));
  atlas.add('log', 16, 16, (g) => fallenLog(g));
  atlas.add('mushroom', 16, 16, (g) => mushroom(g, false));
  atlas.add('mushroom_glow', 16, 16, (g) => mushroom(g, true));
  atlas.add('flowers_0', 16, 16, (g) => flowers(g, 1));
  atlas.add('flowers_1', 16, 16, (g) => flowers(g, 2));
  atlas.add('tallgrass_0', 16, 16, (g) => tallGrass(g, 1));
  atlas.add('tallgrass_1', 16, 16, (g) => tallGrass(g, 2));
  atlas.add('tent', 56, 44, tent);
  atlas.add('bedroll', 28, 14, bedroll);
  atlas.add('stump', 16, 22, stump);
  atlas.add('sack', 16, 16, sack);
  atlas.add('crate', 16, 16, crate);
  atlas.add('lantern', 8, 16, lantern);
  for (let f = 0; f < 4; f++) atlas.add(`campfire_${f}`, 16, 16, (g) => campfire(g, f));
  for (const dir of PLAYER_DIRS) for (let s = 0; s < 4; s++) atlas.add(`player_${dir}_${s}`, 16, 16, (g) => playerFrame(g, dir, s));
  atlas.add('sticks_0', 16, 16, (g) => sticksOnGround(g, 0));
  atlas.add('sticks_1', 16, 16, (g) => sticksOnGround(g, 1));
  atlas.add('pebbles', 16, 16, pebbles);
  atlas.add('stump_cut', 16, 16, choppedStump);
  atlas.add('bare_bush', 16, 16, bareBush);
  atlas.add('item_stone_axe', 16, 16, iconAxe);
  atlas.add('item_stone_pick', 16, 16, iconPick);
  atlas.add('item_wood', 16, 16, iconWood);
  atlas.add('item_stone', 16, 16, iconStone);
  atlas.add('item_copper_ore', 16, 16, iconOre);
  atlas.add('item_fiber', 16, 16, iconFiber);
  atlas.add('item_berries', 16, 16, iconBerries);
  atlas.add('item_mushroom', 16, 16, (g) => iconMushroom(g, false));
  atlas.add('item_glowcap', 16, 16, (g) => iconMushroom(g, true));
  atlas.add('item_stick', 16, 16, (g) => sticksOnGround(g, 0));
  atlas.add('target', 18, 18, targetCorners);
  atlas.add('eyes', 4, 1, eyes);
  atlas.add('glow', 96, 96, (g) => glow(g, 96));

  const tex = scene.textures.addCanvas('atlas', atlas.canvas)!;
  for (const f of atlas.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
}
