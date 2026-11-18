import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/game/inventory';
import { HAND_RECIPES, ITEMS } from '../src/game/items';
import { modsFor } from '../src/game/stats';
import { cantEat, eat, freshVitals, spendStamina, tickVitals } from '../src/game/survival';
import { GATHER } from '../src/game/gather';
import { Prop, generateWorld, idx } from '../src/world/generate';
import { SURVIVAL } from '../src/config';

describe('pack', () => {
  it('stops taking items at the weight limit', () => {
    const pack = new Inventory(10);
    expect(pack.add('stone', 10)).toBe(5); // stone weighs 2
    expect(pack.weight).toBe(10);
    expect(pack.add('fiber')).toBe(0);
    expect(pack.remove('stone', 2)).toBe(2);
    expect(pack.add('fiber', 3)).toBe(3);
    expect(pack.weight).toBe(7.5);
  });

  it('crafts a stone axe from sticks, stones and fiber', () => {
    const pack = new Inventory(40);
    const axe = HAND_RECIPES.find((r) => r.makes === 'stone_axe')!;
    pack.add('stick', 3);
    pack.add('stone', 1);
    pack.add('fiber', 2);
    expect(pack.craft(axe)).toBe(false);
    pack.add('stone', 1);
    expect(pack.craft(axe)).toBe(true);
    expect(pack.hasTool('axe')).toBe(true);
    expect(pack.count('stick')).toBe(0);
  });

  it('drops materials into the stash but keeps tools and food', () => {
    const pack = new Inventory(40);
    const stash = new Inventory();
    pack.add('wood', 5);
    pack.add('berries', 4);
    pack.add('stone_axe');
    const moved = pack.depositMaterials(stash);
    expect(moved).toEqual([['wood', 5]]);
    expect(stash.count('wood')).toBe(5);
    expect(pack.count('berries')).toBe(4);
    expect(pack.hasTool('axe')).toBe(true);
  });
});

describe('survival', () => {
  const base = { moving: false, sprinting: false, atCamp: false };

  it('has no hunger: standing around for minutes costs nothing', () => {
    let v = freshVitals();
    for (let t = 0; t < 600; t++) v = tickVitals(v, { ...base, dt: 1 });
    expect(v).toEqual(freshVitals());
  });

  it('food heals health, then has to wait out a cooldown', () => {
    const v = { ...freshVitals(), health: 40 };
    expect(cantEat(v, 100, 0, 0)).toBeNull();
    const readyAt = eat(v, ITEMS.berries.heal!, 100, 0);
    expect(v.health).toBe(40 + ITEMS.berries.heal!);
    expect(readyAt).toBe(SURVIVAL.foodCooldownMs);
    expect(cantEat(v, 100, 5000, readyAt)).toMatch(/again in 10s/);
    expect(cantEat(v, 100, readyAt, readyAt)).toBeNull();
    expect(cantEat({ ...v, health: 100 }, 100, readyAt, readyAt)).toMatch(/full health/);
    // Never past max health.
    eat(v, 500, 100, 0);
    expect(v.health).toBe(100);
  });

  it('endurance makes food heal more', () => {
    const a = { ...freshVitals(), health: 10 };
    const b = { ...freshVitals(), health: 10 };
    eat(a, 20, 200, 0);
    eat(b, 20, 200, 0, modsFor({ strength: 0, endurance: 3, agility: 0, gathering: 0 }));
    expect(b.health).toBeGreaterThan(a.health);
  });

  it('camp slowly heals you', () => {
    const v = tickVitals({ ...freshVitals(), health: 50 }, { ...base, atCamp: true, dt: 5 });
    expect(v.health).toBeGreaterThan(50);
  });

  it('sprinting burns stamina and resting brings it back, faster at camp', () => {
    let v = freshVitals();
    v = tickVitals(v, { dt: 3, moving: true, sprinting: true, atCamp: false });
    expect(v.stamina).toBeLessThan(60);
    const away = tickVitals(v, { ...base, dt: 1 });
    const home = tickVitals(v, { ...base, dt: 1, atCamp: true });
    expect(home.stamina).toBeGreaterThan(away.stamina);
    expect(spendStamina(v, 1000)).toBe(false);
  });
});

describe('gathering', () => {
  const world = generateWorld();

  it('leaves the tools you need for the first trip within reach of camp', () => {
    const near: Record<number, number> = {};
    for (let y = world.campY - 15; y <= world.campY + 15; y++)
      for (let x = world.campX - 15; x <= world.campX + 15; x++) {
        const p = world.prop[idx(world, x, y)];
        near[p] = (near[p] ?? 0) + 1;
      }
    // Enough for an axe and a pick: 6 sticks, 5 stones, 4 fiber.
    expect((near[Prop.Sticks] ?? 0) * 2).toBeGreaterThanOrEqual(6);
    expect((near[Prop.Pebbles] ?? 0) * 2).toBeGreaterThanOrEqual(5);
    expect((near[Prop.TallGrass] ?? 0) * 2).toBeGreaterThanOrEqual(4);
  });

  it('only needs tools for trees, logs and rocks', () => {
    for (const [p, rule] of Object.entries(GATHER)) {
      const needsTool = [Prop.Tree, Prop.Log, Prop.Rock, Prop.OreRock].includes(Number(p));
      expect(Boolean(rule!.tool)).toBe(needsTool);
    }
  });
});
