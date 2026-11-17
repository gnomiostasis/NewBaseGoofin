// The day and night cycle. A full day takes DAY.lengthMs of play; a run starts in the morning.
// Clock time is a fraction of the day: 0 is dawn (6 AM), 0.5 is dusk (6 PM).

export const DAY = {
  /** One full day and night, in milliseconds of play. */
  lengthMs: 8 * 60_000,
  /** Fraction of the day when dusk starts and when it is fully night. */
  duskStart: 0.5,
  nightStart: 0.58,
  /** Fraction of the day when night starts to lift and when it's fully morning. */
  dawnStart: 0.92,
  /** A new run starts here: mid-morning. */
  startAt: 0.08,
  /** How dark full night gets (0 none, 1 black). Kept readable. */
  maxDark: 0.62,
};

/** Where in the day `clockMs` falls, 0 to 1. */
export function dayFraction(clockMs: number): number {
  const f = (clockMs / DAY.lengthMs + DAY.startAt) % 1;
  return f < 0 ? f + 1 : f;
}

/** Day number, starting from 1. */
export function dayNumber(clockMs: number): number {
  return Math.floor(clockMs / DAY.lengthMs + DAY.startAt) + 1;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** How night it is, 0 (day) to 1 (deep night), easing through dusk and dawn. */
export function nightness(clockMs: number): number {
  const f = dayFraction(clockMs);
  if (f < DAY.duskStart) return 0;
  if (f < DAY.nightStart) return smooth((f - DAY.duskStart) / (DAY.nightStart - DAY.duskStart));
  if (f < DAY.dawnStart) return 1;
  return 1 - smooth((f - DAY.dawnStart) / (1 - DAY.dawnStart));
}

/** True once it's dark enough for night creatures to come out. */
export function isNight(clockMs: number): boolean {
  return nightness(clockMs) > 0.5;
}

/** Clock time to sleep until: the next morning at 6 AM. */
export function nextMorning(clockMs: number): number {
  const sinceDawn = dayFraction(clockMs) * DAY.lengthMs;
  return clockMs - sinceDawn + DAY.lengthMs;
}

/** "9 AM", "12 PM", "11 PM". */
export function hourLabel(clockMs: number): string {
  const h = (Math.floor(dayFraction(clockMs) * 24) + 6) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Morning", "Afternoon", "Evening", "Night". */
export function partOfDay(clockMs: number): string {
  const f = dayFraction(clockMs);
  if (f < 0.25) return 'Morning';
  if (f < DAY.duskStart) return 'Afternoon';
  if (f < DAY.nightStart) return 'Evening';
  if (f < DAY.dawnStart) return 'Night';
  return 'Dawn';
}
