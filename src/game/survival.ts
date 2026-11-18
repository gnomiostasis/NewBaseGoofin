import { SURVIVAL } from '../config';
import { BASE_MODS, type StatMods } from './stats';

/** The two survival bars, each 0..max. */
export interface Vitals {
  health: number;
  stamina: number;
}

export const freshVitals = (): Vitals => ({
  health: SURVIVAL.maxHealth,
  stamina: SURVIVAL.maxStamina,
});

export interface TickInput {
  /** Seconds since the last tick. */
  dt: number;
  moving: boolean;
  sprinting: boolean;
  /** Within the campfire's warmth: energy comes back faster and health slowly returns. */
  atCamp: boolean;
}

/** Advances the bars by `dt` seconds. Energy recovers when you're not sprinting; camp heals you slowly. */
export function tickVitals(v: Vitals, t: TickInput, m: StatMods = BASE_MODS): Vitals {
  const s = SURVIVAL;
  let stamina = v.stamina;
  let health = v.health;

  if (t.sprinting && t.moving) stamina -= t.dt * s.sprintStaminaPerSecond * m.sprintCostMul;
  else {
    const rate = (t.atCamp ? s.campStaminaRegen : s.staminaRegen) * m.staminaRegenMul * (t.moving ? 0.5 : 1);
    stamina += t.dt * rate;
  }
  if (t.atCamp) health += t.dt * s.campHealPerSecond;

  return {
    health: clamp(health, 0, m.maxHealth),
    stamina: clamp(stamina, 0, s.maxStamina),
  };
}

/** Spend stamina for an action. Returns false (and spends nothing) if there isn't enough. */
export function spendStamina(v: Vitals, cost: number): boolean {
  if (v.stamina < cost) return false;
  v.stamina -= cost;
  return true;
}

/** Why you can't eat right now, or null if a meal would heal you. */
export function cantEat(v: Vitals, maxHealth: number, now: number, readyAt: number): string | null {
  if (now < readyAt) return `You can eat again in ${Math.ceil((readyAt - now) / 1000)}s.`;
  if (v.health >= maxHealth - 0.5) return "You're already at full health.";
  return null;
}

/** Eats: heals `heal` health (times the endurance bonus). Returns when you can eat again. */
export function eat(v: Vitals, heal: number, maxHealth: number, now: number, m: StatMods = BASE_MODS): number {
  v.health = clamp(v.health + heal * m.foodHealMul, 0, maxHealth);
  return now + SURVIVAL.foodCooldownMs;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
