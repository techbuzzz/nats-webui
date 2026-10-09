import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeGatewayz } from '#shared/utils/normalize'
import type { RawGatewayz } from '#shared/types/nats-wire'
import type { GatewayList } from '#shared/types/monitoring'

const QUERY_SPEC: QuerySpec = {
  subs: 'bool',
}

/** GET /api/monitor/gatewayz — super-cluster gateways. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawGatewayz, GatewayList>(event, 'gatewayz', QUERY_SPEC, normalizeGatewayz)
})