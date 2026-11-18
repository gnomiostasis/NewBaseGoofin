// The day and night cycle. A full day takes DAY.lengthMs of play: about 6 minutes of daylight,
// then about 2 minutes of night. A run starts in the morning. Clock time is a fraction of the
// day: 0 is 6 AM, `nightFrom` is 8 PM, and the hours of the night pass faster than the day's.

export const DAY = {
  /** One full day and night, in milliseconds of play. */
  lengthMs: 8 * 60_000,
  /** Fraction of the day when dusk starts and when it is fully night. */
  duskStart: 0.71,
  nightStart: 0.75,
  /** Fraction of the day when night starts to lift and when it's fully morning. */
  dawnStart: 0.96,
  /** Night creatures are out from here (halfway through dusk) until halfway through dawn: 2 minutes. */
  nightFrom: 0.73,
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

/** "9 AM", "12 PM", "11 PM". */
export function hourLabel(clockMs: number): string {
  const f = dayFraction(clockMs);
  // 6 AM to 8 PM across the day, 8 PM to 6 AM across the (shorter) night.
  const hours = f < DAY.nightFrom ? 6 + (f / DAY.nightFrom) * 14 : 20 + ((f - DAY.nightFrom) / (1 - DAY.nightFrom)) * 10;
  const h = Math.floor(hours) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Morning", "Afternoon", "Evening", "Night". */
export function partOfDay(clockMs: number): string {
  const f = dayFraction(clockMs);
  if (f < 0.3) return 'Morning';
  if (f < DAY.duskStart) return 'Afternoon';
  if (f < DAY.nightStart) return 'Evening';
  if (f < DAY.dawnStart) return 'Night';
  return 'Dawn';
}

/** Night creatures come out halfway through dusk and leave halfway through dawn. */
const NIGHT_END = (DAY.dawnStart + 1) / 2;

/** Whether it's night now, and how long until that changes (nightfall by day, sunrise by night). */
export function nightCountdown(clockMs: number): { night: boolean; msLeft: number } {
  const f = dayFraction(clockMs);
  const night = f >= DAY.nightFrom && f < NIGHT_END;
  let target = night ? NIGHT_END : DAY.nightFrom;
  if (!night && f >= NIGHT_END) target += 1;
  return { night, msLeft: Math.max(0, (target - f) * DAY.lengthMs) };
}

/** "4:05" from milliseconds, rounding up so it never shows 0:00 early. */
export function countdownLabel(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
