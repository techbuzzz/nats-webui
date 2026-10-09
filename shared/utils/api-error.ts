/**
 * Converts transport errors into the normalized {@link MonitoringFailure} shape
 * the UI renders.
 *
 * The Nitro layer returns `createError({ data: failure })`, which ofetch exposes
 * as `error.data.data`. Anything else (offline, aborted, unexpected shape) is
 * coerced into a generic failure rather than leaking a raw stack trace.
 */

import type { MonitoringFailure } from '../types/monitoring'

const GENERIC_FAILURE: MonitoringFailure = {
  kind: 'unreachable',
  message: 'The request to the WebUI API failed.',
  hint: 'Check that the WebUI container is running and that NATS is reachable from it.',
  status: 502,
}

function isFailure(value: unknown): value is MonitoringFailure {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<MonitoringFailure>
  return typeof candidate.kind === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.hint === 'string'
}

function unwrapPayload(error: unknown): unknown {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const record = error as Record<string, unknown>
  // ofetch: parsed response body sits on `data`.
  const body = record.data
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as Record<string, unknown>).data
  }
  return undefined
}

/** Extracts a {@link MonitoringFailure} from an ofetch/FetchError, if present. */
export function toMonitoringFailure(error: unknown): MonitoringFailure {
  const payload = unwrapPayload(error)
  if (isFailure(payload)) {
    return payload
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return {
        ...GENERIC_FAILURE,
        kind: 'timeout',
        message: 'The request timed out before the server responded.',
        hint: 'Check the monitoring endpoint health and raise NUXT_NATS_MONITOR_TIMEOUT_MS if needed.',
        status: 504,
      }
    }
    return {
      ...GENERIC_FAILURE,
      message: `The request failed: ${error.message}`,
    }
  }

  return GENERIC_FAILURE
}

/** Best-effort human-readable message for arbitrary errors. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return 'Unknown error.'
}