import { FOREST, WORLD, ZONES, type ZoneId } from '../config';
import { fbm, hash2, mulberry32, valueNoise } from './rng';

/** What the ground is made of. Water blocks movement. */
export enum Ground {
  Grass = 0,
  Dirt = 1,
  Water = 2,
}

/** Something standing on a tile. Everything except Flowers, TallGrass and Mushroom blocks movement. */
export enum Prop {
  None = 0,
  Tree = 1,
  Rock = 2,
  OreRock = 3,
  BerryBush = 4,
  Log = 5,
  Mushroom = 6,
  Flowers = 7,
  TallGrass = 8,
  Camp = 9, // footprint of a camp object; the object itself is listed in `campObjects`
  Sticks = 10,
  Pebbles = 11,
  Stump = 12, // what's left after chopping a tree
  BareBush = 13, // a berry bush that's been picked; regrows
}

const BLOCKING = new Set<Prop>([Prop.Tree, Prop.Rock, Prop.OreRock, Prop.BerryBush, Prop.BareBush, Prop.Log, Prop.Camp]);

export type CampObjectKind = 'tent' | 'campfire' | 'bedroll' | 'stump' | 'sack' | 'lantern' | 'crate';

export interface CampObject {
  kind: CampObjectKind;
  /** Tile the object's bottom-left sits on. */
  tx: number;
  ty: number;
  /** Footprint in tiles that blocks movement (0 = walk-through). */
  w: number;
  h: number;
}

export interface World {
  width: number;
  height: number;
  seed: number;
  campX: number;
  campY: number;
  ground: Uint8Array;
  prop: Uint8Array;
  /** Per-tile random byte for picking art variants. */
  variant: Uint8Array;
  zone: Uint8Array;
  /** 0 at camp, 1 at the far corners: drives darkness and danger. */
  depth: Float32Array;
  campObjects: CampObject[];
  /** Tiles along each trail, in order from camp outward. */
  trails: Array<Array<[number, number]>>;
  /** Player-built structure on each tile (see game/build.ts); 0 = none. */
  build: Uint8Array;
  /** 1 where the player laid a floor. */
  floor: Uint8Array;
}

/** Structure ids that block movement. Kept here so collision has one source of truth. */
export const BLOCKING_BUILDS = new Set<number>([1, 3, 4, 5]);

export const isBlockingProp = (p: Prop) => BLOCKING.has(p);

export function idx(w: World, x: number, y: number) {
  return y * w.width + x;
}

