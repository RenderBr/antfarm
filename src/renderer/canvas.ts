/* renderer/canvas.ts — Canvas2D renderer + main loop.
 * Owns the <canvas>, the camera, the world/sim, and the offscreen layers.
 * Runs the requestAnimationFrame loop (sim.update -> draw) and pushes
 * UiSnap (5Hz) and LbSnap (1Hz) into the reactive store. Reads tool /
 * paused / speed / showPher / showVision / brush / selectedId from the
 * store; writes selectedId when the user picks an ant.
 */

import {
  GROUND, DIRT, WALL, NEST, ROCK, CS, isSolid, World,
} from "../world.js";
import { Simulation } from "../sim.js";
import { Ant, CARRY_FOOD, CARRY_SOIL, CARRY_SUPER } from "../ant.js";
import {
  store, setRenderer,
  type UiSnap, type ColonySnap, type EventSnap, type SelectedSnap,
} from "../state/store.js";
import {
  buildLbEntries, getCategory,
  type LbEntry,
} from "../leaderboard.js";
import { FOOD_NONE, NUM_FOODS, pickFoodType, foodName } from "../foods.js";
import {
  bakeAllFoodSprites, computeAppearance, darkenHex,
  FOOD_GRID_PX,
} from "./sprites.js";

const GRID_W = 170;
const GRID_H = 108;

const TILE_RGB: Record<number, [number, number, number]> = {
  [GROUND]: [58, 38, 24],
  [DIRT]: [104, 67, 38],
  [WALL]: [150, 116, 74],
  [NEST]: [40, 26, 60],
  [ROCK]: [70, 70, 78],
};

