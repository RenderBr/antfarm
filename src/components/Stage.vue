<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { Renderer } from "../renderer/canvas";
import { store } from "../state/store";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const brush = ref<HTMLCanvasElement | null>(null); // unused element ref placeholder
const brushVal = ref(store.brush);
const tools: { key: string; label: string; title: string }[] = [
  { key: "inspect", label: "Inspect", title: "Click an ant to inspect; drag to pan" },
  { key: "food",    label: "Food",    title: "Paint food" },
  { key: "dirt",    label: "Dirt",    title: "Paint diggable dirt" },
  { key: "wall",    label: "Wall",    title: "Paint walls" },
  { key: "erase",   label: "Erase",   title: "Clear to open ground" },
  { key: "spider",  label: "Spider",  title: "Release a spider where you click" },
];

let renderer: Renderer | null = null;

onMounted(() => {
  if (canvasRef.value) {
    renderer = new Renderer(canvasRef.value);
  }
});

function setTool(t: string) {
  store.tool = t as typeof store.tool;
  if (canvasRef.value) {
    canvasRef.value.style.cursor = store.tool === "inspect" ? "grab" : "crosshair";
  }
}

watch(brushVal, (v) => { store.brush = v; });
</script>

<template>
  <section class="relative min-w-0 min-h-0 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[#0a0807] max-[980px]:h-[66vh] max-[980px]:min-h-[440px]">
    <canvas
      ref="canvasRef"
      role="img"
      aria-label="Ant farm simulation canvas. Scroll to zoom, drag to pan, and use the toolbar to edit the world."
      class="block w-full h-full cursor-grab"
    ></canvas>

    <div class="toolbar absolute left-3 top-3 flex flex-wrap gap-1.5 items-center p-1.5 rounded-xl
                bg-[color:rgba(16,12,8,0.85)] backdrop-blur-sm border border-[var(--color-border)]">
      <button
        v-for="t in tools"
        :key="t.key"
        class="tool tool-btn"
        :class="{ active: store.tool === t.key }"
        :aria-pressed="store.tool === t.key ? 'true' : 'false'"
        :title="t.title"
        @click="setTool(t.key)"
      >{{ t.label }}</button>
      <label class="brushlbl flex items-center gap-1.5 pl-2 text-xs text-[var(--color-muted)]" title="Brush size">
        <input ref="brush" type="range" min="0" max="6" step="1" v-model.number="brushVal" class="w-20" />
      </label>
    </div>

    <div class="hint absolute left-3 bottom-3 px-3 py-1.5 rounded-full text-xs text-[var(--color-muted)]
                bg-[color:rgba(16,12,8,0.8)] border border-[var(--color-border)] pointer-events-none">
      Scroll to zoom · drag to pan · Inspect an ant or pick a tool to edit
    </div>
  </section>
</template>