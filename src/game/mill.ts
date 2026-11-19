// Producers: buildings that work while you're away. The lumber mill saws wood from the standing
// trees around it; the quarry cuts stone from the rocks around it. Neither uses up its trees or
// rocks. What they make piles up in their hopper, and a pack mule hauls full loads home
// along open ground to the nearest storage: the camp, or any chest.

import { Prop, idx, inBounds, isBlocked, type World } from '../world/generate';
import { Build } from './build';
import type { ItemId } from './items';

export interface ProducerDef {
  name: string;
  /** The prop it works from, and what it makes. */
  source: Prop;
  sourceName: [one: string, many: string];
  item: ItemId;
  itemName: string;
  /** Sources within this many tiles (in every direction) count. */
  radius: number;
  /** More sources than this don't make it any faster. */
  maxSources: number;
  /** With one source it takes this long to make one item; each extra source shares the work. */
  msPerItemOneSource: number;
  /** It stops when its hopper holds this many items and the mule hasn't taken them yet. */
  hopper: number;
  /** It stops when storage holds this much of its item. */
  cap: number;
}

export const MILL: ProducerDef = {
  name: 'Lumber mill',
  source: Prop.Tree,
  sourceName: ['tree', 'trees'],
  item: 'wood',
  itemName: 'wood',
  radius: 3,
  maxSources: 6,
  msPerItemOneSource: 48_000,
  hopper: 20,
  cap: 150,
};

export const QUARRY: ProducerDef = {
  name: 'Quarry',
  source: Prop.Rock,
  sourceName: ['rock', 'rocks'],
  item: 'stone',
  itemName: 'stone',
  radius: 3,
  maxSources: 4,
  msPerItemOneSource: 60_000,
  hopper: 20,
  cap: 200,
};

export interface MillState {
  /** Milliseconds of work towards the next item. */
  work: number;
  /** Items made since it was built. */
  made: number;
  /** Items waiting in its hopper for the mule (missing in older saves). */
  held?: number;
}

/** A pack mule carries this many items per trip, at this speed in pixels a second. */
export const MULE = { load: 10, speed: 42 };

/** Distance from the campfire, in tiles, that counts as delivered to camp. */
const CAMP_DROP = 3;

export type MillStatus =
  | { ok: true; sources: number; msPerItem: number }
  | { ok: false; reason: 'no-source' | 'hopper-full' | 'full'; sources: number };

/** The tiles of the sources (trees for a mill, rocks for a quarry) a producer at tile (x, y) works from. */
export function sourceTilesNear(w: World, x: number, y: number, def: ProducerDef = MILL): Array<[number, number]> {
  const tiles: Array<[number, number]> = [];
  const r = def.radius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(w, x + dx, y + dy) && w.prop[idx(w, x + dx, y + dy)] === def.source) tiles.push([x + dx, y + dy]);
    }
  }
  return tiles;
}

/** How many sources are around tile (x, y). */
export function sourcesNear(w: World, x: number, y: number, def: ProducerDef = MILL): number {
  return sourceTilesNear(w, x, y, def).length;
}

/** What placing a producer at (x, y) would give: "4 rocks in range · +4 stone/min", or a warning. */
export function placementHint(sources: number, def: ProducerDef = MILL): string {
  const [one, many] = def.sourceName;
  if (sources === 0) return `No ${many} in range: it won't make anything here`;
  const n = sources >= def.maxSources ? `${sources} ${many} in range (full speed)` : `${sources} ${sources === 1 ? one : many} in range`;
  return `${n} · +${rateLabel(60_000 / msPerItem(sources, def))} ${def.itemName}/min`;
}

export const treesNear = (w: World, x: number, y: number) => sourcesNear(w, x, y, MILL);

export function msPerItem(sources: number, def: ProducerDef = MILL): number {
  return def.msPerItemOneSource / Math.min(sources, def.maxSources);
}

