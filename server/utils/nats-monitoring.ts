/**
 * Typed client for the NATS monitoring endpoint.
 *
 * Responsibilities:
 *  - fetch a monitoring endpoint with a timeout,
 *  - turn every failure mode into a {@link MonitoringFailure} with an actionable hint,
 *  - never leak credentials into logs or client responses.
 */

import type { MonitoringFailure, MonitoringFailureKind } from '#shared/types/monitoring'
import { buildMonitoringUrl, monitoringHeaders, useNatsConfig } from './nats-config'
import type { NatsRuntimeConfig } from './nats-config'

/** Error carrying a normalized, operator-facing description of a failure. */
export class MonitoringError extends Error {
  readonly failure: MonitoringFailure

  constructor(failure: MonitoringFailure) {
    super(failure.message)
    this.name = 'MonitoringError'
    this.failure = failure
  }
}

function failure(
  kind: MonitoringFailureKind,
  message: string,
  hint: string,
  status = 502,
): MonitoringError {
  return new MonitoringError({ kind, message, hint, status })
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/**
 * Fetches a monitoring endpoint as JSON.
 *
 * Distinguishes "server not listening" from "listening but monitoring disabled"
 * so the UI can say which knob to turn rather than showing a generic failure.
 */
export async function fetchMonitoringJson<T>(
  endpoint: string,
  query?: Record<string, string>,
  config: NatsRuntimeConfig = useNatsConfig(),
): Promise<T> {
  const url = buildMonitoringUrl(config, endpoint, query)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.monitorTimeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      headers: monitoringHeaders(config),
      signal: controller.signal,
    })
  }
  catch (error) {
    if (isAbortError(error)) {
      throw failure(
        'timeout',
        `Timed out after ${config.monitorTimeoutMs}ms waiting for the NATS monitoring endpoint.`,
        'The server is reachable but slow. Raise NUXT_NATS_MONITOR_TIMEOUT_MS or check the server load.',
        504,
      )
    }
    throw failure(
      'unreachable',
      `Could not reach the NATS monitoring endpoint at ${config.monitorUrl}.`,
      'Check that nats-server is running and that NUXT_NATS_MONITOR_URL points at its http_port.',
      502,
    )
  }
  finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw failure(
        'bad-status',
        `The monitoring endpoint rejected our credentials (HTTP ${response.status}).`,
        'Set NUXT_NATS_MONITOR_USER and NUXT_NATS_MONITOR_PASSWORD, or the monitoring token.',
        502,
      )
    }
    throw failure(
      'bad-status',
      `The monitoring endpoint returned HTTP ${response.status} for /${endpoint}.`,
      response.status === 404
        ? 'The path is unknown. Note that NATS exposes /subsz (not /subz) and requires http_port to be enabled.'
        : 'Inspect the response body from the monitoring endpoint directly.',
      502,
    )
  }

  try {
    return (await response.json()) as T
  }
  catch {
    throw failure(
      'bad-payload',
      `The monitoring endpoint did not return valid JSON for /${endpoint}.`,
      'Something other than nats-server may be listening on the monitoring port.',
      502,
    )
  }
}