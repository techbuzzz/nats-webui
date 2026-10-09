import type { QuerySpec } from '../../utils/monitoring-route'
import { monitoringRoute } from '../../utils/monitoring-route'
import { normalizeVarz } from '#shared/utils/normalize'
import type { RawVarz } from '#shared/types/nats-wire'
import type { ServerOverview } from '#shared/types/monitoring'

/** `/varz` accepts no query parameters. */
const QUERY_SPEC: QuerySpec = {}

/** GET /api/monitor/varz — server dashboard data. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawVarz, ServerOverview>(event, 'varz', QUERY_SPEC, normalizeVarz)
})