<script setup lang="ts">
import { computed } from "vue";
import { store } from "../state/store";
import { fmtTime } from "../renderer/canvas";

const colonies = computed(() => store.uiSnap?.colonies ?? []);
const events = computed(() => store.uiSnap?.events ?? []);
</script>

<template>
  <section class="colonies-panel panel-card">
    <h2 class="m-0 mb-2 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Colonies</h2>
    <div v-if="colonies.length === 0" class="empty">No colonies yet.</div>
    <div v-else>
      <div v-for="c in colonies" :key="c.id" class="colrow">
        <span class="dot" :style="{ background: c.color }"></span>
        <span class="cname">
          {{ c.name }}<span v-if="c.founder"> founder</span><span v-if="c.fertility > 1" class="fert"> ×{{ c.fertility | 0 }} fertility</span>
          <small>gen {{ c.generation }}</small>
        </span>
        <span class="cpop">{{ c.population }} ants</span>
        <span class="cfood">{{ Math.round(c.store) }} food</span>
        <span class="cfit">{{ c.avgFitness.toFixed(0) }} fit</span>
      </div>
    </div>

    <h2 class="evhead m-0 mt-4 mb-1 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Events</h2>
    <div id="eventlog">
      <div v-if="events.length === 0" class="ev evnone">No events yet.</div>
      <div v-for="(e, i) in events" :key="i" class="ev">
        <span class="evt">{{ fmtTime(e.t) }}</span>{{ e.msg }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.empty { color: var(--color-muted); font-size: 12.5px; padding: 4px 2px; }
.colrow { display: grid; grid-template-columns: 14px minmax(0,1fr) auto auto auto; align-items: center; gap: 8px; padding: 5px 2px; font-size: 12.5px; border-top: 1px solid rgba(255,255,255,0.04); }
.colrow:first-of-type { border-top: none; }
.cname { font-weight: 600; display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.cname small { font-weight: 400; color: var(--color-muted); font-size: 10px; }
.fert { color: #ddb84a; font-size: 10px; font-weight: 600; }
.cpop, .cfood, .cfit { font-variant-numeric: tabular-nums; color: var(--color-muted); font-size: 11.5px; white-space: nowrap; }
#eventlog { display: flex; flex-direction: column; gap: 3px; max-height: 132px; overflow-y: auto; margin-top: 4px; }
.ev { font-size: 11.5px; color: var(--color-text); padding: 4px 7px; border-radius: 6px; background: rgba(255,255,255,0.03); }
.evt { color: var(--color-muted); font-variant-numeric: tabular-nums; margin-right: 6px; }
.evnone { color: var(--color-muted); background: none; }
</style>