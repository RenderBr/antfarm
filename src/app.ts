/* app.ts — wiring: rendering (camera + layers), input/tools, UI, main loop. */

import { GROUND, DIRT, WALL, NEST, ROCK, CS, isSolid, World } from "./world.js";
import { Simulation } from "./sim.js";
import { Ant } from "./ant.js";
import { isSuper } from "./nn.js";

const canvas = document.getElementById("farm") as HTMLCanvasElement;
if (!canvas) throw new Error("canvas #farm not found");
const ctx = canvas.getContext("2d")!;

const ui = {
  stats: document.getElementById("stats")!,
  inspector: document.getElementById("inspector")!,
  speed: document.getElementById("speed") as HTMLInputElement,
  speedVal: document.getElementById("speedVal")!,
  pause: document.getElementById("pause")!,
  reset: document.getElementById("reset")!,
  pher: document.getElementById("togglePher")!,
  vision: document.getElementById("toggleVision")!,
  tools: document.querySelectorAll<HTMLButtonElement>(".tool"),
  brush: document.getElementById("brush") as HTMLInputElement,
  leaderboard: document.getElementById("leaderboard")!,
  lbCategory: document.getElementById("lbCategory") as HTMLSelectElement,
  colonies: document.getElementById("colonies")!,
  eventlog: document.getElementById("eventlog")!,
};

// ---------- world + sim ----------
const GRID_W = 170, GRID_H = 108;
let world: World, sim: Simulation;
let tool = "inspect";
let paused = false;
let showPher = true;
let showVision = false;
let selected: Ant | null = null;
let lbTimer = 0;

// ---------- camera ----------
const cam = { x: 0, y: 0, zoom: 1 };
let dpr = 1;

// offscreen layers (1px per cell)
const terrainCv = document.createElement("canvas");
const terrainCtx = terrainCv.getContext("2d")!;
let terrainImg: ImageData, dynImg: ImageData, dynCv: HTMLCanvasElement, dynCtx: CanvasRenderingContext2D;

function buildWorld(): void {
  world = new World(GRID_W, GRID_H);
  sim = new Simulation(world, { colonies: 3, perColony: 45, spiders: 4, worms: 8 });
  selected = null;

  terrainCv.width = world.w; terrainCv.height = world.h;
  terrainImg = terrainCtx.createImageData(world.w, world.h);
  dynCv = document.createElement("canvas");
  dynCv.width = world.w; dynCv.height = world.h;
  dynCtx = dynCv.getContext("2d")!;
  dynImg = dynCtx.createImageData(world.w, world.h);

  paintAllTerrain();
  fitCamera();
}

// ---------- terrain rendering ----------
const TILE_RGB: Record<number, [number, number, number]> = {
  [GROUND]: [58, 38, 24],
  [DIRT]: [104, 67, 38],
  [WALL]: [150, 116, 74],
  [NEST]: [40, 26, 60],
  [ROCK]: [70, 70, 78],
};

function putTilePixel(i: number): void {
  const t = world.tiles[i];
  let [r, g, b] = TILE_RGB[t];
  const n = ((i * 1103515245 + 12345) & 0x3f) - 32;
  r = Math.max(0, Math.min(255, r + n * 0.25));
  g = Math.max(0, Math.min(255, g + n * 0.22));
  b = Math.max(0, Math.min(255, b + n * 0.2));
  const p = i * 4;
  terrainImg.data[p] = r;
  terrainImg.data[p + 1] = g;
  terrainImg.data[p + 2] = b;
  terrainImg.data[p + 3] = 255;
}

function paintAllTerrain(): void {
  for (let i = 0; i < world.tiles.length; i++) putTilePixel(i);
  terrainCtx.putImageData(terrainImg, 0, 0);
  world.dirty.fill(0);
}

function flushDirtyTerrain(): void {
  let any = false;
  for (let i = 0; i < world.dirty.length; i++) {
    if (world.dirty[i]) { putTilePixel(i); world.dirty[i] = 0; any = true; }
  }
  if (any) terrainCtx.putImageData(terrainImg, 0, 0);
}

