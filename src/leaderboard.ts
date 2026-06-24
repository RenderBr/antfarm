/* leaderboard.ts — categories + combined entry builder shared by the renderer
 * (which computes the top-8 each tick) and the LeaderboardPanel Vue component
 * (which formats the rows).
 */

import type { Ant } from "./ant.js";
import type { Champion, Simulation } from "./sim.js";

export interface LbEntry {
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

export interface LbCategory {
  key: string;
  label: string;
  score: (e: LbEntry) => number;
  fmt: (e: LbEntry) => string;
  small: (e: LbEntry) => string;
}

export const LB_CATEGORIES: LbCategory[] = [
  { key: "smart",   label: "Smartest",  score: (e) => e.brainScore,    fmt: (e) => e.brainScore.toFixed(2),    small: (e) => `${e.foodDelivered.toFixed(1)} food` },
  { key: "food",    label: "Most food", score: (e) => e.foodDelivered, fmt: (e) => e.foodDelivered.toFixed(1), small: (e) => `${e.brainScore.toFixed(2)} smart` },
  { key: "soil",    label: "Most soil", score: (e) => e.soilMoved,     fmt: (e) => e.soilMoved.toString(),     small: (e) => `${e.foodDelivered.toFixed(1)} food` },
  { key: "kills",   label: "Most kills",score: (e) => e.kills,         fmt: (e) => e.kills.toString(),         small: (e) => `${e.foodDelivered.toFixed(1)} food` },
  { key: "age",     label: "Oldest",    score: (e) => e.age,           fmt: (e) => `${e.age.toFixed(0)}s`,     small: (e) => `${e.foodDelivered.toFixed(1)} food` },
  { key: "fitness", label: "Most fit",  score: (e) => e.fitness,       fmt: (e) => e.fitness.toFixed(0),      small: (e) => `${e.foodDelivered.toFixed(1)} food` },
];

export function buildLbEntries(sim: Simulation): LbEntry[] {
  const map = new Map<number, LbEntry>();
  for (const a of sim.ants as Ant[]) {
    if (!a.alive) continue;
    map.set(a.id, {
      id: a.id,
      colony: a.colony.name,
      color: a.colony.color,
      traits: { size: a.traits.size, speed: a.traits.speed, smarts: a.traits.smarts },
      brainScore: a.brainScore,
      fitness: a.fitness,
      foodDelivered: a.foodDelivered,
      soilMoved: a.soilMoved,
      kills: a.kills,
      age: a.age,
      gen: a.bornGen || 1,
      live: true,
    });
  }
  const fame: Champion[] = sim.hallOfFame;
  for (const h of fame) {
    if (map.has(h.id)) continue;
    map.set(h.id, {
      id: h.id,
      colony: h.colony,
      color: h.color,
      traits: h.traits,
      brainScore: h.brainScore,
      fitness: h.fitness,
      foodDelivered: h.foodDelivered,
      soilMoved: h.soilMoved,
      kills: h.kills,
      age: h.age,
      gen: h.gen,
      live: false,
    });
  }
  return Array.from(map.values());
}

export function getCategory(key: string): LbCategory {
  return LB_CATEGORIES.find((c) => c.key === key) || LB_CATEGORIES[0];
}