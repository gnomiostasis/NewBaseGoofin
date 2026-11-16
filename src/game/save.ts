// Saving and loading a run. The map itself is rebuilt from its seed, so a save only holds
// what changed: props you cleared, things you built, plus the player's pack, stats and so on.

import type { World } from '../world/generate';
import type { Inventory } from './inventory';
import type { ItemId } from './items';
import type { MillState } from './mill';
import type { Progress, StatId } from './stats';
import type { Vitals } from './survival';

export const SAVE_KEY = 'newbasegoofin.save';
export const SAVE_VERSION = 1;
/** How often the game saves on its own. */
export const AUTOSAVE_MS = 20_000;
/** Mills keep working while the game is closed, for at most this long. */
export const OFFLINE_CAP_MS = 4 * 60 * 60 * 1000;

export interface SaveData {
  v: number;
  savedAt: number;
  seed: number;
  player: { x: number; y: number };
  /** [tile index, prop] for every tile whose prop differs from the freshly generated map. */
  props: Array<[number, number]>;
  builds: Array<[number, number]>;
  floors: number[];
  pack: Array<[ItemId, number]>;
  stash: Array<[ItemId, number]>;
  vitals: Vitals;
  progress: { level: number; xp: number; points: number; stats: Record<StatId, number> };
  respawn: [number, number] | null;
  lostPacks: Array<{ tx: number; ty: number; items: Array<[ItemId, number]> }>;
  mills: Array<[number, MillState]>;
  /** Bushes growing back: [tile index, ms left, prop]. */
  regrow: Array<[number, number, number]>;
}

/** The parts of GameState a save reads and writes. */
export interface Saveable {
  pack: Inventory;
  stash: Inventory;
  vitals: Vitals;
  progress: Progress;
  respawn: [number, number] | null;
  lostPacks: Array<{ tx: number; ty: number; items: Array<[ItemId, number]> }>;
  mills: Map<number, MillState>;
}

export function worldChanges(w: World, baseProps: Uint8Array): Pick<SaveData, 'props' | 'builds' | 'floors'> {
  const props: Array<[number, number]> = [];
  const builds: Array<[number, number]> = [];
  const floors: number[] = [];
  for (let i = 0; i < w.prop.length; i++) {
    if (w.prop[i] !== baseProps[i]) props.push([i, w.prop[i]]);
    if (w.build[i]) builds.push([i, w.build[i]]);
    if (w.floor[i]) floors.push(i);
  }
  return { props, builds, floors };
}

/** Puts a save's changes onto a freshly generated world. */
export function applyWorldChanges(w: World, d: Pick<SaveData, 'props' | 'builds' | 'floors'>) {
  const n = w.prop.length;
  for (const [i, p] of d.props) if (i >= 0 && i < n) w.prop[i] = p;
  for (const [i, b] of d.builds) if (i >= 0 && i < n) w.build[i] = b;
  for (const i of d.floors) if (i >= 0 && i < n) w.floor[i] = 1;
}

export function captureState(s: Saveable): Pick<SaveData, 'pack' | 'stash' | 'vitals' | 'progress' | 'respawn' | 'lostPacks' | 'mills'> {
  const p = s.progress;
  return {
    pack: s.pack.entries(),
    stash: s.stash.entries(),
    vitals: { ...s.vitals },
    progress: { level: p.level, xp: p.xp, points: p.points, stats: { ...p.stats } },
    respawn: s.respawn ? [s.respawn[0], s.respawn[1]] : null,
    lostPacks: s.lostPacks.map((l) => ({ tx: l.tx, ty: l.ty, items: l.items.map(([id, n]) => [id, n] as [ItemId, number]) })),
    mills: [...s.mills].map(([i, m]) => [i, { ...m }]),
  };
}

export function restoreState(s: Saveable, d: SaveData) {
  // Whatever was in the pack fits again, even before stat bonuses to carry space are reapplied.
  const cap = s.pack.baseCapacity;
  s.pack.baseCapacity = Infinity;
  s.pack.clear();
  for (const [id, n] of d.pack) s.pack.add(id, n);
  s.pack.baseCapacity = cap;
  s.stash.clear();
  for (const [id, n] of d.stash) s.stash.add(id, n);
  s.vitals = { ...d.vitals };
  Object.assign(s.progress, { level: d.progress.level, xp: d.progress.xp, points: d.progress.points });
  s.progress.stats = { ...s.progress.stats, ...d.progress.stats };
  s.respawn = d.respawn;
  s.lostPacks = d.lostPacks.map((l) => ({ ...l, items: [...l.items] }));
  s.mills.clear();
  for (const [i, m] of d.mills) s.mills.set(i, { ...m });
}

/** Parses a stored save, or returns null if it's missing, broken or from another version. */
export function parseSave(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text) as SaveData;
    if (d?.v !== SAVE_VERSION || !Array.isArray(d.props) || !d.player || !d.progress) return null;
    return d;
  } catch {
    return null;
  }
}

export function loadSave(): SaveData | null {
  try {
    return parseSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to remove.
  }
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
export function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