export function inBounds(w: World, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

export function isBlocked(w: World, x: number, y: number) {
  if (!inBounds(w, x, y)) return true;
  const i = idx(w, x, y);
  return w.ground[i] === Ground.Water || BLOCKING.has(w.prop[i] as Prop) || BLOCKING_BUILDS.has(w.build[i]);
}

export function zoneAt(distance: number): ZoneId {
  for (const z of ZONES) if (distance < z.until) return z.id;
  return 3;
}

export function generateWorld(seed = WORLD.seed, width = WORLD.width, height = WORLD.height): World {
  const n = width * height;
  const world: World = {
    width,
    height,
    seed,
    campX: Math.floor(width / 2),
    campY: Math.floor(height / 2),
    ground: new Uint8Array(n),
    prop: new Uint8Array(n),
    variant: new Uint8Array(n),
    zone: new Uint8Array(n),
    depth: new Float32Array(n),
    campObjects: [],
    trails: [],
    build: new Uint8Array(n),
    floor: new Uint8Array(n),
  };
  const rand = mulberry32(seed);
  const { campX, campY } = world;
  const maxDist = Math.hypot(width / 2, height / 2);

  // 1. Zones and depth: distance from camp, with a wobble so edges aren't perfect circles.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = Math.hypot(x - campX, y - campY);
      const wobble = (valueNoise(x, y, 14, seed + 7) - 0.5) * 10;
      const zd = d + (d > 10 ? wobble : 0);
      world.zone[i] = zoneAt(zd);
      world.depth[i] = Math.min(1, Math.max(0, (zd - 6) / (maxDist - 6)));
      world.variant[i] = Math.floor(hash2(x, y, seed + 3) * 256);
    }
  }

  // 2. Ponds: low spots in a broad noise field, kept away from camp and out of the Deepwild core.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const z = world.zone[i];
      if (z === 0) continue;
      const wet = fbm(x, y, 18, seed + 31);
      if (wet < (z === 3 ? 0.17 : 0.2)) world.ground[i] = Ground.Water;
    }
  }

  // 3. Plants and stones. Thickets of near-solid trees, open glades with scattered ones between.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (world.ground[i] === Ground.Water) continue;
      const z = world.zone[i] as ZoneId;
      if (z === 0) continue;
      const forest = FOREST[z];
      const thicket = fbm(x, y, 10, seed + 57) > forest.thicket;
      const treeP = thicket ? 0.82 : forest.scatter;
      const r = hash2(x, y, seed + 91);
      if (r < treeP) {
        world.prop[i] = Prop.Tree;
        continue;
      }
      const r2 = hash2(x, y, seed + 113);
      const rocky = valueNoise(x, y, 9, seed + 71);
      if (r2 < 0.012 + rocky * 0.02) world.prop[i] = z >= 2 && r2 < 0.004 + z * 0.002 ? Prop.OreRock : Prop.Rock;
      else if (r2 < 0.05) world.prop[i] = z === 3 ? Prop.Mushroom : Prop.BerryBush;
      else if (r2 < 0.058) world.prop[i] = Prop.Log;
      else if (r2 < 0.1 && z === 3) world.prop[i] = Prop.Mushroom;
      else if (r2 < 0.075) world.prop[i] = Prop.Sticks;
      else if (r2 < 0.09) world.prop[i] = Prop.Pebbles;
      else if (r2 < 0.16 && z <= 2) world.prop[i] = z === 1 ? Prop.Flowers : Prop.TallGrass;
      else if (r2 < 0.24 && z <= 2) world.prop[i] = Prop.TallGrass;
    }
  }

  // 4. Trails: a few winding dirt paths from camp out to every side, so the map is always crossable.
  const trailCount = 5;
  const startAngle = rand() * Math.PI * 2;
  for (let t = 0; t < trailCount; t++) {
    const angle = startAngle + (t / trailCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    world.trails.push(carveTrail(world, angle, rand));
  }

  // 5. The day-one camp: tent, campfire, bedroll, a stump with an axe, supply sacks and a crate.
  buildCamp(world);

  // 6. Day-one supplies: a few sticks, pebbles and grass a short walk from camp.
  scatterStarterSupplies(world, rand);

  // 7. Open up pockets the trees sealed off, so every glade can be reached on foot; fill the rest.
  openSealedPockets(world);

  return world;
}

function scatterStarterSupplies(world: World, rand: () => number) {
  const want: Array<[Prop, number]> = [
    [Prop.Sticks, 7],
    [Prop.Pebbles, 6],
    [Prop.TallGrass, 6],
  ];
  for (const [prop, count] of want) {
    let placed = 0;
    for (let attempt = 0; attempt < 400 && placed < count; attempt++) {
      const a = rand() * Math.PI * 2;
      const r = 5 + rand() * 9;
      const x = Math.round(world.campX + Math.cos(a) * r);
      const y = Math.round(world.campY + Math.sin(a) * r);
      const i = idx(world, x, y);
      if (world.ground[i] !== Ground.Grass || world.prop[i] !== Prop.None) continue;
      world.prop[i] = prop;
      placed++;
    }
  }
}

/** Glowing mushrooms only grow in the Deepwild; they're a rare material, not food. */
export function isGlowcap(world: World, i: number) {
  return world.prop[i] === Prop.Mushroom && world.zone[i] === 3 && world.variant[i] % 3 !== 0;
}

/**
 * Repeatedly removes props (never camp objects) that sit between ground you can reach
 * from camp and open ground you can't, until nearly everything is connected.
 */
