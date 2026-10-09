/**
 * Polls a callback on an interval, pausing while the tab is hidden.
 *
 * Monitoring endpoints are cheap on-demand snapshots, so a slow refresh keeps
 * the dashboard live without hammering the NATS server. Runs client-side only,
 * because a background tab has no reason to keep polling.
 */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number): {
  start: () => void
  stop: () => void
  isActive: Readonly<Ref<boolean>>
} {
  const isActive = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    isActive.value = false
  }

  function start(): void {
    if (timer !== null || !import.meta.client) {
      return
    }
    isActive.value = true
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void callback()
      }
    }, intervalMs)
  }

  onBeforeUnmount(stop)

  return { start, stop, isActive: readonly(isActive) as Readonly<Ref<boolean>> }
}