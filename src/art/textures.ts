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
  const tex = scene.textures.addCanvas('tiles', canvas)!;
  // Named frames for drawing single tiles outside a tilemap (the title screen).
  for (let v = 0; v < GRASS_VARIANTS; v++) tex.add(`grass_${v}`, 0, ...at(T_GRASS + v), TILE, TILE);
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

// --- player-built structures ---------------------------------------------

const PLANK = ['#b98a5a', '#9c6b43', '#d2a473', '#5a3a24'] as const;
const COPPER = ['#d9824a', '#b0612f', '#f2a66e', '#6e3418'] as const;

function floorTile(g: Ctx) {
  rect(g, 0, 0, 16, 16, PLANK[0]);
  for (let r = 0; r < 4; r++) {
    const y = r * 4;
    rect(g, 0, y + 3, 16, 1, PLANK[1]);
    rect(g, 0, y, 16, 1, PLANK[2]);
    const seam = (r * 7 + 3) % 16;
    rect(g, seam, y, 1, 3, PLANK[1]);
    px(g, (seam + 9) % 16, y + 1, PLANK[3]);
  }
}

/**
 * 16 x 26 log-wall piece: a 16px top face that joins with neighbouring walls (mask bits
 * N=1, E=2, S=4, W=8) and a 10px front face when nothing continues the wall below.
 */
function wallPiece(g: Ctx, mask: number) {
  // 16 x 26, anchored at the tile's bottom (the tile is rows 10-25). A thin post-and-rail fence:
  // a post in the middle of the tile, with rails running to each neighbouring fence or gate
  // (N=1, E=2, S=4, W=8).
  const rail = (x: number, w: number) => {
    for (const y of [11, 16]) {
      rect(g, x, y, w, 4, OUTLINE);
      rect(g, x, y + 1, w, 2, PLANK[0]);
      rect(g, x, y + 1, w, 1, PLANK[2]);
    }
  };
  // Runs going north or south are seen end-on: a narrow strip of rail tops.
  const strip = (y: number, h: number) => {
    rect(g, 6, y, 4, h, OUTLINE);
    rect(g, 7, y, 2, h, PLANK[0]);
    for (let yy = y + 1; yy < y + h; yy += 4) px(g, 7, yy, PLANK[2]);
  };
  shadow(g, 8, 24, 4, 1, 0.25);
  if (mask & 1) strip(0, 10);
  if (mask & 4) strip(22, 4);
  if (mask & 8) rail(0, 6);
  if (mask & 2) rail(10, 6);
  // The post, with a pointed cap.
  rect(g, 6, 8, 4, 16, OUTLINE);
  rect(g, 7, 9, 2, 14, WOOD[0]);
  rect(g, 7, 9, 1, 14, WOOD[2]);
  px(g, 7, 7, OUTLINE);
  px(g, 8, 7, OUTLINE);
}

function door(g: Ctx, open: boolean) {
  // 16 x 26: a fence gate between two posts at the tile's edges, so fence rails meet it.
  const post = (x: number) => {
    rect(g, x, 7, 4, 17, OUTLINE);
    rect(g, x + 1, 8, 2, 15, WOOD[0]);
    rect(g, x + 1, 8, 1, 15, WOOD[2]);
  };
  shadow(g, 8, 24, 7, 1, 0.22);
  if (open) {
    // The gate swung inward: just its edge shows beside the left post.
    rect(g, 3, 10, 3, 13, OUTLINE);
    rect(g, 4, 11, 1, 11, PLANK[0]);
  } else {
    // Pickets behind two rails.
    for (const x of [4, 9]) {
      rect(g, x, 8, 3, 15, OUTLINE);
      rect(g, x + 1, 9, 1, 13, PLANK[0]);
      px(g, x + 1, 9, PLANK[2]);
    }
    for (const y of [11, 17]) {
      rect(g, 3, y, 10, 3, OUTLINE);
      rect(g, 3, y + 1, 10, 1, PLANK[2]);
    }
    px(g, 10, 15, '#e0b13a');
  }
  post(0);
  post(12);
}

