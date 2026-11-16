// All tuning numbers live here so balancing never means hunting through code.

export const TILE = 16;

export const WORLD = {
  width: 200,
  height: 200,
  seed: 20261116,
};

/** Zone boundaries, in tiles from the camp. A little noise wobbles each edge. */
export const ZONES = [
  { id: 0, name: 'Camp', until: 7 },
  { id: 1, name: 'The Meadow', until: 34 },
  { id: 2, name: 'The Old Woods', until: 64 },
  { id: 3, name: 'The Deepwild', until: Infinity },
] as const;

export type ZoneId = (typeof ZONES)[number]['id'];

/**
 * Trees per zone. Where a broad noise field rises above `thicket`, trees grow almost solid;
 * elsewhere they're scattered at `scatter`. Lower thresholds mean more of the zone is thicket.
 */
export const FOREST: Record<ZoneId, { thicket: number; scatter: number }> = {
  0: { thicket: 2, scatter: 0 },
  1: { thicket: 0.74, scatter: 0.05 },
  2: { thicket: 0.58, scatter: 0.12 },
  3: { thicket: 0.47, scatter: 0.2 },
};

export const PLAYER = {
  speed: 78, // pixels per second at 1x
  walkFps: 8,
};

/** Tint applied at the farthest point of the map; the wilds dim and cool toward it. */
export const FAR_TINT = 0x4f5d86;
export const MAX_DARKNESS = 0.78;
