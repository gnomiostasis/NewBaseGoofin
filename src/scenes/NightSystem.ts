import Phaser from 'phaser';
import { DAY, nightness } from '../game/daynight';

export interface Light {
  x: number;
  y: number;
  /** Radius in world pixels. */
  r: number;
  /** Gentle flicker, like a fire. */
  flicker?: boolean;
}

const MASK = 64;
const NIGHT_COLOR = 0x0b1030;

/** Darkens the world as night falls and cuts soft pools of light around fires, lanterns and you. */
export class NightSystem {
  readonly lights: Light[] = [];
  private rt!: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;
  private rtW = 0;
  private rtH = 0;

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists('lightmask')) {
      const tex = scene.textures.createCanvas('lightmask', MASK, MASK)!;
      const g = tex.getContext();
      const grad = g.createRadialGradient(MASK / 2, MASK / 2, 0, MASK / 2, MASK / 2, MASK / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, MASK, MASK);
      tex.refresh();
    }
    this.stamp = scene.make.image({ key: 'lightmask', add: false }).setOrigin(0.5);
  }

  addLight(l: Light) {
    this.lights.push(l);
    return l;
  }

  removeLight(l: Light) {
    const k = this.lights.indexOf(l);
    if (k >= 0) this.lights.splice(k, 1);
  }

  /** The light whose pool (x, y) stands in, if any. */
  litAt(x: number, y: number, shrink = 0.8): Light | null {
    for (const l of this.lights) if (Math.hypot(x - l.x, y - l.y) < l.r * shrink) return l;
    return null;
  }

  update(clockMs: number, time: number) {
    const n = nightness(clockMs);
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    // The darkness is drawn at world resolution, so its edges come out as chunky pixels like the art.
    const w = Math.ceil(view.width) + 16;
    const h = Math.ceil(view.height) + 16;
    if (!this.rt || w > this.rtW || h > this.rtH) {
      this.rt?.destroy();
      this.rtW = Math.max(w, this.rtW);
      this.rtH = Math.max(h, this.rtH);
      this.rt = this.scene.add.renderTexture(0, 0, this.rtW, this.rtH).setOrigin(0).setDepth(150000);
    }
    this.rt.setVisible(n > 0.001);
    if (n <= 0.001) return;
    const ox = Math.floor(view.x) - 8;
    const oy = Math.floor(view.y) - 8;
    this.rt.setPosition(ox, oy);
    this.rt.clear();
    this.rt.fill(NIGHT_COLOR, DAY.maxDark * n);
    for (const l of this.lights) {
      if (l.x + l.r < ox || l.y + l.r < oy || l.x - l.r > ox + this.rtW || l.y - l.r > oy + this.rtH) continue;
      const f = l.flicker ? 1 + Math.sin(time / 130 + l.x) * 0.03 + Math.sin(time / 57) * 0.02 : 1;
      this.stamp.setPosition(l.x - ox, l.y - oy).setScale(((l.r * 2) / MASK) * f);
      this.rt.erase(this.stamp);
    }
  }
}
