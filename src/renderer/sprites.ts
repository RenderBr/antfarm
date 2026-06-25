/* renderer/sprites.ts — pre-render food sprites and compute per-ant
 * appearance bits. Foods are baked once from a 14x14 pixel grid into
 * offscreen canvases; the renderer blits them with smoothing off.
 * Ants are drawn live each frame (too many unique combos to cache),
 * but `computeAppearance` derives a stable genome hash that drives
 * pattern variation (abdomen stripe, thorax spots, hue shift, leg
 * style, antennae curve, head glint) and evolves with the genome.
 */

import { FOODS } from "../foods.js";
import type { FoodDef } from "../foods.js";

export const FOOD_GRID_PX = 14;

export function bakeFoodSprite(def: FoodDef): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = FOOD_GRID_PX;
  cv.height = FOOD_GRID_PX;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  for (let y = 0; y < FOOD_GRID_PX; y++) {
    const row = def.pixels[y];
    if (!row) continue;
    for (let x = 0; x < FOOD_GRID_PX; x++) {
      const tok = row[x];
      if (tok === "." || tok === " ") continue;
      const c = def.palette[tok];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

export function bakeAllFoodSprites(): HTMLCanvasElement[] {
  return FOODS.map(bakeFoodSprite);
}

export interface AntAppearance {
  stripe: boolean;
  spots: number;
  hueShift: number;
  legStyle: number;
  antennaeCurve: number;
  headGlint: boolean;
}

export function computeAppearance(genome: Float32Array): AntAppearance {
  let h = 5381 >>> 0;
  const n = genome.length;
  for (let i = 0; i < 8; i++) {
    const idx = (i * 137) % n;
    h = (Math.imul(h, 33) ^ Math.trunc(genome[idx] * 1000)) >>> 0;
  }
  return {
    stripe: (h & 1) !== 0,
    spots: (h >> 1) & 0x3,
    hueShift: (((h >> 3) & 0x3F) - 32) / 160,
    legStyle: (h >> 9) & 0x3,
    antennaeCurve: (((h >> 11) & 0x1F) - 16) / 53,
    headGlint: (h & (1 << 16)) !== 0,
  };
}

export function darkenHex(hex: string, amount: number): string {
  let h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return hex;
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  if (amount < 0) {
    const a = -amount;
    r = Math.round(r + (255 - r) * a);
    g = Math.round(g + (255 - g) * a);
    b = Math.round(b + (255 - b) * a);
  } else {
    r = Math.round(r * (1 - amount));
    g = Math.round(g * (1 - amount));
    b = Math.round(b * (1 - amount));
  }
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
