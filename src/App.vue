<script setup lang="ts">
import Stage from "./components/Stage.vue";
import ColoniesPanel from "./components/ColoniesPanel.vue";
import ControlsPanel from "./components/ControlsPanel.vue";
import InspectorPanel from "./components/InspectorPanel.vue";
import LeaderboardPanel from "./components/LeaderboardPanel.vue";
import LegendPanel from "./components/LegendPanel.vue";
import { store } from "./state/store";
import { computed } from "vue";

const stats = computed(() => {
  const s = store.uiSnap;
  return s ? [
    { label: "Ants", value: s.antsCount },
    { label: "Generation", value: s.generation },
    { label: "Predators", value: s.predators },
    { label: "Deaths", value: s.deaths },
  ] : [
    { label: "Ants", value: 0 },
    { label: "Generation", value: 0 },
    { label: "Predators", value: 0 },
    { label: "Deaths", value: 0 },
  ];
});
</script>

<template>
  <main class="grid h-screen p-3 gap-3 [grid-template-columns:minmax(0,1fr)_340px] max-[980px]:[grid-template-columns:1fr] max-[980px]:h-auto max-[980px]:min-h-screen">
    <Stage />

    <aside class="panel panel-scroll flex flex-col gap-3.5 min-h-0 p-4 overflow-auto
                   rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]
                   max-[980px]:overflow-visible">
      <header class="mb-1">
        <h1 class="m-0 text-[22px] font-semibold tracking-tight">Neural Ant Farm</h1>
        <p class="mt-1 text-[13px] leading-snug text-[var(--color-muted)]">Colonies forage, build, and evolve in real time.</p>
      </header>

      <div class="stats grid grid-cols-2 gap-2">
        <div v-for="s in stats" :key="s.label" class="stat">
          <b>{{ s.value }}</b>
          <small>{{ s.label }}</small>
        </div>
      </div>

      <ColoniesPanel />
      <ControlsPanel />
      <InspectorPanel />
      <LegendPanel />
      <LeaderboardPanel />
    </aside>
  </main>
</template>

<style scoped>
.stat { padding: 11px 12px; border-radius: 10px; background: var(--color-card); border: 1px solid var(--color-border); }
.stat b { display: block; font-size: 20px; font-weight: 650; line-height: 1; }
.stat small { display: block; margin-top: 6px; font-size: 10.5px; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.06em; }
</style>