# AGENTS.md

Vue 3 + TypeScript + Vite + Tailwind v4 ant-colony sim. Source in `src/`, UI in `src/components/*.vue`, canvas/sim renderer in `src/renderer/canvas.ts` + `src/renderer/sprites.ts`, reactive store in `src/state/store.ts`, bundled to `dist/`.

## Commands

```bash
bun install        # install dev deps (vue, vite, @vitejs/plugin-vue, @tailwindcss/vite, tailwindcss, typescript, vue-tsc)
bun run dev        # vite dev server on http://localhost:5173
bun run build      # vue-tsc --noEmit + vite build  -> dist/
bun run preview    # vite preview (serve dist/) on http://localhost:5173
bun run typecheck  # vue-tsc --noEmit (strict, type-checks .vue + .ts)
```

Bun is the package manager and script runner; Vite is the dev server and bundler. `index.html` is the Vite entry; the Vue app mounts `<div id="app">` from `src/main.ts` → `App.vue`.

## Layout

- `index.html` — Vite shell (`<div id="app">` + `<script type="module" src="/src/main.ts">`).
- `vite.config.ts` — Vite + `@vitejs/plugin-vue` + `@tailwindcss/vite`.
- `tsconfig.app.json` / `tsconfig.node.json` — split configs (app vs vite.config).
- `src/main.ts` — `createApp(App).mount("#app")`.
- `src/App.vue` — root layout: `<Stage>` (canvas) + side panel composed of the section components.
- `src/style.css` — Tailwind v4 entry (`@import "tailwindcss";`, `@theme` tokens, `@layer components` for `.tool-btn` / `.panel-card`, plus the `.dot` utility).
- `src/state/store.ts` — single `reactive()` store: tool, paused, speed, showPher, showVision, brush, selectedId, lbCategory, uiSnap (5Hz snapshot), lbSnap (1Hz snapshot), and the `markRaw`ed `Renderer` instance. Components read/write it; the renderer reads/writes it.
- `src/renderer/canvas.ts` — `Renderer` class. Owns the `<canvas>`, the camera, world + sim, offscreen terrain/dyn layers. Runs the `requestAnimationFrame` loop: `sim.update` (speed-scaled substeps) → `draw` → throttled snapshot pushes (5Hz uiSnap, 1Hz lbSnap). Handles canvas input (mousedown/move/up/wheel/contextmenu) and reads tool/paused/speed/showPher/showVision/brush/selectedId from the store. Draws the world in layers: terrain → pheromone overlay (dyn layer) → food sprites → nests/super-food → worms → 3-segment ants → spiders → selection ring. The food brush tool picks a random type per drag. Exposes `reset()` and `centerOnAnt(id)`.
- `src/renderer/sprites.ts` — `bakeAllFoodSprites()` bakes the 8 food sprites to 14×14 offscreen canvases. `computeAppearance(genome)` derives a stable 6-tuple of pattern bits (stripe, spots, hueShift, legStyle, antennaeCurve, headGlint) from a genome hash, used by `drawAnts` to vary each ant's look. `darkenHex(hex, amount)` shifts a hex color lighter (negative) or darker (positive).
- `src/leaderboard.ts` — `LB_CATEGORIES` + `buildLbEntries(sim)` + `getCategory(key)`. Shared by the renderer (computes top-8) and `LeaderboardPanel.vue` (formats rows).
- `src/components/Stage.vue` — canvas + toolbar + hint overlay. Creates the `Renderer` on mount.
- `src/components/StatsPanel.vue` removed; the 4 stat cards live inline in `App.vue` (same data, simpler).
- `src/components/ColoniesPanel.vue` — colonies list + events.
- `src/components/ControlsPanel.vue` — speed, pause/reset, pheromone/vision toggles.
- `src/components/InspectorPanel.vue` — selected-ant details. The `<details>` "Brain outputs" preserves its open state automatically because Vue patches the element (doesn't recreate it) on re-render; brain output bars use `:style="{ width }"` and update in place.
- `src/components/LeaderboardPanel.vue` — collapsible `<details>`, `<select>` of 6 categories, `v-for` over the top-8 entries (keyed by id; Vue's reconciliation keeps the DOM stable so the scoreboard doesn't flicker). Click/keydown on a row calls `store.renderer?.centerOnAnt(id)`.
- `src/components/LegendPanel.vue` — static "How it works" `<details>`.

## TS modules (sim — framework-agnostic)

| File | Exports | Role |
|------|---------|------|
| `src/nn.ts`     | `Brain`, `randomGenome`, `crossover`, `mutate`, `N_IN/N_OUT`, `MIN_NEURONS/MAX_NEURONS`, `nHidFromGenome` | Evolvable feed-forward net. GA only — no backprop. Hidden size is a random integer in [18, 300]. |
| `src/world.ts`  | `World`, `TILE` consts (`GROUND/DIRT/WALL/NEST/ROCK`), `CS`, `isSolid` | Tile grid, food + `foodType` (per-cell), pheromone fields, dirty flags. |
| `src/foods.ts`  | `FOOD_*` ids, `FoodDef`, `FOODS`, `FOOD_BY_ID`, `pickFoodType`, `foodName`, `FoodEffect` | 8 food types (apple, blueberry, grape, strawberry, mushroom, banana, cherry, acorn). Each has a 14x14 hand-painted pixel grid, energy value, and effect (`energy`/`smarts_boost`/`max_hp`/`hp_regen`/`poison`/`random`). |
| `src/ant.ts`    | `Ant` + statics (`CARRY_*`, `randomTraits`, `breedTraits`), `Traits`, `Colony`/`AntSim` interfaces | Per-ant sensing + actions via its `Brain`. Carries `carryType`, transient buffs (`smartsBoost`+timer, `hpRegen`+timer, `poisonDps`+timer). `sensorDist` is a getter that includes the smarts boost. Food effects applied at pickup. |
| `src/spider.ts` | `Spider` + statics (`randomGenes`, `breedGenes`), `SpiderGenes`/`SpiderSim` | Predator; evolves. |
| `src/worm.ts`   | `Worm` + statics (`randomGenes`, `breedGenes`), `WormGenes`/`WormSim` | Burrowing organism. |
| `src/sim.ts`    | `Simulation`, `Colony`, `Champion`, `SuperFood`, `LogEntry`, `SimOpts` | Colonies, queen/eggs, gene pool, predators, evolution, hall of fame. `spawnFoodCluster(...)` picks a type if none is given. |
| `src/renderer/sprites.ts` | `bakeAllFoodSprites`, `computeAppearance`, `darkenHex`, `FOOD_GRID_PX` | Bakes the 8 food sprites to offscreen canvases. `computeAppearance(genome)` derives a stable 6-tuple of pattern bits (stripe, spots, hueShift, legStyle, antennaeCurve, headGlint) from a genome hash. Used by `drawAnts` to vary appearance per ant and per generation. |

## Data flow

`Stage.vue` mounts → creates `Renderer` → the renderer's `requestAnimationFrame` loop ticks `sim.update` → ants/spiders/worms act → `Renderer.draw` repaints the canvas → throttled pushes write `uiSnap` (5Hz) / `lbSnap` (1Hz) into the `store`. Vue components re-render reactively when those snapshots (or `store.tool` / `store.selectedId` / etc.) change.

## When editing

- **UI / markup:** the relevant `.vue` SFC. Tailwind utility classes inline; component-scoped styles in the SFC's `<style scoped>` for things awkward in utilities (bars, row layouts, the select chevron). Run `bun run dev` for HMR; `bun run build` to verify the production build.
- **Sim rules / evolution / balance:** `src/sim.ts` and `src/ant.ts`.
- **Brain / sensors:** `src/nn.ts` + sensing in `src/ant.ts`.
- **World gen / tiles / food / pheromones:** `src/world.ts` and `src/foods.ts` (food types, sprite grids, effects, picker).
- **Food effects / buffs on ants:** `src/foods.ts` (effect shapes) + `applyFoodEffect` in `src/ant.ts`.
- **Rendering / camera / tools / input:** `src/renderer/canvas.ts`.
- **Food sprite art / per-ant appearance:** `src/renderer/sprites.ts` (`bakeAllFoodSprites`, `computeAppearance`, `darkenHex`).
- **Leaderboard categories / formatting:** `src/leaderboard.ts`.
- **Reactive store / snapshot shapes:** `src/state/store.ts`.

## Conventions

- Strict TypeScript, ES-module imports, relative `./x.js` specifiers.
- Cross-module circular deps are broken with small interfaces (`AntSim`, `Colony` in `ant.ts`, `SpiderSim`, `WormSim`); `sim.ts` casts `a.colony as Colony` where it needs sim-only members.
- Component-scoped styles preferred; truly shared classes (`.tool-btn`, `.panel-card`, `.dot`) live in `src/style.css`.
- Non-reactive class instances (the `Renderer`) are stored on the reactive store via `markRaw` and accessed as `store.renderer`.
- Comment-light; top-of-file block comments describe each module.