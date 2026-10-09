/**
 * Pure parsing and normalizing layer for NATS monitoring payloads.
 *
 * Every function here takes an untyped JSON payload straight off the wire and
 * returns a strict view model (see `shared/types/monitoring.ts`). No network, no
 * Vue, no Nitro imports — which is exactly what makes this layer unit-testable.
 */

import type {
  AccountList,
  AccountEntry,
  ApiTotals,
  ConnectionEntry,
  ConnectionList,
  GatewayEntry,
  GatewayList,
  JetStreamAccountEntry,
  JetStreamOverview,
  JetStreamUsage,
  LeafNodeEntry,
  LeafNodeList,
  RouteEntry,
  RouteList,
  ServerOverview,
  StreamEntry,
  SubscriptionEntry,
  SubscriptionList,
} from '../types/monitoring'
import type {
  RawAccountDetail,
  RawAccountz,
  RawAccountzEntry,
  RawConnInfo,
  RawConnz,
  RawConsumerInfo,
  RawGatewayInfo,
  RawGatewayz,
  RawJetStreamApiStats,
  RawJetStreamStats,
  RawJsz,
  RawLeafInfo,
  RawLeafz,
  RawRouteInfo,
  RawRoutez,
  RawStreamDetail,
  RawSubsz,
  RawSubDetail,
  RawVarz,
} from '../types/nats-wire'

/** Reads a finite number, falling back when the value is absent or malformed. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

/** Reads a string, falling back when the value is absent or not a string. */
export function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Reads a boolean, treating numeric `0`/`1` as false/true. */
export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  return fallback
}

/** Reads an array of strings, dropping non-string members. */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * Parses a Go duration string such as `1h2m3.5s` into seconds.
 *
 * NATS reports `uptime`, `idle` and `rtt` using `time.Duration.String()`,
 * which always uses the largest unit that keeps the value >= 1, so a compound
 * string is possible (`1h2m3.5s`). Returns `0` for unparseable input.
 */
export function parseGoDurationSeconds(value: unknown): number {
  const text = toText(value).trim()
  if (text === '' || text === '0s' || text === '0') {
    return 0
  }

  const unitSeconds: Record<string, number> = {
    ns: 1e-9,
    us: 1e-6,
    'µs': 1e-6,
    μs: 1e-6,
    ms: 1e-3,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }

  const pattern = /(-?\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h|d)/g
  let total = 0
  let matched = false
  let match: RegExpExecArray | null = pattern.exec(text)

  while (match !== null) {
    const amount = Number(match[1])
    const unit = unitSeconds[match[2] ?? '']
    if (Number.isFinite(amount) && unit !== undefined) {
      total += amount * unit
      matched = true
    }
    match = pattern.exec(text)
  }

  return matched ? total : 0
}

/** Parses a Go duration into milliseconds; `null` when the server reported none. */
export function parseGoDurationMs(value: unknown): number | null {
  const text = toText(value).trim()
  if (text === '' || text === '0s' || text === '0') {
    return null
  }
  const seconds = parseGoDurationSeconds(text)
  return seconds > 0 ? seconds * 1000 : null
}

/** Seconds between two RFC 3339 timestamps, or `0` when either is unparseable. */
export function secondsBetween(start: unknown, end: unknown): number {
  const from = Date.parse(toText(start))
  const to = Date.parse(toText(end))
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0
  }
  return Math.max(0, (to - from) / 1000)
}

function normalizeApiTotals(raw: RawJetStreamApiStats | undefined): ApiTotals {
  return {
    level: toNumber(raw?.level),
    total: toNumber(raw?.total),
    errors: toNumber(raw?.errors),
    inflight: toNumber(raw?.inflight),
  }
}

const EMPTY_JETSTREAM_USAGE: JetStreamUsage = {
  enabled: false,
  memory: 0,
  storage: 0,
  reservedMemory: 0,
  reservedStorage: 0,
  maxMemory: 0,
  maxStorage: 0,
  storeDir: '',
  domain: '',
  metaLeader: '',
  metaClusterSize: 0,
}

/**
 * Folds the three JetStream shapes a server can report into one value:
 * the modern `/varz` object, the pre-2.11 boolean, and absence entirely.
 */
