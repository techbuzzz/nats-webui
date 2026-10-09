import { monitoringRoute } from '../../utils/monitoring-route'
import type { QuerySpec } from '../../utils/monitoring-route'
import { normalizeAccountz } from '#shared/utils/normalize'
import type { RawAccountz } from '#shared/types/nats-wire'
import type { AccountList } from '#shared/types/monitoring'

const QUERY_SPEC: QuerySpec = {}

export interface AccountListResponse extends AccountList {
  /** Present so the UI can distinguish "no JetStream" from "no accounts". */
  jetstreamEnabled: boolean | null
}

/** GET /api/monitor/accountz — accounts known to this server. */
export default defineEventHandler(async (event) => {
  return monitoringRoute<RawAccountz, AccountListResponse>(event, 'accountz', QUERY_SPEC, (raw) => ({
    ...normalizeAccountz(raw),
    // `accountz` itself has no JetStream flag; the UI reads `enabled` from /jsz.
    jetstreamEnabled: null,
  }))
})