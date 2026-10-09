<script setup lang="ts">
/** Labelled key/value row used by the detail views. */
defineProps<{
  label: string
  value: string | number
}>()
</script>

<template>
  <div class="definition-row">
    <dt>{{ label }}</dt>
    <dd>{{ value }}</dd>
  </div>
</template>