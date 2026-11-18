import Phaser from 'phaser';
import { uiText } from '../ui/font';
import { countdownLabel, dayNumber, hourLabel, nightCountdown, nightness } from '../game/daynight';
import { SURVIVAL, TILE, ZONES } from '../config';
import { UI } from '../art/palette';
import { BUILD_LABEL } from '../build';
import { Ground, Prop } from '../world/generate';
import { darknessAt, tintAt } from '../world/shade';
import { BENCH_RECIPES, HAND_RECIPES, ITEMS, type ItemId, type Recipe } from '../game/items';
import { BUILDABLES, payCost } from '../game/build';
import { LEVELING, STAT_INFO, STAT_ORDER, xpToNext } from '../game/stats';
import { CLASSES, CLASS_ORDER, type ClassId } from '../game/classes';
import { GameState } from '../game/state';
import { CONTROLS } from '../game/controls';
import type { WorldScene } from './WorldScene';

const hex = (h: string) => Phaser.Display.Color.HexStringToColor(h).color;

const ZONE_BLURBS: Record<number, string> = {
  0: 'Home, for now. The fire keeps the dark at bay.',
  1: 'Open grass, berries and loose stone. Safe enough by day.',
  2: 'The trees close in. Better wood, and ore in the rocks.',
  3: 'Cold and dark. Something watches from between the pines.',
};

/** The always-on how-to-play card in the bottom-left corner. */
const QUICK_CONTROLS: Array<[key: string, does: string]> = [
  ['WASD', 'Walk  (Shift runs)'],
  ['Left click', 'Chop, mine, pick, use'],
  ['Right click', 'Attack toward the mouse'],
  ['B or C', 'Build & craft menu'],
  ['F', 'Eat to heal'],
  ['H', 'All controls'],
];

/** Screen-space overlay: vitals, compass, pack, prompts, crafting, stash, minimap, banners. */
export class HudScene extends Phaser.Scene {
  private worldScene!: WorldScene;
  private gs!: GameState;
  private zoneText!: Phaser.GameObjects.Text;
  private campText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Triangle;
  private bars!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Container;
  private bannerTitle!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Container;
  private vignette!: Phaser.GameObjects.Image;
  /** Over the Food bar: "Ready" or the seconds until food can heal you again. */
  private foodText!: Phaser.GameObjects.Text;
  private mapBox!: Phaser.GameObjects.Container;
  private clockText!: Phaser.GameObjects.Text;
  private clockKey = '';
  private timerText!: Phaser.GameObjects.Text;
  private timerKey = '';
  private mapDot!: Phaser.GameObjects.Rectangle;
  private mapScale = 0.75;
  private packBox!: Phaser.GameObjects.Container;
  private packKey = '';
  private prompt!: Phaser.GameObjects.Text;
  private toasts: Phaser.GameObjects.Text[] = [];
  private craftBox!: Phaser.GameObjects.Container;
  private menuKey = '';
  private levelText!: Phaser.GameObjects.Text;
  private statsOpen = false;
  private statsKey = '';
  private statsBox!: Phaser.GameObjects.Container;
  /** The "choose your path" picker, shown until you have a class. */
  private classBox: Phaser.GameObjects.Container | null = null;
  /** The controls panel (H). */
  private controlsBox!: Phaser.GameObjects.Container;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private buildBox!: Phaser.GameObjects.Container;
  private buildMsg!: Phaser.GameObjects.Text;
  /** Which build this is, quietly in the bottom-right corner. */
  private buildTag!: Phaser.GameObjects.Text;
  private buildKey = '';
  private stashBox!: Phaser.GameObjects.Container;
  private stashKey = '';
  private lastZone = -1;
  private edgeShown = false;
  private warnedHungry = false;

  constructor() {
    super('hud');
  }

