# AGENTS.md

TypeScript + Bun + Tailwind ant-colony sim. Source in `src/*.ts`, bundled to `dist/`, served via `serve.js`.

## Commands

```bash
bun install        # install dev deps (tailwindcss, @tailwindcss/cli, typescript)
bun run typecheck  # tsc --noEmit (strict)
bun run build      # bun build src/main.ts -> dist/app.js  +  tailwind -> dist/app.css
bun run watch      # rebuild JS and CSS on change
bun run dev        # build once, then serve on http://localhost:5173
bun serve          # serve built dist without rebuilding
```

`index.html` loads `./dist/app.css` and `./dist/app.js` (ES module). Rebuild after editing TS/CSS before refreshing. There is no separate lint/test script; `bun run typecheck` is the gate.

## Layout

- `index.html` — page shell. Tailwind utility classes inline; small JS-driven component classes live in `src/input.css`.
- `src/input.css` — Tailwind v4 entry (`@import "tailwindcss";`, `@theme` tokens, `@layer components` for `.tool-btn` / `.panel-card`, plus CSS for JS-generated markup like `.colrow`, `.lbrow`, `.ev`, `.bar`).
- `serve.js` — tiny static dev server (Bun) so `index.html` can fetch `dist/*`.
- `tsconfig.json` — strict, `module:ESNext`, `moduleResolution:bundler`, `noEmit`.
- `dist/` — build output (`app.js`, `app.css`). Regenerated; safe to delete.
- `src/` — TypeScript modules (ES imports, no browser globals).

## TS modules

| File | Exports | Role |
|------|---------|------|
| `src/nn.ts`     | `Brain`, `randomGenome`, `crossover`, `mutate`, `N_IN/N_HID/N_OUT`, `GENOME_SIZE`, `Genome` | Evolvable feed-forward net. GA only — no backprop. |
| `src/world.ts`  | `World`, `TILE` consts (`GROUND/DIRT/WALL/NEST/ROCK`), `CS`, `isSolid`, `Tile`, `PNO` | Tile grid (`Uint8Array`), `food`, pheromone fields `phF`/`phH`, `dirty` flags. |
| `src/ant.ts`     | `Ant` (+ static `CARRY_*`, `randomTraits`, `breedTraits`), `Traits`, `Colony`/`AntSim` interfaces | Per-ant sensing + actions via its `Brain`. Circularity with sim broken via `AntSim` interface. |
| `src/spider.ts` | `Spider` (+ static `randomGenes`/`breedGenes`), `SpiderGenes` | Predator that hunts ants; evolves. |
| `src/worm.ts`   | `Worm` (+ static `randomGenes`/`breedGenes`), `WormGenes` | Burrowing organism that enriches soil. |
| `src/sim.ts`    | `Simulation`, `Colony`, `Champion`, `SuperFood`, `SimOpts` | Colonies, queen/eggs, gene pool, predators, evolution loop, event log, hall of fame. `new Simulation(world, opts)`. |
| `src/app.ts`    | (side-effect import) | Rendering (camera + offscreen terrain/dyn layers), input/tools, UI, main loop. |
| `src/main.ts`   | `import "./app.js"` | Bun build entry point. |

## Key data flow

`app.ts` owns `world` + `sim` → `requestAnimationFrame` loop ticks `sim.update(dt)` → ants/spiders/worms act → `app.ts` repaints the canvas and refreshes DOM panels (`updateStats`, `updateInspector`, `updateLeaderboard`, colonies/eventlog).

## When editing

- **UI / markup:** `index.html` (Tailwind classes) + `src/input.css` (component/JS-markup styles) + the `update*` functions in `src/app.ts` (search `ui.stats`, `ui.inspector`, `ui.leaderboard`, `ui.colonies`, `ui.eventlog`). Run `bun run build:css` after CSS changes; the page must reload `dist/app.css`.
- **Sim rules / evolution / balance:** `src/sim.ts` (largest) and `src/ant.ts`.
- **Brain architecture / sensors:** `src/nn.ts` (constants at top) + sensing in `src/ant.ts`.
- **World gen / tiles / food / pheromones:** `src/world.ts`.
- **Rendering / camera / tools / input:** `src/app.ts` (search `cam`, `paintAllTerrain`, `applyBrush`).

## Conventions

- Strict TypeScript, ES-module imports (relative `./x.js` specifiers even for `.ts` sources — bundler resolution).
- Circular deps are avoided with `import * as NN` and by typing cross-references through small interfaces (`AntSim`, `Colony` interface in `ant.ts`, `SpiderSim` in `spider.ts`, `WormSim` in `worm.ts`); `sim.ts` casts `a.colony as Colony` where it needs sim-only members.
- Comment-light; top-of-file block comments describe each module.
- Don't commit `dist/` edits by hand — rebuild with `bun run build`. (It's fine to keep `dist/` out of version control; regenerate on demand.)