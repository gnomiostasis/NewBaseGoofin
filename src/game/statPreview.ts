// What each stat does for you right now, and what it would do with more points in it.
// The stat screen shows these side by side, e.g. "Max health 110 → 120".

import { PACK } from '../config';
import { attackFor, withClass, type ClassId } from './classes';
import { modsFor, type StatId, type StatMods } from './stats';

export interface StatEffect {
  label: string;
  now: string;
  next: string;
}

export interface PreviewInput {
  stats: Record<StatId, number>;
  cls: ClassId | null;
  axePower: number;
  level: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plusPct = (mul: number) => `+${Math.round((mul - 1) * 100)}%`;
const minusPct = (mul: number) => (mul >= 1 ? "0%" : `-${Math.round((1 - mul) * 100)}%`);

function effects(id: StatId, m: StatMods, p: PreviewInput): string[] {
  switch (id) {
    case 'strength':
      return [String(attackFor(p.cls, m, p.axePower, p.level).damage), String(PACK.capacity + m.carryBonus)];
    case 'endurance':
      return [String(m.maxHealth), plusPct(m.foodHealMul)];
    case 'agility':
      return [plusPct(m.speedMul), plusPct(m.staminaRegenMul)];
    case 'gathering':
      return [pct(m.bonusYieldChance), minusPct(m.toolStaminaMul)];
  }
}

const LABELS: Record<StatId, string[]> = {
  strength: ['Damage', 'Carry'],
  endurance: ['Max health', 'Food heals'],
  agility: ['Walk speed', 'Energy regen'],
  gathering: ['Bonus yield', 'Tool energy'],
};

/** The stat's effects with `before` points spent, and with `after` (the staged points added). */
export function previewStat(id: StatId, before: PreviewInput, after: Record<StatId, number>): StatEffect[] {
  const now = effects(id, withClass(modsFor(before.stats), before.cls), before);
  const next = effects(id, withClass(modsFor(after), before.cls), before);
  return LABELS[id].map((label, k) => ({ label, now: now[k], next: next[k] }));
}