function chest(g: Ctx) {
  shadow(g, 8, 14, 7, 1.2, 0.25);
  rect(g, 1, 3, 14, 11, OUTLINE);
  rect(g, 2, 4, 12, 4, PLANK[2]);
  rect(g, 2, 8, 12, 5, PLANK[0]);
  rect(g, 2, 7, 12, 1, PLANK[3]);
  rect(g, 4, 4, 1, 9, WOOD[1]);
  rect(g, 11, 4, 1, 9, WOOD[1]);
  rect(g, 7, 6, 2, 3, '#e0b13a');
  px(g, 7, 6, '#fff0a0');
}

function bed(g: Ctx) {
  // 16 x 24, head at the top.
  shadow(g, 8, 22, 8, 1.5, 0.25);
  rect(g, 1, 1, 14, 22, OUTLINE);
  rect(g, 2, 2, 12, 20, WOOD[0]);
  rect(g, 3, 3, 10, 5, '#efe4cf');
  rect(g, 3, 3, 10, 1, '#ffffff');
  rect(g, 3, 9, 10, 12, '#c8553d');
  rect(g, 3, 9, 10, 2, '#e07a5a');
  for (let y = 13; y < 21; y += 4) rect(g, 3, y, 10, 1, '#a8442f');
}

function workbench(g: Ctx) {
  // 16 x 20 table with tools on top.
  shadow(g, 8, 18, 8, 1.5, 0.25);
  rect(g, 1, 4, 14, 8, OUTLINE);
  rect(g, 2, 5, 12, 6, PLANK[2]);
  rect(g, 2, 9, 12, 2, PLANK[1]);
  rect(g, 2, 12, 2, 6, OUTLINE);
  rect(g, 12, 12, 2, 6, OUTLINE);
  rect(g, 2, 12, 1, 6, WOOD[1]);
  rect(g, 12, 12, 1, 6, WOOD[1]);
  rect(g, 4, 14, 8, 1, WOOD[1]);
  // A saw and a hammer.
  rect(g, 4, 6, 5, 1, STONE[2]);
  rect(g, 4, 7, 5, 1, STONE[1]);
  rect(g, 9, 6, 2, 2, WOOD[1]);
  rect(g, 11, 5, 1, 4, WOOD[3]);
  rect(g, 10, 5, 3, 1, STONE[1]);
}

function lumberMill(g: Ctx, frame: number) {
  // 16 x 28: a plank shed with a shingled roof and a saw blade out front.
  shadow(g, 8, 26, 8, 1.6, 0.28);
  // Roof.
  for (let y = 0; y < 10; y++) {
    const half = Math.min(8, 2 + y);
    rect(g, 8 - half, 2 + y, half * 2, 1, OUTLINE);
    if (y > 0) rect(g, 9 - half, 2 + y, half * 2 - 2, 1, y % 3 === 0 ? '#7a3f2c' : '#9a5236');
  }
  rect(g, 7, 2, 2, 1, '#c06a45');
  // Walls.
  rect(g, 1, 12, 14, 14, OUTLINE);
  rect(g, 2, 12, 12, 13, PLANK[0]);
  for (let x = 4; x < 14; x += 3) rect(g, x, 12, 1, 13, PLANK[1]);
  rect(g, 2, 12, 12, 1, PLANK[3]);
  // Doorway with stacked planks inside.
  rect(g, 10, 18, 4, 7, PLANK[3]);
  rect(g, 10, 22, 4, 1, PLANK[2]);
  rect(g, 10, 24, 4, 1, PLANK[2]);
  // Saw blade on its housing.
  rect(g, 2, 23, 7, 2, WOOD[1]);
  const cx = 5.5;
  const cy = 19.5;
  for (let y = 15; y < 24; y++) {
    for (let x = 1; x < 10; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 3.2) px(g, x, y, d < 1.2 ? STONE[3] : STONE[2]);
      else if (d < 4.2) {
        const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx) + (frame * Math.PI) / 16;
        const tooth = ((a / (Math.PI / 4)) % 1 + 1) % 1 < 0.5;
        px(g, x, y, tooth ? STONE[1] : OUTLINE);
      }
    }
  }
  px(g, 5, 19, OUTLINE);
}

