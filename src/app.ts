/* app.ts — wiring: rendering (camera + layers), input/tools, UI, main loop. */

import { GROUND, DIRT, WALL, NEST, ROCK, CS, isSolid, World } from "./world.js";
import { Simulation } from "./sim.js";
import { Ant } from "./ant.js";

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
  tabLive: document.getElementById("tabLive")!,
  tabFame: document.getElementById("tabFame")!,
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
let lbTab: "live" | "fame" = "live";

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
    const cargo = a.carry === Ant.CARRY_FOOD ? "#7CFF6B"
                : a.carry === Ant.CARRY_SOIL ? "#C8965A"
                : a.carry === Ant.CARRY_SUPER ? "#ffd84a" : null;
    ctx.fillStyle = a.colony.color;
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, r * 1.5, r * 0.95, a.heading, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a === selected ? "#ffe27a" : (cargo || "#1a1411");
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

function updateInspector(): void {
  if (!selected || !selected.alive) {
    ui.inspector.innerHTML = `<h2>Inspector</h2><p>Click an ant for details.</p>`;
    return;
  }
  const a = selected;
  const o = a.brain.out;
  const bar = (v: number, col: string) => `<div class="obar"><i style="width:${Math.round(Math.max(0, v) * 100)}%;background:${col}"></i></div>`;
  const carry = a.carry === Ant.CARRY_FOOD ? "food"
              : a.carry === Ant.CARRY_SOIL ? "soil"
              : a.carry === Ant.CARRY_SUPER ? "special food" : "nothing";
  ui.inspector.innerHTML = `
      <h2>Inspector</h2>
      <div class="name"><span class="dot" style="background:${a.colony.color}"></span>Ant #${a.id} <small style="color:${a.colony.color}">${a.colony.name}</small></div>
      <p><strong>${a.lastAction}</strong> · carrying ${carry}</p>
      <p>Energy</p><div class="bar"><i style="width:${Math.round(a.energy)}%"></i></div>
      <p>Health</p><div class="bar health"><i style="width:${Math.round(a.hp / a.maxHp * 100)}%"></i></div>
      <p>Smart ${a.brainScore.toFixed(2)} · Fitness ${a.fitness.toFixed(0)} · Age ${a.age.toFixed(0)}s</p>
      <details class="brain-details">
        <summary>Brain outputs</summary>
        <div class="brainout">
          <label>turn ${bar((o[0] + 1) / 2, "#8fd")}</label>
          <label>move ${bar(o[1], "#fd8")}</label>
          <label>dig ${bar(o[2], "#c96")}</label>
          <label>build ${bar(o[3], "#fb8")}</label>
          <label>grab ${bar(o[4], "#9f8")}</label>
          <label>drop ${bar(o[5], "#f99")}</label>
          <label>food trail ${bar(o[6], "#6f9")}</label>
          <label>home trail ${bar(o[7], "#f6c")}</label>
          <label>eat ${bar(o[8], "#fe9")}</label>
        </div>
      </details>`;
}

function updateLeaderboard(): void {
  let rows = "";
  if (lbTab === "live") {
    const top = sim.ants.slice().sort((a, b) => b.brainScore - a.brainScore).slice(0, 8);
    if (!top.length) rows = `<p class="lbempty">No ants alive.</p>`;
    top.forEach((a, i) => {
      const sel = a === selected ? " sel" : "";
      const tr = `size ${a.traits.size.toFixed(1)} · speed ${a.traits.speed.toFixed(1)} · sense ${a.traits.smarts.toFixed(1)}`;
      rows += `<div class="lbrow${sel}" data-id="${a.id}" role="button" tabindex="0">
          <span class="rank" style="color:${a.colony.color}">${i + 1}</span>
          <span class="who"><span class="dot" style="background:${a.colony.color}"></span>Ant #${a.id}<small>${a.colony.name} · ${tr}</small></span>
          <span class="fit">${a.brainScore.toFixed(2)}<small>${a.foodDelivered.toFixed(1)} food</small></span>
        </div>`;
    });
  } else {
    const top = sim.hallOfFame;
    if (!top.length) rows = `<p class="lbempty">No champions yet.</p>`;
    top.forEach((h, i) => {
      const live = sim.ants.some(a => a.id === h.id);
      const tr = `size ${h.traits.size.toFixed(1)} · speed ${h.traits.speed.toFixed(1)} · sense ${h.traits.smarts.toFixed(1)}`;
      rows += `<div class="lbrow" data-id="${h.id}" ${live ? 'role="button" tabindex="0"' : 'aria-disabled="true"'}>
          <span class="rank" style="color:${h.color}">${i + 1}</span>
          <span class="who"><span class="dot" style="background:${h.color}"></span>Ant #${h.id}${live ? " live" : ""}<small>${h.colony} · ${tr}</small></span>
          <span class="fit">${h.brainScore.toFixed(2)}<small>${h.foodDelivered.toFixed(1)} food</small></span>
        </div>`;
    });
  }
  ui.leaderboard.innerHTML = rows;
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
ui.tabLive.addEventListener("click", () => {
  lbTab = "live";
  ui.tabLive.classList.add("active"); ui.tabLive.setAttribute("aria-pressed", "true");
  ui.tabFame.classList.remove("active"); ui.tabFame.setAttribute("aria-pressed", "false");
  updateLeaderboard();
});
ui.tabFame.addEventListener("click", () => {
  lbTab = "fame";
  ui.tabFame.classList.add("active"); ui.tabFame.setAttribute("aria-pressed", "true");
  ui.tabLive.classList.remove("active"); ui.tabLive.setAttribute("aria-pressed", "false");
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
  if (statTimer <= 0) { updateStats(); updateInspector(); updateLeaderboard(); statTimer = 0.2; }

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