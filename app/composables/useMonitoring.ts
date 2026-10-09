import type { MonitoringFailure } from '#shared/types/monitoring'
import { toMonitoringFailure } from '#shared/utils/api-error'

/** Reactive state of a single monitoring request. */
export interface MonitoringRequest<T> {
  data: Ref<T | null>
  pending: Ref<boolean>
  failure: Ref<MonitoringFailure | null>
  /** True once a request has completed at least once. */
  loaded: Ref<boolean>
  refresh: () => Promise<void>
  /** Replaces the data locally, e.g. after an in-place mutation. */
  set: (value: T) => void
}

/**
 * Fetches a monitoring endpoint through the Nitro proxy and exposes
 * pending/error/data state.
 *
 * Every page uses this so loading, empty and failure states are handled the
 * same way everywhere: a structured {@link MonitoringFailure} rather than a
 * blank screen or a thrown stack trace.
 */
export function useMonitoring<T>(url: string | Ref<string>): MonitoringRequest<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const pending = ref(false)
  const loaded = ref(false)
  const failure = ref<MonitoringFailure | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    try {
      // `$fetch` is typed against Nitro's internal route map, which widens `T`.
// The monitoring routes always return exactly the requested view model.
data.value = (await $fetch<T>(unref(url))) as T
      failure.value = null
    }
    catch (error) {
      failure.value = toMonitoringFailure(error)
    }
    finally {
      pending.value = false
      loaded.value = true
    }
  }

  function set(value: T): void {
    data.value = value
    failure.value = null
  }

  return { data, pending, failure, loaded, refresh, set }
}