import { describe, expect, it } from 'vitest';
import { Build } from '../src/game/build';
import { Inventory } from '../src/game/inventory';
import { SAVE_VERSION, applyWorldChanges, ago, captureState, parseSave, restoreState, worldChanges, type Saveable, type SaveData } from '../src/game/save';
import { Progress } from '../src/game/stats';
import { freshVitals } from '../src/game/survival';
import type { MillState } from '../src/game/mill';
import { Prop, generateWorld } from '../src/world/generate';

const freshState = (): Saveable => ({
  pack: new Inventory(40),
  stash: new Inventory(),
  vitals: freshVitals(),
  progress: new Progress(),
  respawn: null,
  lostPacks: [],
  mills: new Map<number, MillState>(),
});

describe('saving', () => {
  it('stores only what changed on the map, and puts it back', () => {
    const w = generateWorld();
    const base = w.prop.slice();
    const tree = w.prop.findIndex((p) => p === Prop.Tree);
    w.prop[tree] = Prop.Stump;
    w.build[tree + 3] = Build.Chest;
    w.build[tree + 4] = Build.Mill;
    w.floor[tree + 5] = 1;
    const changes = worldChanges(w, base);
    expect(changes.props).toEqual([[tree, Prop.Stump]]);
    expect(changes.builds).toEqual([[tree + 3, Build.Chest], [tree + 4, Build.Mill]]);
    expect(changes.floors).toEqual([tree + 5]);

    const again = generateWorld();
    applyWorldChanges(again, JSON.parse(JSON.stringify(changes)));
    expect(again.prop).toEqual(w.prop);
    expect(again.build).toEqual(w.build);
    expect(again.floor).toEqual(w.floor);
  });

  it('round-trips the pack, storage, stats and mills', () => {
    const a = freshState();
    a.pack.add('stone_axe');
    a.pack.add('wood', 12);
    a.stash.add('copper_ore', 30);
    a.vitals.hunger = 42;
    a.progress.gain(200);
    a.progress.spend('agility');
    a.respawn = [10, 12];
    a.lostPacks.push({ tx: 3, ty: 4, items: [['berries', 2]] });
    a.mills.set(99, { work: 1200, made: 7 });

    const b = freshState();
    restoreState(b, JSON.parse(JSON.stringify(captureState(a))) as SaveData);
    expect(b.pack.entries()).toEqual(a.pack.entries());
    expect(b.stash.entries()).toEqual(a.stash.entries());
    expect(b.vitals.hunger).toBe(42);
    expect(b.progress.level).toBe(a.progress.level);
    expect(b.progress.points).toBe(a.progress.points);
    expect(b.progress.stats.agility).toBe(1);
    expect(b.respawn).toEqual([10, 12]);
    expect(b.lostPacks).toEqual(a.lostPacks);
    expect(b.mills.get(99)).toEqual({ work: 1200, made: 7 });
  });

  it('a full pack still loads in full before carry bonuses come back', () => {
    const a = freshState();
    a.pack.baseCapacity = 200;
    a.pack.add('stone', 150);
    const b = freshState();
    restoreState(b, captureState(a) as SaveData);
    expect(a.pack.count('stone')).toBeGreaterThan(40);
    expect(b.pack.count('stone')).toBe(a.pack.count('stone'));
    expect(b.pack.baseCapacity).toBe(40);
  });

  it('ignores missing, broken or old saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION + 1, props: [], player: {}, progress: {} }))).toBeNull();
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION, props: [], player: { x: 1, y: 2 }, progress: { level: 1 } }))).not.toBeNull();
  });

  it('says how long ago in plain words', () => {
    expect(ago(10_000)).toBe('just now');
    expect(ago(60_000)).toBe('1 minute ago');
    expect(ago(3 * 3600_000)).toBe('3 hours ago');
    expect(ago(49 * 3600_000)).toBe('2 days ago');
  });
});
