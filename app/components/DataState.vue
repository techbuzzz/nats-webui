<script setup lang="ts">
/**
 * Unified loading / failure / empty boundary for monitoring data.
 *
 * Pages hand this component a request state so every screen reacts the same way
 * to a slow, broken or empty upstream instead of rendering a blank page.
 */
import type { MonitoringFailure } from '#shared/types/monitoring'

const props = withDefaults(defineProps<{
  pending: boolean
  loaded: boolean
  failure: MonitoringFailure | null
  /** When true, show the empty state rather than children. */
  empty?: boolean
  emptyTitle?: string
  emptyHint?: string
  /** Label for the retry button. */
  retryLabel?: string
}>(), {
  empty: false,
  emptyTitle: 'Nothing to show',
  emptyHint: 'The server reported no data for this view.',
  retryLabel: 'Retry',
})

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="props.pending && !props.loaded" class="state-block state-loading" role="status" aria-live="polite">
    <div class="skeleton-row" style="width: 38%" />
    <div class="skeleton-row" style="width: 62%" />
    <div class="skeleton-row" style="width: 50%" />
    <span class="visually-hidden">Loading…</span>
  </div>

  <div
    v-else-if="props.failure"
    class="state-block state-error"
    role="alert"
  >
    <p class="state-title">
      {{ props.failure.message }}
    </p>
    <p class="state-hint">
      {{ props.failure.hint }}
    </p>
    <div class="button-row" style="justify-content: center">
      <button type="button" class="button button-primary" @click="emit('retry')">
        {{ props.retryLabel }}
      </button>
    </div>
  </div>

  <div v-else-if="props.empty" class="state-block">
    <p class="state-title">
      {{ props.emptyTitle }}
    </p>
    <p class="state-hint">
      {{ props.emptyHint }}
    </p>
  </div>

  <slot v-else />
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>