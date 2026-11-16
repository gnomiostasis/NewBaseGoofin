import Phaser from 'phaser';
import { TILE, ZONES } from '../config';
import { UI } from '../art/palette';
import { Ground, Prop } from '../world/generate';
import { darknessAt, tintAt } from '../world/shade';
import type { WorldScene } from './WorldScene';

const FONT = '"Pixelify Sans", "Courier New", monospace';

const ZONE_BLURBS: Record<number, string> = {
  0: 'Home, for now. The fire keeps the dark at bay.',
  1: 'Open grass, berries and loose stone. Safe enough by day.',
  2: 'The trees close in. Better wood, and ore in the rocks.',
  3: 'Cold and dark. Something watches from between the pines.',
};

/** Screen-space overlay: zone panel, compass to camp, minimap, banners and hints. */
export class HudScene extends Phaser.Scene {
  private worldScene!: WorldScene;
  private zoneText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Triangle;
  private panel!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Image;
  private mapBox!: Phaser.GameObjects.Container;
  private mapDot!: Phaser.GameObjects.Rectangle;
  private mapScale = 0.75;
  private lastZone = -1;
  private edgeShown = false;
  private hintTimer = 0;
  private moved = false;

  constructor() {
    super('hud');
  }

  create() {
    this.worldScene = this.scene.get('world') as WorldScene;
    this.buildVignette();

    this.panel = this.add.graphics();
    this.drawPanel(this.panel, 12, 12, 236, 58);
    this.zoneText = this.text(26, 20, 'Camp', 20, UI.ink);
    this.campText = this.text(52, 46, '', 14, UI.ink);
    this.arrow = this.add.triangle(36, 52, 0, 12, 6, 0, 12, 12, 0x8a5a36).setOrigin(0.5);

    this.buildBanner();
    this.buildMinimap();

    this.hint = this.text(0, 0, 'WASD or arrow keys to walk   ·   M toggles the map', 16, UI.cream)
      .setOrigin(0.5, 1)
      .setStroke(UI.ink, 4);

    this.input.keyboard!.on('keydown-M', () => this.mapBox.setVisible(!this.mapBox.visible));
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.layout();
  }

  private text(x: number, y: number, s: string, size: number, color: string) {
    return this.add
      .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setResolution(Math.max(1, window.devicePixelRatio || 1));
  }