/** `stored` is how much of its item is in storage; `held` is what's already in its hopper. */
export function millStatus(w: World, x: number, y: number, stored: number, def: ProducerDef = MILL, held = 0): MillStatus {
  const sources = sourcesNear(w, x, y, def);
  if (sources === 0) return { ok: false, reason: 'no-source', sources };
  if (stored + held >= def.cap) return { ok: false, reason: 'full', sources };
  if (held >= def.hopper) return { ok: false, reason: 'hopper-full', sources };
  return { ok: true, sources, msPerItem: msPerItem(sources, def) };
}

/**
 * Advances a producer by `dt` ms, dropping what it makes into its hopper (never past the hopper
 * or the storage cap). Returns how much it made. `hopper` overrides the hopper size, for time
 * away when the mule kept emptying it.
 */
export function tickMill(m: MillState, status: MillStatus, dt: number, stored: number, def: ProducerDef = MILL, hopper = def.hopper): number {
  if (!status.ok) {
    m.work = 0;
    return 0;
  }
  const held = m.held ?? 0;
  m.work += dt;
  let made = Math.floor(m.work / status.msPerItem);
  m.work -= made * status.msPerItem;
  made = Math.max(0, Math.min(made, def.cap - stored - held, hopper - held));
  m.held = held + made;
  m.made += made;
  return made;
}

/**
 * The shortest walk over open ground from beside the producer at (x, y) to storage: within
 * CAMP_DROP tiles of the campfire, or next to a chest. Returns tile indices (first step to last),
 * or null if walls or water cut it off.
 */
export function pathToStorage(w: World, x: number, y: number): number[] | null {
  const n = w.width * w.height;
  const from = new Int32Array(n).fill(-2);
  const queue: number[] = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of dirs) {
    if (isBlocked(w, x + dx, y + dy)) continue;
    const i = idx(w, x + dx, y + dy);
    from[i] = -1;
    queue.push(i);
  }
  const atStorage = (tx: number, ty: number) => {
    if (Math.hypot(tx - w.campX, ty - w.campY) <= CAMP_DROP) return true;
    for (const [dx, dy] of dirs) if (inBounds(w, tx + dx, ty + dy) && w.build[idx(w, tx + dx, ty + dy)] === Build.Chest) return true;
    return false;
  };
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const tx = i % w.width;
    const ty = (i - tx) / w.width;
    if (atStorage(tx, ty)) {
      const path: number[] = [];
      for (let k = i; k !== -1; k = from[k]) path.push(k);
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      if (isBlocked(w, tx + dx, ty + dy)) continue;
      const ni = idx(w, tx + dx, ty + dy);
      if (from[ni] !== -2) continue;
      from[ni] = i;
      queue.push(ni);
    }
  }
  return null;
}

export function describeMill(s: MillStatus, made: number, def: ProducerDef = MILL): string {
  const [one, many] = def.sourceName;
  if (!s.ok) {
    if (s.reason === 'no-source') return `${def.name}: no ${many} nearby to work`;
    if (s.reason === 'hopper-full') return `${def.name}: hopper full (${def.hopper}). Its mule can't find a way home; clear a path to camp or a chest`;
    return `${def.name}: storage is full of ${def.itemName} (${def.cap})`;
  }
  const secs = Math.round(s.msPerItem / 1000);
  const n = s.sources >= def.maxSources ? `${def.maxSources}+ ${many} (full speed)` : `${s.sources} ${s.sources === 1 ? one : many}`;
  return `${def.name}: ${n}, ${rateLabel(perMinute(s))} ${def.itemName} a minute (1 every ${secs}s) · ${made} made`;
}

/** Items a producer makes per minute right now (0 when it's stopped). */
export function perMinute(s: MillStatus): number {
  return s.ok ? 60_000 / s.msPerItem : 0;
}

/** "7.5" or "4": a rate with at most one decimal. */
export const rateLabel = (n: number) => (Math.round(n * 10) / 10).toString();

/** The short label shown above a producer: "+7.5 wood/min", or why it has stopped. */
export function shortStatus(s: MillStatus, def: ProducerDef = MILL): string {
  if (s.ok) return `+${rateLabel(perMinute(s))} ${def.itemName}/min`;
  if (s.reason === 'no-source') return `Stopped: no ${def.sourceName[1]}`;
  if (s.reason === 'hopper-full') return 'Stopped: no way home';
  return 'Stopped: storage full';
}