  create() {
    this.worldScene = this.scene.get('world') as WorldScene;
    this.gs = GameState.get(this);
    this.buildVignette();

    const panel = this.add.graphics();
    this.drawPanel(panel, 12, 12, 250, 132);
    this.zoneText = this.text(26, 20, 'Camp', 20, UI.ink);
    this.campText = this.text(48, 44, '', 14, UI.ink);
    this.arrow = this.add.triangle(34, 51, 0, 12, 6, 0, 12, 12, hex(UI.wood)).setOrigin(0.5);
    this.bars = this.add.graphics();
    for (const [k, label] of ['Health', 'Food', 'Energy'].entries()) this.text(26, 66 + k * 16, label, 12, UI.ink);
    this.levelText = this.text(26, 114, 'Lv 1', 12, UI.ink);
    this.foodText = this.text(165, 84, '', 11, UI.cream).setOrigin(0.5, 0.5).setStroke(UI.ink, 3);

    this.buildBanner();
    this.buildMinimap();
    this.packBox = this.add.container(0, 0);
    this.prompt = this.text(0, 0, '', 16, UI.cream).setOrigin(0.5, 1).setStroke(UI.ink, 4).setVisible(false);
    this.craftBox = this.add.container(0, 0).setVisible(false);
    this.stashBox = this.add.container(0, 0);
    this.buildBox = this.add.container(0, 0).setVisible(false);
    this.statsBox = this.add.container(0, 0).setVisible(false);
    this.controlsBox = this.add.container(0, 0).setVisible(false);
    this.drawControls();
    this.hurtFlash = this.add.rectangle(0, 0, 10, 10, 0xc8302a, 1).setOrigin(0).setAlpha(0);
    this.buildMsg = this.text(0, 0, '', 15, UI.cream).setOrigin(0.5, 0).setStroke(UI.ink, 4);
    this.clockText = this.text(0, 0, '', 15, UI.cream).setOrigin(1, 0).setStroke(UI.ink, 4);
    this.timerText = this.text(0, 0, '', 13, UI.cream).setOrigin(1, 0).setStroke(UI.ink, 4);
    this.hint = this.add.container(0, 0);
    this.drawQuickControls();

    const kb = this.input.keyboard!;
    kb.on('keydown-M', (ev: KeyboardEvent) => !ev.repeat && this.mapBox.setVisible(!this.mapBox.visible));
    const toggleMenu = (ev: KeyboardEvent) => {
      if (!ev.repeat && !this.classBox) this.gs.setMenu(!this.gs.menuOpen);
    };
    kb.on('keydown-B', toggleMenu);
    kb.on('keydown-C', toggleMenu);
    kb.on('keydown-ESC', () => {
      this.gs.setMenu(false);
      this.gs.stopPlacing();
    });
    kb.on('keydown', (ev: KeyboardEvent) => {
      const n = ev.key === '0' ? 10 : ev.key === '-' ? 11 : Number(ev.key);
      if (!(n >= 1 && n <= 11)) return;
      if (this.classBox) {
        if (n <= CLASS_ORDER.length) this.chooseClass(CLASS_ORDER[n - 1]);
        return;
      }
      if (this.statsOpen) {
        if (n <= STAT_ORDER.length && this.gs.progress.spend(STAT_ORDER[n - 1])) {
          this.gs.sfx.craft();
          this.statsKey = '';
        }
        return;
      }
      // In the menu or while placing, number keys pick what to build.
      if ((this.gs.menuOpen || this.gs.buildMode) && n <= BUILDABLES.length) this.pickBuild(n - 1);
    });

    kb.on('keydown-L', (ev: KeyboardEvent) => {
      if (ev.repeat || this.classBox) return;
      this.statsOpen = !this.statsOpen;
      this.statsKey = '';
    });
    kb.on('keydown-ESC', () => {
      this.statsOpen = false;
      this.controlsBox.setVisible(false);
    });
    kb.on('keydown-H', (ev: KeyboardEvent) => {
      if (!ev.repeat) this.controlsBox.setVisible(!this.controlsBox.visible);
    });
    this.gs.on('levelup', (lv) => {
      this.showBanner(`Level ${lv}!`, 'You have a stat point to spend. Press L.');
      this.statsKey = '';
    });
    this.gs.events.on('hurt', () => {
      this.hurtFlash.setAlpha(0.35);
      this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 350 });
    });
    this.worldScene.events.on('creature-hit', (wx: number, wy: number, dmg: number) => {
      const cam = this.worldScene.cameras.main;
      const t = this.text((wx - cam.worldView.x) * cam.zoom, (wy - cam.worldView.y) * cam.zoom, String(dmg), 18, '#ffd27a')
        .setOrigin(0.5)
        .setStroke(UI.ink, 4);
      this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
    });
    this.gs.on('toast', (t) => this.toast(t));
    this.gs.on('phase', (phase, day) => {
      if (phase === 'dusk') this.showBanner('Night is falling', 'Creatures will hunt you after dark. Wall yourself in and light some torches.');
      else this.showBanner(`Day ${day}`, 'The night creatures slink back into the woods.');
    });
    this.gs.on('gained', (wx, wy, items) => this.floatGain(wx, wy, items));
    this.gs.on('prompt', (t, blocked) => {
      this.prompt.setVisible(t !== null);
      if (t) this.prompt.setText(`[Click]  ${t}`).setColor(blocked ? '#f0b8a0' : UI.cream);
    });

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.gs.events.removeAllListeners();
    });
    this.buildTag = this.text(0, 0, BUILD_LABEL, 11, UI.cream).setOrigin(1, 1).setAlpha(0.45).setStroke(UI.outline, 3);
    this.layout();
    if (this.registry.get('newGame') !== false)
      this.time.delayedCall(1200, () => this.toast('Gather sticks, stones and grass, then press C to craft a stone axe.'));
    else this.time.delayedCall(600, () => this.toast('Welcome back.'));
  }

  private text(x: number, y: number, s: string, size: number, color: string) {
    return uiText(this, x, y, s, size, color);
  }

  /** Wooden frame with a parchment face, like the mockup's HUD panels. */
  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(hex(UI.outline)).fillRect(x, y, w, h);
    g.fillStyle(hex(UI.wood)).fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle(hex(UI.woodLight)).fillRect(x + 3, y + 3, w - 6, 3);
    g.fillStyle(hex(UI.parchment)).fillRect(x + 8, y + 8, w - 16, h - 16);
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

  private toast(t: string) {
    const { width, height } = this.scale;
    const msg = this.text(width / 2, 0, t, 16, UI.cream).setOrigin(0.5, 1).setStroke(UI.ink, 4);
    this.toasts.push(msg);
    if (this.toasts.length > 3) this.toasts.shift()!.destroy();
    this.toasts.forEach((m, k) => m.setY(height - 146 - (this.toasts.length - 1 - k) * 22));
    this.tweens.add({
      targets: msg,
      alpha: 0,
      delay: 2400,
      duration: 600,
      onComplete: () => {
        this.toasts = this.toasts.filter((m) => m !== msg);
        msg.destroy();
      },
    });
  }

  /** "+3 Wood" rising from where you gathered it. */
  private floatGain(wx: number, wy: number, items: Array<[ItemId, number]>) {
    const cam = this.worldScene.cameras.main;
    const sx = (wx - cam.worldView.x) * cam.zoom;
    const sy = (wy - cam.worldView.y) * cam.zoom;
    items.forEach(([id, n], k) => {
      const icon = this.add.image(-12, 0, 'atlas', `item_${id}`).setScale(2);
      const label = this.text(4, 0, `+${n} ${ITEMS[id].name}`, 16, UI.cream).setOrigin(0, 0.5).setStroke(UI.ink, 4);
      const c = this.add.container(sx, sy - k * 26, [icon, label]);
      this.tweens.add({
        targets: c,
        y: c.y - 34,
        alpha: { from: 1, to: 0 },
        delay: 250,
        duration: 1100,
        ease: 'Quad.easeOut',
        onComplete: () => c.destroy(),
      });
    });
  }

  /** Every recipe, with whether it needs a workbench nearby. */
  private recipes(): Array<[Recipe, boolean]> {
    return [...HAND_RECIPES.map((r) => [r, false] as [Recipe, boolean]), ...BENCH_RECIPES.map((r) => [r, true] as [Recipe, boolean])];
  }

  /** Crafting takes from your pack first, then from storage, like building. */
  private craft(r: Recipe, needsBench: boolean) {
    const gs = this.gs;
    const pack = gs.pack;
    if (needsBench && !gs.nearBench) {
      this.toast('Stand near a workbench to craft that.');
      gs.sfx.thud();
      return;
    }
    if (pack.has(r.makes)) {
      this.toast(`You already have a ${ITEMS[r.makes].name.toLowerCase()}.`);
      return;
    }
    if (pack.room(r.makes) < 1) {
      this.toast('No room in your pack.');
      return;
    }
    if (!payCost(r.needs, pack, gs.stash)) {
      this.toast('Missing materials (pack or storage).');
      gs.sfx.thud();
      return;
    }
    pack.add(r.makes);
    gs.sfx.craft();
    gs.addXp(LEVELING.xp.craft);
    this.menuKey = '';
    const extra = ITEMS[r.makes].capacity ? ` Your pack holds ${pack.capacity} now.` : '';
    this.toast(`Crafted a ${ITEMS[r.makes].name.toLowerCase()}!${extra}`);
  }

  /** Close the menu and start placing buildable `k`. */
  private pickBuild(k: number) {
    const gs = this.gs;
    gs.setMenu(false);
    gs.buildSel = k;
    gs.demolish = false;
    gs.buildMode = true;
  }

  private pickDemolish() {
    const gs = this.gs;
    gs.setMenu(false);
    gs.demolish = true;
    gs.buildMode = true;
  }

  /** While placing: a small card up top with what you're placing, its cost, and how to cancel. */
  private redrawBuild() {
    const gs = this.gs;
    this.buildBox.setVisible(gs.buildMode);
    this.buildMsg.setVisible(gs.buildMode && gs.buildMsg !== null);
    if (!gs.buildMode) {
      this.buildKey = '';
      return;
    }
    this.buildMsg.setText(gs.buildMsg ?? '');
    const have = (id: ItemId) => gs.pack.count(id) + gs.stash.count(id);
    const def = BUILDABLES[gs.buildSel];
    const key = gs.demolish ? 'demolish' : `${gs.buildSel}|${Object.keys(def.cost).map((id) => have(id as ItemId)).join()}`;
    if (key === this.buildKey) return;
    this.buildKey = key;
    this.buildBox.removeAll(true);
    const w = 500;
    const h = 66;
    const g = this.add.graphics();
    this.drawPanel(g, -w / 2, 0, w, h);
    this.buildBox.add(g);
    const x0 = -w / 2 + 16;
    if (gs.demolish) {
      this.buildBox.add(this.add.image(x0 + 16, 33, 'atlas', 'target').setScale(1.6).setTint(0xd8434e));
      this.buildBox.add(this.text(x0 + 40, 12, 'Demolish', 16, UI.ink));
      this.buildBox.add(this.text(x0 + 40, 36, 'Half of the cost comes back', 12, UI.wood));
    } else {
      const frame = def.kind === 'wall' ? 'wall_10' : def.kind;
      this.buildBox.add(this.add.image(x0 + 16, 58, 'atlas', frame).setOrigin(0.5, 1).setScale(1.4));
      this.buildBox.add(this.text(x0 + 40, 12, def.name, 16, UI.ink));
      (Object.entries(def.cost) as Array<[ItemId, number]>).forEach(([id, n], j) => {
        const x = x0 + 48 + j * 46;
        this.buildBox.add(this.add.image(x, 44, 'atlas', `item_${id}`));
        this.buildBox.add(this.text(x + 10, 36, `${n}`, 13, have(id) >= n ? '#3f7a3a' : '#a2412f'));
      });
    }
    this.buildBox.add(
      this.text(w / 2 - 16, 15, '[Left click] place   [Right click] cancel\n[B] menu   [1-9, 0, -] switch', 12, UI.wood).setOrigin(1, 0).setAlign('right').setLineSpacing(4),
    );
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

  /** Bottom bar: every item you carry, its count, and the pack's weight. */
  private redrawPack() {
    const pack = this.gs.pack;
    const entries = pack.entries();
    const key = entries.map(([id, n]) => `${id}${n}`).join() + pack.weight;
    if (key === this.packKey) return;
    this.packKey = key;
    this.packBox.removeAll(true);
    const slots = Math.max(8, entries.length);
    const slot = 40;
    const w = slots * slot + 16;
    const g = this.add.graphics();
    this.drawPanel(g, -w / 2, -slot - 18, w, slot + 18);
    this.packBox.add(g);
    for (let k = 0; k < slots; k++) {
      const x = -w / 2 + 8 + k * slot + 2;
      const y = -slot - 10;
      const cell = this.add.graphics();
      cell.fillStyle(hex('#b08a54')).fillRect(x, y, slot - 4, slot - 4);
      cell.fillStyle(hex('#e7cf9c')).fillRect(x + 2, y + 2, slot - 8, slot - 8);
      this.packBox.add(cell);
      const e = entries[k];
      if (!e) continue;
      const [id, n] = e;
      this.packBox.add(this.add.image(x + (slot - 4) / 2, y + (slot - 4) / 2, 'atlas', `item_${id}`).setScale(2));
      if (ITEMS[id].kind !== 'tool')
        this.packBox.add(this.text(x + slot - 6, y + slot - 4, String(n), 14, UI.cream).setOrigin(1, 1).setStroke(UI.ink, 3));
    }
    const full = pack.weight >= pack.capacity - 0.5;
    const label = this.text(w / 2 - 10, -slot - 22, `Pack ${pack.weight}/${pack.capacity}`, 14, full ? '#f0b8a0' : UI.cream)
      .setOrigin(1, 1)
      .setStroke(UI.ink, 4);
    this.packBox.add(label);
  }

  /** The build and craft menu (B or C): recipes on the left, buildings on the right. */
  private redrawCraft() {
    const gs = this.gs;
    this.craftBox.setVisible(gs.menuOpen);
    if (!gs.menuOpen) {
      this.menuKey = '';
      return;
    }
    const pack = gs.pack;
    const have = (id: ItemId) => pack.count(id) + gs.stash.count(id);
    const can = (cost: Partial<Record<ItemId, number>>) => (Object.entries(cost) as Array<[ItemId, number]>).every(([id, n]) => have(id) >= n);
    const recipes = this.recipes();
    const key = [gs.nearBench, this.scale.width, ...(['stick', 'stone', 'fiber', 'wood', 'copper_ore'] as ItemId[]).map(have), ...recipes.map(([r]) => pack.has(r.makes))].join('|');
    if (key === this.menuKey) return;
    this.menuKey = key;
    this.craftBox.removeAll(true);

    const rowH = 46;
    const slot = 84;
    const slotH = 86;
    const cols = 4;
    const craftW = 320;
    const w = 16 + craftW + 20 + cols * slot + 16;
    const cells = BUILDABLES.length + 1;
    const bodyH = Math.max(recipes.length * rowH, Math.ceil(cells / cols) * slotH);
    const h = 52 + bodyH + 34;
    const g = this.add.graphics();
    this.drawPanel(g, -w / 2, 0, w, h);
    this.craftBox.add(g);
    const left = -w / 2 + 16;
    const right = left + craftW + 20;
    this.craftBox.add(this.text(left + 4, 14, 'Craft', 18, UI.ink));
    this.craftBox.add(this.text(right + 4, 14, 'Build', 18, UI.ink));
    this.craftBox.add(this.text(w / 2 - 18, 18, 'B, C or Esc to close', 12, UI.wood).setOrigin(1, 0));
    const hover = this.add.graphics();
    this.craftBox.add(hover);
    const hoverAt = (x: number, y: number, ww: number, hh: number) => {
      hover.clear();
      hover.lineStyle(2, hex('#f2b93b')).strokeRect(x, y, ww, hh);
    };
    const zone = (x: number, y: number, ww: number, hh: number, run: () => void) => {
      const z = this.add.zone(x + ww / 2, y + hh / 2, ww, hh).setInteractive({ useHandCursor: true });
      z.on('pointerover', () => hoverAt(x, y, ww, hh));
      z.on('pointerout', () => hover.clear());
      z.on('pointerdown', (p: Phaser.Input.Pointer) => p.leftButtonDown() && run());
      this.craftBox.add(z);
    };

    // Crafting: hand recipes, then workbench recipes (locked unless one is nearby).
    recipes.forEach(([r, bench], k) => {
      const y = 46 + k * rowH;
      const owned = pack.has(r.makes);
      const locked = bench && !gs.nearBench;
      const ok = can(r.needs) && !owned && !locked;
      const cell = this.add.graphics();
      cell.fillStyle(hex('#e7cf9c')).fillRect(left, y, craftW, rowH - 4);
      this.craftBox.add(cell);
      this.craftBox.add(this.add.image(left + 20, y + 20, 'atlas', `item_${r.makes}`).setScale(1.8).setAlpha(locked ? 0.5 : 1));
      const note = owned ? '  (have one)' : locked ? '  (at a workbench)' : '';
      this.craftBox.add(this.text(left + 42, y + 3, ITEMS[r.makes].name + note, 14, ok ? UI.ink : '#9c8566'));
      (Object.entries(r.needs) as Array<[ItemId, number]>).forEach(([id, n], j) => {
        const got = have(id);
        const x = left + 50 + j * 72;
        this.craftBox.add(this.add.image(x, y + 30, 'atlas', `item_${id}`));
        this.craftBox.add(this.text(x + 10, y + 22, `${Math.min(got, n)}/${n}`, 13, got >= n ? '#3f7a3a' : '#a2412f'));
      });
      zone(left, y, craftW, rowH - 4, () => this.craft(r, bench));
    });

    // Building: every buildable, then the demolish tool. Clicking one starts placing it.
    for (let k = 0; k < cells; k++) {
      const x = right + (k % cols) * slot;
      const y = 46 + Math.floor(k / cols) * slotH;
      const cell = this.add.graphics();
      cell.fillStyle(hex('#e7cf9c')).fillRect(x + 2, y, slot - 4, slotH - 6);
      this.craftBox.add(cell);
      if (k === BUILDABLES.length) {
        this.craftBox.add(this.text(x + slot / 2, y + 4, 'Demolish', 12, UI.ink).setOrigin(0.5, 0));
        this.craftBox.add(this.add.image(x + slot / 2, y + 46, 'atlas', 'target').setScale(1.8).setTint(0xd8434e));
        zone(x + 2, y, slot - 4, slotH - 6, () => this.pickDemolish());
        continue;
      }
      const b = BUILDABLES[k];
      const ok = can(b.cost);
      this.craftBox.add(this.text(x + 7, y + 3, k === 10 ? '-' : String((k + 1) % 10), 11, UI.wood));
      const name = this.text(x + slot / 2 + 5, y + 4, b.name, 12, ok ? UI.ink : '#9c8566').setOrigin(0.5, 0);
      if (name.width > slot - 26) name.setScale((slot - 26) / name.width);
      this.craftBox.add(name);
      const frame = b.kind === 'wall' ? 'wall_10' : b.kind;
      this.craftBox.add(this.add.image(x + 24, y + 74, 'atlas', frame).setOrigin(0.5, 1).setScale(1.4).setAlpha(ok ? 1 : 0.5));
      const costs = Object.entries(b.cost) as Array<[ItemId, number]>;
      costs.forEach(([id, n], j) => {
        const yy = y + (costs.length > 2 ? 22 + j * 16 : 28 + j * 18);
        this.craftBox.add(this.add.image(x + 52, yy + 7, 'atlas', `item_${id}`));
        this.craftBox.add(this.text(x + 62, yy, `${n}`, 13, have(id) >= n ? '#3f7a3a' : '#a2412f'));
      });
      zone(x + 2, y, slot - 4, slotH - 6, () => this.pickBuild(k));
    }
    this.craftBox.add(
      this.text(0, h - 26, 'Click a recipe to craft it, or a building to place it. Uses your pack first, then storage.', 12, UI.wood).setOrigin(0.5, 0),
    );
  }

  /** While you're at camp, show what's in the stash. */
  private redrawStash() {
    const stash = this.gs.stash;
    const show = this.gs.nearStorage && stash.entries().length > 0;
    const key = show ? stash.entries().map(([id, n]) => `${id}${n}`).join() : '';
    this.stashBox.setVisible(show);
    if (key === this.stashKey) return;
    this.stashKey = key;
    this.stashBox.removeAll(true);
    if (!show) return;
    const entries = stash.entries();
    const w = 250;
    const h = 44 + Math.ceil(entries.length / 3) * 26;
    const g = this.add.graphics();
    this.drawPanel(g, 0, 0, w, h);
    this.stashBox.add(g);
    this.stashBox.add(this.text(14, 12, 'Storage (camp and chests)', 14, UI.ink));
    entries.forEach(([id, n], k) => {
      const x = 22 + (k % 3) * 76;
      const y = 44 + Math.floor(k / 3) * 26;
      this.stashBox.add(this.add.image(x, y, 'atlas', `item_${id}`));
      this.stashBox.add(this.text(x + 12, y - 8, String(n), 14, UI.ink));
    });
  }

  private layout() {
    const { width, height } = this.scale;
    if (this.classBox) {
      // Rebuild the picker at the new size.
      this.classBox.destroy();
      this.classBox = null;
    }
    this.vignette.setDisplaySize(width, height);
    this.buildTag?.setPosition(width - 8, height - 6);
    this.banner.setPosition(width / 2, Math.round(height * 0.2));
    // Bottom-left, clear of the pack bar; hidden when the window is too narrow for both.
    this.hint.setPosition(12, height - 12).setVisible(width >= 760);
    this.packBox.setPosition(width / 2, height - 8);
    this.prompt.setPosition(width / 2, height - 116);
    this.craftBox.setPosition(width / 2, Math.max(12, Math.round(height * 0.14)));
    this.stashBox.setPosition(12, 152);
    this.statsBox.setPosition(width / 2, Math.round(height * 0.2));
    this.controlsBox.setPosition(width / 2, Math.max(12, Math.round(height / 2 - 190)));
    this.hurtFlash.setSize(width, height);
    this.buildBox.setPosition(width / 2, 12);
    this.buildMsg.setPosition(width / 2, 84);
    const size = this.worldScene.world.width * this.mapScale;
    this.mapBox.setPosition(width - size - 22, 22);
    // Hide the map on small screens by default; M still shows it.
    if (width < 700) this.mapBox.setVisible(false);
    this.clockText.setPosition(width - 22, width < 700 ? 16 : 22 + size + 14);
    this.timerText.setPosition(width - 22, this.clockText.y + 24);
  }

  private hasFood() {
    return this.gs.pack.has('berries') || this.gs.pack.has('mushroom');
  }

  private drawBars() {
    const v = this.gs.vitals;
    const foodWait = Math.max(0, this.gs.foodReadyAt - this.gs.clock);
    const foodLabel = foodWait > 0 ? `${Math.ceil(foodWait / 1000)}s` : this.hasFood() ? 'Ready (F)' : 'Ready';
    if (this.foodText.text !== foodLabel) this.foodText.setText(foodLabel);
    const g = this.bars;
    g.clear();
    const rows: Array<[number, number, string, string]> = [
      [v.health, this.gs.mods.maxHealth, '#d8434e', '#f07c84'],
      // Food: fills back up as the meal cooldown runs out.
      [SURVIVAL.foodCooldownMs - foodWait, SURVIVAL.foodCooldownMs, '#e0892c', '#f6b45e'],
      [v.stamina, SURVIVAL.maxStamina, '#7fc25a', '#b6e38c'],
    ];
    rows.forEach(([val, max, c, light], k) => {
      const x = 90;
      const y = 68 + k * 16;
      const w = 150;
      g.fillStyle(hex(UI.outline)).fillRect(x, y, w, 11);
      g.fillStyle(hex('#5b4632')).fillRect(x + 1, y + 1, w - 2, 9);
      const f = Math.round((w - 2) * (val / max));
      g.fillStyle(hex(c)).fillRect(x + 1, y + 1, f, 9);
      g.fillStyle(hex(light)).fillRect(x + 1, y + 1, f, 2);
    });
    // XP toward the next level.
    const p = this.gs.progress;
    const need = xpToNext(p.level);
    const frac = p.level >= LEVELING.maxLevel ? 1 : p.xp / need;
    g.fillStyle(hex(UI.outline)).fillRect(90, 117, 150, 7);
    g.fillStyle(hex('#5b4632')).fillRect(91, 118, 148, 5);
    g.fillStyle(hex('#6fb3e0')).fillRect(91, 118, Math.round(148 * frac), 5);
    const label = `Lv ${p.level}${p.points ? `  +${p.points}` : ''}`;
    if (this.levelText.text !== label) this.levelText.setText(label).setColor(p.points ? '#a2412f' : UI.ink);
  }

  /** "Choose your path": three class cards. Click one or press 1-3. Shown once per run. */
  private openClassPicker() {
    const { width, height } = this.scale;
    this.worldScene.busy = true;
    this.gs.setMenu(false);
    this.statsOpen = false;
    const box = this.add.container(0, 0).setDepth(20);
    this.classBox = box;
    box.add(this.add.rectangle(0, 0, width, height, 0x0c0a14, 0.55).setOrigin(0).setInteractive());
    const cardW = Math.min(230, Math.floor((width - 80) / 3));
    const cardH = 290;
    const gap = 18;
    const total = cardW * 3 + gap * 2;
    const top = Math.max(70, Math.round(height / 2 - cardH / 2 + 10));
    box.add(this.text(width / 2, top - 58, 'Choose your path', 30, UI.cream).setOrigin(0.5, 0).setStroke(UI.ink, 5));
    box.add(this.text(width / 2, top - 24, 'Click a class or press 1-3. It stays with you for this run.', 14, UI.cream).setOrigin(0.5, 0).setStroke(UI.ink, 4));
    CLASS_ORDER.forEach((id, k) => {
      const c = CLASSES[id];
      const x = Math.round(width / 2 - total / 2 + k * (cardW + gap));
      const g = this.add.graphics();
      this.drawPanel(g, x, top, cardW, cardH);
      box.add(g);
      const hover = this.add.graphics().setVisible(false);
      hover.lineStyle(3, hex('#ffd27a')).strokeRect(x - 2, top - 2, cardW + 4, cardH + 4);
      box.add(hover);
      box.add(this.text(x + 18, top + 16, String(k + 1), 16, UI.wood));
      box.add(this.add.image(x + cardW / 2, top + 58, 'atlas', `class_${id}`).setScale(4));
      box.add(this.text(x + cardW / 2, top + 98, c.name, 22, UI.ink).setOrigin(0.5, 0));
      box.add(this.text(x + cardW / 2, top + 126, c.blurb, 13, UI.wood).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(cardW - 36));
      let py = top + 172;
      for (const perk of c.perks) {
        box.add(this.text(x + 20, py, '•', 14, '#a2412f'));
        const t = this.text(x + 34, py, perk, 13, UI.ink).setWordWrapWidth(cardW - 52);
        box.add(t);
        py += t.height + 8;
      }
      const zone = this.add.zone(x, top, cardW, cardH).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => hover.setVisible(true));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => p.leftButtonDown() && this.chooseClass(id));
      box.add(zone);
    });
  }

  private chooseClass(id: ClassId) {
    if (!this.classBox) return;
    const gs = this.gs;
    gs.progress.cls = id;
    const c = CLASSES[id];
    gs.vitals.health = Math.min(gs.mods.maxHealth, gs.vitals.health + Math.max(0, c.maxHealth));
    this.classBox.destroy();
    this.classBox = null;
    this.worldScene.busy = false;
    gs.sfx.levelUp();
    const how = id === 'fighter' ? 'Right click swings your axe.' : id === 'archer' ? 'Right click shoots an arrow toward the mouse.' : 'Right click hurls a firebolt toward the mouse.';
    this.showBanner(`You are a ${c.name}`, how);
    this.statsKey = '';
  }

  /** Character sheet (L): level, XP, and the four stats with [1-4] to spend points. */
  /** A parchment card listing every control. */
  /** Keycaps and what they do, always on screen so it's clear how to play. */
  private drawQuickControls() {
    const rowH = 22;
    const keyW = 84;
    const w = 262;
    const h = 20 + QUICK_CONTROLS.length * rowH;
    const g = this.add.graphics();
    this.drawPanel(g, 0, -h, w, h);
    this.hint.add(g);
    QUICK_CONTROLS.forEach(([key, does], k) => {
      const y = -h + 11 + k * rowH;
      const label = this.text(0, 0, key, 13, UI.ink);
      const capW = Math.max(18, label.width + 10);
      const cap = this.add.graphics();
      cap.fillStyle(hex(UI.wood)).fillRect(12, y, capW, rowH - 3);
      cap.fillStyle(hex(UI.cream)).fillRect(13, y + 1, capW - 2, rowH - 6);
      label.setPosition(12 + capW / 2, y + (rowH - 4) / 2).setOrigin(0.5);
      this.hint.add([cap, label, this.text(12 + keyW + 6, y + (rowH - 4) / 2, does, 13, UI.wood).setOrigin(0, 0.5)]);
    });
    this.hint.setAlpha(0.92);
  }

  private drawControls() {
    const w = 660;
    const rowH = 24;
    const h = 66 + CONTROLS.length * rowH;
    const g = this.add.graphics();
    this.drawPanel(g, -w / 2, 0, w, h);
    this.controlsBox.add(g);
    this.controlsBox.add(this.text(-w / 2 + 20, 14, 'Controls', 20, UI.ink));
    this.controlsBox.add(this.text(w / 2 - 20, 20, '[H] or [Esc] to close', 12, UI.wood).setOrigin(1, 0));
    CONTROLS.forEach(([key, does], k) => {
      const y = 48 + k * rowH;
      this.controlsBox.add(this.text(-w / 2 + 20, y, key, 14, UI.ink));
      this.controlsBox.add(this.text(-w / 2 + 150, y + 1, does, 13, UI.wood));
    });
    this.controlsBox.setDepth(10);
  }

  private redrawStats() {
    this.statsBox.setVisible(this.statsOpen);
    if (!this.statsOpen) return;
    const p = this.gs.progress;
    const key = `${p.level}|${p.xp}|${p.points}|${STAT_ORDER.map((s) => p.stats[s]).join()}`;
    if (key === this.statsKey) return;
    this.statsKey = key;
    this.statsBox.removeAll(true);
    const w = 420;
    const h = 92 + STAT_ORDER.length * 40;
    const g = this.add.graphics();
    this.drawPanel(g, -w / 2, 0, w, h);
    this.statsBox.add(g);
    this.statsBox.add(this.text(-w / 2 + 20, 14, `Level ${p.level}`, 20, UI.ink));
    const next = p.level >= LEVELING.maxLevel ? 'Max level' : `${p.xp} / ${xpToNext(p.level)} XP`;
    const cls = p.cls ? CLASSES[p.cls].name : 'No class';
    this.statsBox.add(this.text(-w / 2 + 120, 20, `${cls}  ·  ${next}`, 13, UI.wood));
    this.statsBox.add(
      this.text(w / 2 - 20, 18, p.points ? `${p.points} point${p.points > 1 ? 's' : ''} to spend` : 'L to close', 13, p.points ? '#a2412f' : UI.wood).setOrigin(1, 0),
    );
    STAT_ORDER.forEach((id, k) => {
      const y = 52 + k * 40;
      const val = p.stats[id];
      const canSpend = p.points > 0 && val < LEVELING.maxPerStat;
      this.statsBox.add(this.text(-w / 2 + 20, y + 4, `${k + 1}`, 16, canSpend ? UI.ink : '#9c8566'));
      this.statsBox.add(this.text(-w / 2 + 44, y, STAT_INFO[id].name, 15, UI.ink));
      this.statsBox.add(this.text(-w / 2 + 44, y + 18, STAT_INFO[id].perPoint, 11, UI.wood));
      const pips = this.add.graphics();
      for (let i = 0; i < LEVELING.maxPerStat; i++) {
        pips.fillStyle(hex(UI.outline)).fillRect(w / 2 - 20 - (LEVELING.maxPerStat - i) * 14, y + 6, 11, 11);
        pips.fillStyle(hex(i < val ? '#e0892c' : '#d9c49a')).fillRect(w / 2 - 19 - (LEVELING.maxPerStat - i) * 14, y + 7, 9, 9);
      }
      this.statsBox.add(pips);
    });
    this.statsBox.add(this.text(0, h - 26, '1-4 spends a point. Gather, craft, build and fight for XP.', 11, UI.wood).setOrigin(0.5, 0));
  }

  update(_time: number, _delta: number) {
    const st = this.worldScene.state;
    const w = this.worldScene.world;
    if (!this.gs.progress.cls && !this.classBox && this.worldScene.player) this.openClassPicker();

    const clock = this.gs.clock;
    const key = `Day ${dayNumber(clock)}  ·  ${hourLabel(clock)}`;
    if (key !== this.clockKey) {
      this.clockKey = key;
      this.clockText.setText(key);
    }
    this.clockText.setColor(nightness(clock) > 0.5 ? '#b9c6ff' : UI.cream);
    const { night, msLeft } = nightCountdown(clock);
    const timer = `${night ? 'Sunrise in' : 'Night in'} ${countdownLabel(msLeft)}`;
    if (timer !== this.timerKey) {
      this.timerKey = timer;
      this.timerText.setText(timer);
      // Night is close: warn in amber for the last 30 seconds of daylight.
      this.timerText.setColor(night ? '#b9c6ff' : msLeft < 30_000 ? '#ffb347' : UI.cream);
    }

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

    this.drawBars();
    this.redrawStats();
    this.redrawPack();
    this.redrawCraft();
    this.redrawBuild();
    this.redrawStash();

    // A reminder, once, when you're hurt and have food ready.
    const v = this.gs.vitals;
    const hurt = v.health < this.gs.mods.maxHealth * 0.5;
    if (hurt && !this.warnedHungry && this.hasFood() && this.gs.clock >= this.gs.foodReadyAt) {
      this.warnedHungry = true;
      this.toast("You're hurt. Press F to eat and heal.");
    }
    if (!hurt) this.warnedHungry = false;

    this.vignette.setAlpha(Math.min(0.85, 0.15 + darknessAt(st.depth) * 1.05));
    this.mapDot.setPosition((st.x / TILE) * this.mapScale, (st.y / TILE) * this.mapScale);

    if (st.atEdge && !this.edgeShown) {
      this.edgeShown = true;
      this.showBanner('The edge of the known wilds', 'Nothing but dark trees beyond. Time to head home.');
    }

  }
}

function compassName(dx: number, dy: number) {
  const names = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
  const a = Math.atan2(dy, dx);
  const k = Math.round(a / (Math.PI / 4));
  return names[(k + 8) % 8];
}
