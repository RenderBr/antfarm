# Neural Ant Farm 🐜🧠

An open-world 2D ant colony where **every ant is its own neural network**. Nothing is
scripted — foraging, eating, digging and building all **emerge** and **evolve** as the
queen breeds the most successful ants over generations.

UI is **Vue 3** with **TypeScript**; the dev server and bundler are **Vite**; styling
is **Tailwind v4**; the package manager and script runner is **Bun**.

## Run

Requires [Bun](https://bun.sh). Install deps, then start the dev server:

```bash
bun install
bun run dev        # http://localhost:5173
```

Edit Vue components in `src/components/`, the canvas/sim renderer in
`src/renderer/canvas.ts`, the food + appearance sprites in
`src/renderer/sprites.ts` + `src/foods.ts`, or the reactive store in
`src/state/store.ts`, then save — HMR reloads the page.

Production build:

```bash
bun run build      # vue-tsc --noEmit + vite build -> dist/
bun run preview    # serve dist/ at http://localhost:5173
```

## What's actually simulated

**Each ant = one brain.** A small feed-forward neural net:
- **32 sensory inputs** — three forward probes (blocked? food? food-trail? home-trail?),
  plus energy, what it's carrying, heading-to-nest (sin/cos), distance home, food underfoot,
  an internal oscillator, threat and super-food sensors, and bias.
- **9 action outputs** — turn, move, dig, build, grab, drop, lay food-trail, lay home-trail, eat.
- **Hidden layer is random** in size — every brain picks a random integer in [18, 300],
  so the world contains everything from minimal to highly expressive networks. Crossover
  and breeding preserve the parents' hidden size, so each lineage keeps its architecture.

**Open, mutable world** (tile grid):
- Ground, diggable **dirt**, indestructible **rock**, the **nest** core, and **walls** the
  ants build themselves.
- Ants **dig** dirt into carried soil and **build** it back as walls anywhere — they reshape
  their world.
- Two evaporating/diffusing **pheromone fields** (food trail + home trail) ants can read and lay.
- Eight **typed food clusters** that the world keeps replenishing, plus rare **super-food**
  that triggers a fertility surge when delivered.

### Food types & effects

Each cell has a *type*, not just an amount — and each type has a real effect when an ant
eats it. Sprites are hand-painted 14×14 pixel art, baked once and blitted crisp at any zoom.

| Food | Sprite | Effect |
|------|--------|--------|
| Apple | red w/ leaf | +30 energy |
| Blueberry | dark-blue cluster | +0.4 smarts (longer sensor range) for 12s |
| Grape | purple cluster | +55 energy |
| Strawberry | red w/ seeds | +1 max HP (permanent) |
| Mushroom | red cap + spots | 50/50: +80 energy **or** poison (5 energy/s for 5s) |
| Banana | yellow crescent | +25 energy |
| Cherry | twin red | +0.3 smarts for 10s |
| Acorn | brown cap | +0.8 HP/s regen for 15s |

Active effects are shown as timed pill badges in the inspector (`+smarts`, `+regen`,
`poisoned`). Carried food shows as a small sprite above the ant's back.

**Survival & evolution (genetic algorithm, no backprop):**
- Ants spend energy moving/working and must **eat field food** to survive.
- Delivering food to the nest builds the **colony store**, which the **queen spends on eggs**.
- New ants are bred from a **gene pool of the most successful past ants** via tournament
  selection + crossover + mutation. The **Smart** leaderboard ranking measures how varied
  each ant's brain activity is over recent moments — brains that produce richer action
  signals score higher.

**Predators & scavengers:**
- **Spiders** roam and hunt ants (and worms); they carry heritable genes and breed too.
- **Worms** burrow through dirt, leave nutrient castings (food), and are prey for ants and
  spiders alike.
- Spiders occasionally found **hybrid colonies** by mating across colony lines.

### Appearance evolves with the genome

Each ant's body is rendered as a real 3-segment insect (abdomen → thorax → head) with 6
walking legs, 2 antennae, and mandibles. The shape is driven by its **traits** and by
a stable hash of its **brain genome** (so the look changes as the brain mutates):

- **Colony color** — body tint
- **`traits.size`** — body scale
- **`traits.speed`** — leg length + walking gait
- **`traits.smarts`** — antennae length + mandible size
- **Genome hash bits** — abdomen stripe, thorax spot count, hue shift, leg style,
  antennae curve, head glint

Two ants in the same colony can look very different, and their descendants inherit
(but mutate) the pattern, so a colony's appearance drifts visibly over generations.

## Controls

- **Scroll** to zoom, **drag** to pan.
- **Inspect tool**: click any ant to read its live brain outputs, senses, energy and stats.
- **Food / Dirt / Wall / Erase** tools (with brush size) to sculpt the world yourself.
- **Speed** slider, **Pause**, **New world**, toggles for **Pheromones** and **Vision rays**.
- **Leaderboard** dropdown ranks by *Smartest / Most food / Most soil / Most kills / Oldest /
  Most fit*; the "ever" view includes living ants. Collapsible to keep the panel tidy.

## Architecture

- **`src/nn.ts`, `src/world.ts`, `src/foods.ts`, `src/ant.ts`, `src/spider.ts`, `src/worm.ts`,
  `src/sim.ts`** — the pure simulation (framework-agnostic, no DOM). `foods.ts` holds the
  8 typed food definitions (sprite, palette, energy, effect).
- **`src/renderer/canvas.ts`** + **`src/renderer/sprites.ts`** — Canvas2D renderer + main
  loop. Owns the canvas, camera, world/sim, and offscreen layers. `sprites.ts` bakes the
  food sprites once and computes per-ant appearance from the genome hash. Reads
  tool/paused/speed/etc. from the store and pushes throttled UI snapshots back into it.
- **`src/state/store.ts`** — single `reactive()` store shared by the renderer and the
  Vue components. The `Renderer` instance is attached via `markRaw` so it isn't proxied.
- **`src/App.vue`** + **`src/components/*.vue`** — the UI. Vue's reactive bindings
  replace the old hand-rolled `innerHTML` updates. The `<details>` "Brain outputs" and
  leaderboard keep their open state across re-renders because Vue patches the element
  rather than recreating it. The leaderboard uses `v-for` with `:key` so Vue's
  reconciliation keeps the DOM stable (no per-tick repaint flash).

## Files

```
src/                       App.vue, main.ts, style.css
  components/              Stage, ColoniesPanel, ControlsPanel, InspectorPanel,
                          LeaderboardPanel, LegendPanel (.vue SFCs)
  renderer/canvas.ts       Renderer class (Canvas2D + loop + input)
  renderer/sprites.ts      food sprite baker + genome-appearance hash
  state/store.ts           reactive store + UiSnap / LbSnap shapes
  leaderboard.ts           categories + entry builder (shared renderer ↔ component)
  foods.ts                 8 typed food definitions
  nn.ts, world.ts, ant.ts, spider.ts, worm.ts, sim.ts   (the simulation)
index.html                 Vite entry
vite.config.ts             Vite + Vue + Tailwind plugin
tsconfig.app.json / tsconfig.node.json
package.json
```

`dist/` is the build output (regenerated by `bun run build`). `bun.lock` and `node_modules/`
are local.