import Phaser from 'phaser';
import { TILE } from '../config';
import { CREATURES, NIGHT, SPAWN, nightCap, pickNightSpawn, pickSpawn, type CreatureDef, type CreatureId } from '../game/creatures';
import { dayNumber, isNight } from '../game/daynight';
import { Build, DEFENSE } from '../game/build';
import { LEVELING } from '../game/stats';
import { idx, inBounds, isBlocked } from '../world/generate';
import { tintAt } from '../world/shade';
import type { WorldScene } from './WorldScene';

type Mode = 'wander' | 'chase' | 'return';

interface Creature {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  def: CreatureDef;
  hp: number;
  homeX: number;
  homeY: number;
  mode: Mode;
  nextThink: number;
  nextBite: number;
  stunnedUntil: number;
  bar: Phaser.GameObjects.Graphics;
  growled: boolean;
  /** Came out with the night raid: hunts you anywhere and leaves at dawn. */
  nocturnal: boolean;
  /** Next time it can bite a wall in its way. */
  nextGnaw: number;
  leaving: boolean;
  /** Stuck-on-a-tree handling: how long it's barely moved, and a sidestep it's taking. */
  stuckMs: number;
  sidestepUntil: number;
  sideA: number;
  nextSpike: number;
}

/** Spawns, moves and fights the creatures of the Old Woods and the Deepwild. */
export class CreatureSystem {
  readonly list: Creature[] = [];
  private nextSpawn = 0;
  private nextNightSpawn = 0;

  constructor(private scene: WorldScene) {
    for (const id of Object.keys(CREATURES) as CreatureId[]) {
      scene.anims.create({
        key: `${id}_walk`,
        frames: [0, 1].map((f) => ({ key: 'atlas', frame: `${id}_${f}` })),
        frameRate: 6,
        repeat: -1,
      });
    }
  }

