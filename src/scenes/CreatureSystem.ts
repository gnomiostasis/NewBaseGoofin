import Phaser from 'phaser';
import { TILE } from '../config';
import { CREATURES, SPAWN, pickSpawn, type CreatureDef, type CreatureId } from '../game/creatures';
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
}

/** Spawns, moves and fights the creatures of the Old Woods and the Deepwild. */
export class CreatureSystem {
  readonly list: Creature[] = [];
  private nextSpawn = 0;

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

  spawn(id: CreatureId, x: number, y: number, time = 0) {
    const s = this.scene;
    const def = CREATURES[id];
    const sprite = s.physics.add.sprite(x, y, 'atlas', `${id}_0`);
    sprite.body.setSize(10, 6).setOffset(sprite.width / 2 - 5, 9);
    sprite.setCollideWorldBounds(true);
    sprite.play(`${id}_walk`);
    s.physics.add.collider(sprite, s.collisionLayer);
    const bar = s.add.graphics().setDepth(200003);
    this.list.push({ sprite, def, hp: def.hp, homeX: x, homeY: y, mode: 'wander', nextThink: time, nextBite: 0, stunnedUntil: 0, bar, growled: false });
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
      c.hp -= damage;
      c.mode = 'chase';
      c.stunnedUntil = time + 220;
      const len = Math.hypot(cx - x, cy - y) || 1;
      c.sprite.setVelocity(((cx - x) / len) * 170, ((cy - y) / len) * 170);
      c.sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(90, () => c.sprite.active && c.sprite.clearTint());
      this.scene.events.emit('creature-hit', cx, cy - 8, damage);
      if (c.hp <= 0) this.kill(c);
    }
    return hits;
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
  }

  update(time: number) {
    const s = this.scene;
    const w = s.world;
    const p = s.player;
    if (time >= this.nextSpawn) {
      this.nextSpawn = time + SPAWN.intervalMs;
      this.spawnNear(time);
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

      // Decide what to do.
      if (c.mode !== 'return') {
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
          const a = Math.atan2(p.body.center.y - cy, p.x - cx);
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
