import { ITEMS, ITEM_ORDER, type ItemId, type Recipe } from './items';

/** A bag of item counts. Used for both the player's pack and the camp stash. */
export class Inventory {
  private counts = new Map<ItemId, number>();

  /** `baseCapacity` is the maximum total weight; Infinity for the stash. Gear can raise it. */
  constructor(public baseCapacity = Infinity) {}

  get capacity() {
    let extra = 0;
    for (const id of this.counts.keys()) extra += ITEMS[id].capacity ?? 0;
    return this.baseCapacity + extra;
  }

  count(id: ItemId) {
    return this.counts.get(id) ?? 0;
  }

  has(id: ItemId, n = 1) {
    return this.count(id) >= n;
  }

  get weight() {
    let w = 0;
    for (const [id, n] of this.counts) w += ITEMS[id].weight * n;
    return Math.round(w * 10) / 10;
  }

  /** How many of `id` still fit under the weight limit. */
  room(id: ItemId) {
    const free = this.capacity - this.weight;
    return Math.max(0, Math.floor((free + 1e-9) / ITEMS[id].weight));
  }

  /** Adds up to `n`, as many as fit. Returns how many were actually added. */
  add(id: ItemId, n = 1): number {
    const k = Math.min(n, this.room(id));
    if (k > 0) this.counts.set(id, this.count(id) + k);
    return k;
  }

  /** Removes up to `n`. Returns how many were removed. */
  remove(id: ItemId, n = 1): number {
    const k = Math.min(n, this.count(id));
    if (k <= 0) return 0;
    const left = this.count(id) - k;
    if (left === 0) this.counts.delete(id);
    else this.counts.set(id, left);
    return k;
  }

  canCraft(r: Recipe) {
    return Object.entries(r.needs).every(([id, n]) => this.has(id as ItemId, n));
  }

  /** Spends the ingredients and adds the result. Fails if missing anything or the result won't fit. */
  craft(r: Recipe): boolean {
    if (!this.canCraft(r)) return false;
    for (const [id, n] of Object.entries(r.needs)) this.remove(id as ItemId, n);
    if (this.add(r.makes) === 1) return true;
    // Didn't fit: put the ingredients back.
    for (const [id, n] of Object.entries(r.needs)) this.counts.set(id as ItemId, this.count(id as ItemId) + (n ?? 0));
    return false;
  }

  /** Moves every material into `into`. Returns what moved. */
  depositMaterials(into: Inventory): Array<[ItemId, number]> {
    const moved: Array<[ItemId, number]> = [];
    for (const [id, n] of [...this.counts]) {
      if (ITEMS[id].kind !== 'material') continue;
      const k = into.add(id, n);
      this.remove(id, k);
      if (k > 0) moved.push([id, k]);
    }
    return moved;
  }

  hasTool(tool: 'axe' | 'pick') {
    return this.toolPower(tool) > 0;
  }

  /** Strength of the best tool of this type you carry; 0 if none. */
  toolPower(tool: 'axe' | 'pick') {
    let best = 0;
    for (const id of this.counts.keys()) if (ITEMS[id].tool === tool) best = Math.max(best, ITEMS[id].power ?? 1);
    return best;
  }

  /** Entries in display order. */
  entries(): Array<[ItemId, number]> {
    return ITEM_ORDER.filter((id) => this.count(id) > 0).map((id) => [id, this.count(id)]);
  }

  clear(keep: (id: ItemId) => boolean = () => false) {
    for (const id of [...this.counts.keys()]) if (!keep(id)) this.counts.delete(id);
  }
}
