import { describe, expect, it } from 'vitest';
import { DAY, dayNumber, hourLabel, isNight, nextMorning, nightness } from '../src/game/daynight';

const at = (f: number, day = 0) => (day + f - DAY.startAt) * DAY.lengthMs;

describe('day and night', () => {
  it('starts on a bright morning of day 1', () => {
    expect(dayNumber(0)).toBe(1);
    expect(nightness(0)).toBe(0);
    expect(hourLabel(0)).toBe('7 AM');
  });

  it('gets dark through dusk, stays dark, then lifts at dawn', () => {
    expect(nightness(at(0.3))).toBe(0);
    const mid = nightness(at((DAY.duskStart + DAY.nightStart) / 2));
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(nightness(at(0.85))).toBe(1);
    expect(isNight(at(0.85))).toBe(true);
    expect(nightness(at(0.999))).toBeLessThan(0.05);
    expect(hourLabel(at(0.85))).toBe('12 AM');
    expect(hourLabel(at(DAY.duskStart))).toBe('7 PM');
  });

  it('has about 6 minutes of day and 2 minutes of night', () => {
    let night = 0;
    const step = 100;
    for (let t = 0; t < DAY.lengthMs; t += step) if (isNight(t)) night += step;
    expect(night / 60_000).toBeCloseTo(2, 1);
    expect((DAY.lengthMs - night) / 60_000).toBeCloseTo(6, 1);
  });

  it('sleeping skips to the next morning', () => {
    const t = at(0.85, 2);
    const m = nextMorning(t);
    expect(m).toBeGreaterThan(t);
    expect(nightness(m)).toBe(0);
    expect(hourLabel(m)).toBe('6 AM');
    expect(dayNumber(m)).toBe(dayNumber(t) + 1);
  });
});

import { NIGHT, nightCap, pickNightSpawn } from '../src/game/creatures';

describe('night raids', () => {
  it('start small and grow each night, up to a limit', () => {
    expect(nightCap(1)).toBe(NIGHT.baseCount);
    expect(nightCap(3)).toBeGreaterThan(nightCap(2));
    expect(nightCap(100)).toBe(NIGHT.maxCount);
  });

  it('only send bramblehogs for the first two nights', () => {
    for (const roll of [0, 0.3, 0.99]) {
      expect(pickNightSpawn(1, roll)).toBe('bramblehog');
      expect(pickNightSpawn(2, roll)).toBe('bramblehog');
    }
    expect(pickNightSpawn(5, 0)).toBe('duskprowler');
  });

  it('walls hold far longer than a single bite', () => {
    expect(NIGHT.structureHp.wall).toBeGreaterThan(NIGHT.structureHp.door);
    expect(NIGHT.structureHp.wall / 12).toBeGreaterThanOrEqual(15);
  });
});
