import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeLeafz } from '#shared/utils/normalize'
import type { RawLeafz } from '#shared/types/nats-wire'
import type { LeafNodeList } from '#shared/types/monitoring'

const QUERY_SPEC: QuerySpec = {
  subs: 'bool',
}

/** GET /api/monitor/leafz — leaf node connections. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawLeafz, LeafNodeList>(event, 'leafz', QUERY_SPEC, normalizeLeafz)
})