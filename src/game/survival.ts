import { SURVIVAL } from '../config';
import { BASE_MODS, type StatMods } from './stats';

/** The three survival bars, each 0..max. */
export interface Vitals {
  health: number;
  hunger: number; // 100 = full, 0 = starving
  stamina: number;
}

export const freshVitals = (): Vitals => ({
  health: SURVIVAL.maxHealth,
  hunger: SURVIVAL.maxHunger,
  stamina: SURVIVAL.maxStamina,
});

export interface TickInput {
  /** Seconds since the last tick. */
  dt: number;
  moving: boolean;
  sprinting: boolean;
  /** Within the campfire's warmth: stamina comes back faster. */
  atCamp: boolean;
}

/**
 * Advances the bars by `dt` seconds. Hunger always drains (faster when sprinting).
 * Stamina recovers when you're not sprinting, slowly if you're hungry.
 * At zero hunger you start losing health.
 */
export function tickVitals(v: Vitals, t: TickInput, m: StatMods = BASE_MODS): Vitals {
  const s = SURVIVAL;
  let hunger = v.hunger - t.dt * s.hungerPerSecond * m.hungerMul * (t.sprinting ? s.sprintHungerFactor : 1);
  let stamina = v.stamina;
  let health = v.health;

  if (t.sprinting && t.moving) stamina -= t.dt * s.sprintStaminaPerSecond * m.sprintCostMul;
  else {
    const hungry = hunger < s.hungryBelow;
    const rate = (t.atCamp ? s.campStaminaRegen : s.staminaRegen) * m.staminaRegenMul * (hungry ? 0.35 : 1) * (t.moving ? 0.5 : 1);
    stamina += t.dt * rate;
  }

  if (hunger <= 0) {
    hunger = 0;
    health -= t.dt * s.starveDamagePerSecond;
  } else if (hunger > s.hungryBelow && t.atCamp) {
    health += t.dt * s.campHealPerSecond;
  }

  return {
    health: clamp(health, 0, m.maxHealth),
    hunger: clamp(hunger, 0, s.maxHunger),
    stamina: clamp(stamina, 0, s.maxStamina),
  };
}

/** Spend stamina for an action. Returns false (and spends nothing) if there isn't enough. */
export function spendStamina(v: Vitals, cost: number): boolean {
  if (v.stamina < cost) return false;
  v.stamina -= cost;
  return true;
}

export function eat(v: Vitals, food: number, heal = 0, maxHealth = SURVIVAL.maxHealth) {
  v.hunger = clamp(v.hunger + food, 0, SURVIVAL.maxHunger);
  v.health = clamp(v.health + heal, 0, maxHealth);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