function quarry(g: Ctx, frame: number) {
  // 16 x 28: a timber A-frame over a stone block, with a drop hammer that rises and falls.
  shadow(g, 8, 26, 8, 1.6, 0.28);
  // Legs of the frame.
  for (let y = 0; y < 22; y++) {
    const off = Math.floor(y / 4);
    px(g, 6 - off, 3 + y, OUTLINE);
    px(g, 7 - off, 3 + y, WOOD[0]);
    px(g, 9 + off, 3 + y, WOOD[1]);
    px(g, 10 + off, 3 + y, OUTLINE);
  }
  rect(g, 4, 2, 8, 3, OUTLINE);
  rect(g, 5, 3, 6, 1, WOOD[2]);
  rect(g, 3, 13, 10, 2, OUTLINE);
  rect(g, 4, 13, 8, 1, WOOD[0]);
  // Stone block being cut, with chips around it.
  rect(g, 2, 20, 12, 7, OUTLINE);
  rect(g, 3, 21, 10, 5, STONE[0]);
  rect(g, 3, 21, 10, 1, STONE[2]);
  rect(g, 3, 25, 10, 1, STONE[1]);
  px(g, 6, 23, STONE[1]);
  px(g, 10, 22, STONE[1]);
  // Rope and hammer: up, falling, down (with dust), rising.
  const hy = [6, 10, 14, 10][frame];
  rect(g, 8, 4, 1, hy - 4, '#d9c08c');
  rect(g, 6, hy, 5, 4, OUTLINE);
  rect(g, 7, hy + 1, 3, 2, STONE[3]);
  px(g, 7, hy + 1, STONE[1]);
  if (frame === 2) {
    px(g, 1, 19, STONE[2]);
    px(g, 14, 18, STONE[2]);
    px(g, 2, 17, STONE[0]);
  }
}

function iconCopperAxe(g: Ctx) {
  for (let i = 0; i < 10; i++) {
    px(g, 3 + i, 13 - i, OUTLINE);
    px(g, 4 + i, 13 - i, WOOD[0]);
  }
  rect(g, 8, 1, 6, 6, OUTLINE);
  rect(g, 9, 2, 4, 4, COPPER[0]);
  rect(g, 9, 2, 4, 1, COPPER[2]);
  rect(g, 12, 3, 1, 3, COPPER[1]);
}

function iconCopperPick(g: Ctx) {
  for (let i = 0; i < 10; i++) {
    px(g, 7, 4 + i, OUTLINE);
    px(g, 8, 4 + i, WOOD[0]);
  }
  rect(g, 2, 2, 12, 3, OUTLINE);
  rect(g, 3, 3, 10, 1, COPPER[0]);
  rect(g, 1, 4, 2, 2, COPPER[1]);
  rect(g, 13, 4, 2, 2, COPPER[1]);
  rect(g, 7, 2, 3, 3, COPPER[3]);
}

function iconBasket(g: Ctx) {
  rect(g, 2, 6, 12, 8, OUTLINE);
  rect(g, 3, 7, 10, 6, '#c9a25a');
  for (let y = 7; y < 13; y += 2) rect(g, 3, y, 10, 1, '#a8873f');
  for (let x = 4; x < 13; x += 3) rect(g, x, 7, 1, 6, '#e0c27a');
  rect(g, 4, 2, 8, 1, OUTLINE);
  rect(g, 3, 3, 1, 3, OUTLINE);
  rect(g, 12, 3, 1, 3, OUTLINE);
}

// --- creatures -------------------------------------------------------------

const HOG = ['#7a5a3e', '#5e4430', '#9a7656', OUTLINE] as const;

