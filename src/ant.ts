/* ant.ts — an individual neural-net agent belonging to a colony.
 * Heritable traits (size, speed, smarts) scale its body, metabolism and senses,
 * creating evolutionary trade-offs. Combat is resolved centrally by the sim.
 */

import { GROUND, DIRT, WALL, NEST, ROCK, CS, isSolid, World } from "./world.js";
import { N_IN, Brain } from "./nn.js";
import type { Genome } from "./nn.js";
import { FOOD_NONE, foodName, FOOD_BY_ID, type FoodEffect } from "./foods.js";

export const CARRY_NONE = 0, CARRY_FOOD = 1, CARRY_SOIL = 2, CARRY_SUPER = 3;
export type Carry = 0 | 1 | 2 | 3;

const SENSE_ANGLES = [-0.7, 0, 0.7];
const N_OUT = 9;
const BRAIN_SAMPLES = 24;
let NEXT_ID = 1;

function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }

export interface Traits { size: number; speed: number; smarts: number; }

export function randomTraits(): Traits {
  return { size: 0.8 + Math.random() * 0.6, speed: 0.8 + Math.random() * 0.6, smarts: 0.8 + Math.random() * 0.6 };
}
export function breedTraits(a: Traits, b: Traits): Traits {
  const mix = (x: number, y: number) => (Math.random() < 0.5 ? x : y) + (Math.random() - 0.5) * 0.14;
  return {
    size: clamp(mix(a.size, b.size), 0.6, 1.8),
    speed: clamp(mix(a.speed, b.speed), 0.6, 1.8),
    smarts: clamp(mix(a.smarts, b.smarts), 0.6, 1.8),
  };
}

// Forward references to break circular deps (sim.ts imports ant.ts)
export interface Colony {
  name: string;
  color: string;
  founder: boolean;
  nest: { x: number; y: number };
  nestPx: { x: number; y: number };
  store: number;
  fertility: number;
  fertilityTimer: number;
}
export interface AntSim {
  nearestEnemyAnt(self: Ant, range: number): Ant | null;
  nearestSpider(x: number, y: number, range: number): unknown;
  nearestSuperFood?(x: number, y: number, range: number): { x: number; y: number } | null;
  grabSuperFoodAt(x: number, y: number, r: number): unknown;
  logEvent(msg: string): void;
}

export class Ant {
  static CARRY_NONE: Carry = CARRY_NONE;
  static CARRY_FOOD: Carry = CARRY_FOOD;
  static CARRY_SOIL: Carry = CARRY_SOIL;
  static CARRY_SUPER: Carry = CARRY_SUPER;
  static randomTraits: typeof randomTraits = randomTraits;
  static breedTraits: typeof breedTraits = breedTraits;

  world: World;
  sim: AntSim | null;
  colony: Colony;
  id: number;
  x: number; y: number;
  heading: number;
  brain: Brain;
  traits: Traits;

  radius: number;
  maxSpeed: number;
  maxHp: number;
  hp: number;
  metabRate: number;
  carryCap: number;

  energy: number;
  age: number;
  carry: Carry;
  carryAmt: number;
  alive: boolean;

  foodDelivered: number;
  soilMoved: number;
  damageDealt: number;
  kills: number;
  fitness: number;
  brainScore: number;
  superDelivered?: number;
  killedBySpider?: boolean;

  carryType: number;
  smartsBoost: number;
  smartsBoostTimer: number;
  hpRegen: number;
  hpRegenTimer: number;
  poisonDps: number;
  poisonTimer: number;

  private _osc: number;
  _in: Float32Array;
  private _brainBuf: Float32Array;
  private _brainCount: number;
  private _brainIdx: number;
  private _brainTick: number;
  lastAction: string;
  actCool: number;
  bornGen: number;