export function normalizeVarzJetStream(raw: RawVarz['jetstream']): JetStreamUsage {
  if (raw === undefined || raw === null) {
    return { ...EMPTY_JETSTREAM_USAGE }
  }
  if (typeof raw === 'boolean') {
    // Legacy servers only reported on/off; usage counters came from /jsz.
    return { ...EMPTY_JETSTREAM_USAGE, enabled: raw }
  }

  const config = raw.config
  const stats: RawJetStreamStats = raw.stats ?? {}
  const limits = raw.limits ?? {}

  return {
    // The `jetstream` object only exists when JetStream is actually enabled.
    enabled: true,
    memory: toNumber(stats.memory),
    storage: toNumber(stats.storage),
    reservedMemory: toNumber(stats.reserved_memory),
    reservedStorage: toNumber(stats.reserved_storage),
    maxMemory: toNumber(config?.max_memory, toNumber(limits.max_memory)),
    maxStorage: toNumber(config?.max_storage, toNumber(limits.max_storage)),
    storeDir: toText(config?.store_dir),
    domain: toText(config?.domain),
    metaLeader: toText(raw.meta?.leader),
    metaClusterSize: toNumber(raw.meta?.cluster_size),
  }
}

/** Normalizes the `/varz` payload into the dashboard view model. */
export function normalizeVarz(raw: RawVarz): ServerOverview {
  const jetstream = normalizeVarzJetStream(raw.jetstream)

  return {
    serverId: toText(raw.server_id),
    serverName: toText(raw.server_name),
    version: toText(raw.version),
    goVersion: toText(raw.go),
    host: toText(raw.host),
    port: toNumber(raw.port),
    ip: toText(raw.ip),
    uptime: toText(raw.uptime),
    uptimeSeconds: parseGoDurationSeconds(raw.uptime) || secondsBetween(raw.start, raw.now),
    start: toText(raw.start),
    now: toText(raw.now),
    authRequired: toBoolean(raw.auth_required),
    tlsRequired: toBoolean(raw.tls_required),
    maxPayload: toNumber(raw.max_payload),
    maxConnections: toNumber(raw.max_connections),
    maxPending: toNumber(raw.max_pending),
    connections: toNumber(raw.connections),
    totalConnections: toNumber(raw.total_connections),
    subscriptions: toNumber(raw.subscriptions),
    routes: toNumber(raw.routes),
    remotes: toNumber(raw.remotes),
    leafnodes: toNumber(raw.leafnodes),
    gateways: toNumber(raw.gateways),
    inMsgs: toNumber(raw.in_msgs),
    outMsgs: toNumber(raw.out_msgs),
    inBytes: toNumber(raw.in_bytes),
    outBytes: toNumber(raw.out_bytes),
    slowConsumers: toNumber(raw.slow_consumers),
    staleConnections: toNumber(raw.stale_connections),
    memory: toNumber(raw.mem),
    cpu: toNumber(raw.cpu),
    cores: toNumber(raw.cores),
    clusterName: toText(raw.cluster?.name),
    clusterUrls: toStringArray(raw.cluster?.urls),
    monitoringPort: toNumber(raw.http_port),
    jetstream,
  }
}

/** Normalizes a single `ConnInfo` entry. */
export function normalizeConnection(raw: RawConnInfo): ConnectionEntry {
  return {
    cid: toNumber(raw.cid),
    name: toText(raw.name),
    kind: toText(raw.kind),
    type: toText(raw.type),
    ip: toText(raw.ip),
    port: toNumber(raw.port),
    uptime: toText(raw.uptime),
    uptimeSeconds: parseGoDurationSeconds(raw.uptime),
    idle: toText(raw.idle),
    idleSeconds: parseGoDurationSeconds(raw.idle),
    subscriptions: toNumber(raw.subscriptions, toNumber(raw.num_subs)),
    subscriptionList: toStringArray(raw.subscriptions_list),
    pendingBytes: toNumber(raw.pending_bytes),
    inMsgs: toNumber(raw.in_msgs),
    outMsgs: toNumber(raw.out_msgs),
    inBytes: toNumber(raw.in_bytes),
    outBytes: toNumber(raw.out_bytes),
    rtt: toText(raw.rtt),
    rttMs: parseGoDurationMs(raw.rtt),
    lang: toText(raw.lang),
    version: toText(raw.version),
    authorizedUser: toText(raw.authorized_user),
    account: toText(raw.account),
    start: toText(raw.start),
    lastActivity: toText(raw.last_activity),
    reason: toText(raw.reason),
  }
}

/** Normalizes the `/connz` payload. */
export function normalizeConnz(raw: RawConnz): ConnectionList {
  const connections = Array.isArray(raw.connections) ? raw.connections : []

  return {
    serverId: toText(raw.server_id),
    now: toText(raw.now),
    numConnections: toNumber(raw.num_connections, connections.length),
    total: toNumber(raw.total, connections.length),
    offset: toNumber(raw.offset),
    limit: toNumber(raw.limit),
    connections: connections.map(normalizeConnection),
  }
}

function normalizeSubscriptionEntry(raw: RawSubDetail): SubscriptionEntry {
  return {
    subject: toText(raw.subject),
    queue: toText(raw.qgroup),
    sid: toText(raw.sid),
    cid: toNumber(raw.cid),
    msgs: toNumber(raw.msgs),
    maxPending: toNumber(raw.max),
    account: toText(raw.account),
  }
}

