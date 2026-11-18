import { describe, expect, it } from 'vitest';
import { Build } from '../src/game/build';
import { MILL, QUARRY, millStatus, msPerItem, pathToStorage, perMinute, shortStatus, sourcesNear, tickMill, treesNear, type MillState } from '../src/game/mill';
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

  it('works as soon as it has trees: no chest needed', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-source' });
    w.prop[idx(w, x + 2, y - 1)] = Prop.Tree;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: true, sources: 1 });
  });

  it('fills its hopper over time, faster with more trees', () => {
    const [w, x, y] = clearing();
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const one = fresh();
    for (let t = 0; t < 120_000; t += 16) tickMill(one, millStatus(w, x, y, 0, MILL, one.held), 16, 0);
    expect(one.held).toBe(Math.floor(120_000 / MILL.msPerItemOneSource));

    for (let k = 0; k < 10; k++) w.prop[idx(w, x - 3 + (k % 7), y + 3)] = Prop.Tree;
    expect(treesNear(w, x, y)).toBe(8);
    const many = fresh();
    for (let t = 0; t < 120_000; t += 16) tickMill(many, millStatus(w, x, y, 0, MILL, many.held), 16, 0);
    expect(many.held).toBe(Math.floor(120_000 / msPerItem(MILL.maxSources)));
    expect(many.made).toBe(many.held);
  });

  it('stops when the hopper is full, at the storage cap, and when its trees are cut down', () => {
    const [w, x, y] = clearing();
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const m = fresh();
    // A long time with nobody hauling: the hopper fills and it stops.
    tickMill(m, millStatus(w, x, y, 0), 1000 * MILL.msPerItemOneSource, 0);
    expect(m.held).toBe(MILL.hopper);
    expect(millStatus(w, x, y, 0, MILL, m.held)).toMatchObject({ ok: false, reason: 'hopper-full' });
    // Storage plus hopper never passes the cap.
    const n = fresh();
    expect(tickMill(n, millStatus(w, x, y, MILL.cap - 1), 10 * MILL.msPerItemOneSource, MILL.cap - 1)).toBe(1);
    expect(millStatus(w, x, y, MILL.cap - 1, MILL, 1)).toMatchObject({ ok: false, reason: 'full' });
    w.prop[idx(w, x, y - 2)] = Prop.Stump;
    expect(tickMill(fresh(), millStatus(w, x, y, 0), MILL.msPerItemOneSource, 0)).toBe(0);
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
    expect(sourcesNear(w, x, y, QUARRY)).toBe(2);
    const q = fresh();
    for (let t = 0; t < 120_000; t += 16) tickMill(q, millStatus(w, x, y, 0, QUARRY, q.held), 16, 0, QUARRY);
    expect(q.held).toBe(Math.floor(120_000 / msPerItem(2, QUARRY)));
    expect(w.prop[idx(w, x + 2, y)]).toBe(Prop.Rock);
    expect(millStatus(w, x, y, QUARRY.cap, QUARRY)).toMatchObject({ ok: false, reason: 'full' });
  });
});

describe('production rates', () => {
  it('reports items a minute, or why it stopped', () => {
    const ok = { ok: true as const, sources: 6, msPerItem: msPerItem(6, MILL) };
    expect(perMinute(ok)).toBeCloseTo(7.5);
    expect(shortStatus(ok, MILL)).toBe('+7.5 wood/min');
    expect(shortStatus({ ok: true, sources: 1, msPerItem: msPerItem(1, QUARRY) }, QUARRY)).toBe('+1 stone/min');
    const stopped = { ok: false as const, reason: 'hopper-full' as const, sources: 3 };
    expect(perMinute(stopped)).toBe(0);
    expect(shortStatus(stopped, QUARRY)).toBe('Stopped: no way home');
    expect(shortStatus({ ok: false, reason: 'no-source', sources: 0 }, MILL)).toBe('Stopped: no trees');
  });
});

describe('carts', () => {
  it('find a way home over open ground, to a chest or the camp', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    w.build[idx(w, x + 5, y)] = Build.Chest;
    const path = pathToStorage(w, x, y)!;
    expect(path).not.toBeNull();
    const last = path[path.length - 1];
    expect(last).toBe(idx(w, x + 4, y));
    // Every step is open ground and next to the one before.
    for (let k = 1; k < path.length; k++) {
      const [a, b] = [path[k - 1], path[k]];
      expect(Math.abs((a % w.width) - (b % w.width)) + Math.abs(Math.floor(a / w.width) - Math.floor(b / w.width))).toBe(1);
      expect(isBlocked(w, b % w.width, Math.floor(b / w.width))).toBe(false);
    }
  });

  it('are stuck when walls close the mill in', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) w.build[idx(w, x + dx, y + dy)] = Build.Wall;
    expect(pathToStorage(w, x, y)).toBeNull();
  });

  it('reach camp from far away without a chest', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x, y)] = Build.Mill;
    const path = pathToStorage(w, x, y);
    expect(path).not.toBeNull();
    const last = path![path!.length - 1];
    expect(Math.hypot((last % w.width) - w.campX, Math.floor(last / w.width) - w.campY)).toBeLessThanOrEqual(3);
  });
});
