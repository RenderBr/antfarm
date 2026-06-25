<script setup lang="ts">
</script>

<template>
  <details class="legend panel-card">
    <summary>How it works</summary>
    <ul class="mt-2.5 pl-4 grid gap-1.5 text-[12.5px] leading-snug text-[var(--color-muted)]">
      <li>Ants use nearby food, walls, trails, energy, and nest direction to decide what to do.</li>
      <li>Food grows colonies; successful ants shape the next generation.</li>
      <li><b class="text-[var(--color-text)] font-semibold">Smart</b> ranks brains by how varied their action signals are — richer, more diverse brain activity scores higher.</li>
      <li>Eight <b class="text-[var(--color-text)] font-semibold">food types</b> (apple, blueberry, grape, strawberry, mushroom, banana, cherry, acorn) each give a different effect — boosts to smarts, max HP, HP regen, energy, or a poison debuff.</li>
      <li>Each ant's <b class="text-[var(--color-text)] font-semibold">appearance</b> (segments, legs, antennae, color pattern) is shaped by its traits and a hash of its brain genome, so the look evolves with the mind.</li>
    </ul>
  </details>
</template>

<style scoped>
.legend summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 650; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.legend ul { margin: 10px 0 0; padding-left: 16px; display: grid; gap: 7px; }
.legend b { color: var(--color-text); font-weight: 600; }
</style>