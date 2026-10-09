/**
 * GET /api/health — liveness of the WebUI itself plus NATS reachability.
 *
 * Answers 200 when the WebUI is up (which is what the container HEALTHCHECK
 * asserts) and reports NATS reachability in the body, so a monitor can tell
 * "WebUI down" apart from "NATS unreachable".
 */
import type { NatsRuntimeConfig } from '../utils/nats-config'
import { useNatsConfig } from '../utils/nats-config'
import { MonitoringError, fetchMonitoringJson } from '../utils/nats-monitoring'

export interface HealthResponse {
  status: 'ok' | 'degraded'
  /** Masked monitoring target, so the response never leaks credentials. */
  monitoringUrl: string
  natsReachable: boolean
  natsVersion: string
  checkedAt: string
}

export default defineEventHandler(async (): Promise<HealthResponse> => {
  const config: NatsRuntimeConfig = useNatsConfig()

  let natsReachable = false
  let natsVersion = ''

  try {
    const raw = await fetchMonitoringJson<{ version?: string }>('varz', undefined, config)
    natsReachable = true
    natsVersion = typeof raw.version === 'string' ? raw.version : ''
  }
  catch (error) {
    if (!(error instanceof MonitoringError)) {
      throw error
    }
  }

  // Always 200: the WebUI itself is alive, which is what the container
  // HEALTHCHECK asserts. NATS reachability is reported in the body so a monitor
  // can distinguish "WebUI down" from "NATS unreachable".
  return {
    status: natsReachable ? 'ok' : 'degraded',
    // Strip any embedded credentials before returning the URL.
    monitoringUrl: config.monitorUrl.replace(/\/\/[^@]*@/, '//'),
    natsReachable,
    natsVersion,
    checkedAt: new Date().toISOString(),
  }
})