  constructor(world: World, x: number, y: number, brain: Brain, colony: Colony, traits?: Traits) {
    this.world = world;
    this.sim = null;
    this.colony = colony;
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.heading = Math.random() * Math.PI * 2;
    this.brain = brain;
    this.traits = traits || randomTraits();

    const t = this.traits;
    this.radius = 3.2 * t.size;
    this.maxSpeed = 34 * t.speed;
    this.maxHp = 12 * t.size + 4;
    this.hp = this.maxHp;
    this.metabRate = (0.25) * (0.6 + 0.4 * t.size) * (0.75 + 0.3 * t.smarts);
    this.carryCap = 2 + t.size * 2;

    this.energy = 100;
    this.age = 0;
    this.carry = CARRY_NONE;
    this.carryAmt = 0;
    this.alive = true;

    this.foodDelivered = 0;
    this.soilMoved = 0;
    this.damageDealt = 0;
    this.kills = 0;
    this.fitness = 0;
    this.brainScore = 0;

    this.carryType = FOOD_NONE;
    this.smartsBoost = 0;
    this.smartsBoostTimer = 0;
    this.hpRegen = 0;
    this.hpRegenTimer = 0;
    this.poisonDps = 0;
    this.poisonTimer = 0;

    this._osc = Math.random() * Math.PI * 2;
    this._in = new Float32Array(N_IN);
    this._brainBuf = new Float32Array(BRAIN_SAMPLES * N_OUT);
    this._brainCount = 0;
    this._brainIdx = 0;
    this._brainTick = 0;
    this.lastAction = "wander";
    this.actCool = 0;
    this.bornGen = 1;
  }

  get sensorDist(): number {
    return CS * 2.2 * (0.7 + 0.5 * (this.traits.smarts + this.smartsBoost));
  }

  get nestPx(): { x: number; y: number } { return this.colony.nestPx; }

  sense(): Float32Array {
    const w = this.world, inp = this._in;
    const nest = this.colony.nestPx;
    const dx = nest.x - this.x, dy = nest.y - this.y;
    const distNest = Math.hypot(dx, dy);
    const angToNest = Math.atan2(dy, dx) - this.heading;

    let k = 0;
    for (let s = 0; s < SENSE_ANGLES.length; s++) {
      const a = this.heading + SENSE_ANGLES[s];
      const sx = this.x + Math.cos(a) * this.sensorDist;
      const sy = this.y + Math.sin(a) * this.sensorDist;
      const cx = (sx / CS) | 0, cy = (sy / CS) | 0;
      const inb = w.inBounds(cx, cy);
      const ci = inb ? w.idx(cx, cy) : -1;
      inp[k++] = inb ? (isSolid(w.tiles[ci]) ? 1 : 0) : 1;
      inp[k++] = ci >= 0 ? Math.min(1, w.food[ci] * 0.1) : 0;
      inp[k++] = ci >= 0 ? Math.min(1, w.phF[ci] * 0.25) : 0;
      inp[k++] = ci >= 0 ? Math.min(1, w.phH[ci] * 0.25) : 0;
    }
    inp[k++] = this.energy / 100 * 2 - 1;
    inp[k++] = this.carry === CARRY_FOOD ? 1 : 0;
    inp[k++] = this.carry === CARRY_SOIL ? 1 : 0;
    inp[k++] = Math.sin(angToNest);
    inp[k++] = Math.cos(angToNest);
    inp[k++] = Math.min(1, distNest / (w.pw * 0.5));
    inp[k++] = distNest < CS * 3 ? 1 : 0;
    const hx = (this.x / CS) | 0, hy = (this.y / CS) | 0;
    const here = w.inBounds(hx, hy) ? w.idx(hx, hy) : -1;
    inp[k++] = here >= 0 ? Math.min(1, w.food[here] * 0.1) : 0;
    inp[k++] = Math.sin(this._osc);
    inp[k++] = 1;

    const range = CS * 9;
    const enemy = this.sim ? this.sim.nearestEnemyAnt(this, range) : null;
    const spider = this.sim ? this.sim.nearestSpider(this.x, this.y, range) : null;
    if (enemy) {
      const ea = Math.atan2(enemy.y - this.y, enemy.x - this.x) - this.heading;
      const ed = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      inp[k++] = Math.sin(ea); inp[k++] = Math.cos(ea); inp[k++] = 1 - ed / range;
    } else { inp[k++] = 0; inp[k++] = 0; inp[k++] = 0; }
    if (spider) {
      const sp = spider as { x: number; y: number };
      const sa = Math.atan2(sp.y - this.y, sp.x - this.x) - this.heading;
      const sd = Math.hypot(sp.x - this.x, sp.y - this.y);
      inp[k++] = Math.sin(sa); inp[k++] = Math.cos(sa); inp[k++] = 1 - sd / range;
    } else { inp[k++] = 0; inp[k++] = 0; inp[k++] = 0; }
    inp[k++] = this.hp / this.maxHp * 2 - 1;

    const srange = CS * 16;
    const sf = this.sim && this.sim.nearestSuperFood ? this.sim.nearestSuperFood(this.x, this.y, srange) : null;
    if (sf) {
      const fa = Math.atan2(sf.y - this.y, sf.x - this.x) - this.heading;
      const fd = Math.hypot(sf.x - this.x, sf.y - this.y);
      inp[k++] = Math.sin(fa); inp[k++] = Math.cos(fa); inp[k++] = 1 - fd / srange;
    } else { inp[k++] = 0; inp[k++] = 0; inp[k++] = 0; }
    return inp;
  }

