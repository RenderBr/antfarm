/* spider.ts — roaming predators that hunt ants (and worms).
 * Spiders steer toward the nearest visible prey, bite on contact, and eat
 * kills to refill hunger. They collide with solid tiles, so ants that wall
 * themselves in (or swarm and bite back) can defeat them. Spiders carry
 * heritable genes (size, speed, vision, aggression) and breed with mutation.
 */

import { CS, World } from "./world.js";

let NEXT_ID = 1;

function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export interface SpiderGenes { size: number; speed: number; vision: number; aggr: number; }

export function randomGenes(): SpiderGenes {
  return {
    size: 0.85 + Math.random() * 0.6,
    speed: 30 + Math.random() * 14,
    vision: CS * (9 + Math.random() * 5),
    aggr: 0.6 + Math.random() * 0.8,
  };
}
export function breedGenes(a: SpiderGenes, b: SpiderGenes): SpiderGenes {
  const mix = (x: number, y: number, m: number) => (Math.random() < 0.5 ? x : y) + (Math.random() - 0.5) * m;
  return {
    size: clamp(mix(a.size, b.size, 0.22), 0.6, 2.2),
    speed: clamp(mix(a.speed, b.speed, 7), 20, 60),
    vision: clamp(mix(a.vision, b.vision, CS * 1.5), CS * 6, CS * 18),
    aggr: clamp(mix(a.aggr, b.aggr, 0.25), 0.3, 2.0),
  };
}

export interface SpiderPrey { x: number; y: number; }
export interface SpiderSim {
  nearestReadySpider?(self: Spider): Spider | null;
  nearestAnt(x: number, y: number, range: number): SpiderPrey | null;
  nearestWorm?(x: number, y: number, range: number): SpiderPrey | null;
}

export class Spider {
  static randomGenes: typeof randomGenes = randomGenes;
  static breedGenes: typeof breedGenes = breedGenes;

  world: World;
  id: number;
  x: number; y: number;
  heading: number;
  genes: SpiderGenes;
  size: number;
  speed: number;
  vision: number;
  aggr: number;
  maxHp: number;
  hp: number;
  hunger: number;
  reach: number;
  legPhase: number;
  target: SpiderPrey | Spider | null;
  kills: number;
  alive: boolean;
  wanderTimer: number;
  reproCooldown: number;
  age: number;
  private _wander?: number;

  constructor(world: World, x: number, y: number, genes?: SpiderGenes) {
    this.world = world;
    this.id = NEXT_ID++;
    this.x = x;
    this.y = y;
    this.heading = Math.random() * Math.PI * 2;
    this.genes = genes || randomGenes();
    this.size = this.genes.size;
    this.speed = this.genes.speed;
    this.vision = this.genes.vision;
    this.aggr = this.genes.aggr;
    this.maxHp = 55 + this.size * 35;
    this.hp = this.maxHp;
    this.hunger = 70;
    this.reach = CS * (1.1 + this.size * 0.5);
    this.legPhase = Math.random() * Math.PI * 2;
    this.target = null;
    this.kills = 0;
    this.alive = true;
    this.wanderTimer = 0;
    this.reproCooldown = 10 + Math.random() * 12;
    this.age = 0;
  }

  canBreed(): boolean { return this.hunger > 72 && this.reproCooldown <= 0 && this.age > 8; }

  update(dt: number, sim: SpiderSim): void {
    if (!this.alive) return;
    const w = this.world;
    this.age += dt;
    this.hunger -= dt * 1.6;
    this.reproCooldown -= dt;
    this.legPhase += dt * (4 + this.speed * 0.05);

    let mate: Spider | null = null;
    if (this.canBreed() && sim.nearestReadySpider) mate = sim.nearestReadySpider(this);
    let prey: SpiderPrey | null = mate ? null : sim.nearestAnt(this.x, this.y, this.vision);
    if (!mate && !prey && sim.nearestWorm) prey = sim.nearestWorm(this.x, this.y, this.vision);
    this.target = mate || prey;

    let desired: number;
    const tgt = (mate || prey) as SpiderPrey;
    if (mate) {
      desired = Math.atan2(mate.y - this.y, mate.x - this.x);
    } else if (prey) {
      desired = Math.atan2(prey.y - this.y, prey.x - this.x);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) { this.wanderTimer = 0.6 + Math.random(); this._wander = this.heading + (Math.random() - 0.5) * 2; }
      desired = this._wander != null ? this._wander : this.heading;
    }
    void tgt;
    let diff = ((desired - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));

    const sp = this.speed * (prey ? 1 : 0.5);
    const nx = this.x + Math.cos(this.heading) * sp * dt;
    const ny = this.y + Math.sin(this.heading) * sp * dt;
    if (!w.solidAtPx(nx, this.y)) this.x = nx; else this.heading += (Math.random() - 0.5) * 1.6;
    if (!w.solidAtPx(this.x, ny)) this.y = ny; else this.heading += (Math.random() - 0.5) * 1.6;
    this.x = Math.max(CS, Math.min(w.pw - CS, this.x));
    this.y = Math.max(CS, Math.min(w.ph - CS, this.y));

    if (this.hunger <= 0 || this.hp <= 0) this.alive = false;
  }

  feed(amount: number): void {
    this.hunger = Math.min(140, this.hunger + amount);
    this.kills++;
  }
}

