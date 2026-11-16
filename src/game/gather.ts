import { Prop } from '../world/generate';
import type { ItemId } from './items';

/** What you get from a prop, what it takes, and what's left behind. */
export interface GatherRule {
  verb: string;
  tool?: 'axe' | 'pick';
  /** Swings needed. Pickups take one. */
  hits: number;
  /** Stamina per swing. */
  stamina: number;
  yields: Array<[ItemId, number]>;
  leaves: Prop;
  /** Seconds until the prop grows back from what it leaves behind. */
  regrow?: number;
}

export const GATHER: Partial<Record<Prop, GatherRule>> = {
  [Prop.Sticks]: { verb: 'Pick up', hits: 1, stamina: 0, yields: [['stick', 2]], leaves: Prop.None },
  [Prop.Pebbles]: { verb: 'Pick up', hits: 1, stamina: 0, yields: [['stone', 2]], leaves: Prop.None },
  [Prop.TallGrass]: { verb: 'Pull', hits: 1, stamina: 1, yields: [['fiber', 2]], leaves: Prop.None },
  [Prop.BerryBush]: { verb: 'Pick', hits: 1, stamina: 0, yields: [['berries', 3]], leaves: Prop.BareBush, regrow: 150 },
  [Prop.Mushroom]: { verb: 'Pick', hits: 1, stamina: 0, yields: [['mushroom', 1]], leaves: Prop.None },
  [Prop.Tree]: { verb: 'Chop', tool: 'axe', hits: 4, stamina: 6, yields: [['wood', 3], ['stick', 1]], leaves: Prop.Stump, regrow: 480 },
  [Prop.Log]: { verb: 'Chop', tool: 'axe', hits: 2, stamina: 5, yields: [['wood', 2]], leaves: Prop.None },
  [Prop.Rock]: { verb: 'Mine', tool: 'pick', hits: 3, stamina: 7, yields: [['stone', 3]], leaves: Prop.None },
  [Prop.OreRock]: { verb: 'Mine', tool: 'pick', hits: 5, stamina: 8, yields: [['copper_ore', 2], ['stone', 1]], leaves: Prop.None },
};

/** Glowcaps are the Deepwild's rare find. */
export const GLOWCAP_RULE: GatherRule = { verb: 'Pick', hits: 1, stamina: 0, yields: [['glowcap', 1]], leaves: Prop.None };
