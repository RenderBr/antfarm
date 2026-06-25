/* world.ts — the open, mutable environment.
 * A tile grid the ants can sense, dig out, and build on, plus
 * food and two pheromone fields (food-trail and home-trail).
 */

export const GROUND = 0; // walkable open ground
export const DIRT = 1;   // solid, diggable -> yields soil, becomes ground
export const WALL = 2;   // solid, built by ants from soil, can be removed
export const NEST = 3;   // colony core: food deposited & ants refuel here
export const ROCK = 4;   // solid, indestructible boundary / obstacle

export type Tile = 0 | 1 | 2 | 3 | 4;

export const CS = 8; // pixels per cell

export function isSolid(t: number): boolean { return t === DIRT || t === WALL || t === ROCK; }

export const TILE = { GROUND, DIRT, WALL, NEST, ROCK, CS, isSolid };

import { FOOD_NONE, pickFoodType } from "./foods.js";

export interface PNO { x: number; y: number; }

export class World {
  w: number;
  h: number;
  cs: number;
  pw: number;
  ph: number;
  tiles: Uint8Array;
  food: Float32Array;
  foodType: Uint8Array; // per-cell type id (FOOD_NONE if empty)
  phF: Float32Array; // food-trail pheromone
  phH: Float32Array; // home-trail pheromone
  dirty: Uint8Array; // tile render-dirty flags

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cs = CS;
    this.pw = w * CS;
    this.ph = h * CS;
    const n = w * h;
    this.tiles = new Uint8Array(n);
    this.food = new Float32Array(n);
    this.foodType = new Uint8Array(n).fill(FOOD_NONE);
    this.phF = new Float32Array(n);
    this.phH = new Float32Array(n);
    this.dirty = new Uint8Array(n);
    this.generate();
  }

  idx(cx: number, cy: number): number { return cy * this.w + cx; }
  inBounds(cx: number, cy: number): boolean { return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h; }

  tileAtPx(px: number, py: number): number {
    const cx = (px / CS) | 0, cy = (py / CS) | 0;
    if (!this.inBounds(cx, cy)) return ROCK;
    return this.tiles[this.idx(cx, cy)];
  }

  solidAtPx(px: number, py: number): boolean { return isSolid(this.tileAtPx(px, py)); }

  setTile(cx: number, cy: number, t: number): void {
    if (!this.inBounds(cx, cy)) return;
    const i = this.idx(cx, cy);
    if (this.tiles[i] === NEST && t !== NEST) return; // protect nest core
    this.tiles[i] = t;
    this.dirty[i] = 1;
  }

  generate(): void {
    const { w, h, tiles } = this;
    tiles.fill(GROUND);

    for (let x = 0; x < w; x++) { tiles[this.idx(x, 0)] = ROCK; tiles[this.idx(x, h - 1)] = ROCK; }
    for (let y = 0; y < h; y++) { tiles[this.idx(0, y)] = ROCK; tiles[this.idx(w - 1, y)] = ROCK; }

    const blobs = ((w * h) / 260) | 0;
    for (let b = 0; b < blobs; b++) {
      const cx = 2 + (Math.random() * (w - 4)) | 0;
      const cy = 2 + (Math.random() * (h - 4)) | 0;
      const r = 2 + (Math.random() * 6) | 0;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r) continue;
          const tx = cx + x, ty = cy + y;
          if (this.inBounds(tx, ty) && tiles[this.idx(tx, ty)] === GROUND) {
            if (Math.random() < 0.85) tiles[this.idx(tx, ty)] = DIRT;
          }
        }
      }
    }

    for (let b = 0; b < (blobs / 6 | 0); b++) {
      const cx = 4 + (Math.random() * (w - 8)) | 0;
      const cy = 4 + (Math.random() * (h - 8)) | 0;
      const r = 1 + (Math.random() * 2) | 0;
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r && this.inBounds(cx + x, cy + y))
            tiles[this.idx(cx + x, cy + y)] = ROCK;
    }

    const clusters = 18;
    for (let c = 0; c < clusters; c++) {
      const cx = 3 + (Math.random() * (w - 6)) | 0;
      const cy = 3 + (Math.random() * (h - 6)) | 0;
      this.spawnFoodCluster(cx, cy, 4 + (Math.random() * 4) | 0, 30 + Math.random() * 60);
    }

    this.dirty.fill(1);
  }

  carveNest(nx: number, ny: number, nr?: number): { x: number; y: number; cells: [number, number][] } {
    nr = nr || 5;
    const cells: [number, number][] = [];
    for (let y = -nr - 2; y <= nr + 2; y++) {
      for (let x = -nr - 2; x <= nr + 2; x++) {
        const tx = nx + x, ty = ny + y;
        if (!this.inBounds(tx, ty)) continue;
        const d = Math.hypot(x, y);
        const i = this.idx(tx, ty);
        if (d <= nr + 2 && this.tiles[i] !== ROCK) { this.tiles[i] = GROUND; this.food[i] = 0; this.dirty[i] = 1; }
        if (d <= 2.5) { this.tiles[i] = NEST; this.dirty[i] = 1; cells.push([tx, ty]); }
      }
    }
    return { x: nx, y: ny, cells };
  }

  cellCenterPx(cx: number, cy: number): PNO { return { x: (cx + 0.5) * CS, y: (cy + 0.5) * CS }; }

  spawnFoodCluster(cx: number, cy: number, r: number, amount: number, type?: number): void {
    const ft = type === undefined ? pickFoodType() : type;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const tx = cx + x, ty = cy + y;
        if (!this.inBounds(tx, ty)) continue;
        const i = this.idx(tx, ty);
        if (isSolid(this.tiles[i])) continue;
        this.food[i] += amount * (0.4 + Math.random() * 0.6) / (1 + x * x + y * y);
        this.foodType[i] = ft;
      }
    }
  }

  readPh(field: Float32Array, px: number, py: number): number {
    const cx = (px / CS) | 0, cy = (py / CS) | 0;
    if (!this.inBounds(cx, cy)) return 0;
    return field[this.idx(cx, cy)];
  }
  addPh(field: Float32Array, px: number, py: number, amt: number): void {
    const cx = (px / CS) | 0, cy = (py / CS) | 0;
    if (!this.inBounds(cx, cy)) return;
    const i = this.idx(cx, cy);
    field[i] = Math.min(8, field[i] + amt);
  }

  decay(dt: number, diffuse: boolean): void {
    const evap = Math.exp(-dt * 0.18);
    const { phF, phH } = this;
    for (let i = 0; i < phF.length; i++) {
      phF[i] *= evap;
      phH[i] *= evap;
      if (phF[i] < 0.002) phF[i] = 0;
      if (phH[i] < 0.002) phH[i] = 0;
    }
    if (diffuse) this._diffuse();
  }

  _diffuse(): void {
    const { w, h } = this;
    for (const field of [this.phF, this.phH]) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const v = field[i];
          if (v < 0.05) continue;
          const give = v * 0.06;
          field[i] -= give * 4;
          field[i - 1] += give; field[i + 1] += give;
          field[i - w] += give; field[i + w] += give;
        }
      }
    }
  }
}