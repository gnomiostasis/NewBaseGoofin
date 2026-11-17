import { describe, expect, it } from 'vitest';
import { BUILDABLES, Build, canPlace, payCost, refundFor, wallMask } from '../src/game/build';
import { Inventory } from '../src/game/inventory';
import { BENCH_RECIPES } from '../src/game/items';
import { Ground, Prop, generateWorld, idx, isBlocked } from '../src/world/generate';

/** Finds an open 7x7 patch of grass in the meadow to build on. */
function openPatch(w: ReturnType<typeof generateWorld>): [number, number] {
  for (let y = w.campY + 8; y < w.campY + 30; y++)
    for (let x = w.campX - 20; x < w.campX + 20; x++) {
      let ok = true;
      for (let dy = 0; dy < 7 && ok; dy++)
        for (let dx = 0; dx < 7 && ok; dx++) {
          const i = idx(w, x + dx, y + dy);
          if (w.ground[i] !== Ground.Grass || ![Prop.None, Prop.Flowers, Prop.TallGrass].includes(w.prop[i])) ok = false;
        }
      if (ok) return [x, y];
    }
  throw new Error('no open patch');
}

describe('building', () => {
  it('walls block, doors and floors do not', () => {
    const w = generateWorld();
    const [x, y] = openPatch(w);
    w.build[idx(w, x, y)] = Build.Wall;
    w.build[idx(w, x + 1, y)] = Build.Door;
    w.floor[idx(w, x + 2, y)] = 1;
    expect(isBlocked(w, x, y)).toBe(true);
    expect(isBlocked(w, x + 1, y)).toBe(false);
    expect(isBlocked(w, x + 2, y)).toBe(false);
  });

  it('refuses water, the camp, occupied tiles and your own feet', () => {
    const w = generateWorld();
    const [x, y] = openPatch(w);
    const none = new Set<number>();
    expect(canPlace(w, x, y, 'wall', [], none).ok).toBe(true);
    expect(canPlace(w, x, y, 'wall', [[x, y]], none).ok).toBe(false);
    expect(canPlace(w, x, y, 'door', [[x, y]], none).ok).toBe(true);
    expect(canPlace(w, x, y, 'wall', [], new Set([idx(w, x, y)])).ok).toBe(false);
    w.build[idx(w, x, y)] = Build.Chest;
    expect(canPlace(w, x, y, 'wall', [], none).ok).toBe(false);
    expect(canPlace(w, x, y, 'floor', [], none).ok).toBe(true);
    let water = -1;
    for (let i = 0; i < w.ground.length && water < 0; i++) if (w.ground[i] === Ground.Water) water = i;
    expect(canPlace(w, water % w.width, Math.floor(water / w.width), 'floor', [], none).ok).toBe(false);
    let tree = -1;
    for (let i = 0; i < w.prop.length && tree < 0; i++) if (w.prop[i] === Prop.Tree) tree = i;
    expect(canPlace(w, tree % w.width, Math.floor(tree / w.width), 'wall', [], none).ok).toBe(false);
  });

  it('pays from the pack first, then storage, and refunds half', () => {
    const pack = new Inventory(40);
    const stash = new Inventory();
    pack.add('wood', 1);
    stash.add('wood', 3);
    expect(payCost({ wood: 5 }, pack, stash)).toBe(false);
    expect(pack.count('wood') + stash.count('wood')).toBe(4);
    expect(payCost({ wood: 2 }, pack, null)).toBe(false);
    expect(payCost({ wood: 2 }, pack, stash)).toBe(true);
    expect(pack.count('wood')).toBe(0);
    expect(stash.count('wood')).toBe(2);
    expect(refundFor('wall')).toEqual([['wood', 1]]);
  });

  it('joins neighbouring walls', () => {
    const w = generateWorld();
    const [x, y] = openPatch(w);
    w.build[idx(w, x, y)] = Build.Wall;
    w.build[idx(w, x + 1, y)] = Build.Wall;
    w.build[idx(w, x, y + 1)] = Build.Door;
    expect(wallMask(w, x, y)).toBe(2 | 4);
    expect(wallMask(w, x + 1, y)).toBe(8);
  });

  it('a one-trip haul builds a small walled room with a door and a chest', () => {
    // 5x5 room: 15 wall tiles + 1 door on the ring, 9 floors inside, a chest and a workbench.
    const need: Record<string, number> = {};
    const add = (kind: string, n: number) => {
      const def = BUILDABLES.find((b) => b.kind === kind)!;
      for (const [id, k] of Object.entries(def.cost)) need[id] = (need[id] ?? 0) + k! * n;
    };
    add('wall', 15);
    add('door', 1);
    add('floor', 9);
    add('chest', 1);
    // Wood weighs 2, so 40 wood is a couple of trips' worth: a fair price for a first base.
    expect(need.wood).toBeLessThanOrEqual(45);
  });

  it('bench recipes include copper tools and a bigger pack', () => {
    const makes = BENCH_RECIPES.map((r) => r.makes);
    expect(makes).toEqual(expect.arrayContaining(['copper_axe', 'copper_pick', 'woven_basket']));
    const pack = new Inventory(40);
    pack.add('woven_basket');
    expect(pack.capacity).toBe(60);
    pack.add('copper_axe');
    pack.add('stone_axe');
    expect(pack.toolPower('axe')).toBe(2);
  });
});

describe('defenses', () => {
  it('spikes can go under you and do not block; torches and turrets do', async () => {
    const { generateWorld, idx, isBlocked } = await import('../src/world/generate');
    const w = generateWorld();
    const x = w.campX + 40;
    const y = w.campY;
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0]]) w.prop[idx(w, x + dx, y + dy)] = 0;
    expect(canPlace(w, x, y, 'spikes', [[x, y]], new Set()).ok).toBe(true);
    expect(canPlace(w, x, y, 'turret', [[x, y]], new Set()).ok).toBe(false);
    w.build[idx(w, x, y)] = Build.Spikes;
    w.build[idx(w, x + 1, y)] = Build.Torch;
    w.build[idx(w, x + 2, y)] = Build.Turret;
    expect(isBlocked(w, x, y)).toBe(false);
    expect(isBlocked(w, x + 1, y)).toBe(true);
    expect(isBlocked(w, x + 2, y)).toBe(true);
  });

  it('fit in the build bar with a key each (1-9, then 0)', () => {
    expect(BUILDABLES.length).toBeLessThanOrEqual(10);
    expect(BUILDABLES.map((b) => b.kind)).toEqual(expect.arrayContaining(['spikes', 'torch', 'turret']));
  });
});
