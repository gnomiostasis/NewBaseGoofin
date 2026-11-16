import Phaser from 'phaser';
import { PACK } from '../config';
import { Inventory } from './inventory';
import type { ItemId } from './items';
import { freshVitals, type Vitals } from './survival';
import { Sfx } from './sfx';

/** Events the world raises for the HUD to show. */
export interface GameEvents {
  toast: (text: string) => void;
  /** Floating "+3 Wood" text at a world position. */
  gained: (wx: number, wy: number, items: Array<[ItemId, number]>) => void;
  /** What pressing E would do right now, or null. */
  prompt: (text: string | null, blocked: boolean) => void;
}

/** Everything about the player's run that the world and the HUD both need. */
export class GameState {
  readonly pack = new Inventory(PACK.capacity);
  readonly stash = new Inventory();
  vitals: Vitals = freshVitals();
  atCamp = true;
  readonly events = new Phaser.Events.EventEmitter();
  readonly sfx = new Sfx();

  emit<K extends keyof GameEvents>(name: K, ...args: Parameters<GameEvents[K]>) {
    this.events.emit(name, ...args);
  }

  on<K extends keyof GameEvents>(name: K, fn: GameEvents[K], ctx?: unknown) {
    this.events.on(name, fn, ctx);
  }

  static get(scene: Phaser.Scene): GameState {
    let s = scene.registry.get('state') as GameState | undefined;
    if (!s) {
      s = new GameState();
      scene.registry.set('state', s);
    }
    return s;
  }
}
