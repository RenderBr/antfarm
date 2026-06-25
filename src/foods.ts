/* foods.ts — typed food system.
 * Each world cell holds an amount + a type id. Each type has a hand-painted
 * 14x14 pixel sprite, an energy value, and an effect that applies when an
 * ant picks the food up. The renderer bakes the sprites once on startup
 * and blits them with imageSmoothingEnabled = false for crisp pixel art.
 */

export const FOOD_NONE = 255;
export const FOOD_APPLE = 0;
export const FOOD_BLUEBERRY = 1;
export const FOOD_GRAPE = 2;
export const FOOD_STRAWBERRY = 3;
export const FOOD_MUSHROOM = 4;
export const FOOD_BANANA = 5;
export const FOOD_CHERRY = 6;
export const FOOD_ACORN = 7;
export const NUM_FOODS = 8;

export type FoodEffect =
  | { kind: "energy"; amount: number }
  | { kind: "smarts_boost"; amount: number; duration: number }
  | { kind: "max_hp"; amount: number }
  | { kind: "hp_regen"; perSec: number; duration: number }
  | { kind: "poison"; damage: number; duration: number }
  | { kind: "random"; buff: FoodEffect; debuff: FoodEffect };

export interface FoodDef {
  id: number;
  name: string;
  pixels: string[];
  palette: Record<string, string>;
  rarity: number;
  energy: number;
  effect: FoodEffect;
}

const T = ".";

const APPLE: FoodDef = {
  id: FOOD_APPLE,
  name: "apple",
  pixels: [
    "......LL......",
    ".....LLLL.....",
    ".....SSSS.....",
    "...RRRRRRR....",
    "..RRRRRRRRRR..",
    ".RRRRrRRRRRRR.",
    ".RRrRRRRRRRRR.",
    ".RRRRRRRRRRRR.",
    ".RRRRRRRRRRRR.",
    "..RRRRRRRRRR..",
    "..RRRRRRRRR...",
    "...RRRRRRR....",
    ".....RRR......",
    "..............",
  ],
  palette: { R: "#d6342a", r: "#ef5a4d", S: "#5a3a1e", L: "#5fa55a" },
  rarity: 0.18,
  energy: 30,
  effect: { kind: "energy", amount: 30 },
};