function fmtTime(t: number): string {
  const m = (t / 60) | 0, s = (t % 60) | 0;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function carryLabel(c: number): string {
  if (c === CARRY_FOOD) return "food";
  if (c === CARRY_SOIL) return "soil";
  if (c === CARRY_SUPER) return "special food";
  return "nothing";
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world!: World;
  private sim!: Simulation;

  private cam = { x: 0, y: 0, zoom: 1 };
  private dpr = 1;
  private terrainCv: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private terrainImg!: ImageData;
  private dynCv!: HTMLCanvasElement;
  private dynCtx!: CanvasRenderingContext2D;
  private dynImg!: ImageData;

  private dragging = false;
  private panning = false;
  private lastPan: { x: number; y: number } | null = null;
  private last = performance.now();
  private phTimer = 0;
  private diffTick = 0;
  private statTimer = 0;
  private lbTimer = 0;

  private raf = 0;
  private wakeLock: WakeLockSentinel | null = null;

  private foodSprites: HTMLCanvasElement[] = [];
  private brushFoodType: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context not available");
    this.ctx = ctx;

    this.terrainCv = document.createElement("canvas");
    const tctx = this.terrainCv.getContext("2d");
    if (!tctx) throw new Error("offscreen 2d context not available");
    this.terrainCtx = tctx;

    setRenderer(this);
    this.foodSprites = bakeAllFoodSprites();
    this.buildWorld();
    this.resize();
    this.attachInput();
    this.attachWakeLock();
    this.raf = requestAnimationFrame(this.loop);
  }

  reset(): void {
    this.buildWorld();
  }

  centerOnAnt(id: number): void {
    const a = this.sim.ants.find((x) => x.id === id);
    if (!a) return;
    store.selectedId = id;
    const rect = this.canvas.getBoundingClientRect();
    this.cam.x = a.x - rect.width / this.cam.zoom / 2;
    this.cam.y = a.y - rect.height / this.cam.zoom / 2;
  }

  private buildWorld(): void {
    this.world = new World(GRID_W, GRID_H);
    this.sim = new Simulation(this.world, { colonies: 3, perColony: 45, spiders: 4, worms: 8 });
    store.selectedId = null;

    this.terrainCv.width = this.world.w;
    this.terrainCv.height = this.world.h;
    this.terrainImg = this.terrainCtx.createImageData(this.world.w, this.world.h);
    this.dynCv = document.createElement("canvas");
    this.dynCv.width = this.world.w;
    this.dynCv.height = this.world.h;
    const dctx = this.dynCv.getContext("2d");
    if (!dctx) throw new Error("dyn 2d context not available");
    this.dynCtx = dctx;
    this.dynImg = this.dynCtx.createImageData(this.world.w, this.world.h);

    this.paintAllTerrain();
    this.fitCamera();
  }

  // ---------- camera / sizing ----------
  private fitCamera(): void {
    const rect = this.canvas.getBoundingClientRect();
    const zx = rect.width / this.world.pw, zy = rect.height / this.world.ph;
    this.cam.zoom = Math.min(zx, zy) * 0.98;
    this.cam.x = (this.world.pw - rect.width / this.cam.zoom) / 2;
    this.cam.y = (this.world.ph - rect.height / this.cam.zoom) / 2;
  }

  private screenToWorld(sx: number, sy: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (sx - rect.left) / this.cam.zoom + this.cam.x,
      y: (sy - rect.top) / this.cam.zoom + this.cam.y,
    };
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, (rect.width * this.dpr) | 0);
    this.canvas.height = Math.max(1, (rect.height * this.dpr) | 0);
  };

  // ---------- terrain / dyn layers ----------
  private putTilePixel(i: number): void {
    const t = this.world.tiles[i];
    let [r, g, b] = TILE_RGB[t];
    const n = ((i * 1103515245 + 12345) & 0x3f) - 32;
    r = Math.max(0, Math.min(255, r + n * 0.25));
    g = Math.max(0, Math.min(255, g + n * 0.22));
    b = Math.max(0, Math.min(255, b + n * 0.2));
    const p = i * 4;
    this.terrainImg.data[p] = r;
    this.terrainImg.data[p + 1] = g;
    this.terrainImg.data[p + 2] = b;
    this.terrainImg.data[p + 3] = 255;
  }

  private paintAllTerrain(): void {
    for (let i = 0; i < this.world.tiles.length; i++) this.putTilePixel(i);
    this.terrainCtx.putImageData(this.terrainImg, 0, 0);
    this.world.dirty.fill(0);
  }

  private flushDirtyTerrain(): void {
    let any = false;
    for (let i = 0; i < this.world.dirty.length; i++) {
      if (this.world.dirty[i]) { this.putTilePixel(i); this.world.dirty[i] = 0; any = true; }
    }
    if (any) this.terrainCtx.putImageData(this.terrainImg, 0, 0);
  }

  private buildDynLayer(): void {
    const d = this.dynImg.data;
    const { phF, phH } = this.world;
    const show = store.showPher;
    for (let i = 0; i < phF.length; i++) {
      const p = i * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (show) {
        const pf = Math.min(1, phF[i] * 0.4);
        const ph = Math.min(1, phH[i] * 0.4);
        if (pf > 0.02 || ph > 0.02) {
          r = Math.min(255, r + ph * 180);
          g = Math.min(255, g + pf * 160);
          b = Math.min(255, b + pf * 120 + ph * 60);
          a = Math.max(a, (pf + ph) * 150);
        }
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a;
    }
    this.dynCtx.putImageData(this.dynImg, 0, 0);
  }

  // ---------- drawing ----------
  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0807";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.cam.zoom * this.dpr, 0, 0, this.cam.zoom * this.dpr, -this.cam.x * this.cam.zoom * this.dpr, -this.cam.y * this.cam.zoom * this.dpr);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(this.terrainCv, 0, 0, this.world.w, this.world.h, 0, 0, this.world.pw, this.world.ph);
    this.buildDynLayer();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.dynCv, 0, 0, this.world.w, this.world.h, 0, 0, this.world.pw, this.world.ph);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;

    this.drawFood();

    for (const col of this.sim.colonies) {
      const n = col.nestPx;
      ctx.strokeStyle = col.color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2.5 / this.cam.zoom;
      ctx.beginPath(); ctx.arc(n.x, n.y, CS * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = col.color;
      ctx.beginPath(); ctx.arc(n.x, n.y, CS * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawWorms();
    this.drawSuperFood();
    this.drawAnts();
    this.drawSpiders();

    const sel = this.getSelected();
    if (sel && sel.alive) this.drawSelection(sel);
  }

  private drawWorms(): void {
    const ctx = this.ctx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const wm of this.sim.worms) {
      const b = wm.body;
      const baseR = CS * 0.34 * wm.size;
      for (let i = b.length - 1; i >= 1; i--) {
        const t = i / (b.length - 1);
        const taper = Math.sin((1 - t) * Math.PI) * 0.6 + 0.4;
        ctx.strokeStyle = i % 2 ? "#d98a93" : "#c87d86";
        ctx.lineWidth = baseR * 2 * taper;
        ctx.beginPath();
        ctx.moveTo(b[i].x, b[i].y);
        ctx.lineTo(b[i - 1].x, b[i - 1].y);
        ctx.stroke();
      }
      ctx.fillStyle = "#e09aa2";
      ctx.beginPath(); ctx.arc(b[0].x, b[0].y, baseR * 1.05, 0, Math.PI * 2); ctx.fill();
      const cseg = b[(b.length / 3) | 0];
      if (cseg) { ctx.fillStyle = "#a85f68"; ctx.beginPath(); ctx.arc(cseg.x, cseg.y, baseR * 1.0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
  }

  private drawSuperFood(): void {
    const ctx = this.ctx;
    for (const sf of this.sim.superFoods) {
      const pr = CS * (1.0 + 0.25 * Math.sin(sf.pulse));
      const grad = ctx.createRadialGradient(sf.x, sf.y, 0, sf.x, sf.y, pr * 2.4);
      grad.addColorStop(0, "rgba(255,238,140,0.95)");
      grad.addColorStop(0.4, "rgba(255,205,60,0.7)");
      grad.addColorStop(1, "rgba(255,180,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sf.x, sf.y, pr * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath(); ctx.arc(sf.x, sf.y, pr * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawFood(): void {
    const ctx = this.ctx;
    const w = this.world;
    const sprites = this.foodSprites;
    if (sprites.length === 0) return;
    ctx.imageSmoothingEnabled = false;
    const W = w.w, H = w.h;
    for (let cy = 0; cy < H; cy++) {
      const yp = (cy + 0.5) * CS;
      for (let cx = 0; cx < W; cx++) {
        const i = cy * W + cx;
        const f = w.food[i];
        if (f < 0.2) continue;
        const ft = w.foodType[i];
        if (ft === FOOD_NONE || ft >= sprites.length) continue;
        const spr = sprites[ft];
        if (!spr) continue;
        const k = Math.min(1, f * 0.13);
        const sz = 12 + 5 * k;
        const xp = (cx + 0.5) * CS;
        ctx.globalAlpha = 0.85 + 0.15 * k;
        ctx.drawImage(spr, 0, 0, FOOD_GRID_PX, FOOD_GRID_PX, xp - sz / 2, yp - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawAnts(): void {
    const ctx = this.ctx;
    const sprites = this.foodSprites;
    for (const a of this.sim.ants) {
      const t = a.traits;
      const r = Math.max(1.6, 4.2 * t.size);
      const isSel = a.id === store.selectedId;
      const app = computeAppearance(a.brain.g);
      const col = a.colony.color;
      const bodyCol = darkenHex(col, -app.hueShift * 0.3);
      const thxCol = darkenHex(col, 0.2);
      const headCol = isSel ? "#ffe27a" : darkenHex(col, 0.35);
      const legCol = darkenHex(col, 0.55);
      const cargo = a.carry;

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.heading);

      const legLen = 1.7 * r * (0.7 + 0.5 * t.speed);
      const legSpread = [0.7, 0, -0.7][app.legStyle & 1 ? 1 : 0] || (app.legStyle < 2 ? -0.4 : 0.4);
      ctx.strokeStyle = legCol;
      ctx.lineWidth = Math.max(0.5, r * 0.16);
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const sx = 0.4 * r + (i - 1) * 0.8 * r;
        const sw = Math.sin(a.age * 9 + i * 1.7) * 0.35;
        for (const side of [-1, 1]) {
          const baseAng = side * (Math.PI / 2 + legSpread * 0.4);
          const tipAng = baseAng + sw * 0.6;
          const kx = sx + Math.cos(baseAng) * legLen;
          const ky = side * 0.5 * r + Math.sin(baseAng) * legLen;
          const ex = sx + Math.cos(tipAng) * legLen * 1.55;
          const ey = side * 0.5 * r + Math.sin(tipAng) * legLen * 1.55;
          ctx.beginPath();
          ctx.moveTo(sx, side * 0.5 * r);
          ctx.lineTo(kx, ky);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";

      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.ellipse(-1.9 * r, 0, 1.3 * r, 0.95 * r, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = thxCol;
      ctx.beginPath();
      ctx.ellipse(0.15 * r, 0, 0.75 * r, 0.6 * r, 0, 0, Math.PI * 2);
      ctx.fill();

      if (app.spots > 0) {
        ctx.fillStyle = darkenHex(col, -0.4);
        for (let i = 0; i < app.spots; i++) {
          const sx = -1.4 * r + (i - 1) * 0.6 * r;
          const sy = (i - 1) * 0.3 * r;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.18 * r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (app.stripe) {
        ctx.fillStyle = "rgba(255,220,120,0.85)";
        ctx.fillRect(-1.8 * r, -0.18 * r, 0.7 * r, 0.36 * r);
      }

      ctx.fillStyle = headCol;
      ctx.beginPath();
      ctx.arc(1.05 * r, 0, 0.55 * r, 0, Math.PI * 2);
      ctx.fill();

      const manSize = 0.45 * r * (0.4 + 0.6 * t.smarts);
      ctx.fillStyle = darkenHex(col, 0.6);
      ctx.beginPath();
      ctx.moveTo(1.55 * r, -0.2 * r);
      ctx.lineTo(1.55 * r + manSize, -0.45 * r);
      ctx.lineTo(1.35 * r, -0.2 * r);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(1.55 * r, 0.2 * r);
      ctx.lineTo(1.55 * r + manSize, 0.45 * r);
      ctx.lineTo(1.35 * r, 0.2 * r);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = legCol;
      ctx.lineWidth = Math.max(0.4, r * 0.13);
      ctx.lineCap = "round";
      const antLen = 1.1 * r * (0.6 + 0.5 * t.smarts);
      const curve = app.antennaeCurve;
      for (const side of [-1, 1]) {
        const cx0 = 1.45 * r, cy0 = side * 0.25 * r;
        const cx1 = 1.45 * r + antLen * 0.55, cy1 = side * 0.25 * r + curve * 0.3 * r;
        const cx2 = 1.45 * r + antLen, cy2 = side * 0.55 * r;
        ctx.beginPath();
        ctx.moveTo(cx0, cy0);
        ctx.quadraticCurveTo(cx1, cy1, cx2, cy2);
        ctx.stroke();
      }
      ctx.lineCap = "butt";

      if (app.headGlint) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(1.15 * r, -0.2 * r, 0.14 * r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cargo === CARRY_FOOD && a.carryType !== FOOD_NONE && a.carryType < sprites.length && sprites[a.carryType]) {
        const sz = 1.5 * r;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprites[a.carryType], 0, 0, FOOD_GRID_PX, FOOD_GRID_PX, -0.4 * r - sz / 2, -1.4 * r, sz, sz);
      } else if (cargo === CARRY_SOIL) {
        ctx.fillStyle = "#C8965A";
        ctx.beginPath();
        ctx.arc(-1.6 * r, -1.1 * r, 0.32 * r, 0, Math.PI * 2);
        ctx.fill();
      } else if (cargo === CARRY_SUPER) {
        ctx.fillStyle = "#ffd84a";
        ctx.beginPath();
        ctx.arc(-1.6 * r, -1.1 * r, 0.4 * r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,180,0.6)";
        ctx.beginPath();
        ctx.arc(-1.6 * r, -1.1 * r, 0.55 * r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (a.hp < a.maxHp * 0.5) {
        ctx.strokeStyle = "rgba(255,60,40,0.7)";
        ctx.lineWidth = 0.8 / this.cam.zoom;
        ctx.beginPath(); ctx.arc(a.x, a.y, r * 2.2, 0, Math.PI * 2); ctx.stroke();
      }
      if (a.poisonTimer > 0) {
        ctx.fillStyle = "rgba(120,210,80,0.75)";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(a.x + Math.cos(performance.now() * 0.004 + i) * r * 1.8,
                  a.y + Math.sin(performance.now() * 0.004 + i) * r * 1.8,
                  r * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.imageSmoothingEnabled = false;
  }

  private drawSpiders(): void {
    const ctx = this.ctx;
    for (const s of this.sim.spiders) {
      const R = CS * 0.9 * s.size;
      ctx.strokeStyle = "#15100d";
      ctx.lineWidth = Math.max(1, R * 0.16);
      for (let i = 0; i < 4; i++) {
        const base = Math.PI / 2 + (i - 1.5) * 0.34;
        const sw = Math.sin(s.legPhase + i) * 0.25;
        for (const side of [-1, 1]) {
          const a1 = s.heading + side * base + sw;
          const kx = s.x + Math.cos(a1) * R * 1.4, ky = s.y + Math.sin(a1) * R * 1.4;
          ctx.beginPath(); ctx.moveTo(s.x, s.y);
          ctx.lineTo(kx, ky);
          ctx.lineTo(kx + Math.cos(a1) * R * 1.1, ky + Math.sin(a1) * R * 1.1);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#241712";
      ctx.beginPath(); ctx.ellipse(s.x, s.y, R * 1.25, R, s.heading, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a2018";
      ctx.beginPath(); ctx.arc(s.x + Math.cos(s.heading) * R, s.y + Math.sin(s.heading) * R, R * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff5436";
      const ex = s.x + Math.cos(s.heading) * R * 1.2, ey = s.y + Math.sin(s.heading) * R * 1.2;
      const px = Math.cos(s.heading + Math.PI / 2) * R * 0.25, py = Math.sin(s.heading + Math.PI / 2) * R * 0.25;
      ctx.beginPath(); ctx.arc(ex + px, ey + py, R * 0.16, 0, Math.PI * 2); ctx.arc(ex - px, ey - py, R * 0.16, 0, Math.PI * 2); ctx.fill();
      if (s.hp < s.maxHp) {
        const bw = R * 2;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(s.x - R, s.y - R * 1.9, bw, 2.2);
        ctx.fillStyle = "#ff5436"; ctx.fillRect(s.x - R, s.y - R * 1.9, bw * (s.hp / s.maxHp), 2.2);
      }
    }
  }

  private drawSelection(a: Ant): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(255,255,160,0.95)";
    ctx.lineWidth = 1.5 / this.cam.zoom;
    ctx.beginPath();
    ctx.arc(a.x, a.y, CS * 1.6 + Math.sin(performance.now() * 0.006) * 2, 0, Math.PI * 2);
    ctx.stroke();
    if (store.showVision) {
      const D = CS * 2.2;
      for (const da of [-0.7, 0, 0.7]) {
        const ang = a.heading + da;
        ctx.strokeStyle = "rgba(120,220,255,0.55)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + Math.cos(ang) * D, a.y + Math.sin(ang) * D);
        ctx.stroke();
      }
    }
  }

  // ---------- input ----------
  private applyBrush(wx: number, wy: number): void {
    const cx = (wx / CS) | 0, cy = (wy / CS) | 0;
    const size = store.brush;
    for (let y = -size; y <= size; y++) {
      for (let x = -size; x <= size; x++) {
        if (x * x + y * y > size * size) continue;
        const tx = cx + x, ty = cy + y;
        if (!this.world.inBounds(tx, ty)) continue;
        const i = this.world.idx(tx, ty);
        if (this.world.tiles[i] === ROCK || this.world.tiles[i] === NEST) continue;
        const tool = store.tool;
      if (tool === "food") {
        this.world.food[i] += 8;
        this.world.foodType[i] = this.brushFoodType;
      }
      else if (tool === "dirt") { this.world.setTile(tx, ty, DIRT); }
      else if (tool === "wall") { this.world.setTile(tx, ty, WALL); }
      else if (tool === "erase") { this.world.setTile(tx, ty, GROUND); this.world.food[i] = 0; this.world.foodType[i] = FOOD_NONE; }
      }
    }
  }

  private pickAnt(wx: number, wy: number): Ant | null {
    let best: Ant | null = null, bd = CS * 2.5;
    for (const a of this.sim.ants) {
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  private getSelected(): Ant | null {
    const id = store.selectedId;
    if (id == null) return null;
    return this.sim.ants.find((a) => a.id === id) || null;
  }

  private onMouseDown = (e: MouseEvent): void => {
    const w = this.screenToWorld(e.clientX, e.clientY);
    const tool = store.tool;
    if (tool === "inspect" || e.button === 1 || e.button === 2) {
      if (e.button === 0 && tool === "inspect") {
        const a = this.pickAnt(w.x, w.y);
        if (a) { store.selectedId = a.id; return; }
      }
      this.panning = true; this.lastPan = { x: e.clientX, y: e.clientY };
    } else if (tool === "spider") {
      this.sim.spawnSpider(w.x, w.y);
    } else {
      if (tool === "food") this.brushFoodType = pickFoodType();
      this.dragging = true; this.applyBrush(w.x, w.y);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.panning && this.lastPan) {
      this.cam.x -= (e.clientX - this.lastPan.x) / this.cam.zoom;
      this.cam.y -= (e.clientY - this.lastPan.y) / this.cam.zoom;
      this.lastPan = { x: e.clientX, y: e.clientY };
    } else if (this.dragging) {
      const w = this.screenToWorld(e.clientX, e.clientY);
      this.applyBrush(w.x, w.y);
    }
  };

  private onMouseUp = (): void => {
    this.dragging = false; this.panning = false; this.lastPan = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const before = this.screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.cam.zoom = Math.max(0.25, Math.min(6, this.cam.zoom * factor));
    const after = this.screenToWorld(e.clientX, e.clientY);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
  };

  private onContextMenu = (e: Event): void => { e.preventDefault(); };

  private attachInput(): void {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("resize", this.resize);
  }

  // ---------- wake lock ----------
  private async requestWakeLock(): Promise<void> {
    if (!("wakeLock" in navigator)) return;
    try {
      const wl = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      wl.addEventListener("release", () => { this.wakeLock = null; });
      this.wakeLock = wl;
    } catch {
      // ignore (e.g. tab not visible)
    }
  }

  private attachWakeLock(): void {
    this.requestWakeLock();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !this.wakeLock) this.requestWakeLock();
    });
  }

  // ---------- snapshots ----------
  private pushUiSnap(): void {
    const colonies: ColonySnap[] = this.sim.colonies
      .slice()
      .sort((a, b) => b.population - a.population)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        founder: c.founder,
        fertility: c.fertility,
        generation: c.generation,
        population: c.population,
        store: c.store,
        avgFitness: c.avgFitness,
      }));

    const events: EventSnap[] = this.sim.log.slice(0, 7).map((e) => ({ t: e.t, msg: e.msg }));

    let selected: SelectedSnap | null = null;
    const sel = this.getSelected();
    if (sel && sel.alive) {
      const o = sel.brain.out;
      selected = {
        id: sel.id,
        colonyName: sel.colony.name,
        colonyColor: sel.colony.color,
        lastAction: sel.lastAction,
        carry: sel.carry,
        carryLabel: carryLabel(sel.carry),
        carryType: sel.carryType,
        carryFoodName: foodName(sel.carryType),
        energy: sel.energy,
        hp: sel.hp,
        maxHp: sel.maxHp,
        hpPct: sel.maxHp > 0 ? (sel.hp / sel.maxHp) * 100 : 0,
        fitness: sel.fitness,
        brainScore: sel.brainScore,
        age: sel.age,
        nHid: sel.brain.nHid,
        foodDelivered: sel.foodDelivered,
        soilMoved: sel.soilMoved,
        kills: sel.kills,
        brainOutputs: [o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8]],
        smartsBoost: sel.smartsBoost,
        smartsBoostTimer: sel.smartsBoostTimer,
        hpRegen: sel.hpRegen,
        hpRegenTimer: sel.hpRegenTimer,
        poisonTimer: sel.poisonTimer,
      };
    } else if (sel && !sel.alive) {
      store.selectedId = null;
    }

    const snap: UiSnap = {
      antsCount: this.sim.ants.length,
      generation: this.sim.generation,
      predators: this.sim.spiders.length + this.sim.worms.length,
      deaths: this.sim.deaths,
      colonies,
      events,
      selected,
    };
    store.uiSnap = snap;
  }

  private pushLbSnap(): void {
    const cat = getCategory(store.lbCategory);
    const entries = buildLbEntries(this.sim);
    entries.sort((a, b) => cat.score(b) - cat.score(a));
    store.lbSnap = { category: cat.key, entries: entries.slice(0, 8) };
  }

  // ---------- main loop ----------
  private loop = (now: number): void => {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(0.05, dt);

    if (!store.paused) {
      const speed = store.speed;
      const steps = speed <= 2 ? 1 : speed <= 4 ? 2 : 3;
      const sdt = (dt * speed) / steps;
      for (let s = 0; s < steps; s++) {
        this.sim.update(sdt);
        this.phTimer += sdt;
      }
      if (this.phTimer > 0.05) {
        this.diffTick = (this.diffTick + 1) % 3;
        this.world.decay(this.phTimer, this.diffTick === 0);
        this.phTimer = 0;
      }
    }

    this.flushDirtyTerrain();
    this.draw();

    this.statTimer -= dt;
    if (this.statTimer <= 0) { this.pushUiSnap(); this.statTimer = 0.2; }
    this.lbTimer -= dt;
    if (this.lbTimer <= 0) { this.pushLbSnap(); this.lbTimer = 1.0; }

    this.raf = requestAnimationFrame(this.loop);
  };
}

// re-export fmtTime for components that want to render event times
export { fmtTime };
// re-export type for LbEntry consumers
export type { LbEntry };