import Phaser from 'phaser';
import { DISPLAY_FONT, uiText } from '../ui/font';
import { TILE } from '../config';
import { UI } from '../art/palette';
import { BUILD_LABEL } from '../build';
import { GRASS_VARIANTS, TREE_FRAMES } from '../art/textures';
import { hash2 } from '../world/rng';
import { GameState } from '../game/state';
import { ago, deleteSave, loadSave, type SaveData } from '../game/save';
import { CONTROLS } from '../game/controls';

const hex = (h: string) => Phaser.Display.Color.HexStringToColor(h).color;

interface Option {
  label: string;
  detail: string;
  run: () => void;
}

/** A little night-time camp behind a menu: continue your saved run, or start a new one. */
export class TitleScene extends Phaser.Scene {
  private save: SaveData | null = null;
  private options: Option[] = [];
  private sel = 0;
  private confirmNew = false;
  private showControls = false;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private menu!: Phaser.GameObjects.Container;
  private diorama: Phaser.GameObjects.GameObject[] = [];
  private buildTag!: Phaser.GameObjects.Text;

  constructor() {
    super('title');
  }

  create() {
    this.save = loadSave();
    this.sel = 0;
    this.confirmNew = false;
    this.diorama = [];
    this.buildDiorama();
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.ignore(this.diorama);
    this.menu = this.add.container(0, 0);
    this.cameras.main.ignore(this.menu);
    this.buildMenu();
    this.buildTag = this.text(0, 0, BUILD_LABEL, 11, UI.cream).setOrigin(1, 1).setAlpha(0.45).setStroke(UI.outline, 3);
    this.cameras.main.ignore(this.buildTag);

    const kb = this.input.keyboard!;
    const move = (d: number) => {
      this.sel = (this.sel + d + this.options.length) % this.options.length;
      this.confirmNew = false;
      this.buildMenu();
    };
    kb.on('keydown', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      if (['ArrowUp', 'KeyW'].includes(ev.code)) move(-1);
      else if (['ArrowDown', 'KeyS'].includes(ev.code)) move(1);
      else if (['Enter', 'Space', 'KeyE'].includes(ev.code)) this.options[this.sel].run();
      else if (ev.code === 'Escape' && this.confirmNew) {
        this.confirmNew = false;
        this.buildMenu();
      }
    });

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      kb.removeAllListeners('keydown');
    });
    this.layout();
    this.cameras.main.fadeIn(600, 16, 24, 35);
  }

  // A small camp at night, painted from the game's own sprites.
  private buildDiorama() {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.diorama.push(o);
      return o;
    };
    const night = 0x7f8bb8;
    const R = 26;
    for (let y = -R; y < R; y++) {
      for (let x = -R; x < R; x++) {
        const v = Math.floor(hash2(x + 100, y + 100, 3) * GRASS_VARIANTS);
        add(this.add.image(x * TILE, y * TILE, 'tiles', `grass_${v}`).setOrigin(0).setTint(night).setDepth(-100000));
      }
    }
    // Trees in a loose ring around the clearing.
    for (let y = -R; y < R; y++) {
      for (let x = -R; x < R; x++) {
        const d = Math.hypot(x * 0.8, y);
        const h = hash2(x + 100, y + 100, 11);
        if (d < 6 || h > Math.min(0.75, (d - 5) * 0.12)) continue;
        const pool = d > 13 ? TREE_FRAMES.deep : d > 9 ? TREE_FRAMES.woods : TREE_FRAMES.meadow;
        const frame = pool[Math.floor(hash2(x + 100, y + 100, 12) * pool.length)];
        const fx = x * TILE + 8 + Math.round((hash2(x + 100, y + 100, 13) - 0.5) * 6);
        const fy = (y + 1) * TILE;
        add(this.add.image(fx, fy, 'atlas', frame).setOrigin(0.5, 1).setDepth(fy).setTint(d > 13 ? 0x4f5d86 : night));
      }
    }
    add(this.add.image(-40, 8, 'atlas', 'tent').setOrigin(0.5, 1).setDepth(8).setTint(0xb7b2c8));
    add(this.add.image(-6, 28, 'atlas', 'bedroll').setOrigin(0.5, 1).setDepth(28).setTint(0xb7b2c8));
    add(this.add.image(28, 4, 'atlas', 'sack').setOrigin(0.5, 1).setDepth(4).setTint(0xb7b2c8));
    add(this.add.image(42, 10, 'atlas', 'crate').setOrigin(0.5, 1).setDepth(10).setTint(0xb7b2c8));
    const glow = add(this.add.image(8, 14, 'atlas', 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setScale(1.6).setDepth(1000));
    this.tweens.add({ targets: glow, alpha: 0.4, scale: 1.5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const fire = add(this.add.image(8, 20, 'atlas', 'campfire_0').setOrigin(0.5, 1).setDepth(20));
    let f = 0;
    this.time.addEvent({ delay: 120, loop: true, callback: () => fire.setFrame(`campfire_${(f = (f + 1) % 4)}`) });
    // Sparks drifting up from the fire.
    this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        const s = this.add.rectangle(8 + Phaser.Math.Between(-3, 3), 12, 1, 1, 0xffc35a).setDepth(2000);
        this.diorama.push(s);
        this.uiCam?.ignore(s);
        this.tweens.add({
          targets: s,
          y: s.y - Phaser.Math.Between(18, 34),
          x: s.x + Phaser.Math.Between(-6, 6),
          alpha: 0,
          duration: Phaser.Math.Between(900, 1500),
          onComplete: () => {
            s.destroy();
            this.diorama.splice(this.diorama.indexOf(s), 1);
          },
        });
      },
    });
  }

  private text(x: number, y: number, s: string, size: number, color: string) {
    return uiText(this, x, y, s, size, color);
  }

  private start(save: SaveData | null) {
    const state = new GameState();
    this.registry.set('state', state);
    this.registry.set('pendingSave', save);
    this.registry.set('newGame', !save);
    this.input.keyboard!.removeAllListeners('keydown');
    this.cameras.main.fadeOut(400, 16, 24, 35);
    this.uiCam.fadeOut(400, 16, 24, 35);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('world');
      this.scene.launch('hud');
    });
  }

  private buildMenu() {
    const save = this.save;
    this.options = [];
    if (save) {
      this.options.push({
        label: 'Continue',
        detail: `Level ${save.progress.level} · saved ${ago(Date.now() - save.savedAt)}`,
        run: () => this.start(save),
      });
    }
    this.options.push({
      label: this.confirmNew ? 'Start over?' : 'New game',
      detail: this.confirmNew ? 'Press again to erase your saved camp' : 'Wake up at a camp at the edge of the wilds',
      run: () => {
        if (save && !this.confirmNew) {
          this.confirmNew = true;
          this.buildMenu();
          return;
        }
        deleteSave();
        this.start(null);
      },
    });
    this.options.push({
      label: this.showControls ? 'Hide controls' : 'Controls',
      detail: 'Every key and button (H shows them in game)',
      run: () => {
        this.showControls = !this.showControls;
        this.buildMenu();
      },
    });
    this.sel = Math.min(this.sel, this.options.length - 1);

    this.menu.removeAll(true);
    // A little letter spacing also keeps the font from joining the f and i.
    const title = this.add
      .text(0, 0, 'NewBaseGoofin', { fontFamily: DISPLAY_FONT, fontSize: '64px', color: UI.cream, fontStyle: 'bold' })
      .setResolution(Math.max(1, window.devicePixelRatio || 1))
      .setLetterSpacing(2).setOrigin(0.5).setStroke(UI.outline, 10);
    const sub = this.text(0, 46, 'A cozy survival base-builder', 18, '#f2d48a').setOrigin(0.5).setStroke(UI.outline, 5);
    this.menu.add([title, sub]);

    const w = 380;
    const rowH = 58;
    const h = 24 + this.options.length * rowH;
    const top = 92;
    const g = this.add.graphics();
    g.fillStyle(hex(UI.outline)).fillRect(-w / 2, top, w, h);
    g.fillStyle(hex(UI.wood)).fillRect(-w / 2 + 3, top + 3, w - 6, h - 6);
    g.fillStyle(hex(UI.woodLight)).fillRect(-w / 2 + 3, top + 3, w - 6, 3);
    g.fillStyle(hex(UI.parchment)).fillRect(-w / 2 + 8, top + 8, w - 16, h - 16);
    this.menu.add(g);
    this.options.forEach((o, k) => {
      const y = top + 12 + k * rowH;
      const sel = k === this.sel;
      const cell = this.add.graphics();
      if (sel) cell.fillStyle(hex('#f2b93b')).fillRect(-w / 2 + 12, y, w - 24, rowH - 4);
      this.menu.add(cell);
      this.menu.add(this.text(-w / 2 + 28, y + 8, `${sel ? '▸ ' : '  '}${o.label}`, 22, UI.ink));
      this.menu.add(this.text(-w / 2 + 52, y + 34, o.detail, 12, sel ? UI.ink : '#7a5a3e'));
      const zone = this.add.zone(0, y + rowH / 2 - 2, w - 24, rowH - 4).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (this.sel !== k) {
          this.sel = k;
          this.confirmNew = false;
          this.buildMenu();
        }
      });
      zone.on('pointerdown', () => o.run());
      this.menu.add(zone);
    });
    if (this.showControls) {
      const cw = 620;
      const ch = 24 + CONTROLS.length * 20;
      const cy = top + h + 12;
      const cg = this.add.graphics();
      cg.fillStyle(hex(UI.outline)).fillRect(-cw / 2, cy, cw, ch);
      cg.fillStyle(hex(UI.wood)).fillRect(-cw / 2 + 3, cy + 3, cw - 6, ch - 6);
      cg.fillStyle(hex(UI.parchment)).fillRect(-cw / 2 + 8, cy + 8, cw - 16, ch - 16);
      this.menu.add(cg);
      CONTROLS.forEach(([key, does], k) => {
        this.menu.add(this.text(-cw / 2 + 20, cy + 12 + k * 20, key, 13, UI.ink));
        this.menu.add(this.text(-cw / 2 + 140, cy + 13 + k * 20, does, 12, UI.wood));
      });
    } else {
      const help = [
        '[W/S] choose   [Enter] start',
        'Your game saves itself every 20 seconds and whenever you sleep.',
      ];
      help.forEach((line, k) =>
        this.menu.add(this.text(0, top + h + 22 + k * 20, line, 13, UI.cream).setOrigin(0.5, 0).setStroke(UI.outline, 4)),
      );
    }
    this.cameras.main.ignore(this.menu);
  }

  private layout() {
    const { width, height } = this.scale;
    const cam = this.cameras.main;
    cam.setZoom(Math.max(2, Math.round(Math.min(height / (14 * TILE), width / (22 * TILE)))));
    // Keep the camp in the lower part of the screen, under the menu.
    cam.centerOn(4, 20 - (0.3 * height) / cam.zoom);
    this.uiCam.setSize(width, height);
    this.buildTag.setPosition(width - 8, height - 6);
    this.menu.setPosition(width / 2, Math.max(70, height * 0.16));
  }
}
