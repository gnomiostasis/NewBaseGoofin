// Producers: buildings that work while you're away and put what they make in a nearby chest.
// The lumber mill saws wood from the standing trees around it; the quarry cuts stone from
// the rocks around it. Neither uses up its trees or rocks.

import { Prop, idx, inBounds, type World } from '../world/generate';
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
  /** A chest must be within this many tiles to take what it makes. */
  chestRadius: number;
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
  chestRadius: 3,
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
  chestRadius: 3,
  cap: 200,
};

export interface MillState {
  /** Milliseconds of work towards the next item. */
  work: number;
  /** Items made since it was built. */
  made: number;
}

export type MillStatus =
  | { ok: true; sources: number; msPerItem: number; chest: number }
  | { ok: false; reason: 'no-source' | 'no-chest' | 'full'; sources: number };

/** Sources (trees for a mill, rocks for a quarry) around tile (x, y). */
export function sourcesNear(w: World, x: number, y: number, def: ProducerDef = MILL): number {
  let n = 0;
  const r = def.radius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(w, x + dx, y + dy) && w.prop[idx(w, x + dx, y + dy)] === def.source) n++;
    }
  }
  return n;
}

export const treesNear = (w: World, x: number, y: number) => sourcesNear(w, x, y, MILL);

/** The closest chest to tile (x, y) within reach, as a tile index, or -1. */
export function chestNear(w: World, x: number, y: number, r = MILL.chestRadius): number {
  let best = -1;
  let bestD = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!inBounds(w, x + dx, y + dy)) continue;
      const i = idx(w, x + dx, y + dy);
      const d = dx * dx + dy * dy;
      if (w.build[i] === Build.Chest && d < bestD) {
        best = i;
        bestD = d;
      }
    }
  }
  return best;
}

export function msPerItem(sources: number, def: ProducerDef = MILL): number {
  return def.msPerItemOneSource / Math.min(sources, def.maxSources);
}

export function millStatus(w: World, x: number, y: number, stored: number, def: ProducerDef = MILL): MillStatus {
  const sources = sourcesNear(w, x, y, def);
  if (sources === 0) return { ok: false, reason: 'no-source', sources };
  const chest = chestNear(w, x, y, def.chestRadius);
  if (chest < 0) return { ok: false, reason: 'no-chest', sources };
  if (stored >= def.cap) return { ok: false, reason: 'full', sources };
  return { ok: true, sources, msPerItem: msPerItem(sources, def), chest };
}

/** Advances a producer by `dt` ms. Returns how much it made (never past the cap). */
export function tickMill(m: MillState, status: MillStatus, dt: number, stored: number, def: ProducerDef = MILL): number {
  if (!status.ok) {
    m.work = 0;
    return 0;
  }
  m.work += dt;
  let made = Math.floor(m.work / status.msPerItem);
  m.work -= made * status.msPerItem;
  made = Math.min(made, def.cap - stored);
  m.made += made;
  return made;
}

export function describeMill(s: MillStatus, made: number, def: ProducerDef = MILL): string {
  const [one, many] = def.sourceName;
  if (!s.ok) {
    if (s.reason === 'no-source') return `${def.name}: no ${many} nearby to work`;
    if (s.reason === 'no-chest') return `${def.name}: needs a chest within ${def.chestRadius} tiles`;
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
  if (s.reason === 'no-chest') return 'Stopped: needs a chest';
  return 'Stopped: storage full';
}
