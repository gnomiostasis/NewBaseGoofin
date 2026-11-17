import Phaser from 'phaser';

/** Body text: a chunky pixel face whose letters stay distinct at small sizes (its C never reads as an O). */
export const FONT = '"Jersey 10", "Courier New", monospace';
/** Big display text, like the game's name on the title screen. */
export const DISPLAY_FONT = '"Pixelify Sans", "Courier New", monospace';
/** Jersey 10 draws smaller than most fonts at the same pixel size, so sizes are scaled up to match the old layout. */
const SCALE = 1.3;

/** Adds crisp UI text. `size` is in the game's old layout units, so call sites keep their numbers. */
export function uiText(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color: string) {
  return scene.add
    .text(x, y, s, { fontFamily: FONT, fontSize: `${Math.round(size * SCALE)}px`, color })
    .setResolution(Math.max(1, window.devicePixelRatio || 1));
}