  private _computeBrainScore(): number {
    const n = this._brainCount;
    if (n < 2) return 0;
    const bb = this._brainBuf;
    let sumStd = 0;
    for (let j = 0; j < N_OUT; j++) {
      let sum = 0, sumsq = 0;
      for (let s = 0; s < n; s++) {
        const v = bb[s * N_OUT + j];
        sum += v; sumsq += v * v;
      }
      const mean = sum / n;
      const variance = Math.max(0, sumsq / n - mean * mean);
      sumStd += Math.sqrt(variance);
    }
    return sumStd / N_OUT;
  }

  update(dt: number): void {
    if (!this.alive) return;
    const w = this.world;
    this.age += dt;
    this._osc += dt * 3;
    this.actCool -= dt;

    const o = this.brain.forward(this.sense());

    const wi = this._brainIdx * N_OUT;
    for (let k = 0; k < N_OUT; k++) this._brainBuf[wi + k] = o[k];
    this._brainIdx = (this._brainIdx + 1) % BRAIN_SAMPLES;
    if (this._brainCount < BRAIN_SAMPLES) this._brainCount++;
    if (++this._brainTick >= 5) { this._brainTick = 0; this.brainScore = this._computeBrainScore(); }

    this.heading += o[0] * 3.2 * dt;
    const throttle = Math.max(0, o[1]);
    const speed = this.maxSpeed * throttle;

    const nx = this.x + Math.cos(this.heading) * speed * dt;
    const ny = this.y + Math.sin(this.heading) * speed * dt;
    if (!w.solidAtPx(nx, this.y)) this.x = nx; else this.heading += (Math.random() - 0.5) * 1.2;
    if (!w.solidAtPx(this.x, ny)) this.y = ny; else this.heading += (Math.random() - 0.5) * 1.2;
    this.x = clamp(this.x, CS, w.pw - CS);
    this.y = clamp(this.y, CS, w.ph - CS);

    this.energy -= (this.metabRate + speed * 0.025) * dt;

    const cx = (this.x / CS) | 0, cy = (this.y / CS) | 0;
    const acx = ((this.x + Math.cos(this.heading) * CS * 0.9) / CS) | 0;
    const acy = ((this.y + Math.sin(this.heading) * CS * 0.9) / CS) | 0;
    const here = w.idx(cx, cy);

    if (this.actCool <= 0) {
      if (o[2] > 0.4 && this.carry === CARRY_NONE && w.inBounds(acx, acy) && w.tiles[w.idx(acx, acy)] === DIRT) {
        w.setTile(acx, acy, GROUND);
        this.carry = CARRY_SOIL; this.carryAmt = 1;
        this.soilMoved++; this.energy -= 2;
        this.lastAction = "dig"; this.actCool = 0.3 / this.traits.smarts;
      } else if (o[3] > 0.4 && this.carry === CARRY_SOIL && w.inBounds(acx, acy) &&
                 w.tiles[w.idx(acx, acy)] === GROUND) {
        w.setTile(acx, acy, WALL);
        this.carry = CARRY_NONE; this.carryAmt = 0; this.energy -= 1;
        this.lastAction = "build"; this.actCool = 0.3 / this.traits.smarts;
      } else if (o[4] > 0.4 && this.carry === CARRY_NONE && w.food[here] > 0.2) {
        const take = Math.min(w.food[here], this.carryCap);
        w.food[here] -= take;
        this.carry = CARRY_FOOD; this.carryAmt = take;
        const ft = w.foodType[here];
        this.carryType = ft;
        const def = ft < FOOD_BY_ID.length ? FOOD_BY_ID[ft] : null;
        this.lastAction = def ? `grab ${def.name}` : "grab food";
        this.actCool = 0.2;
        if (def) applyFoodEffect(this, def.effect);
      } else if (o[5] > 0.5 && this.carry !== CARRY_NONE) {
        if (this.carry === CARRY_FOOD) w.food[here] += this.carryAmt;
        this.carry = CARRY_NONE; this.carryAmt = 0;
        this.carryType = FOOD_NONE;
        this.lastAction = "drop"; this.actCool = 0.2;
      }
    }

    if (w.food[here] > 0.2 && (this.energy < 45 || o[8] > 0.3) && this.energy < 100) {
      const eat = Math.min(w.food[here], 10 * dt);
      w.food[here] -= eat;
      this.energy = Math.min(100, this.energy + eat * 7);
      this.lastAction = "eat";
    }

    if (o[6] > 0.2) w.addPh(w.phF, this.x, this.y, o[6] * 1.2 * dt * (this.carry === CARRY_FOOD ? 4 : 1));
    if (o[7] > 0.2) w.addPh(w.phH, this.x, this.y, o[7] * 1.2 * dt);

    if (this.carry === CARRY_NONE && this.sim) {
      const sf = this.sim.grabSuperFoodAt(this.x, this.y, this.radius + CS * 0.8);
      if (sf) { this.carry = CARRY_SUPER; this.carryAmt = 1; this.lastAction = "found super-food!"; }
    }

    const nest = this.colony.nestPx;
    const atNest = Math.hypot(nest.x - this.x, nest.y - this.y) < CS * 2.6;
    if (atNest && this.carry === CARRY_FOOD) {
      this.colony.store += this.carryAmt * 12;
      this.foodDelivered += this.carryAmt;
      this.energy = Math.min(100, this.energy + 18);
      this.carry = CARRY_NONE; this.carryAmt = 0;
      this.carryType = FOOD_NONE;
      this.lastAction = "deliver";
    } else if (atNest && this.carry === CARRY_SUPER) {
      this.colony.store += 220;
      this.colony.fertility = 10; this.colony.fertilityTimer = 30;
      this.foodDelivered += 6; this.superDelivered = (this.superDelivered || 0) + 1;
      this.energy = 100;
      this.carry = CARRY_NONE; this.carryAmt = 0;
      this.lastAction = "royal feast!";
      if (this.sim) this.sim.logEvent(`${this.colony.name} found special food: fertility ×10.`);
    }

    this.fitness = this.foodDelivered * 30 + this.soilMoved * 1.2 + this.age * 0.04 +
                   this.damageDealt * 0.4 + this.kills * 12;

    if (this.smartsBoostTimer > 0) {
      this.smartsBoostTimer -= dt;
      if (this.smartsBoostTimer <= 0) { this.smartsBoostTimer = 0; this.smartsBoost = 0; }
    }
    if (this.hpRegenTimer > 0) {
      this.hpRegenTimer -= dt;
      if (this.hpRegenTimer <= 0) { this.hpRegenTimer = 0; this.hpRegen = 0; }
      else if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * dt);
    }
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.energy -= this.poisonDps * dt;
      if (this.poisonTimer <= 0) { this.poisonTimer = 0; this.poisonDps = 0; }
    }

    if (this.energy <= 0) { this.alive = false; this.energy = 0; }
  }
}

