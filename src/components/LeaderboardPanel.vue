<script setup lang="ts">
import { computed } from "vue";
import { store } from "../state/store";
import { getCategory, LB_CATEGORIES } from "../leaderboard.js";

const category = computed({
  get: () => store.lbCategory,
  set: (v: string) => { store.lbCategory = v; },
});

const snap = computed(() => store.lbSnap);
const cat = computed(() => getCategory(store.lbCategory));

function selectRow(e: { id: number; live: boolean }) {
  if (!e.live) return;
  store.renderer?.centerOnAnt(e.id);
}

function onKey(e: KeyboardEvent, row: { id: number; live: boolean }) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  selectRow(row);
}
</script>

<template>
  <details class="leaderboard panel-card" open>
    <summary>Leaderboard</summary>
    <select v-model="category" class="lb-cat" aria-label="Leaderboard category">
      <option v-for="c in LB_CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
    </select>
    <div class="lb-list">
      <div v-if="!snap || snap.entries.length === 0" class="lbempty">No ants yet.</div>
      <div
        v-for="(e, i) in snap?.entries ?? []"
        v-else
        :key="e.id"
        class="lbrow"
        :class="{ sel: e.id === store.selectedId }"
        :aria-disabled="e.live ? null : 'true'"
        :data-id="e.id"
        role="button"
        tabindex="0"
        :title="`${cat.fmt(e)} · ${cat.small(e)}`"
        @click="selectRow(e)"
        @keydown="onKey($event, e)"
      >
        <span class="rank" :style="{ color: e.color }">{{ i + 1 }}</span>
        <span class="who">Ant #{{ e.id }}<small>{{ e.colony }}</small></span>
        <span class="fit">{{ cat.fmt(e) }}</span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.leaderboard > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  user-select: none;
  margin-bottom: 9px;
}
.leaderboard > summary::marker { color: var(--color-muted); }
.leaderboard > summary::-webkit-details-marker { color: var(--color-muted); }
.leaderboard select.lb-cat {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 7px 30px 7px 11px;
  margin-bottom: 9px;
  font-size: 12px;
  font-weight: 500;
  background-color: rgba(255,255,255,0.03);
  color: var(--color-text);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%239f9588' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
  transition: background-color .12s, border-color .12s;
}
.leaderboard select.lb-cat:hover { background-color: rgba(255,255,255,0.06); border-color: #5a4c3d; }
.leaderboard select.lb-cat:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.leaderboard select.lb-cat option { background: var(--color-panel); color: var(--color-text); }

.lb-list {
  max-height: 188px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.lb-list::-webkit-scrollbar { width: 6px; }
.lb-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 999px; }

.lbrow {
  display: grid;
  grid-template-columns: 20px minmax(0,1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
  transition: background .12s;
  font-size: 12px;
  line-height: 1.3;
}
.lbrow + .lbrow { margin-top: 1px; }
.lbrow:hover, .lbrow:focus-visible { background: rgba(255,255,255,0.04); outline: none; }
.lbrow:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.lbrow[aria-disabled="true"] { cursor: default; opacity: 0.55; }
.lbrow[aria-disabled="true"]:hover { background: transparent; }
.lbrow.sel { background: rgba(224,163,90,0.16); border: 1px solid var(--color-accent); padding: 2px 5px; }
.lbrow .rank { font-weight: 600; color: var(--color-muted); text-align: center; font-variant-numeric: tabular-nums; }
.lbrow .who {
  font-weight: 600;
  display: flex;
  gap: 5px;
  align-items: baseline;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.lbrow .who small { font-weight: 400; color: var(--color-muted); font-size: 10px; }
.lbrow .fit { font-weight: 600; color: var(--color-green); font-variant-numeric: tabular-nums; }
.lbempty { color: var(--color-muted); font-size: 12.5px; padding: 4px 2px; }
</style>