/** 16 x 16 bristly boar with thorny back, facing right. */
function bramblehog(g: Ctx, frame: number) {
  shadow(g, 8, 14, 7, 1.2, 0.3);
  blob(g, [[7, 9, 5], [10, 9, 4.5], [5, 10, 4]], HOG, { seed: 21 });
  // Snout and tusk.
  rect(g, 13, 9, 3, 3, OUTLINE);
  rect(g, 13, 10, 2, 1, '#c99a7a');
  px(g, 14, 12, '#efe3cf');
  px(g, 11, 8, OUTLINE);
  // Thorns along the back.
  for (const [x, y] of [[4, 4], [6, 3], [8, 3], [10, 4]]) {
    px(g, x, y, '#6a8a3a');
    px(g, x, y + 1, '#4a6a2a');
  }
  // Legs, alternating.
  const a = frame === 0 ? 0 : 1;
  rect(g, 4 + a, 13, 2, 2, OUTLINE);
  rect(g, 10 - a, 13, 2, 2, OUTLINE);
}

/** 20 x 16 lean shadowy prowler with glowing eyes, facing right. */
function duskprowler(g: Ctx, frame: number) {
  const P = ['#3a3f5c', '#2a2e45', '#545a7e', '#14162a'] as const;
  shadow(g, 10, 14, 9, 1.2, 0.35);
  blob(g, [[8, 9, 4], [12, 9, 4], [5, 9, 3]], P, { seed: 31 });
  // Head and ears.
  blob(g, [[16, 7, 3.2]], P, { seed: 32 });
  px(g, 15, 3, P[3]);
  px(g, 17, 3, P[3]);
  px(g, 15, 4, P[1]);
  px(g, 17, 4, P[1]);
  px(g, 17, 6, '#ffe36a');
  px(g, 15, 6, '#ffe36a');
  // Tail.
  rect(g, 0, 7, 3, 1, P[3]);
  px(g, 1, 6, P[1]);
  const a = frame === 0 ? 0 : 1;
  rect(g, 5 + a, 12, 1, 3, P[3]);
  rect(g, 8 - a, 12, 1, 3, P[3]);
  rect(g, 12 + a, 12, 1, 3, P[3]);
  rect(g, 15 - a, 12, 1, 3, P[3]);
}

function lostPack(g: Ctx) {
  shadow(g, 8, 14, 6, 1.2, 0.3);
  blob(g, [[8, 10, 5], [8, 6, 3]], ['#8a5a36', '#6b4428', '#a87448', OUTLINE]);
  rect(g, 5, 8, 6, 1, '#5a3a24');
  rect(g, 7, 2, 2, 2, '#e0b13a');
}

/** 16 x 16 swing arc, drawn for a swing to the right; rotated for other directions. */
// --- classes ------------------------------------------------------------

function arrowShot(g: Ctx) {
  // 10 x 3, pointing right: fletching, shaft, stone tip.
  sprite(g, 0, 0, ['ff......t.', '.fsssssstt', 'ff......t.'], { f: '#e8dcc0', s: WOOD[2], t: STONE[2] });
}

function firebolt(g: Ctx) {
  // 9 x 7, pointing right: a hot core trailing flame.
  sprite(
    g,
    0,
    0,
    ['...aa....', '.aabbaa..', 'aabbccbb.', '.abbcccbb', 'aabbccbb.', '.aabbaa..', '...aa....'],
    { a: FIRE[0], b: FIRE[1], c: FIRE[2] },
  );
}

function burstRing(g: Ctx) {
  // 24 x 24 ring of embers; scaled up as the firebolt bursts.
  for (let a = 0; a < 360; a += 15) {
    const r = (a * Math.PI) / 180;
    const x = Math.round(12 + Math.cos(r) * 10);
    const y = Math.round(12 + Math.sin(r) * 10);
    px(g, x, y, FIRE[a % 30 === 0 ? 2 : 1]);
    px(g, Math.round(12 + Math.cos(r) * 8), Math.round(12 + Math.sin(r) * 8), 'rgba(242,140,40,0.5)');
  }
}

