import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeRoutez } from '#shared/utils/normalize'
import type { RawRoutez } from '#shared/types/nats-wire'
import type { RouteList } from '#shared/types/monitoring'

/** `/routez` has no paging; `subs` optionally attaches the subscription list. */
const QUERY_SPEC: QuerySpec = {
  subs: 'bool',
}

/** GET /api/monitor/routez — cluster routes. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawRoutez, RouteList>(event, 'routez', QUERY_SPEC, normalizeRoutez)
})