function openSealedPockets(world: World) {
  const { width, height } = world;
  for (let pass = 0; pass < 3; pass++) {
    const seen = reachableFromCamp(world);
    let changed = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const p = world.prop[i] as Prop;
        if (!isBlockingProp(p) || p === Prop.Camp || world.ground[i] === Ground.Water) continue;
        let touchesReached = false;
        let touchesPocket = false;
        for (const ni of [i - 1, i + 1, i - width, i + width]) {
          if (seen[ni]) touchesReached = true;
          else if (world.ground[ni] !== Ground.Water && !isBlockingProp(world.prop[ni] as Prop)) touchesPocket = true;
        }
        if (touchesReached && touchesPocket) {
          world.prop[i] = Prop.None;
          changed++;
        }
      }
    }
    if (changed === 0) break;
  }
  // Whatever is still sealed off is deep inside a thicket: grow it over.
  const seen = reachableFromCamp(world);
  for (let i = 0; i < width * height; i++) {
    if (seen[i] || world.ground[i] === Ground.Water || isBlockingProp(world.prop[i] as Prop)) continue;
    world.prop[i] = Prop.Tree;
  }
}

function carveTrail(world: World, angle: number, rand: () => number): Array<[number, number]> {
  const { width, campX, campY } = world;
  let x = campX + Math.cos(angle) * 4;
  let y = campY + Math.sin(angle) * 4;
  let heading = angle;
  const tiles: Array<[number, number]> = [];
  const seen = new Set<number>();
  for (let step = 0; step < 2000; step++) {
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (!inBounds(world, tx, ty)) break;
    const key = ty * width + tx;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push([tx, ty]);
    }
    // Wander, but keep pulling back toward the trail's overall direction.
    heading += (rand() - 0.5) * 0.5 + Math.sin(heading - angle) * -0.08;
    x += Math.cos(heading) * 0.7;
    y += Math.sin(heading) * 0.7;
  }
  for (const [tx, ty] of tiles) {
    // A 2x2 dirt brush keeps diagonal steps joined; clear blocking props one tile around it.
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!inBounds(world, nx, ny)) continue;
        const i = ny * width + nx;
        const core = dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1;
        if (core) {
          world.ground[i] = Ground.Dirt;
          world.prop[i] = Prop.None;
        } else {
          if (world.ground[i] === Ground.Water) world.ground[i] = Ground.Grass;
          if (isBlockingProp(world.prop[i] as Prop)) world.prop[i] = Prop.None;
        }
      }
    }
  }
  return tiles;
}

function buildCamp(world: World) {
  const { campX: cx, campY: cy } = world;
  // Clear a rough dirt patch around the fire.
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx * 0.85, dy);
      const i = idx(world, cx + dx, cy + dy);
      world.prop[i] = Prop.None;
      if (d < 2.6 || (d < 3.4 && hash2(cx + dx, cy + dy, world.seed + 5) < 0.5)) world.ground[i] = Ground.Dirt;
    }
  }
  const objs: CampObject[] = [
    { kind: 'tent', tx: cx - 4, ty: cy - 1, w: 3, h: 2 },
    { kind: 'campfire', tx: cx, ty: cy, w: 1, h: 1 },
    { kind: 'bedroll', tx: cx - 1, ty: cy + 2, w: 0, h: 0 },
    { kind: 'stump', tx: cx + 2, ty: cy - 1, w: 1, h: 1 },
    { kind: 'sack', tx: cx - 1, ty: cy - 2, w: 1, h: 1 },
    { kind: 'sack', tx: cx + 3, ty: cy - 2, w: 1, h: 1 },
    { kind: 'crate', tx: cx + 3, ty: cy + 2, w: 1, h: 1 },
    { kind: 'lantern', tx: cx - 1, ty: cy - 1, w: 0, h: 0 },
  ];
  for (const o of objs) {
    for (let dy = 0; dy < o.h; dy++) {
      for (let dx = 0; dx < o.w; dx++) world.prop[idx(world, o.tx + dx, o.ty - dy)] = Prop.Camp;
    }
  }
  world.campObjects = objs;
}

/** Breadth-first search over walkable tiles from camp. Returns a visited mask. */
export function reachableFromCamp(world: World): Uint8Array {
  const seen = new Uint8Array(world.width * world.height);
  // Start just below the campfire, which is always clear.
  const sx = world.campX;
  const sy = world.campY + 1;
  const queue: number[] = [idx(world, sx, sy)];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % world.width;
    const y = (i - x) / world.width;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (isBlocked(world, nx, ny)) continue;
      const ni = idx(world, nx, ny);
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}