/** Normalizes the `/subsz` payload. */
export function normalizeSubsz(raw: RawSubsz): SubscriptionList {
  const list = Array.isArray(raw.subscriptions_list) ? raw.subscriptions_list : []

  return {
    serverId: toText(raw.server_id),
    now: toText(raw.now),
    numSubs: toNumber(raw.num_subs),
    numCache: toNumber(raw.num_cache),
    numMatches: toNumber(raw.num_matches),
    numCacheHit: toNumber(raw.num_cache_hit),
    numCacheMiss: toNumber(raw.num_cache_miss),
    numOrphans: toNumber(raw.num_orphans),
    numWaiting: toNumber(raw.num_waiting),
    numPending: toNumber(raw.num_pending),
    numInserts: toNumber(raw.num_inserts),
    numRemoves: toNumber(raw.num_removes),
    total: toNumber(raw.total, list.length),
    offset: toNumber(raw.offset),
    limit: toNumber(raw.limit),
    subscriptions: list.map(normalizeSubscriptionEntry),
  }
}

function normalizeRouteEntry(raw: RawRouteInfo): RouteEntry {
  return {
    rid: toNumber(raw.rid),
    remoteId: toText(raw.remote_id),
    remoteName: toText(raw.remote_name),
    ip: toText(raw.ip),
    port: toNumber(raw.port),
    uptime: toText(raw.uptime),
    idle: toText(raw.idle),
    pendingBytes: toNumber(raw.pending_size),
    inMsgs: toNumber(raw.in_msgs),
    outMsgs: toNumber(raw.out_msgs),
    inBytes: toNumber(raw.in_bytes),
    outBytes: toNumber(raw.out_bytes),
    subscriptions: toNumber(raw.subscriptions),
    isConfigured: toBoolean(raw.is_configured),
    didSolicit: toBoolean(raw.did_solicit),
    account: toText(raw.account),
    compression: toText(raw.compression),
  }
}

/** Normalizes the `/routez` payload. */
export function normalizeRoutez(raw: RawRoutez): RouteList {
  const routes = Array.isArray(raw.routes) ? raw.routes : []

  return {
    serverId: toText(raw.server_id),
    serverName: toText(raw.server_name),
    numRoutes: toNumber(raw.num_routes, routes.length),
    routes: routes.map(normalizeRouteEntry),
  }
}

function normalizeLeafEntry(raw: RawLeafInfo): LeafNodeEntry {
  return {
    rlid: toNumber(raw.rlid),
    remoteId: toText(raw.remote_id),
    remoteName: toText(raw.remote_name),
    ip: toText(raw.ip),
    port: toNumber(raw.port),
    uptime: toText(raw.uptime),
    idle: toText(raw.idle),
    pendingBytes: toNumber(raw.pending_bytes),
    inMsgs: toNumber(raw.in_msgs),
    outMsgs: toNumber(raw.out_msgs),
    inBytes: toNumber(raw.in_bytes),
    outBytes: toNumber(raw.out_bytes),
    subscriptions: toNumber(raw.subscriptions),
    account: toText(raw.account),
  }
}

/** Normalizes the `/leafz` payload. */
export function normalizeLeafz(raw: RawLeafz): LeafNodeList {
  const leafnodes = Array.isArray(raw.leafnodes) ? raw.leafnodes : []

  return {
    serverId: toText(raw.server_id),
    numLeafnodes: toNumber(raw.num_leafnodes, leafnodes.length),
    leafnodes: leafnodes.map(normalizeLeafEntry),
  }
}

function normalizeGatewayEntry(raw: RawGatewayInfo): GatewayEntry {
  return {
    name: toText(raw.name),
    interestMode: toText(raw.interest_mode),
    host: toText(raw.host),
    port: toNumber(raw.port),
    url: toText(raw.url),
    rtt: toText(raw.rtt),
    uptime: toText(raw.uptime),
    idle: toText(raw.idle),
    pendingBytes: toNumber(raw.pending_size),
    inMsgs: toNumber(raw.in_msgs),
    outMsgs: toNumber(raw.out_msgs),
    inBytes: toNumber(raw.in_bytes),
    outBytes: toNumber(raw.out_bytes),
    subscriptions: toNumber(raw.subscriptions),
    accounts: toNumber(raw.accounts),
  }
}

/** Normalizes the `/gatewayz` payload. */
export function normalizeGatewayz(raw: RawGatewayz): GatewayList {
  const gateways = Array.isArray(raw.gateways) ? raw.gateways : []

  return {
    serverId: toText(raw.server_id),
    numGateways: toNumber(raw.num_gateways, gateways.length),
    gateways: gateways.map(normalizeGatewayEntry),
  }
}

