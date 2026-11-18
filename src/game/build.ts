import { Ground, Prop, idx, inBounds, type World } from '../world/generate';
import type { ItemId } from './items';
import type { Inventory } from './inventory';

/** Structures you can stand up on a tile. Ids match BLOCKING_BUILDS in world/generate.ts. */
export enum Build {
  None = 0,
  Wall = 1,
  Door = 2,
  Chest = 3,
  Bed = 4,
  Workbench = 5,
  Mill = 6,
  Spikes = 7,
  Torch = 8,
  Turret = 9,
  Quarry = 10,
}

export type BuildKind = 'floor' | 'wall' | 'door' | 'chest' | 'bed' | 'workbench' | 'mill' | 'spikes' | 'torch' | 'turret' | 'quarry';

export interface BuildDef {
  kind: BuildKind;
  name: string;
  cost: Partial<Record<ItemId, number>>;
  /** What it does, shown in the build bar. */
  blurb: string;
}

/** In build-bar order: keys 1-9, 0 and - pick them. */
export const BUILDABLES: BuildDef[] = [
  { kind: 'floor', name: 'Floor', cost: { wood: 1 }, blurb: 'Plank floor to walk on' },
  { kind: 'wall', name: 'Wall', cost: { wood: 2 }, blurb: 'A sturdy fence that keeps things out' },
  { kind: 'door', name: 'Door', cost: { wood: 2, fiber: 1 }, blurb: 'A gate in your fence you can walk through' },
  { kind: 'chest', name: 'Chest', cost: { wood: 4, stone: 1 }, blurb: 'Storage, shared with the camp stash' },
  { kind: 'bed', name: 'Bed', cost: { wood: 4, fiber: 4 }, blurb: 'Rest here; you wake here if you collapse' },
  { kind: 'workbench', name: 'Workbench', cost: { wood: 5, stone: 3 }, blurb: 'Crafts copper tools and a bigger pack' },
  { kind: 'mill', name: 'Mill', cost: { wood: 10, stone: 6, copper_ore: 2 }, blurb: 'Saws wood from nearby trees into a chest' },
  { kind: 'spikes', name: 'Spikes', cost: { wood: 2, stone: 2 }, blurb: 'Hurts and slows creatures that cross; you can walk over it' },
  { kind: 'torch', name: 'Torch', cost: { wood: 1, fiber: 1 }, blurb: 'Lights up the night around it' },
  { kind: 'turret', name: 'Turret', cost: { wood: 8, stone: 8 }, blurb: 'Shoots creatures in range; uses stone from storage as ammo' },
  { kind: 'quarry', name: 'Quarry', cost: { wood: 10, stone: 4, copper_ore: 2 }, blurb: 'Cuts stone from nearby rocks into a chest' },
];

/** Spike traps and turrets: the numbers behind your defenses. */
export const DEFENSE = {
  spikeDamage: 7,
  /** A creature on spikes is hurt this often, and moves at this fraction of its speed. */
  spikeEveryMs: 600,
  spikeSlow: 0.45,
  turretRange: 6,
  turretDamage: 12,
  turretEveryMs: 1000,
  /** Stone used per shot. */
  turretAmmo: 1,
  boltSpeed: 260,
  torchLight: 56,
};

export const BUILD_ID: Record<Exclude<BuildKind, 'floor'>, Build> = {
  wall: Build.Wall,
  door: Build.Door,
  chest: Build.Chest,
  bed: Build.Bed,
  workbench: Build.Workbench,
  mill: Build.Mill,
  spikes: Build.Spikes,
  torch: Build.Torch,
  turret: Build.Turret,
  quarry: Build.Quarry,
};

export const KIND_OF: Record<number, BuildKind> = {
  [Build.Wall]: 'wall',
  [Build.Door]: 'door',
  [Build.Chest]: 'chest',
  [Build.Bed]: 'bed',
  [Build.Workbench]: 'workbench',
  [Build.Mill]: 'mill',
  [Build.Spikes]: 'spikes',
  [Build.Torch]: 'torch',
  [Build.Turret]: 'turret',
  [Build.Quarry]: 'quarry',
};

/** Ground cover that building simply clears away. */
const CLEARABLE = new Set<Prop>([Prop.None, Prop.Flowers, Prop.TallGrass, Prop.Stump]);

/** How far from the player you can build, in tiles. */
export const BUILD_REACH = 5;

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

/**
 * Can `kind` go on tile (x, y)? `playerTiles` are the tiles the player's feet overlap,
 * so you can't wall yourself in place.
 */
export function canPlace(
  w: World,
  x: number,
  y: number,
  kind: BuildKind,
  playerTiles: Array<[number, number]>,
  campTiles: Set<number>,
): PlaceCheck {
  if (!inBounds(w, x, y)) return { ok: false, reason: 'Off the map' };
  const i = idx(w, x, y);
  if (w.ground[i] === Ground.Water) return { ok: false, reason: "Can't build on water" };
  if (campTiles.has(i)) return { ok: false, reason: 'The camp is in the way' };
  if (!CLEARABLE.has(w.prop[i] as Prop)) return { ok: false, reason: 'Clear it first' };
  if (kind === 'floor') {
    if (w.floor[i]) return { ok: false, reason: 'Already a floor here' };
    return { ok: true };
  }
  if (w.build[i] !== Build.None) return { ok: false, reason: 'Something is already built here' };
  if (kind !== 'door' && kind !== 'spikes' && playerTiles.some(([px, py]) => px === x && py === y))
    return { ok: false, reason: "You're standing there" };
  return { ok: true };
}

/** Spend `cost` from the pack first, then from storage. Returns false (spending nothing) if short. */
export function payCost(cost: Partial<Record<ItemId, number>>, pack: Inventory, storage: Inventory | null): boolean {
  for (const [id, n] of Object.entries(cost) as Array<[ItemId, number]>) {
    if (pack.count(id) + (storage?.count(id) ?? 0) < n) return false;
  }
  for (const [id, n] of Object.entries(cost) as Array<[ItemId, number]>) {
    const fromPack = pack.remove(id, n);
    if (fromPack < n) storage!.remove(id, n - fromPack);
  }
  return true;
}

/** Removing a structure gives back half its cost, rounded up. */
export function refundFor(kind: BuildKind): Array<[ItemId, number]> {
  const def = BUILDABLES.find((b) => b.kind === kind)!;
  return (Object.entries(def.cost) as Array<[ItemId, number]>).map(([id, n]) => [id, Math.ceil(n / 2)]);
}

/** 4-bit mask of which neighbours are walls or doors, for joining wall art (N=1, E=2, S=4, W=8). */
export function wallMask(w: World, x: number, y: number): number {
  const wallish = (xx: number, yy: number) =>
    inBounds(w, xx, yy) && (w.build[idx(w, xx, yy)] === Build.Wall || w.build[idx(w, xx, yy)] === Build.Door);
  return (wallish(x, y - 1) ? 1 : 0) | (wallish(x + 1, y) ? 2 : 0) | (wallish(x, y + 1) ? 4 : 0) | (wallish(x - 1, y) ? 8 : 0);
}
