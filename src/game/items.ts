// Every item in the game, with how heavy it is and what eating it does.
// Tuning numbers live here so balancing is one file.

export type ItemId =
  | 'stick'
  | 'stone'
  | 'fiber'
  | 'berries'
  | 'wood'
  | 'copper_ore'
  | 'mushroom'
  | 'glowcap'
  | 'stone_axe'
  | 'stone_pick'
  | 'copper_axe'
  | 'copper_pick'
  | 'woven_basket';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Pack weight per item. */
  weight: number;
  /** Health restored when eaten (food only). */
  heal?: number;
  tool?: 'axe' | 'pick';
  /** Tool strength: hits needed are divided by this. */
  power?: number;
  /** Extra pack capacity while carried. */
  capacity?: number;
  /** Materials can be dropped into the camp stash; tools and food stay with you. */
  kind: 'material' | 'food' | 'tool';
}

export const ITEMS: Record<ItemId, ItemDef> = {
  stick: { id: 'stick', name: 'Stick', weight: 1, kind: 'material' },
  stone: { id: 'stone', name: 'Stone', weight: 2, kind: 'material' },
  fiber: { id: 'fiber', name: 'Plant fiber', weight: 0.5, kind: 'material' },
  wood: { id: 'wood', name: 'Wood', weight: 2, kind: 'material' },
  copper_ore: { id: 'copper_ore', name: 'Copper ore', weight: 3, kind: 'material' },
  glowcap: { id: 'glowcap', name: 'Glowcap', weight: 0.5, kind: 'material' },
  berries: { id: 'berries', name: 'Berries', weight: 0.5, heal: 15, kind: 'food' },
  mushroom: { id: 'mushroom', name: 'Mushroom', weight: 0.5, heal: 25, kind: 'food' },
  stone_axe: { id: 'stone_axe', name: 'Stone axe', weight: 3, tool: 'axe', power: 1, kind: 'tool' },
  stone_pick: { id: 'stone_pick', name: 'Stone pick', weight: 3, tool: 'pick', power: 1, kind: 'tool' },
  copper_axe: { id: 'copper_axe', name: 'Copper axe', weight: 3, tool: 'axe', power: 2, kind: 'tool' },
  copper_pick: { id: 'copper_pick', name: 'Copper pick', weight: 3, tool: 'pick', power: 2, kind: 'tool' },
  woven_basket: { id: 'woven_basket', name: 'Woven basket', weight: 0, capacity: 20, kind: 'tool' },
};

export interface Recipe {
  makes: ItemId;
  needs: Partial<Record<ItemId, number>>;
}

/** Hand recipes: no workbench needed. The workbench and better tools arrive in milestone 3. */
export const HAND_RECIPES: Recipe[] = [
  { makes: 'stone_axe', needs: { stick: 3, stone: 2, fiber: 2 } },
  { makes: 'stone_pick', needs: { stick: 3, stone: 3, fiber: 2 } },
];

/** Made at a workbench. Ingredients can come from your pack or nearby storage. */
export const BENCH_RECIPES: Recipe[] = [
  { makes: 'copper_axe', needs: { copper_ore: 4, wood: 2, stick: 2 } },
  { makes: 'copper_pick', needs: { copper_ore: 5, wood: 2, stick: 2 } },
  { makes: 'woven_basket', needs: { fiber: 12, stick: 4 } },
];

/** Order items appear in the pack display. */
export const ITEM_ORDER: ItemId[] = [
  'copper_axe',
  'copper_pick',
  'stone_axe',
  'stone_pick',
  'woven_basket',
  'berries',
  'mushroom',
  'stick',
  'stone',
  'fiber',
  'wood',
  'copper_ore',
  'glowcap',
];
