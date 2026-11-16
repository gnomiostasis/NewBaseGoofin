import Phaser from 'phaser';
import { PLAYER, TILE } from '../config';
import { E, GRASS_VARIANTS, N, PLAYER_DIRS, S, T_BLOCK, T_DIRT, T_GRASS, T_WATER, TREE_FRAMES, W } from '../art/textures';
import { Ground, Prop, generateWorld, idx, inBounds, isBlocked, type CampObject, type World } from '../world/generate';
import { tintAt } from '../world/shade';
import { hash2 } from '../world/rng';

const CHUNK = 16; // tiles per side of a streaming chunk

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

/** Glowing eyes that watch from the Deepwild and blink out when you get close. */
interface Watcher {
  img: Phaser.GameObjects.Image;
  phase: number;
}

export class WorldScene extends Phaser.Scene {
  world!: World;
  player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private facing: Dir = 'down';
  private chunks = new Map<number, Phaser.GameObjects.GameObject[]>();
  private visibleChunks = new Set<number>();
  private watchers = new Map<number, Watcher[]>();
  readonly state: PlayerState = { x: 0, y: 0, tx: 0, ty: 0, zone: 0, depth: 0, atEdge: false };

  constructor() {
    super('world');
  }

  create() {
    this.world = generateWorld();
    this.buildTilemap();
    this.createAnimations();
    this.buildCamp();
    this.createPlayer();
    this.setupCamera();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as WorldScene['keys'];

    this.scale.on('resize', this.fitZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitZoom, this));
  }

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

  private collideLayer!: Phaser.Tilemaps.TilemapLayer;

  private buildCamp() {
    const w = this.world;
    const tint = tintAt(0);
    for (const o of w.campObjects) this.placeCampObject(o, tint);
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

  /** Props are created per chunk the first time the camera comes near, then shown and hidden. */
  private buildChunk(cx: number, cy: number): Phaser.GameObjects.GameObject[] {
    const w = this.world;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const watchers: Watcher[] = [];
    for (let ty = cy * CHUNK; ty < Math.min(w.height, (cy + 1) * CHUNK); ty++) {
      for (let tx = cx * CHUNK; tx < Math.min(w.width, (cx + 1) * CHUNK); tx++) {
        const i = idx(w, tx, ty);
        const p = w.prop[i] as Prop;
        if (p === Prop.None || p === Prop.Camp) continue;
        const v = w.variant[i];
        const zone = w.zone[i];
        const tint = tintAt(w.depth[i]);
        const jx = ((v & 7) - 3.5) * 0.6;
        const footX = Math.round(tx * TILE + 8 + (p === Prop.Tree ? jx : 0));
        const footY = (ty + 1) * TILE;
        let frame: string;
        switch (p) {
          case Prop.Tree: {
            // Near zone borders, mix in the neighbouring zone's trees so edges blend.
            const blend = hash2(tx, ty, 404) < 0.25;
            const set = zone === 3 ? (blend ? TREE_FRAMES.woods : TREE_FRAMES.deep) : zone === 2 ? (blend ? TREE_FRAMES.meadow : TREE_FRAMES.woods) : TREE_FRAMES.meadow;
            frame = set[v % set.length];
            break;
          }
          case Prop.Rock:
            frame = 'rock';
            break;
          case Prop.OreRock:
            frame = 'ore_rock';
            break;
          case Prop.BerryBush:
            frame = 'berry_bush';
            break;
          case Prop.Log:
            frame = 'log';
            break;
          case Prop.Mushroom:
            frame = zone === 3 && v % 3 !== 0 ? 'mushroom_glow' : 'mushroom';
            break;
          case Prop.Flowers:
            frame = `flowers_${v & 1}`;
            break;
          default:
            frame = `tallgrass_${v & 1}`;
        }
        const flat = p === Prop.Flowers || p === Prop.TallGrass || p === Prop.Mushroom;
        const img = this.add
          .image(footX, footY, 'atlas', frame)
          .setOrigin(0.5, 1)
          .setDepth(flat ? footY - 8 : footY)
          .setTint(tint)
          .setFlipX(p !== Prop.Tree && (v & 16) !== 0);
        objs.push(img);

        if (frame === 'mushroom_glow') {
          const g = this.add
            .image(footX, footY - 6, 'atlas', 'glow')
            .setScale(0.22)
            .setTint(0x6fd6e8)
            .setAlpha(0.45)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(100000);
          objs.push(g);
        }
        if (p === Prop.Tree && zone === 3 && hash2(tx, ty, 777) < 0.035) {
          const eyes = this.add
            .image(footX - 2 + (v % 5), footY - 16 - (v % 6), 'atlas', 'eyes')
            .setOrigin(0.5)
            .setDepth(footY + 1);
          objs.push(eyes);
          watchers.push({ img: eyes, phase: v * 37 });
        }
      }
    }
    this.watchers.set(this.chunkKey(cx, cy), watchers);
    return objs;
  }

  private chunkKey(cx: number, cy: number) {
    return cy * 1000 + cx;
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
        let objs = this.chunks.get(key);
        if (!objs) {
          objs = this.buildChunk(cx, cy);
          this.chunks.set(key, objs);
        } else for (const o of objs) (o as Phaser.GameObjects.Image).setVisible(true);
      }
    }
    for (const key of this.visibleChunks) {
      if (wanted.has(key)) continue;
      for (const o of this.chunks.get(key) ?? []) (o as Phaser.GameObjects.Image).setVisible(false);
    }
    this.visibleChunks = wanted;
  }

  private updateWatchers(time: number) {
    const px = this.player.x;
    const py = this.player.y;
    for (const key of this.visibleChunks) {
      for (const wt of this.watchers.get(key) ?? []) {
        const near = Math.hypot(wt.img.x - px, wt.img.y - py) < 6 * TILE;
        const blink = ((time / 16 + wt.phase) % 160) < 7;
        const target = near ? 0 : blink ? 0 : 1;
        wt.img.alpha += (target - wt.img.alpha) * (near ? 0.15 : 0.6);
      }
    }
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

  update(time: number) {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.left.isDown || k.a.isDown) vx -= 1;
    if (k.right.isDown || k.d.isDown) vx += 1;
    if (k.up.isDown || k.w.isDown) vy -= 1;
    if (k.down.isDown || k.s.isDown) vy += 1;
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * PLAYER.speed, (vy / len) * PLAYER.speed);

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      // Face the axis you're pushing hardest; on diagonals keep the current facing if it fits.
      if (vx !== 0 && vy !== 0) {
        const fits = (this.facing === 'left' && vx < 0) || (this.facing === 'right' && vx > 0) || (this.facing === 'up' && vy < 0) || (this.facing === 'down' && vy > 0);
        if (!fits) this.facing = vx < 0 ? 'left' : 'right';
      } else if (vx !== 0) this.facing = vx < 0 ? 'left' : 'right';
      else this.facing = vy < 0 ? 'up' : 'down';
    }
    const animDir = this.facing === 'left' ? 'right' : this.facing;
    this.player.setFlipX(this.facing === 'left');
    if (moving) this.player.anims.play(`walk_${animDir}`, true);
    else {
      this.player.anims.stop();
      this.player.setFrame(`player_${animDir}_0`);
    }

    const w = this.world;
    const feetY = this.player.body.bottom;
    this.player.setDepth(feetY);
    const tx = Phaser.Math.Clamp(Math.floor(this.player.x / TILE), 0, w.width - 1);
    const ty = Phaser.Math.Clamp(Math.floor(feetY / TILE), 0, w.height - 1);
    const i = idx(w, tx, ty);
    this.player.setTint(tintAt(w.depth[i]));

    const s = this.state;
    s.x = this.player.x;
    s.y = feetY;
    s.tx = tx;
    s.ty = ty;
    s.zone = w.zone[i];
    s.depth = w.depth[i];
    s.atEdge = tx <= 0 || ty <= 0 || tx >= w.width - 1 || ty >= w.height - 1;

    this.streamChunks();
    this.updateWatchers(time);
  }
}