function applyFoodEffect(ant: Ant, eff: FoodEffect): void {
  if (eff.kind === "random") {
    applyFoodEffect(ant, Math.random() < 0.5 ? eff.buff : eff.debuff);
    return;
  }
  if (eff.kind === "energy") {
    ant.energy = Math.min(100, ant.energy + eff.amount);
    return;
  }
  if (eff.kind === "smarts_boost") {
    ant.smartsBoost = Math.max(ant.smartsBoost, eff.amount);
    ant.smartsBoostTimer = Math.max(ant.smartsBoostTimer, eff.duration);
    return;
  }
  if (eff.kind === "max_hp") {
    ant.maxHp += eff.amount;
    ant.hp += eff.amount;
    return;
  }
  if (eff.kind === "hp_regen") {
    ant.hpRegen = Math.max(ant.hpRegen, eff.perSec);
    ant.hpRegenTimer = Math.max(ant.hpRegenTimer, eff.duration);
    return;
  }
  if (eff.kind === "poison") {
    ant.poisonDps = Math.max(ant.poisonDps, eff.damage);
    ant.poisonTimer = Math.max(ant.poisonTimer, eff.duration);
    ant.energy = Math.max(0, ant.energy - 12);
    ant.lastAction = "poisoned!";
    return;
  }
}

void foodName;

Ant.CARRY_NONE = CARRY_NONE;
Ant.CARRY_FOOD = CARRY_FOOD;
Ant.CARRY_SOIL = CARRY_SOIL;
Ant.CARRY_SUPER = CARRY_SUPER;
Ant.randomTraits = randomTraits;
Ant.breedTraits = breedTraits;
void ROCK; void NEST;