<script setup lang="ts">
import { computed } from "vue";
import { store } from "../state/store";

const speed = computed({
  get: () => store.speed,
  set: (v: number) => { store.speed = v; },
});
const speedLabel = computed(() => store.speed.toFixed(1) + "×");

function togglePause() { store.paused = !store.paused; }
function resetWorld() { store.renderer?.reset(); }
function togglePher() { store.showPher = !store.showPher; }
function toggleVision() { store.showVision = !store.showVision; }
</script>

<template>
  <section class="controls panel-card grid gap-2.5">
    <label class="row flex items-center justify-between gap-2.5 text-[13px]">
      Speed <span class="tabular-nums text-[var(--color-muted)]">{{ speedLabel }}</span>
      <input type="range" min="0" max="8" step="0.1" v-model.number="speed" class="flex-1" />
    </label>
    <div class="btnrow flex gap-2">
      <button class="tool-btn flex-1" @click="togglePause">{{ store.paused ? "Resume" : "Pause" }}</button>
      <button class="tool-btn flex-1" @click="resetWorld">New world</button>
    </div>
    <div class="btnrow flex gap-2">
      <button class="tool-btn flex-1" :class="{ active: store.showPher }" :aria-pressed="store.showPher ? 'true' : 'false'" @click="togglePher">Pheromones</button>
      <button class="tool-btn flex-1" :class="{ active: store.showVision }" :aria-pressed="store.showVision ? 'true' : 'false'" @click="toggleVision">Vision rays</button>
    </div>
  </section>
</template>