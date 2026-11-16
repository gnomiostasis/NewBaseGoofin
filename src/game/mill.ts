// The lumber mill: the first thing that works while you're away.
// It saws wood from the standing trees around it and puts it in a nearby chest.

import { Prop, idx, inBounds, type World } from '../world/generate';
import { Build } from './build';

export const MILL = {
  /** Trees within this many tiles (in every direction) feed the mill. */
  treeRadius: 3,
  /** More trees than this don't make it any faster. */
  maxTrees: 6,
  /** With one tree it takes this long to make one wood; each extra tree shares the work. */
  msPerWoodOneTree: 48_000,
  /** A chest must be within this many tiles to take the wood. */
  chestRadius: 3,
  /** Mills stop when storage holds this much wood. */
  woodCap: 150,
};

export interface MillState {
  /** Milliseconds of work towards the next wood. */
  work: number;
  /** Wood made since it was built. */
  made: number;
}

export type MillStatus =
  | { ok: true; trees: number; msPerWood: number; chest: number }
  | { ok: false; reason: 'no-trees' | 'no-chest' | 'full'; trees: number };

/** Standing trees around tile (x, y). */
export function treesNear(w: World, x: number, y: number): number {
  let n = 0;
  const r = MILL.treeRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inBounds(w, x + dx, y + dy) && w.prop[idx(w, x + dx, y + dy)] === Prop.Tree) n++;
    }
  }
  return n;
}

/** The closest chest to tile (x, y) within reach, as a tile index, or -1. */
export function chestNear(w: World, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  const r = MILL.chestRadius;
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

export function msPerWood(trees: number): number {
  return MILL.msPerWoodOneTree / Math.min(trees, MILL.maxTrees);
}

export function millStatus(w: World, x: number, y: number, storedWood: number): MillStatus {
  const trees = treesNear(w, x, y);
  if (trees === 0) return { ok: false, reason: 'no-trees', trees };
  const chest = chestNear(w, x, y);
  if (chest < 0) return { ok: false, reason: 'no-chest', trees };
  if (storedWood >= MILL.woodCap) return { ok: false, reason: 'full', trees };
  return { ok: true, trees, msPerWood: msPerWood(trees), chest };
}

/** Advances a mill by `dt` ms. Returns how much wood it made (never past the cap). */
export function tickMill(m: MillState, status: MillStatus, dt: number, storedWood: number): number {
  if (!status.ok) {
    m.work = 0;
    return 0;
  }
  m.work += dt;
  let made = Math.floor(m.work / status.msPerWood);
  m.work -= made * status.msPerWood;
  made = Math.min(made, MILL.woodCap - storedWood);
  m.made += made;
  return made;
}

export function describeMill(s: MillStatus, made: number): string {
  if (!s.ok) {
    if (s.reason === 'no-trees') return 'Lumber mill: no trees nearby to saw';
    if (s.reason === 'no-chest') return 'Lumber mill: needs a chest within 3 tiles';
    return `Lumber mill: storage is full of wood (${MILL.woodCap})`;
  }
  const secs = Math.round(s.msPerWood / 1000);
  const trees = s.trees >= MILL.maxTrees ? `${MILL.maxTrees}+ trees (full speed)` : `${s.trees} tree${s.trees === 1 ? '' : 's'}`;
  return `Lumber mill: ${trees}, 1 wood every ${secs}s · ${made} made`;
}
