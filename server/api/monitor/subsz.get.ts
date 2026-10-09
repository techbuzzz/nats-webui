import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeSubsz } from '#shared/utils/normalize'
import type { RawSubsz } from '#shared/types/nats-wire'
import type { SubscriptionList } from '#shared/types/monitoring'

/**
 * Upstream path is `/subsz` (subscriptions-z), not `/subz`. The docs and many
 * third-party articles get this wrong; we always call the real endpoint.
 */
const QUERY_SPEC: QuerySpec = {
  subs: 'bool',
  limit: 'number',
  offset: 'number',
  test: 'string',
  acc: 'string',
}

/** GET /api/monitor/subsz — subscription list plus sublist routing statistics. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawSubsz, SubscriptionList>(event, 'subsz', QUERY_SPEC, normalizeSubsz)
})