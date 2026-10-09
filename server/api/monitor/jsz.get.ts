import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeJsz } from '#shared/utils/normalize'
import type { RawJsz } from '#shared/types/nats-wire'
import type { JetStreamOverview } from '#shared/types/monitoring'

/**
 * `accounts` pulls in every account (and, with `streams`, every stream and
 * consumer). That response is slow on large clusters, so the UI asks for the
 * server totals first and only requests details on demand.
 */
const QUERY_SPEC: QuerySpec = {
  accounts: 'bool',
  streams: 'bool',
  consumers: 'bool',
  config: 'bool',
  acc: 'string',
  limit: 'number',
  offset: 'number',
}

/** GET /api/monitor/jsz — JetStream streams, consumers and API totals. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawJsz, JetStreamOverview>(event, 'jsz', QUERY_SPEC, normalizeJsz)
})