// ---------- dynamic layer (food + pheromones) ----------
function buildDynLayer(): void {
  const d = dynImg.data;
  const { food, phF, phH } = world;
  for (let i = 0; i < food.length; i++) {
    const p = i * 4;
    const f = food[i];
    let r = 0, g = 0, b = 0, a = 0;
    if (f > 0.05) {
      const k = Math.min(1, f * 0.13);
      r = 120 + 135 * k; g = 200 + 40 * k; b = 70; a = 120 + 130 * k;
    }
    if (showPher) {
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
  dynCtx.putImageData(dynImg, 0, 0);
}

// ---------- camera helpers ----------
function fitCamera(): void {
  const rect = canvas.getBoundingClientRect();
  const zx = rect.width / world.pw, zy = rect.height / world.ph;
  cam.zoom = Math.min(zx, zy) * 0.98;
  cam.x = (world.pw - rect.width / cam.zoom) / 2;
  cam.y = (world.ph - rect.height / cam.zoom) / 2;
}

function screenToWorld(sx: number, sy: number) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (sx - rect.left) / cam.zoom + cam.x,
    y: (sy - rect.top) / cam.zoom + cam.y,
  };
}

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, (rect.width * dpr) | 0);
  canvas.height = Math.max(1, (rect.height * dpr) | 0);
}

