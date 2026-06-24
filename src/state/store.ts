/* state/store.ts — single reactive store shared by the renderer and the
 * Vue components. The renderer mutates uiSnap / lbSnap (plain objects,
 * replaced on each push) and reads tool / paused / speed / showPher /
 * showVision / brush / selectedId. Components read everything and write
 * tool / paused / speed / showPher / showVision / brush / lbCategory
 * (and call store.renderer?.reset() to rebuild the world).
 */

import { reactive, markRaw } from "vue";
import type { Renderer } from "../renderer/canvas.js";

export type Tool = "inspect" | "food" | "dirt" | "wall" | "erase" | "spider";

export interface ColonySnap {
  id: number;
  name: string;
  color: string;
  founder: boolean;
  fertility: number;
  generation: number;
  population: number;
  store: number;
  avgFitness: number;
}

export interface EventSnap {
  t: number;
  msg: string;
}

export interface SelectedSnap {
  id: number;
  colonyName: string;
  colonyColor: string;
  lastAction: string;
  carry: number;
  carryLabel: string;
  energy: number;
  hp: number;
  maxHp: number;
  hpPct: number;
  fitness: number;
  brainScore: number;
  age: number;
  nHid: number;
  foodDelivered: number;
  soilMoved: number;
  kills: number;
  brainOutputs: number[];
}

export interface UiSnap {
  antsCount: number;
  generation: number;
  predators: number;
  deaths: number;
  colonies: ColonySnap[];
  events: EventSnap[];
  selected: SelectedSnap | null;
}

export interface LbSnap {
  category: string;
  entries: import("../leaderboard.js").LbEntry[];
}

export const store = reactive({
  tool: "inspect" as Tool,
  paused: false,
  speed: 1,
  showPher: true,
  showVision: false,
  brush: 2,
  selectedId: null as number | null,
  lbCategory: "smart" as string,

  uiSnap: null as UiSnap | null,
  lbSnap: null as LbSnap | null,

  renderer: null as Renderer | null,
});

export function setRenderer(r: Renderer): void {
  store.renderer = markRaw(r);
}