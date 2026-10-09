/** Central resolution of every NATS address used by the server layer.

/**
 * Central resolution of every NATS address used by the server layer.
 *
 * Nothing outside this module may read `process.env` for NATS settings or
 * hardcode `localhost:4222` / `:8222`. Route handlers resolve URLs through here,
 * so pointing the UI at a different server is a single env-var change.
 */
export interface NatsRuntimeConfig {
  /** Base URL of the NATS monitoring endpoint, e.g. `http://nats:8222`. */
  monitorUrl: string
  /** Optional HTTP basic-auth user for the monitoring endpoint. */
  monitorUser: string
  /** Optional HTTP basic-auth password for the monitoring endpoint. */
  monitorPassword: string
  /** Optional bearer token for the monitoring endpoint. */
  monitorToken: string
  /** Request timeout for monitoring calls, in milliseconds. */
  monitorTimeoutMs: number
  /** Base URL of the NATS client port, used by README/diagnostics only. */
  clientUrl: string
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Reads the NATS blocks out of an untyped runtime config.
 *
 * `runtimeConfig` is typed as a sealed record by Nitro, so the shape is
 * narrowed here from `unknown` rather than importing Nitro internal types.
 */
function readConfigBlock(config: unknown, key: string): Record<string, unknown> {
  if (!config || typeof config !== 'object') {
    return {}
  }
  const block = (config as Record<string, unknown>)[key]
  return block && typeof block === 'object' ? (block as Record<string, unknown>) : {}
}

/** Narrows the `runtimeConfig.nats` block into {@link NatsRuntimeConfig}. */
export function resolveNatsConfig(config: unknown): NatsRuntimeConfig {
  const nats = readConfigBlock(config, 'nats')

  return {
    monitorUrl: readString(nats.monitorUrl, 'http://nats:8222').replace(/\/+$/, ''),
    monitorUser: readString(nats.monitorUser),
    monitorPassword: readString(nats.monitorPassword),
    monitorToken: readString(nats.monitorToken),
    monitorTimeoutMs: readNumber(nats.monitorTimeoutMs, 8000),
    clientUrl: readString(nats.clientUrl, 'nats://nats:4222'),
  }
}

/** Current NATS configuration for this request. */
export function useNatsConfig(): NatsRuntimeConfig {
  return resolveNatsConfig(useRuntimeConfig())
}

/**
 * Builds the absolute URL for a monitoring endpoint, merging a validated query.
 *
 * `http_base_path` is not applied here: the base URL is operator-supplied and
 * may already include a path prefix for reverse-proxied deployments.
 */
export function buildMonitoringUrl(
  config: NatsRuntimeConfig,
  endpoint: string,
  query?: Record<string, string>,
): string {
  const url = new URL(`${config.monitorUrl}/${endpoint.replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

/**
 * Auth headers for the monitoring endpoint, if the operator configured any.
 * Returns a fresh object each call so headers are never shared or mutated.
 */
export function monitoringHeaders(config: NatsRuntimeConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (config.monitorToken !== '') {
    headers.Authorization = `Bearer ${config.monitorToken}`
  }
  else if (config.monitorUser !== '') {
    const credentials = Buffer.from(`${config.monitorUser}:${config.monitorPassword}`).toString('base64')
    headers.Authorization = `Basic ${credentials}`
  }

  return headers
}

/**
 * Public, non-secret runtime values handed to the browser.
 *
 * Only the WebSocket URL crosses the trust boundary — monitoring credentials
 * stay server-side and are never serialized into the page.
 */
export function publicNatsConfig(config: unknown): {
  websocketUrl: string
  connectionName: string
} {
  const nats = readConfigBlock(readConfigBlock(config, 'public'), 'nats')

  return {
    websocketUrl: readString(nats.websocketUrl, 'ws://localhost:8080'),
    connectionName: readString(nats.connectionName, 'nats-webui'),
  }
}