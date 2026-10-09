/**
 * Normalized view models produced by the parsing layer in `shared/utils/normalize.ts`.
 *
 * These are strict: every field is required, so components never deal with
 * `undefined` checks or optional chaining on server data. Both the Nitro routes
 * and the Vue components consume these types.
 */

/** Where the JetStream limits/usage came from. */
export interface JetStreamUsage {
  enabled: boolean
  /** Bytes currently held in the memory store. */
  memory: number
  /** Bytes currently held in the file store. */
  storage: number
  reservedMemory: number
  reservedStorage: number
  /** Configured ceilings, `0` when the server did not report one. */
  maxMemory: number
  maxStorage: number
  storeDir: string
  domain: string
  metaLeader: string
  metaClusterSize: number
}

export interface ServerOverview {
  serverId: string
  serverName: string
  version: string
  goVersion: string
  host: string
  port: number
  ip: string
  uptime: string
  uptimeSeconds: number
  start: string
  now: string
  authRequired: boolean
  tlsRequired: boolean
  maxPayload: number
  maxConnections: number
  maxPending: number
  connections: number
  totalConnections: number
  subscriptions: number
  routes: number
  remotes: number
  leafnodes: number
  gateways: number
  inMsgs: number
  outMsgs: number
  inBytes: number
  outBytes: number
  slowConsumers: number
  staleConnections: number
  memory: number
  cpu: number
  cores: number
  clusterName: string
  clusterUrls: string[]
  monitoringPort: number
  jetstream: JetStreamUsage
}

export interface ConnectionEntry {
  cid: number
  name: string
  kind: string
  type: string
  ip: string
  port: number
  uptime: string
  uptimeSeconds: number
  idle: string
  idleSeconds: number
  subscriptions: number
  subscriptionList: string[]
  pendingBytes: number
  inMsgs: number
  outMsgs: number
  inBytes: number
  outBytes: number
  /** Round-trip time as reported by the server, `''` when not measured. */
  rtt: string
  rttMs: number | null
  lang: string
  version: string
  authorizedUser: string
  account: string
  start: string
  lastActivity: string
  reason: string
}

export interface ConnectionList {
  serverId: string
  now: string
  numConnections: number
  total: number
  offset: number
  limit: number
  connections: ConnectionEntry[]
}

export interface SubscriptionEntry {
  subject: string
  queue: string
  sid: string
  cid: number
  msgs: number
  maxPending: number
  account: string
}

export interface SubscriptionList {
  serverId: string
  now: string
  numSubs: number
  numCache: number
  numMatches: number
  numCacheHit: number
  numCacheMiss: number
  numOrphans: number
  numWaiting: number
  numPending: number
  numInserts: number
  numRemoves: number
  total: number
  offset: number
  limit: number
  subscriptions: SubscriptionEntry[]
}

export interface RouteEntry {
  rid: number
  remoteId: string
  remoteName: string
  ip: string
  port: number
  uptime: string
  idle: string
  pendingBytes: number
  inMsgs: number
  outMsgs: number
  inBytes: number
  outBytes: number
  subscriptions: number
  isConfigured: boolean
  didSolicit: boolean
  account: string
  compression: string
}

export interface RouteList {
  serverId: string
  serverName: string
  numRoutes: number
  routes: RouteEntry[]
}

export interface LeafNodeEntry {
  rlid: number
  remoteId: string
  remoteName: string
  ip: string
  port: number
  uptime: string
  idle: string
  pendingBytes: number
  inMsgs: number
  outMsgs: number
  inBytes: number
  outBytes: number
  subscriptions: number
  account: string
}

export interface LeafNodeList {
  serverId: string
  numLeafnodes: number
  leafnodes: LeafNodeEntry[]
}

export interface GatewayEntry {
  name: string
  interestMode: string
  host: string
  port: number
  url: string
  rtt: string
  uptime: string
  idle: string
  pendingBytes: number
  inMsgs: number
  outMsgs: number
  inBytes: number
  outBytes: number
  subscriptions: number
  accounts: number
}

export interface GatewayList {
  serverId: string
  numGateways: number
  gateways: GatewayEntry[]
}

export interface AccountEntry {
  name: string
  id: string
  connections: number
  leafnodes: number
  subscriptions: number
  subscriptionsCache: number
  totalMsgs: number
  totalBytes: number
  isSystem: boolean
  expired: boolean
}

export interface AccountList {
  serverId: string
  now: string
  accounts: AccountEntry[]
}

export interface ApiTotals {
  level: number
  total: number
  errors: number
  inflight: number
}

export interface ConsumerEntry {
  name: string
  streamName: string
  created: string
  numPending: number
  numAckPending: number
  numRedelivered: number
  numWaiting: number
  deliveredConsumerSeq: number
  deliveredStreamSeq: number
  ackFloorConsumerSeq: number
  ackFloorStreamSeq: number
  leader: string
}

export interface StreamEntry {
  name: string
  created: string
  subjects: string[]
  storage: string
  retention: string
  replicas: number
  messages: number
  bytes: number
  firstSeq: number
  lastSeq: number
  consumerCount: number
  numSubjects: number
  clusterLeader: string
  consumers: ConsumerEntry[]
}

export interface JetStreamAccountEntry {
  name: string
  id: string
  memory: number
  storage: number
  reservedMemory: number
  reservedStorage: number
  api: ApiTotals
  streams: StreamEntry[]
}

export interface JetStreamOverview {
  serverId: string
  now: string
  enabled: boolean
  streams: number
  streamsLeader: number
  consumers: number
  consumersLeader: number
  messages: number
  bytes: number
  totalAccounts: number
  memory: number
  storage: number
  reservedMemory: number
  reservedStorage: number
  maxMemory: number
  maxStorage: number
  storeDir: string
  domain: string
  api: ApiTotals
  metaLeader: string
  metaClusterSize: number
  accounts: JetStreamAccountEntry[]
}

/**
 * Client-facing runtime configuration. Deliberately carries **no secrets**:
 * the browser needs the WebSocket URL, never the monitoring credentials.
 */
export interface NatsClientConfig {
  /** WebSocket URL the playground connects to, e.g. `ws://localhost:8080`. */
  websocketUrl: string
  /** Default connection name advertised in the NATS CONNECT frame. */
  connectionName: string
  /** True when the server requires authentication, so the UI can prompt early. */
  authRequired: boolean
  /** Client protocol version reported by the NATS server INFO frame, if known. */
  serverVersion: string
}

/** Normalized error shape surfaced to the UI when the monitoring endpoint fails. */
export type MonitoringFailureKind =
  | 'unreachable'
  | 'monitoring-disabled'
  | 'timeout'
  | 'bad-status'
  | 'bad-payload'

export interface MonitoringFailure {
  kind: MonitoringFailureKind
  message: string
  /** Operator-facing next step, e.g. "enable http_port in nats-server.conf". */
  hint: string
  status: number
}