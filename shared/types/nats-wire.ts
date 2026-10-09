/**
 * Wire types for the NATS server monitoring endpoint.
 *
 * Field names mirror `server/monitor.go` of nats-io/nats-server (main branch).
 * Every field is optional because the monitoring payload grows between minor
 * releases and we must stay forward compatible: a missing field normalizes to a
 * safe default instead of crashing the UI.
 *
 * An `unknown` index signature lets us accept the extra keys newer servers emit
 * without resorting to `any`.
 */

/** Loose JSON object as produced by the monitoring endpoint. */
export interface MonitoringPayload {
  [key: string]: unknown
}

/** JetStream limits exposed by `/varz` (`JetStreamVarz.limits`). */
export interface RawJetStreamLimits {
  max_memory?: number
  max_storage?: number
  max_streams?: number
  max_consumers?: number
  max_ack_pending?: number
  memory_max_stream_bytes?: number
  storage_max_stream_bytes?: number
  max_bytes_required?: boolean
  max_bytes_required_bool?: boolean
  [key: string]: unknown
}

/** JetStream API counters (`JetStreamAPIStats`). */
export interface RawJetStreamApiStats {
  level?: number
  total?: number
  errors?: number
  inflight?: number
}

/** JetStream usage counters (`JetStreamStats`). */
export interface RawJetStreamStats {
  memory?: number
  storage?: number
  reserved_memory?: number
  reserved_storage?: number
  accounts?: number
  ha_assets?: number
  api?: RawJetStreamApiStats
}

/** `JetStreamConfig` + `JetStreamStats` + limits, as nested under `/varz` `jetstream`. */
export interface RawJetStreamVarz {
  config?: {
    max_memory?: number
    max_storage?: number
    store_dir?: string
    sync_interval?: number
    domain?: string
    compress_ok?: boolean
  }
  stats?: RawJetStreamStats
  meta?: RawMetaClusterInfo
  limits?: RawJetStreamLimits
}

/**
 * `/varz` JetStream field. Servers before 2.11 emitted a plain boolean,
 * current servers emit the `JetStreamVarz` object. Both are accepted.
 */
export type RawVarzJetStream = boolean | RawJetStreamVarz

export interface RawMetaClusterInfo {
  name?: string
  leader?: string
  peer?: string
  cluster_size?: number
  quorum_needed?: number
  replica?: unknown[]
  [key: string]: unknown
}

/** `/varz` */
export interface RawVarz extends MonitoringPayload {
  server_id?: string
  server_name?: string
  version?: string
  proto?: number
  go?: string
  git_commit?: string
  host?: string
  port?: number
  auth_required?: boolean
  tls_required?: boolean
  tls_verify?: boolean
  ip?: string
  connect_urls?: string[]
  ws_connect_urls?: string[]
  max_connections?: number
  max_subscriptions?: number
  ping_interval?: number
  ping_max?: number
  http_host?: string
  http_port?: number
  http_base_path?: string
  https_port?: number
  max_control_line?: number
  max_payload?: number
  max_pending?: number
  start?: string
  now?: string
  uptime?: string
  mem?: number
  cores?: number
  gomaxprocs?: number
  cpu?: number
  connections?: number
  total_connections?: number
  routes?: number
  remotes?: number
  leafnodes?: number
  gateways?: number
  in_msgs?: number
  out_msgs?: number
  in_bytes?: number
  out_bytes?: number
  in_client_msgs?: number
  out_client_msgs?: number
  slow_consumers?: number
  stale_connections?: number
  stalled_clients?: number
  subscriptions?: number
  jetstream?: RawVarzJetStream
  cluster?: { name?: string, urls?: string[] }
  websocket?: { host?: string, port?: number, tls_required?: boolean }
  system_account?: string
  tags?: unknown
}

/** One entry of `/connz` (`ConnInfo`). */
export interface RawConnInfo extends MonitoringPayload {
  cid?: number
  kind?: string
  type?: string
  ip?: string
  port?: number
  start?: string
  last_activity?: string
  stop?: string
  reason?: string
  rtt?: string
  uptime?: string
  idle?: string
  pending_bytes?: number
  in_msgs?: number
  out_msgs?: number
  in_bytes?: number
  out_bytes?: number
  num_subs?: number
  subscriptions?: number
  name?: string
  lang?: string
  version?: string
  authorized_user?: string
  account?: string
  jwt?: string
  subscriptions_list?: string[]
  subscriptions_list_detail?: RawSubDetail[]
}

/** `/connz` */
export interface RawConnz extends MonitoringPayload {
  server_id?: string
  now?: string
  num_connections?: number
  total?: number
  offset?: number
  limit?: number
  connections?: RawConnInfo[]
}

/** `SubDetail`, used by `/subsz` and `/connz?subs=detail`. */
export interface RawSubDetail extends MonitoringPayload {
  account?: string
  subject?: string
  qgroup?: string
  sid?: string
  msgs?: number
  max?: number
  cid?: number
}

/** `SublistStats`, embedded in `/subsz`. */
export interface RawSublistStats extends MonitoringPayload {
  num_subs?: number
  num_cache?: number
  num_inserts?: number
  num_removes?: number
  num_matches?: number
  num_cache_hit?: number
  num_cache_miss?: number
  num_orphans?: number
  num_waiting?: number
  num_pending?: number
}

