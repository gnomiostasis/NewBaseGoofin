// Character progression: XP, levels, and the four stats you spend points on.
// Every number that affects balance is in LEVELING so it can be tuned in one place.

import type { ClassId } from './classes';

export type StatId = 'strength' | 'endurance' | 'agility' | 'gathering';

export const STAT_INFO: Record<StatId, { name: string; perPoint: string }> = {
  strength: { name: 'Strength', perPoint: '+2 damage, +5 carry' },
  endurance: { name: 'Endurance', perPoint: '+10 max health, food heals 10% more' },
  agility: { name: 'Agility', perPoint: 'Faster walking, energy recovers faster' },
  gathering: { name: 'Gathering', perPoint: '+10% bonus yield, tools cost less energy' },
};

export const STAT_ORDER: StatId[] = ['strength', 'endurance', 'agility', 'gathering'];

export const LEVELING = {
  maxLevel: 10,
  maxPerStat: 9,
  /** XP for each action. */
  xp: {
    pickup: 1,
    chop: 4,
    mine: 4,
    ore: 7,
    craft: 6,
    build: 2,
    kill: { bramblehog: 18, duskprowler: 40 } as Record<string, number>,
  },
};

/** Total XP needed to go from level `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(25 + 18 * Math.pow(level - 1, 1.45));
}

export class Progress {
  level = 1;
  xp = 0; // toward the next level
  points = 0;
  stats: Record<StatId, number> = { strength: 0, endurance: 0, agility: 0, gathering: 0 };
  /** Fighter, archer or mage; null until you pick one. */
  cls: ClassId | null = null;

  /** Adds XP and returns how many levels were gained. */
  gain(amount: number): number {
    if (this.level >= LEVELING.maxLevel) return 0;
    this.xp += amount;
    let ups = 0;
    while (this.level < LEVELING.maxLevel && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.points++;
      ups++;
    }
    if (this.level >= LEVELING.maxLevel) this.xp = 0;
    return ups;
  }

  spend(stat: StatId): boolean {
    if (this.points <= 0 || this.stats[stat] >= LEVELING.maxPerStat) return false;
    this.stats[stat]++;
    this.points--;
    return true;
  }

  get mods(): StatMods {
    return modsFor(this.stats);
  }
}

/** Everything the stats change, as multipliers and flat bonuses. */
export interface StatMods {
  damageBonus: number;
  carryBonus: number;
  maxHealth: number;
  /** Food heals this much more. */
  foodHealMul: number;
  speedMul: number;
  staminaRegenMul: number;
  sprintCostMul: number;
  bonusYieldChance: number;
  toolStaminaMul: number;
  /** Damage you take is multiplied by this (classes change it). */
  damageTakenMul: number;
}

export function modsFor(s: Record<StatId, number>): StatMods {
  return {
    damageBonus: s.strength * 2,
    carryBonus: s.strength * 5,
    maxHealth: 100 + s.endurance * 10,
    foodHealMul: 1 + s.endurance * 0.1,
    speedMul: 1 + s.agility * 0.04,
    staminaRegenMul: 1 + s.agility * 0.08,
    sprintCostMul: 1 - s.agility * 0.05,
    bonusYieldChance: s.gathering * 0.1,
    toolStaminaMul: 1 - s.gathering * 0.07,
    damageTakenMul: 1,
  };
}

export const BASE_MODS: StatMods = modsFor({ strength: 0, endurance: 0, agility: 0, gathering: 0 });
