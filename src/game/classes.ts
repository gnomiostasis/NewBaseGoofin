// Character classes. You pick one when a run begins: the fighter swings up close, the archer
// shoots arrows from range, and the mage hurls firebolts that burst on impact.
// Every number that affects balance is in CLASSES so it can be tuned in one place.

import { COMBAT, playerDamage } from './creatures';
import type { StatMods } from './stats';

export type ClassId = 'fighter' | 'archer' | 'mage';

export const CLASS_ORDER: ClassId[] = ['fighter', 'archer', 'mage'];

export interface ClassDef {
  id: ClassId;
  name: string;
  /** One line on how the class plays. */
  blurb: string;
  /** The perks, one short line each, as shown on the class picker. */
  perks: string[];
  /** Flat and multiplied changes on top of your stats. */
  maxHealth: number;
  damageBonus: number;
  speedMul: number;
  staminaRegenMul: number;
  /** Damage you take is multiplied by this. */
  damageTakenMul: number;
  /** Radius in pixels of the light you carry at night (0 for none). */
  glow: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    blurb: 'Wades in with an axe and shrugs off bites.',
    perks: ['Hard-hitting swings with a wider reach', '+30 max health', 'Takes 25% less damage'],
    maxHealth: 30,
    damageBonus: 3,
    speedMul: 1,
    staminaRegenMul: 1,
    damageTakenMul: 0.75,
    glow: 0,
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    blurb: 'Picks creatures off before they get close.',
    perks: ['Shoots arrows toward the mouse', 'Walks 12% faster', 'Arrows hit harder as you level'],
    maxHealth: 0,
    damageBonus: 0,
    speedMul: 1.12,
    staminaRegenMul: 1,
    damageTakenMul: 1,
    glow: 0,
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    blurb: 'Hurls firebolts that burst and hit everything nearby.',
    perks: ['Firebolts burst on impact', 'Energy comes back 35% faster', 'Carries a brighter light at night'],
    maxHealth: -10,
    damageBonus: 0,
    speedMul: 1,
    staminaRegenMul: 1.35,
    damageTakenMul: 1,
    glow: 30,
  },
};

/** How a class attacks: a melee swing, or a shot that flies toward the aim point. */
export interface AttackSpec {
  kind: 'swing' | 'arrow' | 'firebolt';
  damage: number;
  cooldownMs: number;
  stamina: number;
  /** Swing reach, or how far a shot flies, in pixels. */
  range: number;
  /** Shot speed in pixels per second (0 for a swing). */
  speed: number;
  /** A firebolt also hurts everything within this many pixels of where it bursts. */
  splash: number;
}

export const SHOTS = {
  arrow: { base: 8, perLevel: 1, cooldownMs: 480, stamina: 3, range: 9 * 16, speed: 320 },
  firebolt: { base: 11, perLevel: 1.5, cooldownMs: 760, stamina: 8, range: 7 * 16, speed: 210, splash: 22 },
  fighter: { reach: 20, cooldownMs: 380 },
};

/** The attack a character of this class, level and gear makes. `cls` null is the classless default. */
export function attackFor(cls: ClassId | null, mods: StatMods, axePower: number, level: number): AttackSpec {
  if (cls === 'archer') {
    const a = SHOTS.arrow;
    return { kind: 'arrow', damage: Math.round(a.base + mods.damageBonus + a.perLevel * level), cooldownMs: a.cooldownMs, stamina: a.stamina, range: a.range, speed: a.speed, splash: 0 };
  }
  if (cls === 'mage') {
    const f = SHOTS.firebolt;
    return { kind: 'firebolt', damage: Math.round(f.base + mods.damageBonus + f.perLevel * level), cooldownMs: f.cooldownMs, stamina: f.stamina, range: f.range, speed: f.speed, splash: f.splash };
  }
  const fighter = cls === 'fighter';
  return {
    kind: 'swing',
    damage: playerDamage(mods, axePower),
    cooldownMs: fighter ? SHOTS.fighter.cooldownMs : COMBAT.swingCooldownMs,
    stamina: COMBAT.swingStamina,
    range: fighter ? SHOTS.fighter.reach : COMBAT.reach,
    speed: 0,
    splash: 0,
  };
}

/** Your stats with the class's perks applied. */
export function withClass(mods: StatMods, cls: ClassId | null): StatMods {
  if (!cls) return mods;
  const c = CLASSES[cls];
  return {
    ...mods,
    maxHealth: mods.maxHealth + c.maxHealth,
    damageBonus: mods.damageBonus + c.damageBonus,
    speedMul: mods.speedMul * c.speedMul,
    staminaRegenMul: mods.staminaRegenMul * c.staminaRegenMul,
    damageTakenMul: mods.damageTakenMul * c.damageTakenMul,
  };
}

/** Damage per second, ignoring splash, for balance checks. */
export function dps(a: AttackSpec): number {
  return (a.damage * 1000) / a.cooldownMs;
}

export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && (CLASS_ORDER as string[]).includes(v);