/** 16 x 16 class badges for the class picker. */
function classFighter(g: Ctx) {
  // A round wooden shield behind a crossed axe.
  sprite(
    g,
    0,
    0,
    [
      '................',
      '.....oooooo.....',
      '...oowwwwwwoo...',
      '..owwwwddwwwwo..',
      '..owwwwddwwwwo..',
      '.owwwwwddwwwwwo.',
      '.odddddmmdddddo.',
      '.odddddmmdddddo.',
      '.owwwwwddwwwwwo.',
      '..owwwwddwwwwo..',
      '..owwwwddwwwwo..',
      '...oowwddwwoo...',
      '.....oooooo.....',
      '................',
      '................',
      '................',
    ],
    { o: OUTLINE, w: WOOD[0], d: WOOD[1], m: STONE[2] },
  );
  sprite(g, 6, 3, ['..sss', '.sSSs', 'sSSso', '.hso.', '.h...', 'h....', 'h....', 'h....', 'h....', 'h....', 'h....', 'h....'], {
    s: STONE[3],
    S: STONE[2],
    o: OUTLINE,
    h: WOOD[2],
  });
}

function classArcher(g: Ctx) {
  // A drawn bow and an arrow on the string.
  sprite(
    g,
    0,
    0,
    [
      '..........bb....',
      '........bb..s...',
      '.......b....s...',
      '......b.....s...',
      '.....b......s...',
      '....b...t...s...',
      '...b...ttt..s...',
      '..b...f.a...s...',
      '..b...f.a...s...',
      '..b.....a...s...',
      '...b....a...s...',
      '....b...a...s...',
      '.....b..a...s...',
      '......b.a..s....',
      '.......bff.s....',
      '........bbs.....',
    ],
    { b: WOOD[1], s: '#e8dcc0', a: WOOD[2], t: STONE[2], f: '#e8dcc0' },
  );
}

function classMage(g: Ctx) {
  // A crooked staff with a flame on top.
  sprite(
    g,
    0,
    0,
    [
      '.......a........',
      '......aba.......',
      '.....abcba......',
      '.....abccba.....',
      '......bccb......',
      '.......bb.......',
      '.......ww.......',
      '......w.ww......',
      '.......ww.......',
      '.......w........',
      '.......w........',
      '........w.......',
      '........w.......',
      '.......w........',
      '.......w........',
      '.......w........',
    ],
    { a: FIRE[0], b: FIRE[1], c: FIRE[2], w: WOOD[1] },
  );
}

function handcart(g: Ctx) {
  // 14 x 10: a little wooden handcart with one big wheel and a pull handle, facing right.
  sprite(
    g,
    0,
    0,
    [
      '..............',
      'oooooooooo....',
      'owwwwwwwwo....',
      'oWWWWWWWWoohhh',
      'owwwwwwwwo....',
      'oooooooooo....',
      '...ooooo......',
      '..osSsSso.....',
      '..oSsosSo.....',
      '...ooooo......',
    ],
    { o: OUTLINE, w: WOOD[0], W: WOOD[2], h: WOOD[1], s: STONE[1], S: STONE[3] },
  );
}

