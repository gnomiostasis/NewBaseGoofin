// Creatures of the outer zones, how they spawn, and how a fight between you and one plays out.

import type { StatMods } from './stats';

export type CreatureId = 'bramblehog' | 'duskprowler';

export interface CreatureDef {
  id: CreatureId;
  name: string;
  /** Lowest zone it lives in; it won't follow you into anything safer. */
  minZone: number;
  hp: number;
  damage: number;
  /** Pixels per second. */
  wanderSpeed: number;
  chaseSpeed: number;
  /** Tiles at which it notices you. */
  aggro: number;
  /** Tiles it will chase from where it started before giving up. */
  leash: number;
  /** Milliseconds between its bites. */
  attackCooldown: number;
}

export const CREATURES: Record<CreatureId, CreatureDef> = {
  bramblehog: {
    id: 'bramblehog',
    name: 'Bramblehog',
    minZone: 2,
    hp: 28,
    damage: 12,
    wanderSpeed: 22,
    chaseSpeed: 66,
    aggro: 5,
    leash: 12,
    attackCooldown: 1100,
  },
  duskprowler: {
    id: 'duskprowler',
    name: 'Duskprowler',
    minZone: 3,
    hp: 60,
    damage: 18,
    wanderSpeed: 30,
    chaseSpeed: 88,
    aggro: 7,
    leash: 16,
    attackCooldown: 950,
  },
};

export const SPAWN = {
  /** Most creatures alive near you at once, by the zone you're in. */
  maxNear: [0, 0, 4, 7] as number[],
  /** Duskprowlers hunt in pairs. */
  packSize: { bramblehog: 1, duskprowler: 2 } as Record<CreatureId, number>,
  /** Spawn in a ring around you, out of sight. */
  minDist: 13,
  maxDist: 20,
  /** Creatures this far away are removed. */
  despawnDist: 32,
  intervalMs: 2200,
};

/** Which creature spawns on a tile of this zone (roll in [0, 1)), or null for none. */
export function pickSpawn(zone: number, roll: number): CreatureId | null {
  if (zone < 2) return null;
  if (zone === 2) return 'bramblehog';
  return roll < 0.7 ? 'duskprowler' : 'bramblehog';
}

/** Night raids: creatures come out after dark and hunt you wherever you are, camp included. */
export const NIGHT = {
  /** Night creatures alive at once on the first night; each night adds more, up to `maxCount`. */
  baseCount: 2,
  perNight: 1,
  maxCount: 9,
  intervalMs: 3500,
  /** Every structure has this much health against bites; walls and doors are tougher. */
  structureHp: { wall: 400, door: 260, other: 120 } as const,
  /** After you collapse, the night leaves you alone this long. */
  graceMs: 30_000,
};

/** How many night creatures can be out on night `day` (1 = first night). */
export function nightCap(day: number): number {
  return Math.min(NIGHT.maxCount, NIGHT.baseCount + NIGHT.perNight * Math.max(0, day - 1));
}

/** Which creature a night raid sends (roll in [0, 1)): bramblehogs early on, then duskprowlers too. */
export function pickNightSpawn(day: number, roll: number): CreatureId {
  const prowlerChance = Math.min(0.5, Math.max(0, (day - 2) * 0.15));
  return roll < prowlerChance ? 'duskprowler' : 'bramblehog';
}

export const COMBAT = {
  baseDamage: 5,
  /** Extra damage per point of axe power (stone 1, copper 2). */
  weaponDamage: 4,
  swingCooldownMs: 420,
  swingStamina: 5,
  /** Reach of a swing in pixels, measured from your centre. */
  reach: 16,
  /** You can't be hurt again for this long after a hit. */
  invulnMs: 650,
};

export function playerDamage(mods: StatMods, axePower: number): number {
  return COMBAT.baseDamage + mods.damageBonus + axePower * COMBAT.weaponDamage;
}

/**
 * Rough fight: can a player with these mods kill `count` of this creature, one after another,
 * before they kill the player? Every living creature bites once per cooldown (or once per
 * invulnerability window, whichever is longer). Used to check the "level up to survive" promise.
 */
export function wouldWin(def: CreatureDef, count: number, mods: StatMods, axePower: number, startHealth = mods.maxHealth): boolean {
  const swingsToKill = Math.ceil(def.hp / playerDamage(mods, axePower));
  const biteEvery = Math.max(def.attackCooldown, COMBAT.invulnMs);
  let taken = 0;
  for (let i = 0; i < count; i++) {
    // Creature i stays alive until the player has landed (i + 1) kills' worth of swings.
    const aliveFor = ((i + 1) * swingsToKill - 1) * COMBAT.swingCooldownMs;
    taken += (Math.floor(aliveFor / biteEvery) + 1) * def.damage;
  }
  return taken < startHealth;
}
