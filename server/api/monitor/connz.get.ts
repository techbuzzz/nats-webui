import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeConnz } from '#shared/utils/normalize'
import type { RawConnz } from '#shared/types/nats-wire'
import type { ConnectionList } from '#shared/types/monitoring'

/**
 * `/connz` parameters we forward. Anything else is dropped by `sanitizeQuery`.
 *
 * `cid` selects a single connection and is what the connection detail view uses.
 */
const QUERY_SPEC: QuerySpec = {
  cid: 'number',
  limit: 'number',
  offset: 'number',
  state: 'string',
  user: 'string',
  acc: 'string',
  auth: 'bool',
  subs: 'bool',
  sort: 'string',
}

/** GET /api/monitor/connz — connection list, or one connection via `?cid=N`. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawConnz, ConnectionList>(event, 'connz', QUERY_SPEC, normalizeConnz)
})