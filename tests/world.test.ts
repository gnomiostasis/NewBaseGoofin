import { describe, expect, it } from 'vitest';
import { Ground, Prop, generateWorld, idx, isBlocked, reachableFromCamp } from '../src/world/generate';

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('world generation', () => {
  const world = generateWorld();

  it('is deterministic for a seed', () => {
    const again = generateWorld();
    expect(same(again.prop, world.prop)).toBe(true);
    expect(same(again.ground, world.ground)).toBe(true);
    const other = generateWorld(world.seed + 1);
    expect(same(other.prop, world.prop)).toBe(false);
  });

  it('puts the camp in a clear clearing at the centre', () => {
    expect(world.zone[idx(world, world.campX, world.campY)]).toBe(0);
    expect(world.campObjects.map((o) => o.kind)).toEqual(
      expect.arrayContaining(['tent', 'campfire', 'bedroll', 'stump', 'sack']),
    );
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const p = world.prop[idx(world, world.campX + dx, world.campY + dy)];
        expect([Prop.None, Prop.Camp]).toContain(p);
      }
    }
  });

  it('has all four zones, getting more crowded farther out', () => {
    const tiles = [0, 0, 0, 0];
    const trees = [0, 0, 0, 0];
    for (let i = 0; i < world.zone.length; i++) {
      tiles[world.zone[i]]++;
      if (world.prop[i] === Prop.Tree) trees[world.zone[i]]++;
    }
    expect(tiles.every((t) => t > 0)).toBe(true);
    const density = trees.map((t, z) => t / tiles[z]);
    expect(density[1]).toBeLessThan(density[2]);
    expect(density[2]).toBeLessThan(density[3]);
  });

  it('lets you walk from camp to every edge of the map', () => {
    const seen = reachableFromCamp(world);
    const edge = (pred: (x: number, y: number) => boolean) => {
      for (let y = 0; y < world.height; y++)
        for (let x = 0; x < world.width; x++) if (pred(x, y) && seen[idx(world, x, y)]) return true;
      return false;
    };
    expect(edge((_x, y) => y === 0)).toBe(true);
    expect(edge((_x, y) => y === world.height - 1)).toBe(true);
    expect(edge((x) => x === 0)).toBe(true);
    expect(edge((x) => x === world.width - 1)).toBe(true);
  });

  it('leaves no open ground sealed off from camp', () => {
    const seen = reachableFromCamp(world);
    let open = 0;
    let reached = 0;
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        if (isBlocked(world, x, y)) continue;
        open++;
        if (seen[idx(world, x, y)]) reached++;
      }
    expect(reached / open).toBe(1);
  });

  it('has ponds, and trails ford them instead of stopping', () => {
    let water = 0;
    for (const g of world.ground) if (g === Ground.Water) water++;
    expect(water).toBeGreaterThan(50);
    for (const trail of world.trails) for (const [x, y] of trail) expect(isBlocked(world, x, y)).toBe(false);
  });
});
