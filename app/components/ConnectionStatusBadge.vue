<script setup lang="ts">
import type { ConnectionState } from '~/composables/useNatsConnection'

/** Connection status indicator for the playground. */
const props = defineProps<{
  state: ConnectionState
  detail?: string
}>()

const presentation = computed(() => {
  switch (props.state) {
    case 'connected':
      return { label: 'Connected', variant: 'is-ok' }
    case 'connecting':
      return { label: 'Connecting…', variant: 'is-warn' }
    case 'disconnected':
      return { label: 'Disconnected', variant: 'is-idle' }
    case 'error':
      return { label: 'Error', variant: 'is-danger' }
    default:
      return { label: 'Idle', variant: 'is-idle' }
  }
})
</script>

<template>
  <span class="badge" :class="presentation.variant">
    <span class="badge-dot" />
    {{ presentation.label }}
    <span v-if="detail" class="badge-detail">· {{ detail }}</span>
  </span>
</template>

<style scoped>
.badge-detail {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.72rem;
}
</style>