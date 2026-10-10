/**
 * Shared plumbing for the `/api/monitor/**` routes: query validation, fetching,
 * normalizing and HTTP error mapping.
 *
 * Routes stay one-liners so all behaviour worth testing lives here.
 */

import { createError } from 'nuxt/server'
import type { MonitoringFailure } from '#shared/types/monitoring'
import type { NatsRuntimeConfig } from './nats-config'
import { MonitoringError, fetchMonitoringJson } from './nats-monitoring'

/**
 * The only part of the request event this module reads.
 *
 * The type is derived from `getQuery` itself rather than imported from `h3` or
 * `nuxt/schema`, so it stays correct whichever server builder supplies the
 * event and does not leak a specific event class into the call sites.
 */
type QueryEvent = Parameters<typeof getQuery>[0]

/**
 * Untrusted query input as handed over by `getQuery`.
 *
 * The runtime does not export its own `QueryObject`, so the structural shape is
 * spelled out here.
 */
export type MonitoringQuery = Record<string, string | string[] | undefined>

/** Declares which query parameters an endpoint accepts, and how to coerce them. */
export type QuerySpec = Record<string, 'number' | 'bool' | 'string'>

interface NumberRule {
  min?: number
  max?: number
}

const DEFAULT_NUMBER_RULES: Record<'number' | 'bool', NumberRule> = {
  number: { min: 0, max: 100_000 },
  bool: {},
}

function coerce(
  kind: 'number' | 'bool' | 'string',
  value: string,
  rules: NumberRule,
): string | null {
  if (kind === 'string') {
    return value
  }
  if (kind === 'bool') {
    if (value === 'true') {
      return 'true'
    }
    if (value === 'false') {
      return 'false'
    }
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  const { min, max } = rules
  if (min !== undefined && parsed < min) {
    return null
  }
  if (max !== undefined && parsed > max) {
    return null
  }
  return String(Math.trunc(parsed))
}

/**
 * Filters and coerces an untrusted query object down to the declared spec.
 *
 * Anything undeclared is dropped, so the proxy can only ever forward parameters
 * the upstream monitoring endpoint understands.
 */
export function sanitizeQuery(query: MonitoringQuery, spec: QuerySpec): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, kind] of Object.entries(spec)) {
    const raw = query[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value !== 'string' || value === '') {
      continue
    }

    const coerced = coerce(kind, value, DEFAULT_NUMBER_RULES[kind === 'string' ? 'number' : kind])

    if (coerced !== null) {
      result[key] = coerced
    }
  }

  return result
}

/**
 * Fetches a monitoring endpoint and normalizes it.
 *
 * `config` is injectable so tests can drive the client without touching env.
 */
export async function fetchNormalized<TWire, TView>(
  endpoint: string,
  query: Record<string, string>,
  normalize: (raw: TWire) => TView,
  config?: NatsRuntimeConfig,
): Promise<TView> {
  const raw = await fetchMonitoringJson<TWire>(endpoint, query, config)
  return normalize(raw)
}

/** Maps a normalized failure onto an HTTP status code. */
export function statusForFailure(failure: MonitoringFailure): number {
  if (failure.kind === 'unreachable') {
    return 503
  }
  if (failure.kind === 'timeout') {
    return 504
  }
  return 502
}

/**
 * Route entry point: sanitize, fetch, normalize, and convert any failure into
 * an HTTP error carrying `{ kind, message, hint }` so the UI can render an
 * actionable state instead of a stack trace.
 * `config` is injectable so tests can drive the client without a Nitro runtime.
 */
export async function handleMonitoring<TWire, TView>(
  query: MonitoringQuery,
  endpoint: string,
  spec: QuerySpec,
  normalize: (raw: TWire) => TView,
  config?: NatsRuntimeConfig,
): Promise<TView> {
  try {
    return await fetchNormalized<TWire, TView>(
      endpoint,
      sanitizeQuery(query, spec),
      normalize,
      config,
    )
  } catch (error) {
    if (error instanceof MonitoringError) {
      throw createError({
        statusCode: statusForFailure(error.failure),
        statusMessage: error.failure.message,
        message: error.failure.message,
        data: error.failure,
      })
    }
    throw error
  }
}

/** Convenience wrapper so route files read as `monitoringRoute(event, ...)`. */
export function monitoringRoute<TWire, TView>(
  event: QueryEvent,
  endpoint: string,
  spec: QuerySpec,
  normalize: (raw: TWire) => TView,
): Promise<TView> {
  return handleMonitoring<TWire, TView>(getQuery(event), endpoint, spec, normalize)
}
