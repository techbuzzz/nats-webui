<script setup lang="ts">
/** A single labelled metric on the dashboard grids. */
withDefaults(defineProps<{
  label: string
  value: string | number
  hint?: string
}>(), {
  hint: '',
})
</script>

<template>
  <div class="stat-tile">
    <div class="stat-tile-label">
      {{ label }}
    </div>
    <div class="stat-tile-value">
      {{ value }}
    </div>
    <div v-if="hint" class="stat-tile-hint">
      {{ hint }}
    </div>
  </div>
</template>