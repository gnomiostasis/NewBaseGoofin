/** Every control, for the in-game controls panel (H) and the title screen. */
export const CONTROLS: Array<[key: string, does: string]> = [
  ['WASD / arrows', 'Walk'],
  ['Shift', 'Run (uses energy)'],
  ['Left click', 'Use what you click next to you; hold to keep chopping or mining'],
  ['Right click', 'Attack toward the mouse (fighters swing, archers shoot, mages cast); hold to keep going'],
  ['Space', "Swing at what's in front of you"],
  ['F', 'Eat to heal (mushrooms first, then berries); then wait out the Food bar before the next meal'],
  ['B or C', 'Build & craft menu: click a recipe to craft, or a building to place it'],
  ['Placing', 'Left click places, right click (or Esc) cancels, 1-9, 0, - switch'],
  ['L', 'Stats: + and - stage points, Confirm (or Enter) spends them'],
  ['M', 'Map'],
  ['H', 'Show or hide these controls'],
  ['Esc', 'Close any panel'],
];
