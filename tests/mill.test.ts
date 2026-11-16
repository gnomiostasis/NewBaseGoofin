import { describe, expect, it } from 'vitest';
import { Build } from '../src/game/build';
import { MILL, millStatus, msPerWood, tickMill, treesNear, type MillState } from '../src/game/mill';
import { Prop, generateWorld, idx, isBlocked, type World } from '../src/world/generate';

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
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-trees' });
    w.prop[idx(w, x + 2, y - 1)] = Prop.Tree;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-chest' });
    w.build[idx(w, x - 4, y)] = Build.Chest; // too far
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: false, reason: 'no-chest' });
    w.build[idx(w, x - 1, y + 1)] = Build.Chest;
    expect(millStatus(w, x, y, 0)).toMatchObject({ ok: true, trees: 1, chest: idx(w, x - 1, y + 1) });
  });

  it('fills a chest with wood over time, faster with more trees', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x + 1, y)] = Build.Chest;
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const one = fresh();
    let wood = 0;
    for (let t = 0; t < 120_000; t += 16) wood += tickMill(one, millStatus(w, x, y, wood), 16, wood);
    expect(wood).toBe(Math.floor(120_000 / MILL.msPerWoodOneTree));

    for (let k = 0; k < 10; k++) w.prop[idx(w, x - 3 + (k % 7), y + 3)] = Prop.Tree;
    expect(treesNear(w, x, y)).toBe(8);
    const many = fresh();
    wood = 0;
    for (let t = 0; t < 120_000; t += 16) wood += tickMill(many, millStatus(w, x, y, wood), 16, wood);
    expect(wood).toBe(Math.floor(120_000 / msPerWood(MILL.maxTrees)));
    expect(many.made).toBe(wood);
  });

  it('stops at the storage cap and when its trees are cut down', () => {
    const [w, x, y] = clearing();
    w.build[idx(w, x + 1, y)] = Build.Chest;
    w.prop[idx(w, x, y - 2)] = Prop.Tree;
    const m = fresh();
    expect(tickMill(m, millStatus(w, x, y, MILL.woodCap - 1), 10 * MILL.msPerWoodOneTree, MILL.woodCap - 1)).toBe(1);
    expect(millStatus(w, x, y, MILL.woodCap)).toMatchObject({ ok: false, reason: 'full' });
    w.prop[idx(w, x, y - 2)] = Prop.Stump;
    expect(tickMill(m, millStatus(w, x, y, 0), MILL.msPerWoodOneTree, 0)).toBe(0);
  });
});
