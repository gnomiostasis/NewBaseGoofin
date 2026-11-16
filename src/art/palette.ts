// The game's limited palette. Four shades per material: [base, dark, light, outline],
// with light always falling from the top left. Seasons will swap these sets later.

export type Shades = readonly [string, string, string, string];

export const OUTLINE = '#2e1f15';

export const GRASS: Shades = ['#6aa64e', '#558f42', '#86bf62', '#3f7536'];
export const DIRT: Shades = ['#ad7d51', '#8e6342', '#c79a6c', '#664330'];
export const WATER: Shades = ['#5b9bd5', '#4a82b8', '#86bde8', '#2f5a85'];
export const WOOD: Shades = ['#9c6b43', '#7a4f30', '#bb8657', '#3f2818'];
export const STONE: Shades = ['#9aa0a6', '#787e86', '#bcc2c7', '#4a4f57'];
export const CANVAS: Shades = ['#c9b48a', '#a08b63', '#e0cfa6', OUTLINE];
export const BURLAP: Shades = ['#c2a26e', '#9c7f50', '#dcc08c', OUTLINE];

/** Canopy colours by zone: warm near camp, deeper in the woods, cool and dark in the Deepwild. */
export const LEAVES: Record<'meadow' | 'woods' | 'deep', Shades[]> = {
  meadow: [
    ['#559e4a', '#3e7f3e', '#7cc25e', '#2a5634'],
    ['#62a84a', '#4a8a3c', '#8acb64', '#2f5a30'],
  ],
  woods: [
    ['#418c3f', '#2f6e36', '#62aa4c', '#204a2b'],
    ['#3b7f45', '#2a6339', '#58a058', '#1c4229'],
  ],
  deep: [
    ['#2f5d4a', '#234a3c', '#3f7560', '#152f25'],
    ['#2c5552', '#1f4241', '#3c6e6a', '#122a29'],
  ],
};

export const FLOWERS = ['#f4e27a', '#f4a6c0', '#ffffff', '#9cc0ff'];
export const BERRY = '#d8434e';
export const ORE = ['#e08a3c', '#ffc27a'] as const;
export const FIRE = ['#c8442d', '#f28c28', '#ffe08a'] as const;
export const GLOW_SHROOM = ['#6fd6e8', '#3aa0b8'] as const;
export const EYES = '#ffe36a';

export const PLAYER_COLORS: Record<string, string> = {
  o: OUTLINE,
  H: '#9a5e38', // hair
  h: '#6b3e26', // hair shadow
  s: '#f2c29b', // skin
  e: OUTLINE, // eyes
  c: '#c8553d', // tunic
  C: '#e07a5a', // tunic light
  p: '#3d4a6b', // trousers
  b: '#5a3a24', // boots
  k: '#8a5a36', // pack strap
};

/** UI wood panels and parchment. */
export const UI = {
  outline: '#2e1f15',
  wood: '#8a5a36',
  woodLight: '#b07a4a',
  parchment: '#f0dcae',
  ink: '#3b2618',
  cream: '#fff6dc',
};
