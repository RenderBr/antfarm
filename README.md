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
`src/renderer/canvas.ts`, or the reactive store in `src/state/store.ts`, then save —
HMR reloads the page.

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
- Food clusters that the world keeps replenishes, plus rare **super-food** that triggers a
  fertility surge when delivered.

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

## Controls

- **Scroll** to zoom, **drag** to pan.
- **Inspect tool**: click any ant to read its live brain outputs, senses, energy and stats.
- **Food / Dirt / Wall / Erase** tools (with brush size) to sculpt the world yourself.
- **Speed** slider, **Pause**, **New world**, toggles for **Pheromones** and **Vision rays**.
- **Leaderboard** dropdown ranks by *Smartest / Most food / Most soil / Most kills / Oldest /
  Most fit*; the "ever" view includes living ants. Collapsible to keep the panel tidy.

## Architecture

- **`src/nn.ts`, `src/world.ts`, `src/ant.ts`, `src/spider.ts`, `src/worm.ts`, `src/sim.ts`** —
  the pure simulation (framework-agnostic, no DOM).
- **`src/renderer/canvas.ts`** — Canvas2D renderer + main loop. Owns the canvas, camera,
  world/sim, and offscreen layers. Reads tool/paused/speed/etc. from the store and pushes
  throttled UI snapshots back into it.
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
  state/store.ts           reactive store + UiSnap / LbSnap shapes
  leaderboard.ts           categories + entry builder (shared renderer ↔ component)
  nn.ts, world.ts, ant.ts, spider.ts, worm.ts, sim.ts   (the simulation)
index.html                 Vite entry
vite.config.ts             Vite + Vue + Tailwind plugin
tsconfig.app.json / tsconfig.node.json
package.json
```

`dist/` is the build output (regenerated by `bun run build`). `bun.lock` and `node_modules/`
are local.