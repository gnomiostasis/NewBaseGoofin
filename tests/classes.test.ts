import { describe, expect, it } from 'vitest';
import { CLASSES, CLASS_ORDER, attackFor, dps, withClass } from '../src/game/classes';
import { CREATURES, wouldWin } from '../src/game/creatures';
import { BASE_MODS, Progress } from '../src/game/stats';
import { captureState, restoreState } from '../src/game/save';
import { Inventory } from '../src/game/inventory';
import { freshVitals } from '../src/game/survival';

describe('classes', () => {
  it('each class attacks its own way', () => {
    expect(attackFor('fighter', BASE_MODS, 1, 1).kind).toBe('swing');
    expect(attackFor('archer', BASE_MODS, 1, 1).kind).toBe('arrow');
    expect(attackFor('mage', BASE_MODS, 1, 1).kind).toBe('firebolt');
    expect(attackFor(null, BASE_MODS, 1, 1).kind).toBe('swing');
  });

  it('the fighter hits hardest up close; ranged classes trade damage for distance', () => {
    const fighter = attackFor('fighter', withClass(BASE_MODS, 'fighter'), 1, 1);
    const archer = attackFor('archer', withClass(BASE_MODS, 'archer'), 1, 1);
    const mage = attackFor('mage', withClass(BASE_MODS, 'mage'), 1, 1);
    expect(dps(fighter)).toBeGreaterThan(dps(archer));
    expect(dps(fighter)).toBeGreaterThan(dps(mage));
    expect(archer.range).toBeGreaterThan(fighter.range * 4);
    expect(mage.splash).toBeGreaterThan(0);
    // Not useless either: within a factor of two of the fighter.
    expect(dps(archer) * 2).toBeGreaterThan(dps(fighter));
    expect(dps(mage) * 2).toBeGreaterThan(dps(fighter));
  });

  it('ranged attacks grow with level', () => {
    expect(attackFor('archer', BASE_MODS, 1, 6).damage).toBeGreaterThan(attackFor('archer', BASE_MODS, 1, 1).damage);
    expect(attackFor('mage', BASE_MODS, 1, 6).damage).toBeGreaterThan(attackFor('mage', BASE_MODS, 1, 1).damage);
  });

  it('perks change the stats they promise', () => {
    const f = withClass(BASE_MODS, 'fighter');
    expect(f.maxHealth).toBe(BASE_MODS.maxHealth + 30);
    expect(f.damageTakenMul).toBeLessThan(1);
    expect(withClass(BASE_MODS, 'archer').speedMul).toBeGreaterThan(1);
    expect(withClass(BASE_MODS, 'mage').staminaRegenMul).toBeGreaterThan(1);
    expect(withClass(BASE_MODS, null)).toEqual(BASE_MODS);
    for (const id of CLASS_ORDER) expect(CLASSES[id].perks.length).toBe(3);
  });

  it('a fighter still beats a bramblehog with a stone axe', () => {
    expect(wouldWin(CREATURES.bramblehog, 1, withClass(BASE_MODS, 'fighter'), 1)).toBe(true);
  });

  it('is saved and restored, and old saves come back without one', () => {
    const make = () => ({ pack: new Inventory(40), stash: new Inventory(), vitals: freshVitals(), progress: new Progress(), respawn: null, lostPacks: [], mills: new Map(), quarries: new Map() });
    const a = make();
    a.progress.cls = 'mage';
    const saved = captureState(a);
    const b = make();
    restoreState(b, { ...saved } as never);
    expect(b.progress.cls).toBe('mage');
    const c = make();
    c.progress.cls = 'archer';
    restoreState(c, { ...saved, progress: { ...saved.progress, cls: undefined } } as never);
    expect(c.progress.cls).toBeNull();
  });
});
