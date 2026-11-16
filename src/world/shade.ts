import { FAR_TINT, MAX_DARKNESS } from '../config';

/** How dark the wilds are at a given depth (0 at camp, 1 at the far corners). */
export function darknessAt(depth: number): number {
  const t = Math.min(1, Math.max(0, depth / 0.62));
  return MAX_DARKNESS * Math.pow(t, 1.15);
}

/** Phaser tint (0xRRGGBB) for a depth: white near camp, dimmer and cooler farther out. */
export function tintAt(depth: number): number {
  const k = darknessAt(depth);
  const r = (FAR_TINT >> 16) & 0xff;
  const g = (FAR_TINT >> 8) & 0xff;
  const b = FAR_TINT & 0xff;
  const mix = (c: number) => Math.round(255 + (c - 255) * k);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}