  /** Wooden frame with a parchment face, like the mockup's HUD panels. */
  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    const c = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
    g.fillStyle(c(UI.outline)).fillRect(x, y, w, h);
    g.fillStyle(c(UI.wood)).fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle(c(UI.woodLight)).fillRect(x + 3, y + 3, w - 6, 3);
    g.fillStyle(c(UI.parchment)).fillRect(x + 8, y + 8, w - 16, h - 16);
  }

  private buildVignette() {
    const size = 256;
    const tex = this.textures.createCanvas('vignette', size, size)!;
    const g = tex.getContext();
    const grad = g.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size * 0.72);
    grad.addColorStop(0, 'rgba(8,12,24,0)');
    grad.addColorStop(1, 'rgba(8,12,24,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    tex.refresh();
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0);
  }

  private buildBanner() {
    this.bannerTitle = this.text(0, 0, '', 34, UI.cream).setOrigin(0.5).setStroke(UI.ink, 6);
    this.bannerSub = this.text(0, 34, '', 16, UI.cream).setOrigin(0.5).setStroke(UI.ink, 4);
    this.banner = this.add.container(0, 0, [this.bannerTitle, this.bannerSub]).setAlpha(0);
  }

  private showBanner(title: string, sub: string) {
    this.bannerTitle.setText(title);
    this.bannerSub.setText(sub);
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, duration: 500 },
        { alpha: 1, duration: 2600 },
        { alpha: 0, duration: 900 },
      ],
    });
  }

  private buildMinimap() {
    const w = this.worldScene.world;
    const tex = this.textures.createCanvas('minimap', w.width, w.height)!;
    const g = tex.getContext();
    const img = g.createImageData(w.width, w.height);
    const zoneGrass = [
      [134, 191, 98],
      [106, 166, 78],
      [72, 132, 62],
      [44, 88, 70],
    ];
    for (let i = 0; i < w.width * w.height; i++) {
      let [r, gg, b] = zoneGrass[w.zone[i]];
      if (w.ground[i] === Ground.Water) [r, gg, b] = [91, 155, 213];
      else if (w.ground[i] === Ground.Dirt) [r, gg, b] = [199, 154, 108];
      else if (w.prop[i] === Prop.Tree) [r, gg, b] = [r * 0.62, gg * 0.7, b * 0.72];
      else if (w.prop[i] === Prop.Rock || w.prop[i] === Prop.OreRock) [r, gg, b] = [154, 160, 166];
      const tint = tintAt(w.depth[i]);
      const k = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255].map((c) => c / 255);
      img.data.set([r * k[0], gg * k[1], b * k[2], 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    tex.refresh();

    const s = this.mapScale;
    const size = w.width * s;
    const frame = this.add.graphics();
    this.drawPanel(frame, -10, -10, size + 20, size + 20);
    const map = this.add.image(0, 0, 'minimap').setOrigin(0).setScale(s);
    const camp = this.add.rectangle(w.campX * s, w.campY * s, 5, 5, 0xf28c28).setStrokeStyle(1, 0x2e1f15);
    this.mapDot = this.add.rectangle(0, 0, 4, 4, 0xfff6dc).setStrokeStyle(1, 0x2e1f15);
    this.mapBox = this.add.container(0, 0, [frame, map, camp, this.mapDot]);
  }

  private layout() {
    const { width, height } = this.scale;
    this.vignette.setDisplaySize(width, height);
    this.banner.setPosition(width / 2, Math.round(height * 0.2));
    this.hint.setPosition(width / 2, height - 18);
    const size = this.worldScene.world.width * this.mapScale;
    this.mapBox.setPosition(width - size - 22, 22);
    // Hide the map on small screens by default; M still shows it.
    if (width < 700) this.mapBox.setVisible(false);
  }

  update(_time: number, delta: number) {
    const st = this.worldScene.state;
    const w = this.worldScene.world;

    if (st.zone !== this.lastZone) {
      const z = ZONES[st.zone];
      this.zoneText.setText(z.name);
      if (this.lastZone !== -1) this.showBanner(z.name, ZONE_BLURBS[st.zone]);
      this.lastZone = st.zone;
    }

    // Compass back to camp.
    const dx = w.campX * TILE + 8 - st.x;
    const dy = (w.campY + 1) * TILE - st.y;
    const dist = Math.round(Math.hypot(dx, dy) / TILE);
    if (dist <= 3) {
      this.campText.setText('At camp');
      this.arrow.setVisible(false);
    } else {
      this.campText.setText(`Camp is ${dist} steps ${compassName(dx, dy)}`);
      this.arrow.setVisible(true).setRotation(Math.atan2(dy, dx) + Math.PI / 2);
    }

    this.vignette.setAlpha(Math.min(0.85, 0.15 + darknessAt(st.depth) * 1.05));
    this.mapDot.setPosition((st.x / TILE) * this.mapScale, (st.y / TILE) * this.mapScale);

    if (st.atEdge && !this.edgeShown) {
      this.edgeShown = true;
      this.showBanner('The edge of the known wilds', 'Nothing but dark trees beyond. Time to head home.');
    }

    // Fade the controls hint once the player has walked a bit.
    if (!this.moved && this.worldScene.player?.body.speed > 0) this.moved = true;
    if (this.moved) {
      this.hintTimer += delta;
      if (this.hintTimer > 1500) this.hint.setAlpha(Math.max(0, this.hint.alpha - delta / 800));
    }
  }
}

function compassName(dx: number, dy: number) {
  const names = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
  const a = Math.atan2(dy, dx);
  const k = Math.round(a / (Math.PI / 4));
  return names[(k + 8) % 8];
}
