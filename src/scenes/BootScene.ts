import Phaser from 'phaser';
import { buildTextures } from '../art/textures';

/** Paints all textures, waits briefly for the UI font, then starts the world. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  async create() {
    buildTextures(this);
    try {
      await Promise.race([
        document.fonts.load('16px "Pixelify Sans"'),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Fall back to the monospace font if the web font can't load.
    }
    this.scene.start('world');
    this.scene.launch('hud');
  }
}
