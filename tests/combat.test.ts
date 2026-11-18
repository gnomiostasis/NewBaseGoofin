import { describe, expect, it } from 'vitest';
import { CREATURES, pickSpawn, wouldWin } from '../src/game/creatures';
import { Progress, xpToNext, modsFor, LEVELING } from '../src/game/stats';

describe('leveling', () => {
  it('levels up, grants points, and caps at the max level', () => {
    const p = new Progress();
    expect(p.gain(xpToNext(1) - 1)).toBe(0);
    expect(p.gain(1)).toBe(1);
    expect(p.level).toBe(2);
    expect(p.points).toBe(1);
    p.gain(1e6);
    expect(p.level).toBe(LEVELING.maxLevel);
    expect(p.points).toBe(LEVELING.maxLevel - 1);
    expect(p.gain(100)).toBe(0);
  });

  it('spends points within limits', () => {
    const p = new Progress();
    expect(p.spend('strength')).toBe(false);
    p.points = 20;
    for (let i = 0; i < 12; i++) p.spend('strength');
    expect(p.stats.strength).toBe(LEVELING.maxPerStat);
  });

  it('endurance raises max health and makes food heal more', () => {
    const tough = modsFor({ strength: 0, endurance: 4, agility: 0, gathering: 0 });
    expect(tough.maxHealth).toBe(140);
    expect(tough.foodHealMul).toBeGreaterThan(1);
  });

  it('a level takes a handful of trips, not hundreds', () => {
    // A trip of ~6 chops, ~6 pickups and a craft earns this much.
    const trip = 6 * LEVELING.xp.chop + 6 * LEVELING.xp.pickup + LEVELING.xp.craft;
    let total = 0;
    for (let l = 1; l < 5; l++) total += xpToNext(l);
    expect(total / trip).toBeLessThan(12);
    expect(xpToNext(1) / trip).toBeGreaterThan(0.5);
  });
});

describe('danger', () => {
  it('keeps creatures out of the camp and meadow', () => {
    expect(pickSpawn(0, 0.5)).toBeNull();
    expect(pickSpawn(1, 0.5)).toBeNull();
    expect(pickSpawn(2, 0.5)).toBe('bramblehog');
    expect(pickSpawn(3, 0.1)).toBe('duskprowler');
  });

  it('a pair of duskprowlers beats a fresh character but not a levelled one', () => {
    const fresh = modsFor({ strength: 0, endurance: 0, agility: 0, gathering: 0 });
    expect(wouldWin(CREATURES.duskprowler, 2, fresh, 1)).toBe(false);
    // Level 6: five points, a copper axe.
    const levelled = modsFor({ strength: 3, endurance: 2, agility: 0, gathering: 0 });
    expect(wouldWin(CREATURES.duskprowler, 2, levelled, 2)).toBe(true);
  });

  it('a bramblehog is beatable from the start with a stone axe', () => {
    const fresh = modsFor({ strength: 0, endurance: 0, agility: 0, gathering: 0 });
    expect(wouldWin(CREATURES.bramblehog, 1, fresh, 1)).toBe(true);
  });
});