/** `/subsz` */
export interface RawSubsz extends RawSublistStats {
  server_id?: string
  now?: string
  total?: number
  offset?: number
  limit?: number
  subscriptions_list?: RawSubDetail[]
}

/** `RouteInfo`, one entry of `/routez`. */
export interface RawRouteInfo extends MonitoringPayload {
  rid?: number
  remote_id?: string
  remote_name?: string
  ip?: string
  port?: number
  start?: string
  last_activity?: string
  rtt?: string
  uptime?: string
  idle?: string
  pending_size?: number
  in_msgs?: number
  out_msgs?: number
  in_bytes?: number
  out_bytes?: number
  subscriptions?: number
  is_configured?: boolean
  did_solicit?: boolean
  account?: string
  compression?: string
}

/** `/routez` */
export interface RawRoutez extends MonitoringPayload {
  server_id?: string
  server_name?: string
  now?: string
  num_routes?: number
  routes?: RawRouteInfo[]
}

/** `LeafInfo`, one entry of `/leafz`. */
export interface RawLeafInfo extends MonitoringPayload {
  rlid?: number
  remote_id?: string
  remote_name?: string
  ip?: string
  port?: number
  start?: string
  last_activity?: string
  rtt?: string
  uptime?: string
  idle?: string
  pending_bytes?: number
  in_msgs?: number
  out_msgs?: number
  in_bytes?: number
  out_bytes?: number
  subscriptions?: number
  account?: string
}

/** `/leafz` */
export interface RawLeafz extends MonitoringPayload {
  server_id?: string
  num_leafnodes?: number
  leafnodes?: RawLeafInfo[]
}

/** `GatewayInfo`, one entry of `/gatewayz`. */
export interface RawGatewayInfo extends MonitoringPayload {
  name?: string
  interest_mode?: string
  host?: string
  port?: number
  url?: string
  last_attempt?: string
  rtt?: string
  uptime?: string
  idle?: string
  pending_size?: number
  in_msgs?: number
  out_msgs?: number
  in_bytes?: number
  out_bytes?: number
  subscriptions?: number
  accounts?: number
}

/** `/gatewayz` */
export interface RawGatewayz extends MonitoringPayload {
  server_id?: string
  now?: string
  num_gateways?: number
  gateways?: RawGatewayInfo[]
}

/** `/accountz`, one entry. */
export interface RawAccountzEntry extends MonitoringPayload {
  name?: string
  id?: string
  connections?: number
  leafnodes?: number
  subscriptions?: number
  subscriptions_cache?: number
  total_msgs_size?: number
  total_bytes_size?: number
  is_system?: boolean
  expired?: boolean
  imported?: unknown[]
  exported?: unknown[]
}

/** `/accountz` */
export interface RawAccountz extends MonitoringPayload {
  server_id?: string
  now?: string
  account_detail?: RawAccountzEntry[]
}

/** `StreamState`, nested under `/jsz` stream detail. */
export interface RawStreamState extends MonitoringPayload {
  messages?: number
  bytes?: number
  first_seq?: number
  last_seq?: number
  consumer_count?: number
  num_subjects?: number
  subjects?: number
  deleted?: number
  num_deleted?: number
  lost?: number
}

/** `ConsumerInfo`, nested under `/jsz` stream detail. */
export interface RawConsumerInfo extends MonitoringPayload {
  name?: string
  stream_name?: string
  created?: string
  num_pending?: number
  num_ack_pending?: number
  num_redelivered?: number
  num_waiting?: number
  num_pending_max?: number
  delivered?: {
    consumer_seq?: number
    stream_seq?: number
    last_active?: string
  }
  ack_floor?: {
    consumer_seq?: number
    stream_seq?: number
  }
  cluster?: { leader?: string, name?: string }
}

/** `StreamDetail`, nested under `/jsz` account detail. */
export interface RawStreamDetail extends MonitoringPayload {
  name?: string
  created?: string
  config?: {
    name?: string
    subjects?: string[]
    retention?: string
    max_msgs?: number
    max_bytes?: number
    max_age?: number
    storage?: string
    num_replicas?: number
    discard?: string
  }
  state?: RawStreamState
  consumer_detail?: RawConsumerInfo[]
  cluster?: { name?: string, leader?: string, replicas?: unknown[] }
}

/** `AccountDetail`, nested under `/jsz` `account_details`. */
export interface RawAccountDetail extends MonitoringPayload {
  name?: string
  id?: string
  memory?: number
  storage?: number
  reserved_memory?: number
  reserved_storage?: number
  accounts?: number
  api?: RawJetStreamApiStats
  stream_detail?: RawStreamDetail[]
}

/** `/jsz` */
export interface RawJsz extends MonitoringPayload {
  server_id?: string
  now?: string
  disabled?: boolean
  config?: {
    max_memory?: number
    max_storage?: number
    store_dir?: string
    sync_interval?: number
    domain?: string
    compress_ok?: boolean
  }
  meta_cluster?: RawMetaClusterInfo
  streams?: number
  streams_leader?: number
  consumers?: number
  consumers_leader?: number
  messages?: number
  bytes?: number
  total?: number
  memory?: number
  storage?: number
  reserved_memory?: number
  reserved_storage?: number
  api?: RawJetStreamApiStats
  account_details?: RawAccountDetail[]
}