function normalizeAccountEntry(raw: RawAccountzEntry): AccountEntry {
  return {
    name: toText(raw.name),
    id: toText(raw.id),
    connections: toNumber(raw.connections),
    leafnodes: toNumber(raw.leafnodes),
    subscriptions: toNumber(raw.subscriptions),
    subscriptionsCache: toNumber(raw.subscriptions_cache),
    totalMsgs: toNumber(raw.total_msgs_size),
    totalBytes: toNumber(raw.total_bytes_size),
    isSystem: toBoolean(raw.is_system),
    expired: toBoolean(raw.expired),
  }
}

/** Normalizes the `/accountz` payload. */
export function normalizeAccountz(raw: RawAccountz): AccountList {
  const details = Array.isArray(raw.account_detail) ? raw.account_detail : []

  return {
    serverId: toText(raw.server_id),
    now: toText(raw.now),
    accounts: details.map(normalizeAccountEntry),
  }
}

function normalizeConsumer(raw: RawConsumerInfo): StreamEntry['consumers'][number] {
  return {
    name: toText(raw.name),
    streamName: toText(raw.stream_name),
    created: toText(raw.created),
    numPending: toNumber(raw.num_pending),
    numAckPending: toNumber(raw.num_ack_pending),
    numRedelivered: toNumber(raw.num_redelivered),
    numWaiting: toNumber(raw.num_waiting),
    deliveredConsumerSeq: toNumber(raw.delivered?.consumer_seq),
    deliveredStreamSeq: toNumber(raw.delivered?.stream_seq),
    ackFloorConsumerSeq: toNumber(raw.ack_floor?.consumer_seq),
    ackFloorStreamSeq: toNumber(raw.ack_floor?.stream_seq),
    leader: toText(raw.cluster?.leader),
  }
}

function normalizeStream(raw: RawStreamDetail): StreamEntry {
  const consumers = Array.isArray(raw.consumer_detail) ? raw.consumer_detail : []
  const state = raw.state ?? {}

  return {
    name: toText(raw.name ?? raw.config?.name),
    created: toText(raw.created),
    subjects: toStringArray(raw.config?.subjects),
    storage: toText(raw.config?.storage),
    retention: toText(raw.config?.retention),
    replicas: toNumber(raw.config?.num_replicas),
    messages: toNumber(state.messages),
    bytes: toNumber(state.bytes),
    firstSeq: toNumber(state.first_seq),
    lastSeq: toNumber(state.last_seq),
    consumerCount: toNumber(state.consumer_count),
    numSubjects: toNumber(state.num_subjects),
    clusterLeader: toText(raw.cluster?.leader),
    consumers: consumers.map(normalizeConsumer),
  }
}

function normalizeJetStreamAccount(raw: RawAccountDetail): JetStreamAccountEntry {
  const streams = Array.isArray(raw.stream_detail) ? raw.stream_detail : []

  return {
    name: toText(raw.name),
    id: toText(raw.id),
    memory: toNumber(raw.memory),
    storage: toNumber(raw.storage),
    reservedMemory: toNumber(raw.reserved_memory),
    reservedStorage: toNumber(raw.reserved_storage),
    api: normalizeApiTotals(raw.api),
    streams: streams.map(normalizeStream),
  }
}

/** Normalizes the `/jsz` payload into the JetStream view model. */
export function normalizeJsz(raw: RawJsz): JetStreamOverview {
  const accounts = Array.isArray(raw.account_details) ? raw.account_details : []

  return {
    serverId: toText(raw.server_id),
    now: toText(raw.now),
    enabled: !toBoolean(raw.disabled),
    streams: toNumber(raw.streams),
    streamsLeader: toNumber(raw.streams_leader),
    consumers: toNumber(raw.consumers),
    consumersLeader: toNumber(raw.consumers_leader),
    messages: toNumber(raw.messages),
    bytes: toNumber(raw.bytes),
    totalAccounts: toNumber(raw.total),
    memory: toNumber(raw.memory),
    storage: toNumber(raw.storage),
    reservedMemory: toNumber(raw.reserved_memory),
    reservedStorage: toNumber(raw.reserved_storage),
    maxMemory: toNumber(raw.config?.max_memory),
    maxStorage: toNumber(raw.config?.max_storage),
    storeDir: toText(raw.config?.store_dir),
    domain: toText(raw.config?.domain),
    api: normalizeApiTotals(raw.api),
    metaLeader: toText(raw.meta_cluster?.leader),
    metaClusterSize: toNumber(raw.meta_cluster?.cluster_size),
    accounts: accounts.map(normalizeJetStreamAccount),
  }
}