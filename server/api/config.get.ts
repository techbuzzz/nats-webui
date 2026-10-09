import { publicNatsConfig } from '../utils/nats-config'
import type { NatsClientConfig } from '#shared/types/monitoring'

/**
 * GET /api/config — non-secret runtime configuration for the browser.
 *
 * The playground needs the WebSocket URL; monitoring credentials are never
 * serialized here. `authRequired` is probed from `/varz` so the settings panel
 * can prompt for credentials before the operator tries to connect.
 */
export default defineEventHandler(async (): Promise<NatsClientConfig> => {
  const { websocketUrl, connectionName } = publicNatsConfig(useRuntimeConfig())

  let authRequired = false
  let serverVersion = ''

  try {
    const raw = await fetchMonitoringJson<{ auth_required?: boolean, version?: string }>('varz')
    authRequired = raw.auth_required === true
    serverVersion = typeof raw.version === 'string' ? raw.version : ''
  }
  catch {
    // The dashboard already surfaces monitoring failures; here we degrade to
    // "auth unknown" so the playground remains usable.
    authRequired = false
    serverVersion = ''
  }

  return {
    websocketUrl,
    connectionName,
    authRequired,
    serverVersion,
  }
})