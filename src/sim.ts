/* sim.ts — multi-colony world with predators.
 * Several independent colonies (each its own gene pool & nest) compete for food
 * and territory, fight at their borders, and are hunted by spiders. Traits and
 * brains evolve separately per colony.
 */

import { CS, isSolid, GROUND, DIRT, WALL, NEST, ROCK, World } from "./world.js";
import * as NN from "./nn.js";
import { Ant, type Colony as ColonyIface, type Traits, randomTraits, breedTraits, type Genome } from "./ant.js";
import { Spider, type SpiderGenes } from "./spider.js";
import { Worm } from "./worm.js";

function randomColor(): string {
  const h = (Math.random() * 360) | 0;
  return `hsl(${h},65%,58%)`;
}

const COLONY_DEFS = [
  { name: "Crimson", color: "#e0524a" },
  { name: "Azure",   color: "#4f8cf0" },
  { name: "Verdant", color: "#57c057" },
  { name: "Amber",   color: "#e0a23a" },
];

const HYBRID_NAMES = ["Onyx", "Ivory", "Jade", "Coral", "Violet", "Saffron",
  "Cobalt", "Rose", "Mint", "Plum", "Slate", "Teal", "Magenta", "Indigo"];

function blendColors(c1: string, c2: string): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(c1), b = p(c2);
  const mix = (i: number) => Math.min(255, Math.round((a[i] + b[i]) / 2 + 28));
  const hx = (v: number) => v.toString(16).padStart(2, "0");
  return "#" + hx(mix(0)) + hx(mix(1)) + hx(mix(2));
}

interface Hashable { x: number; y: number; }

// ---------------- spatial hash for fast neighbour queries ----------------
class SpatialHash {
  cell: number;
  map: Map<number, Hashable[]>;
  constructor(cell: number) { this.cell = cell; this.map = new Map(); }
  clear(): void { this.map.clear(); }
  _key(gx: number, gy: number): number { return gx * 73856093 ^ gy * 19349663; }
  insert(item: Hashable): void {
    const gx = (item.x / this.cell) | 0, gy = (item.y / this.cell) | 0;
    const k = this._key(gx, gy);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(item);
  }
  build(items: Hashable[]): void { this.clear(); for (const it of items) this.insert(it); }
  near(x: number, y: number, range: number, cb: (it: Hashable) => void): void {
    const r = Math.ceil(range / this.cell);
    const gx = (x / this.cell) | 0, gy = (y / this.cell) | 0;
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        const arr = this.map.get(this._key(gx + ox, gy + oy));
        if (arr) for (const it of arr) cb(it);
      }
  }
}

export interface GenePoolEntry { genome: Genome; fitness: number; traits: Traits; gen: number; }
export interface Champion {
  id: number; fitness: number; foodDelivered: number;
  soilMoved: number; kills: number; age: number; gen: number;
  colony: string; color: string;
  traits: Traits;
}
export interface SuperFood { x: number; y: number; pulse: number; }
export interface LogEntry { t: number; msg: string; }

// ---------------- a single colony ----------------
export class Colony implements ColonyIface {
  sim: Simulation;
  id: number;
  name: string;
  color: string;
  founder: boolean;
  parents: string[] | null;
  nest: { x: number; y: number };
  nestPx: { x: number; y: number };
  store: number;
  genePool: GenePoolEntry[];
  births: number;
  deaths: number;
  generation: number;
  bestFitness: number;
  avgFitness: number;
  population: number;
  spawnTimer: number;
  fertility: number;
  fertilityTimer: number;
  // transient per-tick accumulators
  _sumF: number;
  _best: number;
  _maxGen: number;

  constructor(sim: Simulation, id: number, def: { name: string; color: string; parents?: string[] }, nestCell: { x: number; y: number }, founder?: boolean) {
    this.sim = sim;
    this.id = id;
    this.name = def.name;
    this.color = def.color;
    this.founder = !!founder;
    this.parents = def.parents || null;
    this.nest = { x: nestCell.x, y: nestCell.y };
    this.nestPx = sim.world.cellCenterPx(nestCell.x, nestCell.y);
    this.store = founder ? 160 : 200;
    this.genePool = [];
    this.births = 0;
    this.deaths = 0;
    this.generation = 1;
    this.bestFitness = 0;
    this.avgFitness = 0;
    this.population = 0;
    this.spawnTimer = Math.random();
    this.fertility = 1;
    this.fertilityTimer = 0;
    this._sumF = 0;
    this._best = 0;
    this._maxGen = 0;
  }

