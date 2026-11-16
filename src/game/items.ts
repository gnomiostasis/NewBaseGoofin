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
  | 'stone_pick';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Pack weight per item. */
  weight: number;
  /** Hunger restored when eaten (0 = not food). */
  food?: number;
  /** Health restored when eaten. */
  heal?: number;
  tool?: 'axe' | 'pick';
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
  berries: { id: 'berries', name: 'Berries', weight: 0.5, food: 12, kind: 'food' },
  mushroom: { id: 'mushroom', name: 'Mushroom', weight: 0.5, food: 18, heal: 4, kind: 'food' },
  stone_axe: { id: 'stone_axe', name: 'Stone axe', weight: 3, tool: 'axe', kind: 'tool' },
  stone_pick: { id: 'stone_pick', name: 'Stone pick', weight: 3, tool: 'pick', kind: 'tool' },
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

/** Order items appear in the pack display. */
export const ITEM_ORDER: ItemId[] = [
  'stone_axe',
  'stone_pick',
  'berries',
  'mushroom',
  'stick',
  'stone',
  'fiber',
  'wood',
  'copper_ore',
  'glowcap',
];
