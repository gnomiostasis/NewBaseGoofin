import Phaser from 'phaser';
import { PACK, PLAYER, SPRINT_MULTIPLIER, SURVIVAL, TILE } from '../config';
import { CreatureSystem } from './CreatureSystem';
import { COMBAT, playerDamage } from '../game/creatures';
import { LEVELING } from '../game/stats';
import { E, GRASS_VARIANTS, N, PLAYER_DIRS, S, T_BLOCK, T_DIRT, T_GRASS, T_WATER, TREE_FRAMES, W } from '../art/textures';
import {
  Ground,
  Prop,
  generateWorld,
  idx,
  inBounds,
  isBlocked,
  isGlowcap,
  type CampObject,
  type CampObjectKind,
  type World,
} from '../world/generate';
import { tintAt } from '../world/shade';
import { hash2 } from '../world/rng';
import { GATHER, GLOWCAP_RULE, type GatherRule } from '../game/gather';
import { ITEMS, type ItemId } from '../game/items';
import { GameState } from '../game/state';
import { eat, freshVitals, spendStamina, tickVitals } from '../game/survival';
import { Sfx } from '../game/sfx';
import {
  BUILDABLES,
  BUILD_ID,
  BUILD_REACH,
  Build,
  KIND_OF,
  canPlace,
  payCost,
  refundFor,
  wallMask,
  type BuildKind,
} from '../game/build';

const CHUNK = 16; // tiles per side of a streaming chunk
const SWING_COOLDOWN = 330; // ms between tool swings

export interface PlayerState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  zone: number;
  depth: number;
  atEdge: boolean;
}

type Dir = 'down' | 'up' | 'left' | 'right';
const DIR_STEP: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

/** Glowing eyes that watch from the Deepwild and blink out when you get close. */
interface Watcher {
  img: Phaser.GameObjects.Image;
  phase: number;
}

/** What E would act on right now. */
type Target =
  | { kind: 'prop'; i: number; tx: number; ty: number; rule: GatherRule; prop: Prop }
  | { kind: 'camp'; tx: number; ty: number; what: CampObjectKind }
  | { kind: 'regrowing'; tx: number; ty: number }
  | { kind: 'build'; tx: number; ty: number; what: BuildKind }
  | { kind: 'lostpack'; tx: number; ty: number; k: number };

export class WorldScene extends Phaser.Scene {
  world!: World;
  player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  game_!: GameState;
  private keys!: Record<
    'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift' | 'e' | 'space',
    Phaser.Input.Keyboard.Key
  >;
  private facing: Dir = 'down';
  private collideLayer!: Phaser.Tilemaps.TilemapLayer;
  get collisionLayer() {
    return this.collideLayer;
  }
  creatures!: CreatureSystem;
  private nextAttack = 0;
  private invulnUntil = 0;
  private knockUntil = 0;
  private lostPackImages: Phaser.GameObjects.Image[] = [];
  private queuedAttack = false;
  private chunks = new Set<number>();
  private chunkTiles = new Map<number, number[]>();
  private propObjects = new Map<number, Phaser.GameObjects.Image[]>();
  private visibleChunks = new Set<number>();
  private watchers = new Map<number, Watcher[]>();
  private campAt = new Map<number, CampObjectKind>();
  private hits = new Map<number, number>();
  private regrow: Array<{ i: number; at: number; prop: Prop }> = [];
  private targetMarker!: Phaser.GameObjects.Image;
  private target: Target | null = null;
  private lastPrompt = '';
  private nextSwing = 0;
  busy = false; // resting or fainted: no input
  private sfx!: Sfx;
  readonly state: PlayerState = { x: 0, y: 0, tx: 0, ty: 0, zone: 0, depth: 0, atEdge: false };

  constructor() {
    super('world');
  }