  selectParent(): GenePoolEntry | null {
    if (this.genePool.length < 2) return null;
    let best: GenePoolEntry | null = null;
    for (let i = 0; i < 4; i++) {
      const c = this.genePool[(Math.random() * this.genePool.length) | 0];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  breed(): { genome: Genome; traits: Traits; gen: number } {
    const a = this.selectParent(), b = this.selectParent();
    let genome: Genome, traits: Traits, gen: number;
    if (!a || !b) { genome = NN.randomGenome(); traits = randomTraits(); gen = 1; }
    else {
      genome = NN.crossover(a.genome, b.genome);
      traits = breedTraits(a.traits, b.traits);
      gen = Math.max(a.gen || 1, b.gen || 1) + 1;
    }
    NN.mutate(genome, 0.12, 0.35);
    return { genome, traits, gen };
  }

  recordDeath(ant: Ant): void {
    this.deaths++;
    this.sim.recordChampion(ant);
    if (ant.fitness > 1) {
      this.genePool.push({ genome: ant.brain.g, fitness: ant.fitness, traits: ant.traits, gen: ant.bornGen || 1 });
      this.genePool.sort((p, q) => q.fitness - p.fitness);
      if (this.genePool.length > 50) this.genePool.length = 50;
    }
  }
}

export interface SimOpts { colonies?: number; perColony?: number; spiders?: number; worms?: number; }

// ---------------- the simulation ----------------
export class Simulation {
  world: World;
  opts: Required<SimOpts>;
  ants: Ant[] = [];
  spiders: Spider[] = [];
  worms: Worm[] = [];
  superFoods: SuperFood[] = [];
  colonies: Colony[] = [];
  hallOfFame: Champion[] = [];
  hash: SpatialHash;

  births: number = 0;
  deaths: number = 0;
  bestFitness: number = 0;
  avgFitness: number = 0;
  generation: number = 1;

  foodTimer: number;
  spiderTimer: number;
  wormTimer: number;
  superTimer: number;
  immigrantTimer: number;
  matingCooldown: number;
  maxColonies: number;
  maxWorms: number;
  _nextColonyId: number = 1;
  log: LogEntry[] = [];
  time: number = 0;

  constructor(world: World, opts?: SimOpts) {
    this.world = world;
    this.opts = Object.assign({ colonies: 3, perColony: 45, spiders: 3, worms: 8 }, opts || {}) as Required<SimOpts>;
    this.hash = new SpatialHash(CS * 4);

    this.foodTimer = 4;
    this.spiderTimer = 6;
    this.wormTimer = 4;
    this.superTimer = 40 + Math.random() * 30;
    this.immigrantTimer = 70;
    this.matingCooldown = 25;
    this.maxColonies = 8;
    this.maxWorms = Math.max(10, this.opts.worms * 2);

    this._placeColonies();
    this._seed();
    for (let i = 0; i < this.opts.spiders; i++) this.spawnSpider();
    for (let i = 0; i < this.opts.worms; i++) this.spawnWorm();
  }

  logEvent(msg: string): void {
    this.log.unshift({ t: this.time, msg });
    if (this.log.length > 30) this.log.length = 30;
  }

  _placeColonies(): void {
    const w = this.world;
    const n = this.opts.colonies;
    const cx = w.w / 2, cy = w.h / 2;
    const R = Math.min(w.w, w.h) * 0.34;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const gx = Math.round(cx + Math.cos(ang) * R);
      const gy = Math.round(cy + Math.sin(ang) * R);
      const cell = w.carveNest(gx, gy, 5);
      this.colonies.push(new Colony(this, this._nextColonyId++, COLONY_DEFS[i % COLONY_DEFS.length], cell));
    }
  }

  _seed(): void {
    for (const col of this.colonies)
      for (let i = 0; i < this.opts.perColony; i++)
        this.spawnAnt(col, NN.randomGenome(), randomTraits(), 1);
  }

  spawnAnt(colony: Colony, genome: Genome, traits: Traits, gen: number): Ant {
    const a = Math.random() * Math.PI * 2, r = Math.random() * CS * 2;
    const ant = new Ant(this.world, colony.nestPx.x + Math.cos(a) * r,
      colony.nestPx.y + Math.sin(a) * r, new NN.Brain(genome), colony, traits);
    ant.sim = this;
    ant.bornGen = gen || 1;
    this.ants.push(ant);
    colony.births++; this.births++;
    return ant;
  }

  // ------- cross-colony mating: rare hybrid colony founding -------
  tryFoundColony(a: Ant, b: Ant): boolean {
    if (this.matingCooldown > 0 || this.colonies.length >= this.maxColonies) return false;
    if (a.fitness < 20 || b.fitness < 20 || a.energy < 40 || b.energy < 40) return false;
    if (Math.random() > 0.5) return false;
    const site = this._findNestSite();
    if (!site) return false;

    const cell = this.world.carveNest(site.x, site.y, 4);
    const def = {
      name: this._pickHybridName(),
      color: blendColors(a.colony.color, b.colony.color),
      parents: [a.colony.name, b.colony.name],
    };
    const col = new Colony(this, this._nextColonyId++, def, cell, true);
    this.colonies.push(col);
    const baseGen = Math.max(a.bornGen || 1, b.bornGen || 1) + 1;
    for (let i = 0; i < 12; i++) {
      const genome = NN.crossover(a.brain.g, b.brain.g);
      NN.mutate(genome, 0.14, 0.4);
      const traits = breedTraits(a.traits, b.traits);
      this.spawnAnt(col, genome, traits, baseGen);
    }
    col.generation = baseGen;
    this.matingCooldown = 35 + Math.random() * 25;
    this.logEvent(`${col.name} founded by ${a.colony.name} × ${b.colony.name}`);
    return true;
  }

  _findNestSite(): { x: number; y: number } | null {
    const w = this.world;
    for (let tries = 0; tries < 80; tries++) {
      const gx = 6 + (Math.random() * (w.w - 12)) | 0;
      const gy = 6 + (Math.random() * (w.h - 12)) | 0;
      if (isSolid(w.tiles[w.idx(gx, gy)])) continue;
      let ok = true;
      for (const c of this.colonies) if (Math.hypot(gx - c.nest.x, gy - c.nest.y) < 16) { ok = false; break; }
      if (ok) return { x: gx, y: gy };
    }
    return null;
  }

  _pickHybridName(): string {
    const used = new Set(this.colonies.map(c => c.name));
    const pool = HYBRID_NAMES.filter(n => !used.has(n));
    if (pool.length) return pool[(Math.random() * pool.length) | 0];
    return "Clan-" + this._nextColonyId;
  }

  spawnSpider(px?: number, py?: number): void {
    const w = this.world;
    if (px != null && py != null) {
      const gx = (px / CS) | 0, gy = (py / CS) | 0;
      if (!w.inBounds(gx, gy)) return;
      if (isSolid(w.tiles[w.idx(gx, gy)])) return;
      this.spiders.push(new Spider(w, (gx + 0.5) * CS, (gy + 0.5) * CS));
      return;
    }
    for (let tries = 0; tries < 60; tries++) {
      const gx = 2 + (Math.random() * (w.w - 4)) | 0;
      const gy = 2 + (Math.random() * (w.h - 4)) | 0;
      if (isSolid(w.tiles[w.idx(gx, gy)])) continue;
      let nearNest = false;
      for (const c of this.colonies) if (Math.hypot(gx - c.nest.x, gy - c.nest.y) < 10) nearNest = true;
      if (nearNest) continue;
      this.spiders.push(new Spider(w, (gx + 0.5) * CS, (gy + 0.5) * CS));
      return;
    }
  }

  spawnWorm(): void {
    const w = this.world;
    for (let tries = 0; tries < 40; tries++) {
      const gx = 2 + (Math.random() * (w.w - 4)) | 0;
      const gy = 2 + (Math.random() * (w.h - 4)) | 0;
      const t = w.tiles[w.idx(gx, gy)];
      if (t === WALL || t === ROCK) continue;
      this.worms.push(new Worm(w, (gx + 0.5) * CS, (gy + 0.5) * CS));
      return;
    }
  }

  spawnSuperFood(): void {
    const site = this._findNestSite() || { x: 4 + (Math.random() * (this.world.w - 8)) | 0, y: 4 + (Math.random() * (this.world.h - 8)) | 0 };
    const p = this.world.cellCenterPx(site.x, site.y);
    this.superFoods.push({ x: p.x, y: p.y, pulse: Math.random() * Math.PI * 2 });
    this.logEvent("Special food appeared somewhere in the world");
  }

  nearestSuperFood(x: number, y: number, range: number): SuperFood | null {
    let best: SuperFood | null = null, bd = range * range;
    for (const s of this.superFoods) {
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  grabSuperFoodAt(x: number, y: number, r: number): SuperFood | null {
    for (let i = 0; i < this.superFoods.length; i++) {
      const s = this.superFoods[i];
      if ((s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) <= r * r) {
        this.superFoods.splice(i, 1);
        return s;
      }
    }
    return null;
  }
  nearestWorm(x: number, y: number, range: number): Worm | null {
    let best: Worm | null = null, bd = range * range;
    for (const wm of this.worms) {
      if (!wm.alive) continue;
      const d = (wm.x - x) * (wm.x - x) + (wm.y - y) * (wm.y - y);
      if (d < bd) { bd = d; best = wm; }
    }
    return best;
  }

  // ------------- spatial queries -------------
  nearestAnt(x: number, y: number, range: number): Ant | null {
    let best: Ant | null = null, bd = range * range;
    this.hash.near(x, y, range, (it) => {
      const a = it as Ant;
      if (!a.alive) return;
      const d = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }
  nearestEnemyAnt(ant: Ant, range: number): Ant | null {
    let best: Ant | null = null, bd = range * range;
    this.hash.near(ant.x, ant.y, range, (it) => {
      const a = it as Ant;
      if (!a.alive || a.colony === ant.colony) return;
      const d = (a.x - ant.x) * (a.x - ant.x) + (a.y - ant.y) * (a.y - ant.y);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }
  nearestSpider(x: number, y: number, range: number): Spider | null {
    let best: Spider | null = null, bd = range * range;
    for (const s of this.spiders) {
      if (!s.alive) continue;
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  recordChampion(ant: Ant): void {
    const snap: Champion = {
      id: ant.id, fitness: ant.fitness, foodDelivered: ant.foodDelivered,
      soilMoved: ant.soilMoved, kills: ant.kills, age: ant.age, gen: ant.bornGen || 1,
      colony: ant.colony.name, color: ant.colony.color,
      traits: { size: ant.traits.size, speed: ant.traits.speed, smarts: ant.traits.smarts },
    };
    const ex = this.hallOfFame.find(h => h.id === ant.id);
    if (ex) { if (snap.fitness > ex.fitness) Object.assign(ex, snap); }
    else if (this.hallOfFame.length < 12 || snap.fitness > this.hallOfFame[this.hallOfFame.length - 1].fitness)
      this.hallOfFame.push(snap);
    this.hallOfFame.sort((a, b) => b.fitness - a.fitness);
    if (this.hallOfFame.length > 12) this.hallOfFame.length = 12;
  }

  // ------------- combat -------------
  resolveCombat(dt: number): void {
    const seen = this.ants;
    for (const a of seen) {
      if (!a.alive) continue;
      this.hash.near(a.x, a.y, CS * 2, (it) => {
        const b = it as Ant;
        if (!b.alive || b.id <= a.id || b.colony === a.colony) return;
        const contact = a.radius + b.radius + 1.5;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy > contact * contact) return;
        if (this.tryFoundColony(a, b)) return;
        const dmgA = (2.5 + a.traits.size * 3) * dt;
        const dmgB = (2.5 + b.traits.size * 3) * dt;
        b.hp -= dmgA; a.damageDealt += dmgA;
        a.hp -= dmgB; b.damageDealt += dmgB;
        if (b.hp <= 0 && b.alive) { b.alive = false; a.kills++; }
        if (a.hp <= 0 && a.alive) { a.alive = false; b.kills++; }
      });
    }
    for (const s of this.spiders) {
      if (!s.alive) continue;
      this.hash.near(s.x, s.y, s.reach + CS, (it) => {
        const a = it as Ant;
        if (!a.alive) return;
        const contact = s.reach + a.radius;
        const dx = a.x - s.x, dy = a.y - s.y;
        if (dx * dx + dy * dy > contact * contact) return;
        a.hp -= (10 + s.size * 8) * dt;
        const back = (2 + a.traits.size * 3) * dt;
        s.hp -= back; a.damageDealt += back;
        if (a.hp <= 0 && a.alive) { a.alive = false; s.feed(45); a.killedBySpider = true; }
        if (s.hp <= 0) s.alive = false;
      });
    }
    for (const wm of this.worms) {
      if (!wm.alive) continue;
      this.hash.near(wm.x, wm.y, CS * 2, (it) => {
        const a = it as Ant;
        if (!a.alive || !wm.alive) return;
        const contact = a.radius + CS * 0.7;
        if ((a.x - wm.x) * (a.x - wm.x) + (a.y - wm.y) * (a.y - wm.y) > contact * contact) return;
        wm.hp -= (4 + a.traits.size * 4) * dt;
        a.energy = Math.min(100, a.energy + 10 * dt);
        if (wm.hp <= 0) { wm.alive = false; a.energy = Math.min(100, a.energy + 12); }
      });
      if (!wm.alive) continue;
      for (const s of this.spiders) {
        if (!s.alive) continue;
        const cr = s.reach + CS * 0.6;
        if ((s.x - wm.x) * (s.x - wm.x) + (s.y - wm.y) * (s.y - wm.y) > cr * cr) continue;
        wm.hp -= (8 + s.size * 6) * dt;
        if (wm.hp <= 0) { wm.alive = false; s.feed(22); break; }
      }
    }
  }

  // ------------- spider breeding -------------
  nearestReadySpider(self: Spider): Spider | null {
    let best: Spider | null = null, bd = self.vision * self.vision;
    for (const s of this.spiders) {
      if (s === self || !s.alive || !s.canBreed()) continue;
      const d = (s.x - self.x) * (s.x - self.x) + (s.y - self.y) * (s.y - self.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  handleSpiderBreeding(dt: number): void {
    void dt;
    const sp = this.spiders;
    if (sp.length >= 8) return;
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i];
      if (!a.alive || !a.canBreed()) continue;
      for (let j = i + 1; j < sp.length; j++) {
        const b = sp[j];
        if (!b.alive || !b.canBreed()) continue;
        if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > (CS * 6) * (CS * 6)) continue;
        const genes: SpiderGenes = Spider.breedGenes(a.genes, b.genes);
        const baby = new Spider(this.world, (a.x + b.x) / 2, (a.y + b.y) / 2, genes);
        baby.hunger = 60;
        this.spiders.push(baby);
        a.hunger -= 40; b.hunger -= 40;
        a.reproCooldown = 30 + Math.random() * 20; b.reproCooldown = 30 + Math.random() * 20;
        this.logEvent("A spider brood hatched");
        return;
      }
    }
  }

  // ------------- a fresh wandering colony (immigration / re-seed) -------------
  foundRandomColony(): boolean {
    const site = this._findNestSite();
    if (!site) return false;
    const cell = this.world.carveNest(site.x, site.y, 5);
    const used = new Set(this.colonies.map(c => c.name));
    let def = COLONY_DEFS.find(d => !used.has(d.name));
    if (!def) def = { name: this._pickHybridName(), color: randomColor() };
    const col = new Colony(this, this._nextColonyId++, def, cell);
    this.colonies.push(col);
    for (let i = 0; i < 16; i++) this.spawnAnt(col, NN.randomGenome(), randomTraits(), 1);
    this.logEvent(`${col.name} wanderers settled a new nest`);
    return true;
  }

  update(dt: number): void {
    const w = this.world;
    this.time += dt;
    if (this.matingCooldown > 0) this.matingCooldown -= dt;
    this.hash.build(this.ants);

    for (const s of this.spiders) s.update(dt, this);
    for (const wm of this.worms) wm.update(dt, this);
    for (const a of this.ants) a.update(dt);
    for (const sf of this.superFoods) sf.pulse += dt * 4;

    this.hash.build(this.ants);
    this.resolveCombat(dt);
    this.handleSpiderBreeding(dt);
    this.worms = this.worms.filter(wm => wm.alive);

    // cull dead, tally per colony
    const live: Ant[] = [];
    let totalF = 0, gBest = 0;
    for (const col of this.colonies) { col.population = 0; col._sumF = 0; col._best = 0; col._maxGen = 0; }
    for (const a of this.ants) {
      if (a.alive) {
        live.push(a);
        const col = a.colony as Colony;
        col.population++; col._sumF += a.fitness;
        if (a.fitness > col._best) col._best = a.fitness;
        if ((a.bornGen || 1) > col._maxGen) col._maxGen = a.bornGen || 1;
        totalF += a.fitness; if (a.fitness > gBest) gBest = a.fitness;
      } else {
        (a.colony as Colony).recordDeath(a); this.deaths++;
      }
    }
    this.ants = live;
    this.spiders = this.spiders.filter(s => s.alive);
    this.avgFitness = live.length ? totalF / live.length : 0;
    this.bestFitness = Math.max(this.bestFitness * 0.999, gBest);

    // per-colony economy + births
    let genSum = 0;
    const survivors: Colony[] = [];
    for (const col of this.colonies) {
      col.avgFitness = col.population ? col._sumF / col.population : 0;
      col.bestFitness = col._best;
      col.generation = Math.max(col.generation, col._maxGen);
      if (col.population === 0) {
        this.logEvent(`${col.name} went extinct`);
        continue;
      }
      if (col.fertilityTimer > 0) { col.fertilityTimer -= dt; if (col.fertilityTimer <= 0) col.fertility = 1; }
      col.store = Math.max(0, Math.min(8000, col.store + dt * 4.5 - dt * (0.3 + col.population * 0.02)));
      col.spawnTimer -= dt;
      if (col.spawnTimer <= 0) {
        col.spawnTimer = (col.store > 400 ? 0.25 : 0.55) / (col.fertility || 1);
        if (col.store > 8) {
          col.store -= 7;
          const { genome, traits, gen } = col.breed();
          this.spawnAnt(col, genome, traits, gen);
        }
      }
      survivors.push(col);
      genSum += col.generation;
    }
    this.colonies = survivors;
    this.generation = survivors.length ? Math.round(genSum / survivors.length) : 1;

    this.immigrantTimer -= dt;
    if (this.immigrantTimer <= 0) {
      this.immigrantTimer = 55 + Math.random() * 45;
      if (this.colonies.length < 3 && this.colonies.length < this.maxColonies) this.foundRandomColony();
    }
    if (this.colonies.length === 0) this.foundRandomColony();

    this.foodTimer -= dt;
    if (this.foodTimer <= 0) {
      this.foodTimer = 6 + Math.random() * 6;
      const gx = 3 + (Math.random() * (w.w - 6)) | 0;
      const gy = 3 + (Math.random() * (w.h - 6)) | 0;
      w.spawnFoodCluster(gx, gy, 3 + (Math.random() * 3) | 0, 28 + Math.random() * 50);
    }

    this.spiderTimer -= dt;
    if (this.spiderTimer <= 0) {
      this.spiderTimer = 10 + Math.random() * 8;
      const target = Math.min(7, 2 + (this.ants.length / 60 | 0));
      if (this.spiders.length < target) this.spawnSpider();
    }

    this.wormTimer -= dt;
    if (this.wormTimer <= 0) {
      this.wormTimer = 8 + Math.random() * 5;
      if (this.worms.length < this.opts.worms) this.spawnWorm();
    }

    this.superTimer -= dt;
    if (this.superTimer <= 0) {
      this.superTimer = 60 + Math.random() * 50;
      if (this.superFoods.length < 2) this.spawnSuperFood();
    }
  }
}