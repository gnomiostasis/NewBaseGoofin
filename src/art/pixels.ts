// Tiny pixel-drawing toolkit used to paint every sprite in code, so the game ships
// with original art and no image files. All drawing snaps to whole pixels.

import { OUTLINE, type Shades } from './palette';
import { hash2 } from '../world/rng';

export type Ctx = CanvasRenderingContext2D;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** Ordered-dither offset in [-0.5, 0.5), for soft pixel-art shading. */
export const bayer = (x: number, y: number) => BAYER[y & 3][x & 3] / 16 - 0.5;

export function px(g: Ctx, x: number, y: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, 1, 1);
}

export function rect(g: Ctx, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

/** Paint a pixel map: each character is looked up in `colors`; '.' is transparent. */
export function sprite(g: Ctx, x: number, y: number, rows: string[], colors: Record<string, string>, flip = false) {
  rows.forEach((row, j) => {
    const w = row.length;
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const c = colors[ch];
      if (!c) continue;
      px(g, x + (flip ? w - 1 - i : i), y + j, c);
    }
  });
}

export interface BlobOptions {
  /** Seed for speckles. */
  seed?: number;
  /** Speckle colour and chance per pixel, e.g. blossoms or berries. */
  dots?: [string, number];
  /** Skip the dark outline (for soft shapes like shadows). */
  noOutline?: boolean;
}

/**
 * Fill the union of circles with 4-shade shading: highlight top-left, shadow bottom-right,
 * outlined edge. This one routine draws canopies, bushes, rocks and sacks.
 */
export function blob(g: Ctx, circles: Array<[number, number, number]>, pal: Shades, opts: BlobOptions = {}) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const [a, b, r] of circles) {
    x0 = Math.min(x0, a - r);
    x1 = Math.max(x1, a + r);
    y0 = Math.min(y0, b - r);
    y1 = Math.max(y1, b + r);
  }
  const inside = (x: number, y: number) => circles.some(([a, b, r]) => (x - a) ** 2 + (y - b) ** 2 <= r * r);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rad = Math.max(1, (x1 - x0) / 2);
  for (let y = Math.floor(y0); y <= y1; y++) {
    for (let x = Math.floor(x0); x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge =
        !inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y + 1.5) || !inside(x + 0.5, y - 0.5);
      const t = ((x - cx) * 0.55 + (y - cy)) / rad + bayer(x, y) * 0.5;
      let c = edge && !opts.noOutline ? pal[3] : t < -0.45 ? pal[2] : t < 0.3 ? pal[0] : pal[1];
      if (!edge && opts.dots && hash2(x, y, opts.seed ?? 1) < opts.dots[1]) c = opts.dots[0];
      px(g, x, y, c);
    }
  }
}

/** Soft oval ground shadow under objects. */
export function shadow(g: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.28) {
  g.fillStyle = `rgba(20,30,20,${alpha})`;
  for (let i = -rx; i <= rx; i++) {
    const h = Math.round(Math.sqrt(Math.max(0, 1 - (i / (rx + 0.5)) ** 2)) * ry);
    if (h > 0) g.fillRect(cx + i, cy - h, 1, h * 2);
  }
}

export function outlineRect(g: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  rect(g, x, y, w, h, OUTLINE);
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}