const BLUEBERRY: FoodDef = {
  id: FOOD_BLUEBERRY,
  name: "blueberry",
  pixels: [
    "..............",
    "....bb.bb.....",
    "...bBBb.bBBb..",
    "..bBBbBbBBbB..",
    "..bBBbBBBBBb..",
    "..bBBbBBBbBb..",
    "..bBBbBBBBbB..",
    "...bBBBBBBb...",
    "....bBBBBb....",
    ".....bbbb.....",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
  palette: { b: "#3a4d99", B: "#5a6db5" },
  rarity: 0.18,
  energy: 10,
  effect: { kind: "smarts_boost", amount: 0.4, duration: 12 },
};

const GRAPE: FoodDef = {
  id: FOOD_GRAPE,
  name: "grape",
  pixels: [
    "..............",
    "......LLL.....",
    ".....LLLLL....",
    "......pP......",
    "....pPPpPP....",
    "...pPPpPPPp...",
    "..pPPPPPPPPp..",
    "..pPPPPPPpPp..",
    "..pPPpPPPPp...",
    "..pPPPPPPp....",
    "...pPPPPp.....",
    "....pppp......",
    "..............",
    "..............",
  ],
  palette: { p: "#7d4ba1", P: "#a06bc4", L: "#6db56a" },
  rarity: 0.10,
  energy: 55,
  effect: { kind: "energy", amount: 55 },
};

const STRAWBERRY: FoodDef = {
  id: FOOD_STRAWBERRY,
  name: "strawberry",
  pixels: [
    "....LLLLLLL...",
    "...LLLLLLLLL..",
    "...LlLLLLlLL..",
    "...LllLLllLL..",
    "....rRRRRRr...",
    "...rRRRRRRRr..",
    "..rRRsRRsRRr..",
    "..rRRRRRRRRr..",
    "..rRRsRRsRRr..",
    "..rRRRRRRRRr..",
    "..rRRRRRRRRr..",
    "...rRRRRRRr...",
    "....rrrrrr....",
    "..............",
  ],
  palette: { L: "#4d9a4a", l: "#7fbf6a", r: "#d6342a", R: "#ef5a4d", s: "#fff0a0" },
  rarity: 0.14,
  energy: 20,
  effect: { kind: "max_hp", amount: 1 },
};

const MUSHROOM: FoodDef = {
  id: FOOD_MUSHROOM,
  name: "mushroom",
  pixels: [
    "..............",
    ".....WWWWW....",
    "....WCCCCCW...",
    "...WCCcCCcCW..",
    "..WCCCCCCCCW..",
    "..WCCCCCCCCW..",
    "..WCCCCCCCCW..",
    "...WCCCCCCW...",
    "....WWWWWW....",
    ".....SSSS.....",
    "....SS.SS.....",
    "....SS.SS.....",
    "....SS.SS.....",
    ".....SSS......",
  ],
  palette: { W: "#f4ead5", C: "#cc2f25", c: "#e2553b", S: "#dcc79a" },
  rarity: 0.08,
  energy: 0,
  effect: {
    kind: "random",
    buff: { kind: "energy", amount: 80 },
    debuff: { kind: "poison", damage: 5, duration: 5 },
  },
};

const BANANA: FoodDef = {
  id: FOOD_BANANA,
  name: "banana",
  pixels: [
    "..............",
    "..............",
    "..............",
    "......yyY.....",
    "....yYYYYy....",
    "...yYYyYYy....",
    "..yYYYYYYy....",
    "..yYYYYYYy....",
    "..yYYYYy......",
    "..yYYy........",
    "...yy.........",
    "..............",
    "..............",
    "..............",
  ],
  palette: { y: "#f4d346", Y: "#caa035" },
  rarity: 0.08,
  energy: 25,
  effect: { kind: "energy", amount: 25 },
};

const CHERRY: FoodDef = {
  id: FOOD_CHERRY,
  name: "cherry",
  pixels: [
    "..............",
    "......S.......",
    ".....SS.......",
    ".....SS.......",
    "......S.......",
    "......S.......",
    "....rr..rr....",
    "...rRR.rRRr...",
    "..rRRRrRRRr...",
    "..rRRRrRRRr...",
    "..rRRRrRRRr...",
    "...rRR.rRRr...",
    "....rr..rr....",
    "..............",
  ],
  palette: { r: "#d6342a", R: "#a02520", S: "#4a8a3d" },
  rarity: 0.10,
  energy: 12,
  effect: { kind: "smarts_boost", amount: 0.3, duration: 10 },
};

const ACORN: FoodDef = {
  id: FOOD_ACORN,
  name: "acorn",
  pixels: [
    "..............",
    ".....SSSS.....",
    "....SCCCCS....",
    "...SCCcCCcS...",
    "..SCCCCCCCCS..",
    "..SCCCCCCCCS..",
    "..SCCCCCCCCS..",
    "...SCCCCCCS...",
    "....SSSSSS....",
    "....yyyyyy....",
    "....yYyyYy....",
    "....yYyyYy....",
    "....yYyyYy....",
    "....yyyyyy....",
  ],
  palette: { S: "#5a3a1e", C: "#8b5e2a", c: "#b07a3c", y: "#d4b07a", Y: "#a07a48" },
  rarity: 0.14,
  energy: 15,
  effect: { kind: "hp_regen", perSec: 0.8, duration: 15 },
};

export const FOODS: FoodDef[] = [APPLE, BLUEBERRY, GRAPE, STRAWBERRY, MUSHROOM, BANANA, CHERRY, ACORN];

export const FOOD_BY_ID: (FoodDef | null)[] = (() => {
  const arr: (FoodDef | null)[] = new Array(NUM_FOODS).fill(null);
  for (const f of FOODS) arr[f.id] = f;
  return arr;
})();

let _rarityTotal = 0;
for (const f of FOODS) _rarityTotal += f.rarity;

export function pickFoodType(): number {
  let r = Math.random() * _rarityTotal;
  for (const f of FOODS) { r -= f.rarity; if (r <= 0) return f.id; }
  return FOODS[FOODS.length - 1].id;
}

export function foodName(id: number): string {
  if (id === FOOD_NONE || id < 0 || id >= NUM_FOODS) return "food";
  return FOOD_BY_ID[id]?.name ?? "food";
}

void T;