  private spawnNear(time: number) {
    const s = this.scene;
    const w = s.world;
    const st = s.state;
    const cap = SPAWN.maxNear[st.zone] ?? 0;
    if (this.list.length >= cap) return;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = SPAWN.minDist + Math.random() * (SPAWN.maxDist - SPAWN.minDist);
      const tx = Math.round(st.tx + Math.cos(a) * d);
      const ty = Math.round(st.ty + Math.sin(a) * d);
      if (!inBounds(w, tx, ty) || isBlocked(w, tx, ty)) continue;
      const id = pickSpawn(w.zone[idx(w, tx, ty)], Math.random());
      if (!id) continue;
      const n = Math.min(SPAWN.packSize[id], cap - this.list.length);
      for (let k = 0; k < n; k++) this.spawn(id, tx * TILE + 8 + k * 10, ty * TILE + 8, time);
      return;
    }
  }

  /** A night raid: creatures appear out of sight, anywhere (even around camp), and come for you. */
  private spawnNight(time: number) {
    const s = this.scene;
    const w = s.world;
    const st = s.state;
    const day = dayNumber(s.game_.clock);
    const out = this.list.filter((c) => c.nocturnal).length;
    if (out >= nightCap(day)) return;
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = SPAWN.minDist + Math.random() * (SPAWN.maxDist - SPAWN.minDist);
      const tx = Math.round(st.tx + Math.cos(a) * d);
      const ty = Math.round(st.ty + Math.sin(a) * d);
      if (!inBounds(w, tx, ty) || isBlocked(w, tx, ty)) continue;
      // Never pop up inside a pool of light.
      if (s.night.litAt(tx * TILE + 8, ty * TILE + 8, 1.1)) continue;
      const id = pickNightSpawn(day, Math.random());
      const c = this.spawn(id, tx * TILE + 8, ty * TILE + 8, time);
      c.nocturnal = true;
      c.mode = 'chase';
      return;
    }
  }

  /** The built tile just ahead of (x, y) heading at angle `a`, if any. */
  private builtAhead(x: number, y: number, a: number): [number, number] | null {
    const w = this.scene.world;
    for (const r of [6, 11]) {
      const tx = Math.floor((x + Math.cos(a) * r) / TILE);
      const ty = Math.floor((y + Math.sin(a) * r) / TILE);
      const b = inBounds(w, tx, ty) ? w.build[idx(w, tx, ty)] : 0;
      // Spikes are walked over (painfully), not chewed through.
      if (b !== Build.None && b !== Build.Spikes) return [tx, ty];
    }
    return null;
  }

  /** True if a creature is coming for you within `tiles`. */
  hunting(tiles: number): boolean {
    const p = this.scene.player;
    return this.list.some(
      (c) => c.mode === 'chase' && !c.leaving && Math.hypot(c.sprite.x - p.x, c.sprite.y - p.y) / TILE < tiles,
    );
  }

  /** Night creatures vanish when the night is slept away. */
  clearNocturnal() {
    for (const c of [...this.list]) if (c.nocturnal) this.remove(c);
  }

  spawn(id: CreatureId, x: number, y: number, time = 0) {
    const s = this.scene;
    const def = CREATURES[id];
    const sprite = s.physics.add.sprite(x, y, 'atlas', `${id}_0`);
    sprite.body.setSize(10, 6).setOffset(sprite.width / 2 - 5, 9);
    sprite.setCollideWorldBounds(true);
    sprite.play(`${id}_walk`);
    s.physics.add.collider(sprite, s.collisionLayer);
    s.physics.add.collider(sprite, s.doorBlockers);
    const bar = s.add.graphics().setDepth(200003);
    const c: Creature = {
      sprite,
      def,
      hp: def.hp,
      homeX: x,
      homeY: y,
      mode: 'wander',
      nextThink: time,
      nextBite: 0,
      stunnedUntil: 0,
      bar,
      growled: false,
      nocturnal: false,
      nextGnaw: 0,
      leaving: false,
      stuckMs: 0,
      sidestepUntil: 0,
      sideA: 0,
      nextSpike: 0,
    };
    this.list.push(c);
    return c;
  }

  private remove(c: Creature) {
    c.sprite.destroy();
    c.bar.destroy();
    this.list.splice(this.list.indexOf(c), 1);
  }

  /** A swing from (x, y) toward (dx, dy). Returns how many creatures it hit. */
  hit(x: number, y: number, dx: number, dy: number, reach: number, damage: number, time: number): number {
    const hx = x + dx * reach * 0.7;
    const hy = y + dy * reach * 0.7;
    let hits = 0;
    for (const c of [...this.list]) {
      const cx = c.sprite.body.center.x;
      const cy = c.sprite.body.center.y;
      if (Math.hypot(cx - hx, cy - hy) > reach) continue;
      hits++;
      this.damage(c, damage, x, y, time);
    }
    return hits;
  }

  /** A burst at (x, y): hurts every creature within `radius`, shoving them outward. Returns how many it hit. */
  blast(x: number, y: number, radius: number, damage: number, time: number): number {
    let hits = 0;
    for (const c of [...this.list]) {
      if (Math.hypot(c.sprite.body.center.x - x, c.sprite.body.center.y - y) > radius + 6) continue;
      hits++;
      this.damage(c, damage, x, y, time, 140);
    }
    return hits;
  }

  /** Hurts a creature, knocking it back from (fromX, fromY). `knock` 0 stops it without a shove. */
  damage(c: Creature, damage: number, fromX: number, fromY: number, time: number, knock = 170) {
    if (!this.list.includes(c)) return;
    const cx = c.sprite.body.center.x;
    const cy = c.sprite.body.center.y;
    c.hp -= damage;
    c.mode = 'chase';
    c.stunnedUntil = time + (knock > 0 ? 220 : 120);
    const len = Math.hypot(cx - fromX, cy - fromY) || 1;
    c.sprite.setVelocity(((cx - fromX) / len) * knock, ((cy - fromY) / len) * knock);
    c.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => c.sprite.active && c.sprite.clearTint());
    this.scene.events.emit('creature-hit', cx, cy - 8, damage);
    if (c.hp <= 0) this.kill(c);
  }

  /** The closest living creature to (x, y) within `range` pixels, for turrets. */
  nearest(x: number, y: number, range: number): Creature | null {
    let best: Creature | null = null;
    let bestD = range;
    for (const c of this.list) {
      if (c.leaving) continue;
      const d = Math.hypot(c.sprite.body.center.x - x, c.sprite.body.center.y - y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private kill(c: Creature) {
    const s = this.scene;
    const { x, y } = c.sprite;
    for (let k = 0; k < 8; k++) {
      const puff = s.add.rectangle(x, y, 3, 3, 0x2a2e45, 0.8).setDepth(200001);
      s.tweens.add({
        targets: puff,
        x: x + Phaser.Math.Between(-12, 12),
        y: y + Phaser.Math.Between(-14, 4),
        alpha: 0,
        duration: 500,
        onComplete: () => puff.destroy(),
      });
    }
    const xp = LEVELING.xp.kill[c.def.id] ?? 10;
    s.game_.addXp(xp);
    s.game_.emit('toast', `Defeated a ${c.def.name.toLowerCase()}. +${xp} XP`);
    this.remove(c);
  }

  /** Everything in the outer zones forgets you when you collapse. */
  clear() {
    for (const c of [...this.list]) this.remove(c);
    this.nextNightSpawn = this.scene.time.now + NIGHT.graceMs;
  }

  update(time: number) {
    const s = this.scene;
    const w = s.world;
    const p = s.player;
    if (time >= this.nextSpawn) {
      this.nextSpawn = time + SPAWN.intervalMs;
      this.spawnNear(time);
    }
    const night = isNight(s.game_.clock);
    if (night && time >= this.nextNightSpawn) {
      this.nextNightSpawn = time + NIGHT.intervalMs;
      this.spawnNight(time);
    }
    for (const c of [...this.list]) {
      const spr = c.sprite;
      const cx = spr.body.center.x;
      const cy = spr.body.center.y;
      const dist = Math.hypot(p.x - cx, p.body.center.y - cy) / TILE;
      if (dist > SPAWN.despawnDist) {
        this.remove(c);
        continue;
      }
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);
      const i = idx(w, Phaser.Math.Clamp(tx, 0, w.width - 1), Phaser.Math.Clamp(ty, 0, w.height - 1));
      const fromHome = Math.hypot(cx - c.homeX, cy - c.homeY) / TILE;
      const playerZone = s.state.zone;

      // Night creatures slink away at dawn and fade out.
      if (c.nocturnal && !night && !c.leaving) {
        c.leaving = true;
        c.mode = 'wander';
        s.tweens.add({ targets: [spr, c.bar], alpha: 0, duration: 1600, onComplete: () => this.list.includes(c) && this.remove(c) });
      }

      // Decide what to do.
      if (c.nocturnal) {
        // Hunts you wherever you are, and never gives up while it's dark.
        if (!c.leaving && !s.busy) c.mode = 'chase';
        else if (s.busy && c.mode === 'chase') c.mode = 'wander';
        if (c.mode === 'chase' && !c.growled) {
          s.game_.sfx.growl();
          c.growled = true;
        }
      } else if (c.mode !== 'return') {
        const canSee = dist < c.def.aggro && playerZone >= c.def.minZone - 1 && !s.busy;
        if (canSee) {
          if (c.mode !== 'chase' && !c.growled) {
            s.game_.sfx.growl();
            c.growled = true;
          }
          c.mode = 'chase';
        } else if (c.mode === 'chase' && dist > c.def.aggro * 1.6) c.mode = 'wander';
        // Never into safe ground, and never too far from where it lives.
        if (w.zone[i] < c.def.minZone - 1 || fromHome > c.def.leash || playerZone < c.def.minZone - 1) c.mode = 'return';
      } else if (fromHome < 2) c.mode = 'wander';

      if (time >= c.stunnedUntil) {
        if (c.mode === 'chase') {
          let a = Math.atan2(p.body.center.y - cy, p.x - cx);
          // Caught on a tree or rock: step sideways for a moment, then try again.
          const moved = Math.abs(spr.body.deltaX()) + Math.abs(spr.body.deltaY());
          const ahead = this.builtAhead(cx, cy, a);
          c.stuckMs = moved < 0.2 && dist > 1.2 && !ahead ? c.stuckMs + this.scene.game.loop.delta : 0;
          if (c.stuckMs > 700 && time >= c.sidestepUntil) {
            c.sidestepUntil = time + 600 + Math.random() * 500;
            c.sideA = a + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.6);
            c.stuckMs = 0;
          }
          if (time < c.sidestepUntil) a = c.sideA;
          spr.setVelocity(Math.cos(a) * c.def.chaseSpeed, Math.sin(a) * c.def.chaseSpeed);
        } else if (c.mode === 'return') {
          const a = Math.atan2(c.homeY - cy, c.homeX - cx);
          spr.setVelocity(Math.cos(a) * c.def.chaseSpeed * 0.8, Math.sin(a) * c.def.chaseSpeed * 0.8);
        } else if (time >= c.nextThink) {
          c.nextThink = time + 1200 + Math.random() * 2000;
          if (Math.random() < 0.35) spr.setVelocity(0, 0);
          else {
            const a = Math.random() * Math.PI * 2;
            spr.setVelocity(Math.cos(a) * c.def.wanderSpeed, Math.sin(a) * c.def.wanderSpeed);
          }
        }
      }

      // A night creature bites through whatever you've built in its way.
      if (c.nocturnal && c.mode === 'chase' && dist >= 0.9 && time >= c.nextGnaw && time >= c.stunnedUntil) {
        const ahead = this.builtAhead(cx, cy, Math.atan2(p.body.center.y - cy, p.x - cx));
        if (ahead && s.damageStructure(ahead[0], ahead[1], c.def.damage)) c.nextGnaw = time + c.def.attackCooldown;
      }

      // Spike traps hurt and slow whatever crosses them.
      if (w.build[i] === Build.Spikes) {
        spr.body.velocity.scale(DEFENSE.spikeSlow);
        if (time >= c.nextSpike) {
          c.nextSpike = time + DEFENSE.spikeEveryMs;
          this.damage(c, DEFENSE.spikeDamage, cx, cy, time, 0);
          if (!this.list.includes(c)) continue;
        }
      }

      // Bite when touching.
      if (c.mode === 'chase' && dist < 0.9 && time >= c.nextBite && !s.busy) {
        c.nextBite = time + c.def.attackCooldown;
        s.hurtPlayer(c.def.damage, cx, cy, time);
      }

      const moving = Math.abs(spr.body.velocity.x) + Math.abs(spr.body.velocity.y) > 4;
      if (moving) spr.anims.play(`${c.def.id}_walk`, true);
      else spr.anims.pause();
      if (Math.abs(spr.body.velocity.x) > 2) spr.setFlipX(spr.body.velocity.x < 0);
      spr.setDepth(spr.body.bottom);
      if (!spr.tintFill) spr.setTint(tintAt(w.depth[i]));

      // Health bar once hurt.
      c.bar.clear();
      if (c.hp < c.def.hp) {
        const bw = 14;
        const bx = Math.round(spr.x - bw / 2);
        const by = Math.round(spr.y - spr.height / 2 - 4);
        c.bar.fillStyle(0x2e1f15).fillRect(bx - 1, by - 1, bw + 2, 4);
        c.bar.fillStyle(0xd8434e).fillRect(bx, by, Math.max(0, Math.round((bw * c.hp) / c.def.hp)), 2);
      }
    }
  }
}
