/* worm.ts — earthworms that burrow through soil and enrich it.
 * Worms tunnel through DIRT (turning it to GROUND) and leave nutrient castings
 * that become food clusters, so they reshape the map and feed the colonies.
 * They are soft-bodied prey: ants and spiders eat them for energy. They breed
 * slowly and pass on slightly mutated genes. Rain coaxes more of them out.
 */

import { GROUND, DIRT, WALL, ROCK, NEST, CS, World } from "./world.js";

let NEXT_ID = 1;

function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export interface WormGenes { size: number; speed: number; vigor: number; }
export interface WormSim { worms: Worm[]; maxWorms: number; }

export function randomGenes(): WormGenes {
  return { size: 0.8 + Math.random() * 0.7, speed: 0.8 + Math.random() * 0.6, vigor: 0.8 + Math.random() * 0.6 };
}
export function breedGenes(a: WormGenes, b: WormGenes): WormGenes {
  const mix = (x: number, y: number) => (Math.random() < 0.5 ? x : y) + (Math.random() - 0.5) * 0.18;
  return {
    size: clamp(mix(a.size, b.size), 0.5, 1.9),
    speed: clamp(mix(a.speed, b.speed), 0.5, 1.9),
    vigor: clamp(mix(a.vigor, b.vigor), 0.5, 1.9),
  };
}

interface Seg { x: number; y: number; }

export class Worm {
  static randomGenes: typeof randomGenes = randomGenes;
  static breedGenes: typeof breedGenes = breedGenes;

  world: World;
  id: number;
  x: number; y: number;
  heading: number;
  genes: WormGenes;
  size: number;
  speed: number;
  maxHp: number;
  hp: number;
  age: number;
  lifespan: number;
  energy: number;
  castTimer: number;
  reproTimer: number;
  wriggle: number;
  alive: boolean;
  segLen: number;
  numSeg: number;
  body: Seg[];

  constructor(world: World, x: number, y: number, genes?: WormGenes) {
    this.world = world;
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.heading = Math.random() * Math.PI * 2;
    this.genes = genes || randomGenes();
    this.size = this.genes.size;
    this.speed = 9 * this.genes.speed;
    this.maxHp = 6 + this.size * 6;
    this.hp = this.maxHp;
    this.age = 0;
    this.lifespan = (90 + Math.random() * 60) * this.genes.vigor;
    this.energy = 40;
    this.castTimer = 0;
    this.reproTimer = 25 + Math.random() * 20;
    this.wriggle = Math.random() * Math.PI * 2;
    this.alive = true;
    this.segLen = CS * 0.62;
    this.numSeg = Math.round(7 + this.size * 5);
    this.body = [];
    for (let s = 0; s < this.numSeg; s++) this.body.push({ x: x - Math.cos(this.heading) * s * this.segLen, y: y - Math.sin(this.heading) * s * this.segLen });
  }

  update(dt: number, sim: WormSim): void {
    if (!this.alive) return;
    const w = this.world;
    this.age += dt;
    this.wriggle += dt * 6;
    this.energy -= dt * 0.5;

    this.heading += Math.sin(this.wriggle) * 0.6 * dt + (Math.random() - 0.5) * 0.8 * dt;
    const sp = this.speed;
    const nx = this.x + Math.cos(this.heading) * sp * dt;
    const ny = this.y + Math.sin(this.heading) * sp * dt;
    const blocked = (px: number, py: number) => { const t = w.tileAtPx(px, py); return t === WALL || t === ROCK; };
    if (!blocked(nx, this.y)) this.x = nx; else this.heading += Math.PI * (0.5 + Math.random());
    if (!blocked(this.x, ny)) this.y = ny; else this.heading += Math.PI * (0.5 + Math.random());
    this.x = clamp(this.x, CS, w.pw - CS);
    this.y = clamp(this.y, CS, w.ph - CS);

    const b = this.body;
    b[0].x = this.x; b[0].y = this.y;
    for (let s = 1; s < b.length; s++) {
      const p = b[s - 1], c = b[s];
      const dx = c.x - p.x, dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > this.segLen) { c.x = p.x + dx / d * this.segLen; c.y = p.y + dy / d * this.segLen; }
    }

    const cx = (this.x / CS) | 0, cy = (this.y / CS) | 0;
    if (w.inBounds(cx, cy)) {
      const i = w.idx(cx, cy);
      if (w.tiles[i] === DIRT) { w.setTile(cx, cy, GROUND); this.energy += 3; }
      this.castTimer -= dt;
      if (this.castTimer <= 0 && w.tiles[i] !== NEST) {
        this.castTimer = 2.5;
        w.food[i] += 1.4 * this.size;
      }
    }

    this.reproTimer -= dt;
    if (this.reproTimer <= 0 && this.age > 25 && this.energy > 30 && sim.worms.length < sim.maxWorms) {
      this.reproTimer = 30 + Math.random() * 20;
      this.energy -= 18;
      sim.worms.push(new Worm(w, this.x, this.y, breedGenes(this.genes, this.genes)));
    }

    if (this.age > this.lifespan || this.energy <= 0 || this.hp <= 0) {
      this.alive = false;
      if (w.inBounds(cx, cy)) w.food[w.idx(cx, cy)] += 4;
    }
  }
}