// ---------- drawing ----------
function draw(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0a0807";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(cam.zoom * dpr, 0, 0, cam.zoom * dpr, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(terrainCv, 0, 0, world.w, world.h, 0, 0, world.pw, world.ph);
  buildDynLayer();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(dynCv, 0, 0, world.w, world.h, 0, 0, world.pw, world.ph);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;

  for (const col of sim.colonies) {
    const n = col.nestPx;
    ctx.strokeStyle = col.color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2.5 / cam.zoom;
    ctx.beginPath(); ctx.arc(n.x, n.y, CS * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = col.color;
    ctx.beginPath(); ctx.arc(n.x, n.y, CS * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawWorms();
  drawSuperFood();
  drawAnts();
  drawSpiders();
  if (selected && selected.alive) drawSelection();
}

function drawWorms(): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const wm of sim.worms) {
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

function drawSuperFood(): void {
  for (const sf of sim.superFoods) {
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

function drawAnts(): void {
  for (const a of sim.ants) {
    const r = Math.max(1.4, CS * 0.42 * a.traits.size);
    const super_ = isSuper(a.brain);
    if (super_) {
      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r * 3.2);
      grad.addColorStop(0, "rgba(120,230,210,0.55)");
      grad.addColorStop(1, "rgba(120,230,210,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(a.x, a.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    }
    const cargo = a.carry === Ant.CARRY_FOOD ? "#7CFF6B"
                : a.carry === Ant.CARRY_SOIL ? "#C8965A"
                : a.carry === Ant.CARRY_SUPER ? "#ffd84a" : null;
    ctx.fillStyle = a.colony.color;
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, r * 1.5, r * 0.95, a.heading, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a === selected ? "#ffe27a" : (super_ ? "#e8fff7" : (cargo || "#1a1411"));
    ctx.beginPath();
    ctx.arc(a.x + Math.cos(a.heading) * r * 1.4, a.y + Math.sin(a.heading) * r * 1.4, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    if (a.hp < a.maxHp * 0.5) {
      ctx.strokeStyle = "rgba(255,60,40,0.7)";
      ctx.lineWidth = 0.8 / cam.zoom;
      ctx.beginPath(); ctx.arc(a.x, a.y, r * 2.0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function drawSpiders(): void {
  for (const s of sim.spiders) {
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

function drawSelection(): void {
  const a = selected!;
  ctx.strokeStyle = "rgba(255,255,160,0.95)";
  ctx.lineWidth = 1.5 / cam.zoom;
  ctx.beginPath();
  ctx.arc(a.x, a.y, CS * 1.6 + Math.sin(performance.now() * 0.006) * 2, 0, Math.PI * 2);
  ctx.stroke();
  if (showVision) {
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

// ---------- UI ----------
let statTimer = 0;
function updateStats(): void {
  ui.stats.innerHTML = `
      <div class="stat"><b>${sim.ants.length}</b><small>Ants</small></div>
      <div class="stat"><b>${sim.generation}</b><small>Generation</small></div>
      <div class="stat"><b>${sim.spiders.length + sim.worms.length}</b><small>Predators</small></div>
      <div class="stat"><b>${sim.deaths}</b><small>Deaths</small></div>`;

  let rows = "";
  for (const c of sim.colonies.slice().sort((a, b) => b.population - a.population)) {
    const fert = c.fertility > 1 ? ` <span class="fert">×${c.fertility | 0} fertility</span>` : "";
    rows += `<div class="colrow">
        <span class="dot" style="background:${c.color}"></span>
        <span class="cname">${c.name}${c.founder ? " founder" : ""}${fert}<small>gen ${c.generation}</small></span>
        <span class="cpop">${c.population} ants</span>
        <span class="cfood">${Math.round(c.store)} food</span>
        <span class="cfit">${c.avgFitness.toFixed(0)} fit</span>
      </div>`;
  }
  ui.colonies.innerHTML = rows;

  if (ui.eventlog) {
    ui.eventlog.innerHTML = sim.log.slice(0, 7)
      .map(e => `<div class="ev"><span class="evt">${fmtTime(e.t)}</span>${e.msg}</div>`).join("")
      || `<div class="ev evnone">No events yet.</div>`;
  }
}

function fmtTime(t: number): string {
  const m = (t / 60) | 0, s = (t % 60) | 0;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BRAIN_OUTPUT_COLORS = ["#8fd", "#fd8", "#c96", "#fb8", "#9f8", "#f99", "#6f9", "#f6c", "#fe9"];
const BRAIN_OUTPUT_LABELS = ["turn", "move", "dig", "build", "grab", "drop", "food trail", "home trail", "eat"];

interface InsRefs {
  dot: HTMLElement;
  id: HTMLElement;
  colony: HTMLElement;
  lastact: HTMLElement;
  carry: HTMLElement;
  energy: HTMLElement;
  health: HTMLElement;
  stats: HTMLElement;
  brainBars: HTMLElement[];
}

let insBuilt = false;
let insSelectedId: number | null = null;
let insRefs: InsRefs | null = null;

function buildInspectorSkeleton(): void {
  const bars = BRAIN_OUTPUT_LABELS.map((label, k) =>
    `<label>${label} <span class="obar"><i class="ins-o${k}" style="background:${BRAIN_OUTPUT_COLORS[k]}"></i></span></label>`
  ).join("");
  ui.inspector.innerHTML = `
      <h2>Inspector</h2>
      <div class="name"><span class="dot ins-dot"></span><span class="ins-id"></span> <small class="ins-colony"></small></div>
      <p class="ins-action"><strong class="ins-lastact"></strong> · carrying <span class="ins-carry"></span></p>
      <p>Energy</p><div class="bar"><i class="ins-energy"></i></div>
      <p>Health</p><div class="bar health"><i class="ins-health"></i></div>
      <p class="ins-stats"></p>
      <details class="brain-details">
        <summary>Brain outputs</summary>
        <div class="brainout">${bars}</div>
      </details>`;
  const root = ui.inspector;
  insRefs = {
    dot: root.querySelector<HTMLElement>(".ins-dot")!,
    id: root.querySelector<HTMLElement>(".ins-id")!,
    colony: root.querySelector<HTMLElement>(".ins-colony")!,
    lastact: root.querySelector<HTMLElement>(".ins-lastact")!,
    carry: root.querySelector<HTMLElement>(".ins-carry")!,
    energy: root.querySelector<HTMLElement>(".ins-energy")!,
    health: root.querySelector<HTMLElement>(".ins-health")!,
    stats: root.querySelector<HTMLElement>(".ins-stats")!,
    brainBars: Array.from({ length: 9 }, (_, k) => root.querySelector<HTMLElement>(`.ins-o${k}`)!),
  };
  insBuilt = true;
}

function showInspectorEmpty(): void {
  ui.inspector.innerHTML = `<h2>Inspector</h2><p>Click an ant for details.</p>`;
  insBuilt = false;
  insRefs = null;
  insSelectedId = null;
}

function updateInspector(): void {
  if (!selected || !selected.alive) {
    if (insBuilt || insSelectedId !== null) showInspectorEmpty();
    return;
  }
  const a = selected;
  if (!insBuilt || insSelectedId !== a.id) {
    buildInspectorSkeleton();
    insSelectedId = a.id;
  }
  const r = insRefs!;
  r.dot.style.background = a.colony.color;
  r.id.textContent = `Ant #${a.id}`;
  r.colony.textContent = a.colony.name;
  r.colony.style.color = a.colony.color;
  r.lastact.textContent = a.lastAction;
  r.carry.textContent = a.carry === Ant.CARRY_FOOD ? "food"
                      : a.carry === Ant.CARRY_SOIL ? "soil"
                      : a.carry === Ant.CARRY_SUPER ? "special food" : "nothing";
  r.energy.style.width = `${Math.round(a.energy)}%`;
  r.health.style.width = `${Math.round(a.hp / a.maxHp * 100)}%`;
  r.stats.textContent = `Neurons ${a.brain.nHid} · Smart ${a.brainScore.toFixed(2)} · Fitness ${a.fitness.toFixed(0)} · Age ${a.age.toFixed(0)}s`;
  const o = a.brain.out;
  const vals = [(o[0] + 1) / 2, o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8]];
  for (let k = 0; k < 9; k++) {
    r.brainBars[k].style.width = `${Math.round(Math.max(0, Math.min(1, vals[k])) * 100)}%`;
  }
}

interface LbEntry {
  id: number;
  colony: string;
  color: string;
  traits: { size: number; speed: number; smarts: number };
  brainScore: number;
  fitness: number;
  foodDelivered: number;
  soilMoved: number;
  kills: number;
  age: number;
  gen: number;
  live: boolean;
}

interface LbCategory {
  key: string;
  score: (e: LbEntry) => number;
  fmt: (e: LbEntry) => string;
  small: (e: LbEntry) => string;
}

const LB_CATEGORIES: LbCategory[] = [
  { key: "smart",   score: e => e.brainScore,    fmt: e => e.brainScore.toFixed(2),    small: e => `${e.foodDelivered.toFixed(1)} food` },
  { key: "food",    score: e => e.foodDelivered, fmt: e => e.foodDelivered.toFixed(1), small: e => `${e.brainScore.toFixed(2)} smart` },
  { key: "soil",    score: e => e.soilMoved,     fmt: e => e.soilMoved.toString(),     small: e => `${e.foodDelivered.toFixed(1)} food` },
  { key: "kills",   score: e => e.kills,         fmt: e => e.kills.toString(),         small: e => `${e.foodDelivered.toFixed(1)} food` },
  { key: "age",     score: e => e.age,           fmt: e => `${e.age.toFixed(0)}s`,     small: e => `${e.foodDelivered.toFixed(1)} food` },
  { key: "fitness", score: e => e.fitness,       fmt: e => e.fitness.toFixed(0),      small: e => `${e.foodDelivered.toFixed(1)} food` },
];

interface LbRowRefs {
  row: HTMLElement;
  rank: HTMLElement;
  id: HTMLElement;
  small: HTMLElement;
  score: HTMLElement;
  scoreSmall: HTMLElement;
  idNum: number;
}

let lbBuilt = false;
let lbEmpty = false;
let lbRows: LbRowRefs[] = [];

function buildLbRows(): void {
  ui.leaderboard.innerHTML = "";
  lbRows = [];
  for (let i = 0; i < 8; i++) {
    const row = document.createElement("div");
    row.className = "lbrow";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.innerHTML = `
      <span class="rank"></span>
      <span class="who"><span class="who-id"></span><small class="who-small"></small></span>
      <span class="fit"><span class="fit-score"></span><small class="fit-small"></small></span>
    `;
    ui.leaderboard.appendChild(row);
    lbRows.push({
      row,
      rank: row.querySelector<HTMLElement>(".rank")!,
      id: row.querySelector<HTMLElement>(".who-id")!,
      small: row.querySelector<HTMLElement>(".who-small")!,
      score: row.querySelector<HTMLElement>(".fit-score")!,
      scoreSmall: row.querySelector<HTMLElement>(".fit-small")!,
      idNum: -1,
    });
  }
  lbBuilt = true;
  lbEmpty = false;
}

function showLbEmpty(): void {
  ui.leaderboard.innerHTML = `<p class="lbempty">No ants yet.</p>`;
  lbBuilt = false;
  lbEmpty = true;
  lbRows = [];
}

function updateLeaderboard(): void {
  const cat = LB_CATEGORIES.find(c => c.key === ui.lbCategory.value) || LB_CATEGORIES[0];

  const map = new Map<number, LbEntry>();
  for (const a of sim.ants) {
    if (!a.alive) continue;
    map.set(a.id, {
      id: a.id, colony: a.colony.name, color: a.colony.color,
      traits: { size: a.traits.size, speed: a.traits.speed, smarts: a.traits.smarts },
      brainScore: a.brainScore, fitness: a.fitness, foodDelivered: a.foodDelivered,
      soilMoved: a.soilMoved, kills: a.kills, age: a.age, gen: a.bornGen || 1, live: true,
    });
  }
  for (const h of sim.hallOfFame) {
    if (map.has(h.id)) continue;
    map.set(h.id, {
      id: h.id, colony: h.colony, color: h.color,
      traits: { size: h.traits.size, speed: h.traits.speed, smarts: h.traits.smarts },
      brainScore: h.brainScore, fitness: h.fitness, foodDelivered: h.foodDelivered,
      soilMoved: h.soilMoved, kills: h.kills, age: h.age, gen: h.gen, live: false,
    });
  }
  const entries = Array.from(map.values());
  entries.sort((a, b) => cat.score(b) - cat.score(a));
  const top = entries.slice(0, 8);

  if (top.length === 0) {
    if (!lbEmpty) showLbEmpty();
    return;
  }
  if (!lbBuilt) buildLbRows();

  const selId = selected ? selected.id : -1;
  for (let i = 0; i < lbRows.length; i++) {
    const r = lbRows[i];
    const e = top[i];
    if (!e) {
      if (r.row.style.display !== "none") r.row.style.display = "none";
      continue;
    }
    r.row.style.display = "";
    r.idNum = e.id;
    r.row.dataset.id = String(e.id);
    r.rank.textContent = String(i + 1);
    r.rank.style.color = e.color;
    r.id.textContent = `Ant #${e.id}`;
    r.small.textContent = `${e.colony} · size ${e.traits.size.toFixed(1)} · speed ${e.traits.speed.toFixed(1)} · sense ${e.traits.smarts.toFixed(1)}`;
    r.score.textContent = cat.fmt(e);
    r.scoreSmall.textContent = cat.small(e);
    r.row.classList.toggle("sel", e.id === selId);
    if (e.live) r.row.removeAttribute("aria-disabled");
    else r.row.setAttribute("aria-disabled", "true");
  }
}

function selectLeaderboardRow(row: HTMLElement): void {
  const id = +row.dataset.id!;
  const a = sim.ants.find(x => x.id === id);
  if (!a) return;
  selected = a;
  const rect = canvas.getBoundingClientRect();
  cam.x = a.x - rect.width / cam.zoom / 2;
  cam.y = a.y - rect.height / cam.zoom / 2;
  updateInspector();
  updateLeaderboard();
}

ui.leaderboard.addEventListener("click", e => {
  const row = (e.target as HTMLElement).closest(".lbrow");
  if (row) selectLeaderboardRow(row as HTMLElement);
});
ui.leaderboard.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = (e.target as HTMLElement).closest(".lbrow");
  if (!row) return;
  e.preventDefault();
  selectLeaderboardRow(row as HTMLElement);
});
ui.lbCategory.addEventListener("change", () => {
  updateLeaderboard();
});

// ---------- input ----------
let dragging = false, panning = false, lastPan: { x: number; y: number } | null = null;

function applyBrush(wx: number, wy: number): void {
  const cx = (wx / CS) | 0, cy = (wy / CS) | 0;
  const size = +ui.brush.value;
  for (let y = -size; y <= size; y++) {
    for (let x = -size; x <= size; x++) {
      if (x * x + y * y > size * size) continue;
      const tx = cx + x, ty = cy + y;
      if (!world.inBounds(tx, ty)) continue;
      const i = world.idx(tx, ty);
      if (world.tiles[i] === ROCK || world.tiles[i] === NEST) continue;
      if (tool === "food") { world.food[i] += 8; }
      else if (tool === "dirt") { world.setTile(tx, ty, DIRT); }
      else if (tool === "wall") { world.setTile(tx, ty, WALL); }
      else if (tool === "erase") { world.setTile(tx, ty, GROUND); world.food[i] = 0; }
    }
  }
}

function pickAnt(wx: number, wy: number): Ant | null {
  let best: Ant | null = null, bd = CS * 2.5;
  for (const a of sim.ants) {
    const d = Math.hypot(a.x - wx, a.y - wy);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

canvas.addEventListener("mousedown", e => {
  const w = screenToWorld(e.clientX, e.clientY);
  if (tool === "inspect" || e.button === 1 || e.button === 2) {
    if (e.button === 0 && tool === "inspect") {
      const a = pickAnt(w.x, w.y);
      if (a) { selected = a; updateInspector(); return; }
    }
    panning = true; lastPan = { x: e.clientX, y: e.clientY };
  } else if (tool === "spider") {
    sim.spawnSpider(w.x, w.y);
  } else {
    dragging = true; applyBrush(w.x, w.y);
  }
});
window.addEventListener("mousemove", e => {
  if (panning && lastPan) {
    cam.x -= (e.clientX - lastPan.x) / cam.zoom;
    cam.y -= (e.clientY - lastPan.y) / cam.zoom;
    lastPan = { x: e.clientX, y: e.clientY };
  } else if (dragging) {
    const w = screenToWorld(e.clientX, e.clientY);
    applyBrush(w.x, w.y);
  }
});
window.addEventListener("mouseup", () => { dragging = false; panning = false; lastPan = null; });
canvas.addEventListener("contextmenu", e => e.preventDefault());

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const before = screenToWorld(e.clientX, e.clientY);
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  cam.zoom = Math.max(0.25, Math.min(6, cam.zoom * factor));
  const after = screenToWorld(e.clientX, e.clientY);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
}, { passive: false });

ui.tools.forEach(btn => btn.addEventListener("click", () => {
  tool = btn.dataset.tool!;
  ui.tools.forEach(b => {
    const active = b === btn;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  canvas.style.cursor = tool === "inspect" ? "grab" : "crosshair";
}));

ui.pause.addEventListener("click", () => {
  paused = !paused;
  ui.pause.textContent = paused ? "Resume" : "Pause";
});
ui.reset.addEventListener("click", () => buildWorld());
ui.pher.addEventListener("click", () => {
  showPher = !showPher;
  ui.pher.classList.toggle("active", showPher);
  ui.pher.setAttribute("aria-pressed", showPher ? "true" : "false");
});
ui.vision.addEventListener("click", () => {
  showVision = !showVision;
  ui.vision.classList.toggle("active", showVision);
  ui.vision.setAttribute("aria-pressed", showVision ? "true" : "false");
});
ui.speed.addEventListener("input", () => { ui.speedVal.textContent = (+ui.speed.value).toFixed(1) + "×"; });
window.addEventListener("resize", resize);

// ---------- main loop ----------
let last = performance.now();
let phTimer = 0, diffTick = 0;
function loop(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(0.05, dt);

  if (!paused) {
    const speed = +ui.speed.value;
    const steps = speed <= 2 ? 1 : speed <= 4 ? 2 : 3;
    const sdt = (dt * speed) / steps;
    for (let s = 0; s < steps; s++) {
      sim.update(sdt);
      phTimer += sdt;
    }
    if (phTimer > 0.05) {
      diffTick = (diffTick + 1) % 3;
      world.decay(phTimer, diffTick === 0);
      phTimer = 0;
    }
  }

  flushDirtyTerrain();
  draw();

  statTimer -= dt;
  if (statTimer <= 0) { updateStats(); updateInspector(); statTimer = 0.2; }
  lbTimer -= dt;
  if (lbTimer <= 0) { updateLeaderboard(); lbTimer = 1.0; }

  requestAnimationFrame(loop);
}

// ---------- keep the screen awake while the window is open ----------
let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    // request can fail (e.g. tab not visible, low battery) — ignore
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
});
requestWakeLock();

// ---------- boot ----------
resize();
buildWorld();
ui.speedVal.textContent = (+ui.speed.value).toFixed(1) + "×";
canvas.style.cursor = "grab";
requestAnimationFrame(loop);

// keep imports used
void GROUND; void isSolid;