  create() {
    this.game_ = GameState.get(this);
    this.sfx = this.game_.sfx;
    this.world = generateWorld();
    this.buildTilemap();
    this.createAnimations();
    this.buildCamp();
    this.createPlayer();
    this.creatures = new CreatureSystem(this);
    this.setupCamera();
    this.targetMarker = this.add.image(0, 0, 'atlas', 'target').setDepth(200000).setVisible(false);
    this.tweens.add({ targets: this.targetMarker, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
      shift: K.SHIFT,
      e: K.E,
      space: K.SPACE,
    }) as WorldScene['keys'];

    // Queue taps from key events too, so a very quick press is never lost between frames.
    this.input.keyboard!.on('keydown-E', () => (this.queuedAct = true));
    this.input.keyboard!.on('keydown-SPACE', () => (this.queuedAttack = true));
    this.input.keyboard!.on('keydown-J', () => (this.queuedAttack = true));
    this.input.keyboard!.on('keydown-F', () => (this.queuedEat = true));
    this.input.keyboard!.on('keydown-B', (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      this.game_.buildMode = !this.game_.buildMode;
      this.game_.bench = null;
    });
    this.input.mouse?.disableContextMenu();
    this.ghost = this.add.image(0, 0, 'atlas', 'floor').setOrigin(0.5, 1).setAlpha(0.65).setDepth(200002).setVisible(false);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.game_.buildMode || this.busy) return;
      if (p.rightButtonDown()) this.removeAtPointer();
      else this.placeAtPointer();
    });

    this.scale.on('resize', this.fitZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitZoom, this));
  }

  private queuedAct = false;
  private queuedEat = false;
  private buildObjects = new Map<number, Phaser.GameObjects.Image[]>();
  private ghost!: Phaser.GameObjects.Image;
  private chests = new Set<number>();
  private doors = new Set<number>();

  // ---------------------------------------------------------------- world

  private buildTilemap() {
    const w = this.world;
    const map = this.make.tilemap({ width: w.width, height: w.height, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    const ground = map.createBlankLayer('ground', tileset)!;
    const collide = map.createBlankLayer('collide', tileset)!;

    const groundAt = (x: number, y: number, fallback: Ground) =>
      inBounds(w, x, y) ? (w.ground[idx(w, x, y)] as Ground) : fallback;
    const maskFor = (x: number, y: number, kind: Ground) =>
      (groundAt(x, y - 1, kind) !== kind ? N : 0) |
      (groundAt(x + 1, y, kind) !== kind ? E : 0) |
      (groundAt(x, y + 1, kind) !== kind ? S : 0) |
      (groundAt(x - 1, y, kind) !== kind ? W : 0);

    const groundData: number[][] = [];
    const collideData: number[][] = [];
    for (let y = 0; y < w.height; y++) {
      const row: number[] = [];
      const crow: number[] = [];
      for (let x = 0; x < w.width; x++) {
        const i = idx(w, x, y);
        const kind = w.ground[i] as Ground;
        if (kind === Ground.Dirt) row.push(T_DIRT + maskFor(x, y, Ground.Dirt));
        else if (kind === Ground.Water) row.push(T_WATER + maskFor(x, y, Ground.Water));
        else row.push(T_GRASS + (w.variant[i] % GRASS_VARIANTS));
        crow.push(isBlocked(w, x, y) ? T_BLOCK : -1);
      }
      groundData.push(row);
      collideData.push(crow);
    }
    ground.putTilesAt(groundData, 0, 0, false);
    collide.putTilesAt(collideData, 0, 0, false);
    ground.forEachTile((t) => {
      t.tint = tintAt(w.depth[idx(w, t.x, t.y)]);
    });
    collide.setVisible(false);
    collide.setCollision(T_BLOCK);
    ground.setDepth(-10);
    this.collideLayer = collide;
    this.physics.world.setBounds(0, 0, w.width * TILE, w.height * TILE);
  }

  private buildCamp() {
    const w = this.world;
    const tint = tintAt(0);
    for (const o of w.campObjects) {
      this.placeCampObject(o, tint);
      if (o.w === 0) this.campAt.set(idx(w, o.tx, o.ty), o.kind);
      for (let dy = 0; dy < o.h; dy++)
        for (let dx = 0; dx < o.w; dx++) this.campAt.set(idx(w, o.tx + dx, o.ty - dy), o.kind);
    }
  }

  private placeCampObject(o: CampObject, tint: number) {
    const bottom = (o.ty + 1) * TILE;
    const centerX = (o.tx + Math.max(1, o.w) / 2) * TILE;
    switch (o.kind) {
      case 'tent':
        this.add.image(centerX, bottom + 2, 'atlas', 'tent').setOrigin(0.5, 1).setDepth(bottom).setTint(tint);
        break;
      case 'campfire': {
        const fire = this.add.sprite(centerX, bottom, 'atlas', 'campfire_0').setOrigin(0.5, 1).setDepth(bottom);
        fire.play('campfire');
        const glow = this.add
          .image(centerX, bottom - 6, 'atlas', 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.22)
          .setDepth(100000);
        this.tweens.add({ targets: glow, alpha: 0.32, scale: 1.08, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.addSmoke(centerX, bottom - 12);
        break;
      }
      case 'bedroll':
        this.add.image(o.tx * TILE + 14, bottom - 1, 'atlas', 'bedroll').setOrigin(0.5, 1).setDepth(bottom - 12);
        break;
      case 'lantern': {
        this.add.image(o.tx * TILE + 8, bottom, 'atlas', 'lantern').setOrigin(0.5, 1).setDepth(bottom);
        const g = this.add
          .image(o.tx * TILE + 9, bottom - 10, 'atlas', 'glow')
          .setScale(0.3)
          .setAlpha(0.25)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(100000);
        this.tweens.add({ targets: g, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
        break;
      }
      default:
        this.add.image(centerX, bottom, 'atlas', o.kind).setOrigin(0.5, 1).setDepth(bottom);
    }
  }

  private addSmoke(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const puff = this.add.rectangle(x, y, 2, 2, 0xdcdce1, 0.45).setDepth(100001);
      this.tweens.add({
        targets: puff,
        y: y - 34,
        x: x + 6,
        alpha: 0,
        scale: 2,
        duration: 2600,
        delay: i * 650,
        repeat: -1,
        onRepeat: () => puff.setPosition(x, y),
      });
    }
  }

  // ---------------------------------------------------------------- props

  private frameFor(i: number, tx: number, ty: number): string | null {
    const w = this.world;
    const p = w.prop[i] as Prop;
    const v = w.variant[i];
    const zone = w.zone[i];
    switch (p) {
      case Prop.Tree: {
        // Near zone borders, mix in the neighbouring zone's trees so edges blend.
        const blend = hash2(tx, ty, 404) < 0.25;
        const set =
          zone === 3
            ? blend
              ? TREE_FRAMES.woods
              : TREE_FRAMES.deep
            : zone === 2
              ? blend
                ? TREE_FRAMES.meadow
                : TREE_FRAMES.woods
              : TREE_FRAMES.meadow;
        return set[v % set.length];
      }
      case Prop.Rock:
        return 'rock';
      case Prop.OreRock:
        return 'ore_rock';
      case Prop.BerryBush:
        return 'berry_bush';
      case Prop.BareBush:
        return 'bare_bush';
      case Prop.Log:
        return 'log';
      case Prop.Mushroom:
        return isGlowcap(w, i) ? 'mushroom_glow' : 'mushroom';
      case Prop.Flowers:
        return `flowers_${v & 1}`;
      case Prop.TallGrass:
        return `tallgrass_${v & 1}`;
      case Prop.Sticks:
        return `sticks_${v & 1}`;
      case Prop.Pebbles:
        return 'pebbles';
      case Prop.Stump:
        return 'stump_cut';
      default:
        return null;
    }
  }

  /** Creates the images for one tile's prop. */
  private spawnProp(i: number, tx: number, ty: number, watchers?: Watcher[]) {
    const w = this.world;
    const frame = this.frameFor(i, tx, ty);
    if (!frame) return;
    const p = w.prop[i] as Prop;
    const v = w.variant[i];
    const tint = tintAt(w.depth[i]);
    const jx = ((v & 7) - 3.5) * 0.6;
    const footX = Math.round(tx * TILE + 8 + (p === Prop.Tree ? jx : 0));
    const footY = (ty + 1) * TILE;
    const flat = [Prop.Flowers, Prop.TallGrass, Prop.Mushroom, Prop.Sticks, Prop.Pebbles].includes(p);
    const objs: Phaser.GameObjects.Image[] = [];
    const img = this.add
      .image(footX, footY, 'atlas', frame)
      .setOrigin(0.5, 1)
      .setDepth(flat ? footY - 8 : footY)
      .setTint(tint)
      .setFlipX(p !== Prop.Tree && (v & 16) !== 0);
    objs.push(img);

    if (frame === 'mushroom_glow') {
      objs.push(
        this.add
          .image(footX, footY - 6, 'atlas', 'glow')
          .setScale(0.22)
          .setTint(0x6fd6e8)
          .setAlpha(0.45)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(100000),
      );
    }
    if (watchers && p === Prop.Tree && w.zone[i] === 3 && hash2(tx, ty, 777) < 0.035) {
      const eyes = this.add
        .image(footX - 2 + (v % 5), footY - 16 - (v % 6), 'atlas', 'eyes')
        .setOrigin(0.5)
        .setDepth(footY + 1);
      objs.push(eyes);
      watchers.push({ img: eyes, phase: v * 37 });
    }
    this.propObjects.set(i, objs);
  }

  private chunkKey(cx: number, cy: number) {
    return cy * 1000 + cx;
  }

  /** Props are created per chunk the first time the camera comes near, then shown and hidden. */
  private buildChunk(cx: number, cy: number) {
    const w = this.world;
    const watchers: Watcher[] = [];
    const tiles: number[] = [];
    for (let ty = cy * CHUNK; ty < Math.min(w.height, (cy + 1) * CHUNK); ty++) {
      for (let tx = cx * CHUNK; tx < Math.min(w.width, (cx + 1) * CHUNK); tx++) {
        const i = idx(w, tx, ty);
        tiles.push(i);
        this.spawnProp(i, tx, ty, watchers);
      }
    }
    this.chunkTiles.set(this.chunkKey(cx, cy), tiles);
    this.watchers.set(this.chunkKey(cx, cy), watchers);
    this.chunks.add(this.chunkKey(cx, cy));
  }

  private setChunkVisible(key: number, visible: boolean) {
    for (const i of this.chunkTiles.get(key) ?? []) for (const o of this.propObjects.get(i) ?? []) o.setVisible(visible);
  }

  private streamChunks() {
    const view = this.cameras.main.worldView;
    const span = CHUNK * TILE;
    const x0 = Math.max(0, Math.floor(view.x / span) - 1);
    const y0 = Math.max(0, Math.floor(view.y / span) - 1);
    const x1 = Math.min(Math.ceil(this.world.width / CHUNK) - 1, Math.floor(view.right / span) + 1);
    const y1 = Math.min(Math.ceil(this.world.height / CHUNK) - 1, Math.floor(view.bottom / span) + 1);
    const wanted = new Set<number>();
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = this.chunkKey(cx, cy);
        wanted.add(key);
        if (this.visibleChunks.has(key)) continue;
        if (!this.chunks.has(key)) this.buildChunk(cx, cy);
        else this.setChunkVisible(key, true);
      }
    }
    for (const key of this.visibleChunks) if (!wanted.has(key)) this.setChunkVisible(key, false);
    this.visibleChunks = wanted;
  }

  /** Changes what stands on a tile: updates the data, the art and the collision. */
  private setProp(tx: number, ty: number, prop: Prop) {
    const w = this.world;
    const i = idx(w, tx, ty);
    w.prop[i] = prop;
    for (const o of this.propObjects.get(i) ?? []) o.destroy();
    this.propObjects.delete(i);
    const key = this.chunkKey(Math.floor(tx / CHUNK), Math.floor(ty / CHUNK));
    if (this.chunks.has(key)) this.spawnProp(i, tx, ty);
    if (isBlocked(w, tx, ty)) this.collideLayer.putTileAt(T_BLOCK, tx, ty);
    else this.collideLayer.removeTileAt(tx, ty);
  }

  private updateWatchers(time: number) {
    const px = this.player.x;
    const py = this.player.y;
    for (const key of this.visibleChunks) {
      for (const wt of this.watchers.get(key) ?? []) {
        if (!wt.img.active) continue;
        const near = Math.hypot(wt.img.x - px, wt.img.y - py) < 6 * TILE;
        const blink = (time / 16 + wt.phase) % 160 < 7;
        const target = near ? 0 : blink ? 0 : 1;
        wt.img.alpha += (target - wt.img.alpha) * (near ? 0.15 : 0.6);
      }
    }
  }

  // ------------------------------------------------------------ gathering

  /** Finds what's in front of you: the tile you face, then the one you stand on. */
  private findTarget(): Target | null {
    const w = this.world;
    const [dx, dy] = DIR_STEP[this.facing];
    const fx = this.player.x;
    const fy = this.player.body.center.y;
    const here: [number, number] = [Math.floor(fx / TILE), Math.floor(fy / TILE)];
    const reach: [number, number] = [Math.floor((fx + dx * 11) / TILE), Math.floor((fy + dy * 11) / TILE)];
    const next: [number, number] = [here[0] + dx, here[1] + dy];
    const candidates = [reach, next, here].filter(
      ([x, y], k, all) => all.findIndex(([x2, y2]) => x2 === x && y2 === y) === k,
    );
    for (const [tx, ty] of candidates) {
      if (!inBounds(w, tx, ty)) continue;
      const i = idx(w, tx, ty);
      const lost = this.game_.lostPacks.findIndex((l) => l.tx === tx && l.ty === ty);
      if (lost >= 0) return { kind: 'lostpack', tx, ty, k: lost };
      const b = w.build[i];
      if (b === Build.Chest || b === Build.Bed || b === Build.Workbench) return { kind: 'build', tx, ty, what: KIND_OF[b] };
      const camp = this.campAt.get(i);
      if (camp && (camp === 'crate' || camp === 'bedroll' || camp === 'tent' || camp === 'sack')) {
        return { kind: 'camp', tx, ty, what: camp };
      }
      const p = w.prop[i] as Prop;
      if (p === Prop.BareBush) return { kind: 'regrowing', tx, ty };
      const rule = isGlowcap(w, i) ? GLOWCAP_RULE : GATHER[p];
      if (rule) return { kind: 'prop', i, tx, ty, rule, prop: p };
    }
    return null;
  }

  private describe(t: Target): [string, boolean] {
    const pack = this.game_.pack;
    if (t.kind === 'regrowing') return ['Picked clean. Berries will grow back.', true];
    if (t.kind === 'lostpack') return ['Pick up your lost pack', false];
    if (t.kind === 'build') {
      if (t.what === 'chest') return ['Store materials in chest', false];
      if (t.what === 'bed') return ['Sleep (you will wake here)', false];
      return ['Use workbench', false];
    }
    if (t.kind === 'camp') {
      if (t.what === 'crate' || t.what === 'sack') return ['Store materials in camp stash', false];
      return ['Rest', false];
    }
    const name = propName(t.prop, t.rule);
    if (t.rule.tool && !pack.hasTool(t.rule.tool)) return [`${t.rule.verb} ${name} (needs an ${t.rule.tool === 'axe' ? 'axe' : 'pick'})`, true];
    return [`${t.rule.verb} ${name}`, false];
  }

  private act(time: number) {
    const t = this.target;
    if (!t || time < this.nextSwing) return;
    const st = this.game_;
    if (t.kind === 'regrowing') return;
    if (t.kind === 'lostpack') {
      this.nextSwing = time + 400;
      this.recoverPack(t.k);
      return;
    }
    if (t.kind === 'build') {
      this.nextSwing = time + 400;
      if (t.what === 'chest') this.storeMaterials();
      else if (t.what === 'bed') {
        st.respawn = [t.tx, t.ty];
        this.rest(true);
      } else {
        st.bench = st.bench ? null : [t.tx, t.ty];
        st.buildMode = false;
      }
      return;
    }
    if (t.kind === 'camp') {
      if (t.what === 'crate' || t.what === 'sack') this.storeMaterials();
      else this.rest();
      this.nextSwing = time + 400;
      return;
    }
    const { rule } = t;
    if (rule.tool && !st.pack.hasTool(rule.tool)) {
      st.emit('toast', `You need a stone ${rule.tool}. Press C to craft one.`);
      this.sfx.thud();
      this.nextSwing = time + 400;
      return;
    }
    if (!rule.yields.some(([id]) => st.pack.room(id) > 0)) {
      st.emit('toast', 'Your pack is full. Head back and store it at camp.');
      this.sfx.thud();
      this.nextSwing = time + 400;
      return;
    }
    if (!spendStamina(st.vitals, rule.stamina * st.mods.toolStaminaMul)) {
      st.emit('toast', 'Too tired. Rest a moment, or eat something.');
      this.nextSwing = time + 500;
      return;
    }
    this.nextSwing = time + (rule.hits > 1 ? SWING_COOLDOWN : 160);
    const cx = t.tx * TILE + 8;
    const cy = t.ty * TILE + 8;
    this.swingFeedback(cx, cy, t.prop, rule);

    const needed = rule.tool ? Math.max(1, Math.ceil(rule.hits / st.pack.toolPower(rule.tool))) : rule.hits;
    const done = (this.hits.get(t.i) ?? 0) + 1;
    if (done < needed) {
      this.hits.set(t.i, done);
      return;
    }
    this.hits.delete(t.i);
    const got: Array<[ItemId, number]> = [];
    const bonus = Math.random() < st.mods.bonusYieldChance ? 1 : 0;
    rule.yields.forEach(([id, n], j) => {
      const k = st.pack.add(id, n + (j === 0 ? bonus : 0));
      if (k > 0) got.push([id, k]);
    });
    const xp = LEVELING.xp;
    st.addXp(t.prop === Prop.OreRock ? xp.ore : t.prop === Prop.Rock ? xp.mine : rule.tool === 'axe' ? xp.chop : xp.pickup);
    if (got.length < rule.yields.length || got.some(([id, k]) => k < (rule.yields.find((y) => y[0] === id)?.[1] ?? 0))) {
      st.emit('toast', 'Your pack is full. Some of it had to be left behind.');
    }
    st.emit('gained', cx, cy - 10, got);
    if (rule.regrow) this.regrow.push({ i: t.i, at: time + rule.regrow * 1000, prop: t.prop });
    this.setProp(t.tx, t.ty, rule.leaves);
    this.sfx.pickup();
  }

  private swingFeedback(cx: number, cy: number, prop: Prop, rule: GatherRule) {
    const [dx, dy] = DIR_STEP[this.facing];
    // Lunge toward the target and back.
    this.tweens.add({ targets: this.player, x: this.player.x + dx * 2, y: this.player.y + dy * 2, duration: 60, yoyo: true });
    if (rule.hits > 1) {
      for (const o of this.propObjects.get(idx(this.world, Math.floor(cx / TILE), Math.floor(cy / TILE))) ?? []) {
        const x0 = o.x;
        this.tweens.add({ targets: o, x: x0 + 1.5, duration: 40, yoyo: true, repeat: 2, onComplete: () => o.setX(x0) });
      }
      if (rule.tool === 'axe') this.sfx.chop();
      else this.sfx.clink();
      const color = rule.tool === 'axe' ? 0xd9b07a : 0xbcc2c7;
      for (let k = 0; k < 5; k++) {
        const chip = this.add.rectangle(cx, cy, 2, 2, k % 2 ? color : 0x7a4f30).setDepth(200001);
        this.tweens.add({
          targets: chip,
          x: cx + Phaser.Math.Between(-10, 10),
          y: cy + Phaser.Math.Between(-12, 2),
          alpha: 0,
          duration: Phaser.Math.Between(260, 420),
          ease: 'Quad.easeOut',
          onComplete: () => chip.destroy(),
        });
      }
    } else {
      void prop;
    }
    this.cameras.main.shake(rule.hits > 1 ? 50 : 0, 0.0015);
  }

  private storeMaterials() {
    const st = this.game_;
    const moved = st.pack.depositMaterials(st.stash);
    if (moved.length === 0) {
      st.emit('toast', 'Nothing to store. Tools and food stay in your pack.');
      return;
    }
    const total = moved.reduce((a, [, n]) => a + n, 0);
    st.emit('toast', `Stored ${total} item${total === 1 ? '' : 's'}. Chests and the camp stash share storage.`);
    this.sfx.pickup();
  }

  private rest(inBed = false) {
    const st = this.game_;
    if (inBed && st.vitals.stamina >= SURVIVAL.maxStamina - 1) {
      st.emit('toast', 'You will wake up here if you collapse.');
      return;
    }
    if (st.vitals.stamina >= SURVIVAL.maxStamina - 1) {
      st.emit('toast', "You're not tired.");
      return;
    }
    this.busy = true;
    this.player.setVelocity(0, 0);
    const cam = this.cameras.main;
    cam.fadeOut(350, 16, 24, 35);
    cam.once('camerafadeoutcomplete', () => {
      st.vitals.stamina = SURVIVAL.maxStamina;
      st.vitals.hunger = Math.max(0, st.vitals.hunger - 8);
      st.emit('toast', inBed ? 'You sleep in your own bed. Energy restored, and you will wake here.' : 'You rest by the fire. Energy restored.');
      cam.fadeIn(450, 16, 24, 35);
      this.busy = false;
    });
  }

  private eatSomething() {
    const st = this.game_;
    const food = (['mushroom', 'berries'] as ItemId[]).find((id) => st.pack.has(id));
    if (!food) {
      st.emit('toast', 'No food in your pack. Berry bushes grow in the meadow.');
      return;
    }
    if (st.vitals.hunger >= SURVIVAL.maxHunger - 2) {
      st.emit('toast', "You're full.");
      return;
    }
    st.pack.remove(food);
    eat(st.vitals, ITEMS[food].food ?? 0, ITEMS[food].heal ?? 0, st.mods.maxHealth);
    st.emit('toast', `Ate ${ITEMS[food].name.toLowerCase()}.`);
    this.sfx.munch();
  }

  /** Health hit zero: you wake up at camp without your pack (tools stay with you). */
  private faint() {
    const st = this.game_;
    this.busy = true;
    this.player.setVelocity(0, 0);
    const cam = this.cameras.main;
    cam.fadeOut(900, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      const dropped = st.pack.entries().filter(([id]) => ITEMS[id].kind !== 'tool');
      if (dropped.length) st.lostPacks.push({ tx: this.state.tx, ty: this.state.ty, items: dropped });
      st.pack.clear((id) => ITEMS[id].kind === 'tool');
      this.renderLostPacks();
      this.creatures.clear();
      st.vitals = { ...freshVitals(), health: 50, hunger: 50, stamina: 50 };
      const bed = st.respawn && this.world.build[idx(this.world, ...st.respawn)] === Build.Bed ? st.respawn : null;
      if (bed) this.player.setPosition(bed[0] * TILE + 8, (bed[1] + 1) * TILE + 6);
      else this.player.setPosition(this.world.campX * TILE + 8, (this.world.campY + 1) * TILE + 10);
      cam.fadeIn(900, 0, 0, 0);
      st.emit(
        'toast',
        `You collapsed and woke up ${bed ? 'in your bed' : 'at camp'}.${dropped.length ? ' Your pack is where you fell.' : ''}`,
      );
      this.busy = false;
    });
  }

  // --------------------------------------------------------------- combat

  private attack(time: number) {
    const st = this.game_;
    if (time < this.nextAttack || this.busy) return;
    if (!spendStamina(st.vitals, COMBAT.swingStamina)) {
      st.emit('toast', 'Too tired to swing.');
      this.nextAttack = time + 400;
      return;
    }
    this.nextAttack = time + COMBAT.swingCooldownMs;
    const [dx, dy] = DIR_STEP[this.facing];
    const cx = this.player.x;
    const cy = this.player.body.center.y - 3;
    const slash = this.add
      .image(cx + dx * 9, cy + dy * 9, 'atlas', 'slash')
      .setRotation(Math.atan2(dy, dx))
      .setDepth(200004);
    this.tweens.add({ targets: slash, alpha: 0, duration: 160, onComplete: () => slash.destroy() });
    this.tweens.add({ targets: this.player, x: this.player.x + dx * 2, y: this.player.y + dy * 2, duration: 60, yoyo: true });
    this.sfx.swing();
    const damage = playerDamage(st.mods, st.pack.toolPower('axe'));
    if (this.creatures.hit(cx, cy, dx, dy, COMBAT.reach, damage, time) > 0) {
      this.sfx.hit();
      this.cameras.main.shake(60, 0.003);
    }
  }

  hurtPlayer(damage: number, fromX: number, fromY: number, time: number) {
    const st = this.game_;
    if (time < this.invulnUntil || this.busy) return;
    this.invulnUntil = time + COMBAT.invulnMs;
    st.vitals.health = Math.max(0, st.vitals.health - damage);
    const a = Math.atan2(this.player.body.center.y - fromY, this.player.x - fromX);
    this.player.setVelocity(Math.cos(a) * 190, Math.sin(a) * 190);
    this.knockUntil = time + 160;
    this.player.setTintFill(0xff6a5a);
    this.time.delayedCall(110, () => this.player.clearTint());
    this.cameras.main.shake(120, 0.006);
    this.sfx.hurt();
    st.events.emit('hurt', damage);
  }

  private renderLostPacks() {
    for (const o of this.lostPackImages) o.destroy();
    this.lostPackImages = this.game_.lostPacks.map((l) =>
      this.add.image(l.tx * TILE + 8, (l.ty + 1) * TILE, 'atlas', 'lost_pack').setOrigin(0.5, 1).setDepth((l.ty + 1) * TILE - 6),
    );
  }

  private recoverPack(k: number) {
    const st = this.game_;
    const lost = st.lostPacks[k];
    const got: Array<[ItemId, number]> = [];
    lost.items = lost.items
      .map(([id, n]): [ItemId, number] => {
        const added = st.pack.add(id, n);
        if (added) got.push([id, added]);
        return [id, n - added];
      })
      .filter(([, n]) => n > 0);
    if (lost.items.length === 0) st.lostPacks.splice(k, 1);
    else st.emit('toast', 'Your pack is too full to take everything back.');
    this.renderLostPacks();
    if (got.length) st.emit('gained', lost.tx * TILE + 8, lost.ty * TILE, got);
    this.sfx.pickup();
  }

  // ------------------------------------------------------------- building

  /** Draws whatever is built on one tile (floor plus structure). */
  private renderBuild(x: number, y: number) {
    const w = this.world;
    const i = idx(w, x, y);
    for (const o of this.buildObjects.get(i) ?? []) o.destroy();
    const objs: Phaser.GameObjects.Image[] = [];
    const tint = tintAt(w.depth[i]);
    const footX = x * TILE + 8;
    const footY = (y + 1) * TILE;
    if (w.floor[i]) objs.push(this.add.image(footX, footY, 'atlas', 'floor').setOrigin(0.5, 1).setDepth(-5).setTint(tint));
    const b = w.build[i];
    if (b !== Build.None) {
      const frame = b === Build.Wall ? `wall_${wallMask(w, x, y)}` : b === Build.Door ? 'door' : KIND_OF[b];
      objs.push(this.add.image(footX, footY, 'atlas', frame).setOrigin(0.5, 1).setDepth(footY).setTint(tint));
    }
    if (objs.length) this.buildObjects.set(i, objs);
    else this.buildObjects.delete(i);
  }

  private refreshAround(x: number, y: number) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(this.world, nx, ny) && this.world.build[idx(this.world, nx, ny)] === Build.Wall) this.renderBuild(nx, ny);
    }
  }

  private pointerTile(): [number, number] {
    const p = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
  }

  private playerTiles(): Array<[number, number]> {
    const b = this.player.body;
    const tiles: Array<[number, number]> = [];
    for (const x of [b.left, b.right - 0.01]) for (const y of [b.top, b.bottom - 0.01]) tiles.push([Math.floor(x / TILE), Math.floor(y / TILE)]);
    return tiles;
  }

  private campTiles(): Set<number> {
    return new Set(this.campAt.keys());
  }

  /** Checks the ghost tile: reach, ground and cost. */
  private checkPlacement(x: number, y: number): string | null {
    const st = this.game_;
    const def = BUILDABLES[st.buildSel];
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.body.center.y / TILE);
    if (Math.max(Math.abs(x - ptx), Math.abs(y - pty)) > BUILD_REACH) return 'Too far away';
    const check = canPlace(this.world, x, y, def.kind, this.playerTiles(), this.campTiles());
    if (!check.ok) return check.reason;
    for (const [id, n] of Object.entries(def.cost) as Array<[ItemId, number]>) {
      if (st.pack.count(id) + (st.storage?.count(id) ?? 0) < n) return `Need ${n} ${ITEMS[id].name.toLowerCase()}`;
    }
    return null;
  }

  private placeAtPointer() {
    const st = this.game_;
    const [x, y] = this.pointerTile();
    const why = this.checkPlacement(x, y);
    if (why) {
      st.emit('toast', why);
      this.sfx.thud();
      return;
    }
    const def = BUILDABLES[st.buildSel];
    if (!payCost(def.cost, st.pack, st.storage)) return;
    const w = this.world;
    const i = idx(w, x, y);
    w.prop[i] = Prop.None;
    for (const o of this.propObjects.get(i) ?? []) o.destroy();
    this.propObjects.delete(i);
    if (def.kind === 'floor') w.floor[i] = 1;
    else w.build[i] = BUILD_ID[def.kind];
    if (def.kind === 'chest') this.chests.add(i);
    if (def.kind === 'door') this.doors.add(i);
    if (isBlocked(w, x, y)) this.collideLayer.putTileAt(T_BLOCK, x, y);
    this.renderBuild(x, y);
    this.refreshAround(x, y);
    this.sfx.chop();
    st.addXp(LEVELING.xp.build);
    for (const o of this.buildObjects.get(i) ?? []) {
      o.setScale(1.15);
      this.tweens.add({ targets: o, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
  }

  private removeAtPointer() {
    const st = this.game_;
    const w = this.world;
    const [x, y] = this.pointerTile();
    if (!inBounds(w, x, y)) return;
    const i = idx(w, x, y);
    let kind: BuildKind | null = null;
    if (w.build[i] !== Build.None) {
      kind = KIND_OF[w.build[i]];
      w.build[i] = Build.None;
      this.chests.delete(i);
      this.doors.delete(i);
    } else if (w.floor[i]) {
      kind = 'floor';
      w.floor[i] = 0;
    }
    if (!kind) return;
    if (!isBlocked(w, x, y)) this.collideLayer.removeTileAt(x, y);
    this.renderBuild(x, y);
    this.refreshAround(x, y);
    const refund = refundFor(kind);
    const got: Array<[ItemId, number]> = [];
    for (const [id, n] of refund) {
      const k = st.pack.add(id, n);
      const rest = n - k;
      if (rest > 0) st.stash.add(id, rest);
      got.push([id, n]);
    }
    st.emit('gained', x * TILE + 8, y * TILE, got);
    this.sfx.thud();
  }

  private updateGhost() {
    const st = this.game_;
    if (!st.buildMode || this.busy) {
      this.ghost.setVisible(false);
      st.buildMsg = null;
      return;
    }
    const [x, y] = this.pointerTile();
    const def = BUILDABLES[st.buildSel];
    const frame = def.kind === 'wall' ? 'wall_0' : def.kind;
    const why = this.checkPlacement(x, y);
    st.buildMsg = why;
    this.ghost
      .setFrame(frame)
      .setPosition(x * TILE + 8, (y + 1) * TILE)
      .setDepth(def.kind === 'floor' ? -4 : (y + 1) * TILE + 0.5)
      .setTint(why ? 0xff7a6a : 0x9cff9c)
      .setVisible(true);
  }

  /** Doors swing open while you stand in them. */
  private updateDoors() {
    const w = this.world;
    const tiles = this.playerTiles().map(([x, y]) => idx(w, x, y));
    for (const i of this.doors) {
      const img = this.buildObjects.get(i)?.find((o) => o.frame.name.startsWith('door'));
      if (!img) continue;
      const open = tiles.includes(i) || tiles.includes(i + w.width) || tiles.includes(i - w.width);
      img.setFrame(open ? 'door_open' : 'door');
    }
  }

  private nearChest(tx: number, ty: number) {
    const w = this.world;
    for (const i of this.chests) {
      const cx = i % w.width;
      const cy = (i - cx) / w.width;
      if (Math.abs(cx - tx) <= 4 && Math.abs(cy - ty) <= 4) return true;
    }
    return false;
  }

  // --------------------------------------------------------------- player

  private createAnimations() {
    this.anims.create({
      key: 'campfire',
      frames: [0, 1, 2, 3].map((f) => ({ key: 'atlas', frame: `campfire_${f}` })),
      frameRate: 8,
      repeat: -1,
    });
    for (const dir of PLAYER_DIRS) {
      this.anims.create({
        key: `walk_${dir}`,
        frames: [0, 1, 2, 3].map((s) => ({ key: 'atlas', frame: `player_${dir}_${s}` })),
        frameRate: PLAYER.walkFps,
        repeat: -1,
      });
    }
  }

  private createPlayer() {
    const w = this.world;
    const sx = w.campX * TILE + 8;
    const sy = (w.campY + 1) * TILE + 10;
    this.player = this.physics.add.sprite(sx, sy, 'atlas', 'player_down_0');
    this.player.body.setSize(8, 5).setOffset(4, 11);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.collideLayer);
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.width * TILE, this.world.height * TILE);
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.fitZoom();
  }

  private fitZoom() {
    const h = this.scale.height;
    const w = this.scale.width;
    // Show roughly 15 tiles top to bottom, in whole-number zoom steps so pixels stay crisp.
    const zoom = Math.max(2, Math.min(6, Math.round(Math.min(h / (15 * TILE), w / (22 * TILE)))));
    this.cameras.main.setZoom(zoom);
  }

  update(time: number, delta: number) {
    const k = this.keys;
    const st = this.game_;
    let vx = 0;
    let vy = 0;
    if (!this.busy) {
      if (k.left.isDown || k.a.isDown) vx -= 1;
      if (k.right.isDown || k.d.isDown) vx += 1;
      if (k.up.isDown || k.w.isDown) vy -= 1;
      if (k.down.isDown || k.s.isDown) vy += 1;
    }
    const moving = vx !== 0 || vy !== 0;
    const sprinting = moving && k.shift.isDown && st.vitals.stamina > 1;
    const speed = PLAYER.speed * st.mods.speedMul * (sprinting ? SPRINT_MULTIPLIER : 1) * (st.vitals.hunger <= 0 ? 0.8 : 1);
    const len = Math.hypot(vx, vy) || 1;
    if (time >= this.knockUntil) this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
    st.pack.baseCapacity = PACK.capacity + st.mods.carryBonus;

    if (moving) {
      // Face the axis you're pushing; on diagonals keep the current facing if it fits.
      if (vx !== 0 && vy !== 0) {
        const fits =
          (this.facing === 'left' && vx < 0) ||
          (this.facing === 'right' && vx > 0) ||
          (this.facing === 'up' && vy < 0) ||
          (this.facing === 'down' && vy > 0);
        if (!fits) this.facing = vx < 0 ? 'left' : 'right';
      } else if (vx !== 0) this.facing = vx < 0 ? 'left' : 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
    }
    const animDir = this.facing === 'left' ? 'right' : this.facing;
    this.player.setFlipX(this.facing === 'left');
    if (moving) {
      this.player.anims.play(`walk_${animDir}`, true);
      this.player.anims.timeScale = sprinting ? 1.5 : 1;
    } else {
      this.player.anims.stop();
      this.player.setFrame(`player_${animDir}_0`);
    }

    const w = this.world;
    const feetY = this.player.body.bottom;
    this.player.setDepth(feetY);
    const tx = Phaser.Math.Clamp(Math.floor(this.player.x / TILE), 0, w.width - 1);
    const ty = Phaser.Math.Clamp(Math.floor(feetY / TILE), 0, w.height - 1);
    const i = idx(w, tx, ty);
    if (!this.player.tintFill) this.player.setTint(tintAt(w.depth[i]));

    const s = this.state;
    s.x = this.player.x;
    s.y = feetY;
    s.tx = tx;
    s.ty = ty;
    s.zone = w.zone[i];
    s.depth = w.depth[i];
    s.atEdge = tx <= 0 || ty <= 0 || tx >= w.width - 1 || ty >= w.height - 1;

    // Survival.
    st.atCamp = Math.hypot(tx - w.campX, ty - w.campY) <= SURVIVAL.campRadius;
    if (!this.busy) {
      st.vitals = tickVitals(st.vitals, { dt: delta / 1000, moving, sprinting, atCamp: st.atCamp }, st.mods);
      if (st.vitals.health <= 0) this.faint();
    }

    // Targeting and actions.
    this.target = this.busy ? null : this.findTarget();
    if (this.target) {
      this.targetMarker.setPosition(this.target.tx * TILE + 8, this.target.ty * TILE + 8).setVisible(true);
      const [text, blocked] = this.describe(this.target);
      if (text !== this.lastPrompt) st.emit('prompt', text, blocked);
      this.lastPrompt = text;
    } else {
      this.targetMarker.setVisible(false);
      if (this.lastPrompt !== '') st.emit('prompt', null, false);
      this.lastPrompt = '';
    }
    if (!this.busy && (this.queuedAct || k.e.isDown)) this.act(time);
    if (!this.busy && this.queuedEat) this.eatSomething();
    this.queuedAct = false;
    this.queuedEat = false;

    // Bushes grow back.
    for (let r = this.regrow.length - 1; r >= 0; r--) {
      const g = this.regrow[r];
      if (time < g.at) continue;
      this.regrow.splice(r, 1);
      const gx = g.i % w.width;
      const gy = (g.i - gx) / w.width;
      if (w.prop[g.i] === Prop.BareBush) this.setProp(gx, gy, g.prop);
    }

    st.nearStorage = st.atCamp || this.nearChest(tx, ty);
    if (st.bench && Math.hypot(st.bench[0] - tx, st.bench[1] - ty) > 2.5) st.bench = null;
    if (this.queuedAttack || (!this.busy && (k.space.isDown))) this.attack(time);
    this.queuedAttack = false;
    this.creatures.update(time);
    this.updateGhost();
    this.updateDoors();

    this.streamChunks();
    this.updateWatchers(time);
  }
}

function propName(p: Prop, rule: GatherRule): string {
  if (rule === GLOWCAP_RULE) return 'glowcap';
  switch (p) {
    case Prop.Sticks:
      return 'sticks';
    case Prop.Pebbles:
      return 'stones';
    case Prop.TallGrass:
      return 'grass';
    case Prop.BerryBush:
      return 'berries';
    case Prop.Mushroom:
      return 'mushroom';
    case Prop.Tree:
      return 'tree';
    case Prop.Log:
      return 'log';
    case Prop.Rock:
      return 'rock';
    case Prop.OreRock:
      return 'copper ore';
    default:
      return '';
  }
}
