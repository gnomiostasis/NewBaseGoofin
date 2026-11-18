import { describe, expect, it } from 'vitest';
import { DAY, countdownLabel, dayNumber, hourLabel, isNight, nextMorning, nightCountdown, nightness } from '../src/game/daynight';

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

describe('night countdown', () => {
  it('counts down to nightfall by day and to sunrise by night', () => {
    const start = nightCountdown(0);
    expect(start.night).toBe(false);
    expect(start.msLeft).toBeCloseTo((DAY.nightFrom - DAY.startAt) * DAY.lengthMs);
    const dusk = nightCountdown(at(DAY.nightFrom));
    expect(dusk.night).toBe(true);
    expect(dusk.msLeft).toBeCloseTo(2 * 60_000);
    // Just after the creatures leave, the next night is almost a full day away.
    const morning = nightCountdown(at(0.99));
    expect(morning.night).toBe(false);
    expect(morning.msLeft).toBeCloseTo((1 - 0.99 + DAY.nightFrom) * DAY.lengthMs);
  });

  it('agrees with isNight across the day', () => {
    for (let f = 0; f < 1; f += 0.01) expect(nightCountdown(at(f)).night).toBe(isNight(at(f)));
  });

  it('formats as minutes and seconds', () => {
    expect(countdownLabel(245_000)).toBe('4:05');
    expect(countdownLabel(59_100)).toBe('1:00');
    expect(countdownLabel(0)).toBe('0:00');
  });
});