function slash(g: Ctx) {
  for (let a = -60; a <= 60; a += 6) {
    const r = (a * Math.PI) / 180;
    const x = Math.round(4 + Math.cos(r) * 9);
    const y = Math.round(8 + Math.sin(r) * 7);
    px(g, x, y, '#fff6dc');
    px(g, x - 1, y, 'rgba(255,246,220,0.5)');
  }
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

function spikes(g: Ctx) {
  // 16 x 16: sharpened stakes poking out of a low wooden frame, flat on the ground.
  rect(g, 1, 9, 14, 5, OUTLINE);
  rect(g, 2, 10, 12, 3, WOOD[1]);
  rect(g, 2, 10, 12, 1, WOOD[2]);
  for (const x of [2, 6, 10]) {
    rect(g, x + 1, 4, 2, 6, OUTLINE);
    px(g, x + 1, 5, STONE[2]);
    rect(g, x + 1, 6, 1, 4, STONE[0]);
    px(g, x + 2, 3, OUTLINE);
    px(g, x + 2, 4, STONE[2]);
  }
  for (const x of [4, 8, 12]) {
    rect(g, x, 7, 1, 3, OUTLINE);
    px(g, x, 6, STONE[1]);
  }
}

function torch(g: Ctx, frame: number) {
  // 8 x 18: a staked torch with a flickering flame.
  shadow(g, 4, 17, 3, 1, 0.25);
  rect(g, 3, 6, 2, 12, OUTLINE);
  rect(g, 3, 7, 1, 10, WOOD[0]);
  rect(g, 2, 5, 4, 2, WOOD[3]);
  const h = frame === 0 ? 0 : 1;
  rect(g, 2, 1 + h, 4, 4 - h, FIRE[0]);
  rect(g, 3, 2 + h, 2, 3 - h, FIRE[1]);
  px(g, 3 + frame, 3, FIRE[2]);
  if (frame === 0) px(g, 4, 0, FIRE[1]);
}

function turret(g: Ctx, flash: boolean) {
  // 16 x 22: a stone plinth with a wooden crossbow on top.
  shadow(g, 8, 21, 7, 1.4, 0.3);
  rect(g, 2, 11, 12, 10, OUTLINE);
  rect(g, 3, 12, 10, 8, STONE[0]);
  rect(g, 3, 12, 10, 2, STONE[2]);
  rect(g, 3, 18, 10, 2, STONE[1]);
  px(g, 5, 15, STONE[1]);
  px(g, 10, 16, STONE[1]);
  // Swivel and bow.
  rect(g, 6, 8, 4, 4, OUTLINE);
  rect(g, 7, 9, 2, 2, WOOD[1]);
  rect(g, 1, 4, 14, 3, OUTLINE);
  rect(g, 2, 5, 12, 1, WOOD[2]);
  rect(g, 7, 1, 2, 9, OUTLINE);
  rect(g, 7, 2, 1, 7, WOOD[0]);
  px(g, 2, 6, OUTLINE);
  px(g, 13, 6, OUTLINE);
  rect(g, 3, 6, 10, 1, '#efe4cf');
  px(g, 7, 1, flash ? FIRE[2] : STONE[2]);
  px(g, 8, 1, flash ? FIRE[1] : STONE[0]);
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

// Three-quarter views for moving diagonally: face turned to the right, or back turned to the right.
const HEAD_DOWNRIGHT = [
  '....oooo....',
  '..ooHHHHoo..',
  '.oHHHHHHHHo.',
  '.ohHHsssssso',
  '.ohHsessseso',
  '.ohhssssssso',
  '..ohssssssoo',
];
const BODY_DOWNRIGHT = ['..okcCCcco..', '.okkcCCccco.', 'oskkcCCcccso', 'oskcccccccso'];
const HEAD_UPRIGHT = [
  '....oooo....',
  '..ooHHHHoo..',
  '.oHHHHHHHHo.',
  '.ohHHHHHHHso',
  '.ohHHHHHHsso',
  '.ohhHHHHhso.',
  '..ohhhhhhoo.',
];
const BODY_UPRIGHT = ['..okkkcCco..', '.okkkkkcCco.', 'oskKKkkcccso', 'osckkkkcccso'];
const LEGS_DIAG_A = ['.oppppppppo.', '.opppoopppo.', '..obbo.oppo.', '..oooo.obbo.', '........oooo'];
const LEGS_DIAG_B = ['.oppppppppo.', '.opppoopppo.', '.oppo..obbo.', '.obbo...ooo.', '.oooo.......'];

const PLAYER_PAL = { ...PLAYER_COLORS, k: '#8a5a36', K: '#a87448' };

/** Directions in frame order. Left reuses the right-facing frames, flipped. */
export const PLAYER_DIRS = ['down', 'up', 'right', 'downright', 'upright'] as const;

function playerFrame(g: Ctx, dir: (typeof PLAYER_DIRS)[number], step: number) {
  const bob = step % 2 === 1 ? 1 : 0;
  const ox = 2;
  shadow(g, 8, 15, 5, 1, 0.3);
  const diagonal = dir === 'downright' || dir === 'upright';
  const legs =
    dir === 'right'
      ? [LEGS_SIDE_STAND, LEGS_SIDE_A, LEGS_SIDE_STAND, LEGS_SIDE_B][step]
      : diagonal
        ? [LEGS_STAND, LEGS_DIAG_A, LEGS_STAND, LEGS_DIAG_B][step]
        : [LEGS_STAND, LEGS_A, LEGS_STAND, LEGS_B][step];
  const head = { down: HEAD_DOWN, up: HEAD_UP, right: HEAD_SIDE, downright: HEAD_DOWNRIGHT, upright: HEAD_UPRIGHT }[dir];
  const body = { down: BODY_DOWN, up: BODY_UP, right: BODY_SIDE, downright: BODY_DOWNRIGHT, upright: BODY_UPRIGHT }[dir];
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

  const atlas = new Atlas(1024);
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
  atlas.add('floor', 16, 16, floorTile);
  for (let f = 0; f < 2; f++) atlas.add(`bramblehog_${f}`, 16, 16, (g) => bramblehog(g, f));
  for (let f = 0; f < 2; f++) atlas.add(`duskprowler_${f}`, 20, 16, (g) => duskprowler(g, f));
  atlas.add('lost_pack', 16, 16, lostPack);
  atlas.add('slash', 16, 16, slash);
  atlas.add('cart', 14, 10, handcart);
  atlas.add('arrow', 10, 3, arrowShot);
  atlas.add('firebolt', 9, 7, firebolt);
  atlas.add('burst', 24, 24, burstRing);
  atlas.add('class_fighter', 16, 16, classFighter);
  atlas.add('class_archer', 16, 16, classArcher);
  atlas.add('class_mage', 16, 16, classMage);
  for (let m = 0; m < 16; m++) atlas.add(`wall_${m}`, 16, 26, (g) => wallPiece(g, m));
  atlas.add('door', 16, 26, (g) => door(g, false));
  atlas.add('door_open', 16, 26, (g) => door(g, true));
  atlas.add('chest', 16, 16, chest);
  atlas.add('bed', 16, 24, bed);
  atlas.add('workbench', 16, 20, workbench);
  atlas.add('mill', 16, 28, (g) => lumberMill(g, 0));
  atlas.add('quarry', 16, 28, (g) => quarry(g, 0));
  for (let f = 1; f < 4; f++) atlas.add(`quarry_${f}`, 16, 28, (g) => quarry(g, f));
  atlas.add('spikes', 16, 16, spikes);
  atlas.add('torch', 8, 18, (g) => torch(g, 0));
  atlas.add('torch_1', 8, 18, (g) => torch(g, 1));
  atlas.add('turret', 16, 22, (g) => turret(g, false));
  atlas.add('turret_fire', 16, 22, (g) => turret(g, true));
  atlas.add('bolt', 4, 2, (g) => {
    rect(g, 0, 0, 4, 2, OUTLINE);
    rect(g, 1, 0, 3, 1, STONE[2]);
  });
  for (let f = 1; f < 4; f++) atlas.add(`mill_${f}`, 16, 28, (g) => lumberMill(g, f));
  atlas.add('item_copper_axe', 16, 16, iconCopperAxe);
  atlas.add('item_copper_pick', 16, 16, iconCopperPick);
  atlas.add('item_woven_basket', 16, 16, iconBasket);
  atlas.add('eyes', 4, 1, eyes);
  atlas.add('glow', 96, 96, (g) => glow(g, 96));

  const tex = scene.textures.addCanvas('atlas', atlas.canvas)!;
  for (const f of atlas.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
}
