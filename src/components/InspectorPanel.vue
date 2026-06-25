<script setup lang="ts">
import { computed } from "vue";
import { store } from "../state/store";

const BRAIN_LABELS = ["turn", "move", "dig", "build", "grab", "drop", "food trail", "home trail", "eat"];
const BRAIN_COLORS = ["#8fd", "#fd8", "#c96", "#fb8", "#9f8", "#f99", "#6f9", "#f6c", "#fe9"];

const sel = computed(() => store.uiSnap?.selected ?? null);
</script>

<template>
  <section class="inspector panel-card text-[13px] leading-relaxed" id="inspector">
    <h2 class="m-0 mb-1.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Inspector</h2>

    <template v-if="!sel">
      <p class="text-[var(--color-muted)] m-0">Click an ant for details.</p>
    </template>

    <template v-else>
      <div class="name text-base font-semibold flex items-center">
        <span class="dot" :style="{ background: sel.colonyColor }"></span>Ant #{{ sel.id }}
        <small class="ml-1" :style="{ color: sel.colonyColor }">{{ sel.colonyName }}</small>
      </div>
      <p class="text-[var(--color-muted)] m-0 mt-1">
        <strong>{{ sel.lastAction }}</strong>
        <template v-if="sel.carryType !== 255"> · carrying {{ sel.carryFoodName }}</template>
        <template v-else-if="sel.carryLabel !== 'nothing'"> · carrying {{ sel.carryLabel }}</template>
      </p>
      <div v-if="sel.smartsBoostTimer > 0 || sel.hpRegenTimer > 0 || sel.poisonTimer > 0" class="buffs mt-1.5">
        <span v-if="sel.smartsBoostTimer > 0" class="buff smarts" :title="`+${sel.smartsBoost.toFixed(2)} sensor range for ${sel.smartsBoostTimer.toFixed(0)}s`">+smarts {{ sel.smartsBoostTimer.toFixed(0) }}s</span>
        <span v-if="sel.hpRegenTimer > 0" class="buff regen" :title="`+${sel.hpRegen.toFixed(1)} HP/s for ${sel.hpRegenTimer.toFixed(0)}s`">+regen {{ sel.hpRegenTimer.toFixed(0) }}s</span>
        <span v-if="sel.poisonTimer > 0" class="buff poison" :title="`poisoned for ${sel.poisonTimer.toFixed(0)}s`">poisoned {{ sel.poisonTimer.toFixed(0) }}s</span>
      </div>
      <p class="text-[var(--color-muted)] m-0 mt-2 mb-0.5">Energy</p>
      <div class="bar"><i :style="{ width: Math.round(sel.energy) + '%' }"></i></div>
      <p class="text-[var(--color-muted)] m-0 mt-2 mb-0.5">Health</p>
      <div class="bar health"><i :style="{ width: sel.hpPct.toFixed(0) + '%' }"></i></div>
      <p class="text-[var(--color-muted)] m-0 mt-2 text-[12.5px]">
        Neurons {{ sel.nHid }} · Smart {{ sel.brainScore.toFixed(2) }} · Fitness {{ sel.fitness.toFixed(0) }} · Age {{ sel.age.toFixed(0) }}s
      </p>

      <details class="brain-details mt-2">
        <summary>Brain outputs</summary>
        <div class="brainout">
          <label v-for="(v, k) in sel.brainOutputs" :key="k">
            {{ BRAIN_LABELS[k] }}
            <span class="obar"><i :style="{ width: Math.round(Math.max(0, Math.min(1, k === 0 ? (v + 1) / 2 : v)) * 100) + '%', background: BRAIN_COLORS[k] }"></i></span>
          </label>
        </div>
      </details>
    </template>
  </section>
</template>

<style scoped>
.name small { font-size: 12px; font-weight: 500; }
.bar { height: 7px; border-radius: 999px; background: #2c251c; overflow: hidden; margin: 3px 0 8px; }
.bar > i { display: block; height: 100%; background: var(--color-accent); }
.bar.health > i { background: var(--color-red); }
.brain-details summary { cursor: pointer; color: var(--color-muted); font-size: 12px; }
.brainout { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; margin-top: 8px; }
.brainout label { font-size: 11.5px; color: var(--color-muted); display: grid; gap: 3px; }
.obar { height: 5px; border-radius: 999px; background: #2c251c; overflow: hidden; }
.obar > i { display: block; height: 100%; }
.buffs { display: flex; flex-wrap: wrap; gap: 4px; }
.buff { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 500; }
.buff.smarts { background: rgba(110,140,210,0.18); color: #b6c4e8; }
.buff.regen { background: rgba(132,201,122,0.18); color: #b1dca5; }
.buff.poison { background: rgba(217,120,95,0.22); color: #ecb0a0; }
</style>