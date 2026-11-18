import { describe, expect, it } from 'vitest';
import { Build } from '../src/game/build';
import { MILL, QUARRY, millStatus, msPerItem, perMinute, shortStatus, sourcesNear, tickMill, treesNear, type MillState } from '../src/game/mill';
import { Prop, generateWorld, idx, isBlocked, type World } from '../src/world/generate';
import { GATHER } from '../src/game/gather';

/** A blank 20x20 corner of a real world, cleared of props and builds. */
function clearing(): [World, number, number] {
  const w = generateWorld();
  const x0 = w.campX + 40;
  const y0 = w.campY;
  for (let y = y0 - 10; y < y0 + 10; y++)
    for (let x = x0 - 10; x < x0 + 10; x++) {
      w.prop[idx(w, x, y)] = Prop.None;
      w.build[idx(w, x, y)] = Build.None;
    }
  return [w, x0, y0];
}

const fresh = (): MillState => ({ work: 0, made: 0 });

describe('lumber mill', () => {
  it('blocks movement like other structures', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    expect(isBlocked(w, x, y)).toBe(true);
  });

  it('needs trees and a chest before it works', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-source' });
    w.prop[idx(w, x + 2, y - 1)] = Prop.Tree;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-chest' });
    w.build[idx(w, x - 4, y)] = Build.Chest; // too far
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-chest' });
    w.build[idx(w, x - 1, y + 1)] = Build.Chest;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: true, sources: 1, chest: idx(w, x - 1, y + 1) });
  });

  it('fills a chest with wood over time, faster with more trees', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x + 1, y)] = Build.Chest;
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const one = fresh();
    let wood = 0;
    for (let t = 0; t < 120_000; t += 16) wood += tickMill(one, millStatus(w, x, y, wood), 16, wood);
    expect(wood).toBe(Math.floor(120_000 / MILL.msPerItemOneSource));

    for (let k = 0; k < 10; k++) w.prop[idx(w, x - 3 + (k % 7), y + 3)] = Prop.Tree;
    expect(treesNear(w, x, y)).toBe(8);
    const many = fresh();
    wood = 0;
    for (let t = 0; t < 120_000; t += 16) wood += tickMill(many, millStatus(w, x, y, wood), 16, wood);
    expect(wood).toBe(Math.floor(120_000 / msPerItem(MILL.maxSources)));
    expect(many.made).toBe(wood);
  });

  it('stops at the storage cap and when its trees are cut down', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x + 1, y)] = Build.Chest;
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const m = fresh();
    expect(tickMill(m, millStatus(w, x, y, MILL.cap - 1), 10 * MILL.msPerItemOneSource, MILL.cap - 1)).toBe(1);
    expect(millStatus(w, x, y, MILL.cap)).toMatchObject({ ok: false, reason: 'full' });
    w.prop[idx(w, x, y - 2)] = Prop.Stump;
    expect(tickMill(m, millStatus(w, x, y, 0), MILL.msPerItemOneSource, 0)).toBe(0);
  });
});

describe('regrowth', () => {
  it('chopped trees grow back from their stumps, so a mill never runs dry for good', () => {
    expect(GATHER[Prop.Tree]?.leaves).toBe(Prop.Stump);
    expect(GATHER[Prop.Tree]?.regrow).toBeGreaterThan(0);
  });
});

describe('quarry', () => {
  it('cuts stone from nearby rocks into a chest, without using the rocks up', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Quarry;
    expect(isBlocked(w, x, y)).toBe(true);
    expect(millStatus(w, x, y, 0, QUARRY)).toMatchObject({ ok: false, reason: 'no-source' });
    w.prop[idx(w, x + 2, y)] = Prop.Rock;
    w.prop[idx(w, x - 2, y)] = Prop.Rock;
    w.build[idx(w, x, y + 1)] = Build.Chest;
    expect(sourcesNear(w, x, y, QUARRY)).toBe(2);
    const q = fresh();
    let stone = 0;
    for (let t = 0; t < 120_000; t += 16) stone += tickMill(q, millStatus(w, x, y, stone, QUARRY), 16, stone, QUARRY);
    expect(stone).toBe(Math.floor(120_000 / msPerItem(2, QUARRY)));
    expect(w.prop[idx(w, x + 2, y)]).toBe(Prop.Rock);
    expect(millStatus(w, x, y, QUARRY.cap, QUARRY)).toMatchObject({ ok: false, reason: 'full' });
  });
});

describe('production rates', () => {
  it('reports items a minute, or why it stopped', () => {
    const ok = { ok: true as const, sources: 6, msPerItem: msPerItem(6, MILL), chest: 0 };
    expect(perMinute(ok)).toBeCloseTo(7.5);
    expect(shortStatus(ok, MILL)).toBe('+7.5 wood/min');
    expect(shortStatus({ ok: true, sources: 1, msPerItem: msPerItem(1, QUARRY), chest: 0 }, QUARRY)).toBe('+1 stone/min');
    const stopped = { ok: false as const, reason: 'no-chest' as const, sources: 3 };
    expect(perMinute(stopped)).toBe(0);
    expect(shortStatus(stopped, QUARRY)).toBe('Stopped: needs a chest');
    expect(shortStatus({ ok: false, reason: 'no-source', sources: 0 }, MILL)).toBe('Stopped: no trees');
  });
});
