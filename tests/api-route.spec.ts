import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMonitoring, sanitizeQuery, statusForFailure } from '../server/utils/monitoring-route'
import type { QuerySpec } from '../server/utils/monitoring-route'
import { resolveNatsConfig } from '../server/utils/nats-config'
import { normalizeVarz } from '../shared/utils/normalize'
import type { RawVarz } from '../shared/types/nats-wire'
import { MonitoringError } from '../server/utils/nats-monitoring'

/**
 * Exercises the `/api/monitor/**` route behaviour without booting Nitro:
 * `handleMonitoring` is exactly what `server/api/monitor/*.get.ts` delegates to.
 *
 * `TEST_CONFIG` is injected so the tests never touch the Nitro runtime, while
 * exercising the same code path the real routes use.
 */
const TEST_CONFIG = resolveNatsConfig({
  nats: { monitorUrl: 'http://nats.test:8222', monitorTimeoutMs: '5000' },
})

const CONNZ_SPEC: QuerySpec = {
  cid: 'number',
  limit: 'number',
  state: 'string',
  auth: 'bool',
  subs: 'bool',
}

describe('sanitizeQuery', () => {
  it('keeps declared parameters and coerces their types', () => {
    const result = sanitizeQuery({ cid: '7', auth: 'true', subs: 'false' }, CONNZ_SPEC)

    expect(result).toEqual({ cid: '7', auth: 'true', subs: 'false' })
  })

  it('drops undeclared parameters so nothing unexpected is forwarded upstream', () => {
    const result = sanitizeQuery({ cid: '7', evil: 'x', __proto__: 'y' }, CONNZ_SPEC)
    expect(result).toEqual({ cid: '7' })
  })

  it('drops non-numeric values for number parameters', () => {
    expect(sanitizeQuery({ cid: 'abc' }, CONNZ_SPEC)).toEqual({})
  })

  it('drops booleans that are not literally true or false', () => {
    expect(sanitizeQuery({ auth: 'yes' }, CONNZ_SPEC)).toEqual({})
  })

  it('truncates fractional numbers instead of rejecting them', () => {
    expect(sanitizeQuery({ limit: '10.9' }, CONNZ_SPEC)).toEqual({ limit: '10' })
  })

  it('rejects out-of-range numbers', () => {
    expect(sanitizeQuery({ cid: '-5' }, CONNZ_SPEC)).toEqual({})
  })

  it('takes the first value of a repeated parameter', () => {
    expect(sanitizeQuery({ cid: ['7', '9'] }, CONNZ_SPEC)).toEqual({ cid: '7' })
  })

  it('ignores empty values', () => {
    expect(sanitizeQuery({ cid: '', state: 'open' }, CONNZ_SPEC)).toEqual({ state: 'open' })
  })
})

describe('statusForFailure', () => {
  it('maps failure kinds onto HTTP statuses', () => {
    expect(statusForFailure({ kind: 'unreachable', message: 'm', hint: 'h', status: 0 })).toBe(503)
    expect(statusForFailure({ kind: 'timeout', message: 'm', hint: 'h', status: 0 })).toBe(504)
    expect(statusForFailure({ kind: 'bad-status', message: 'm', hint: 'h', status: 0 })).toBe(502)
    expect(statusForFailure({ kind: 'bad-payload', message: 'm', hint: 'h', status: 0 })).toBe(502)
  })
})

describe('handleMonitoring', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockJsonResponse(body: unknown): void {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
  }

  it('fetches, normalizes and returns the view model', async () => {
    mockJsonResponse({ server_id: 'NAB2', version: '2.12.0', connections: 4 } satisfies RawVarz)

    const result = await handleMonitoring<RawVarz, ReturnType<typeof normalizeVarz>>(
      {},
      'varz',
      {},
      normalizeVarz,
      TEST_CONFIG,
    )

    expect(result.serverId).toBe('NAB2')
    expect(result.connections).toBe(4)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('forwards only sanitized query parameters to the upstream URL', async () => {
    mockJsonResponse({ connections: [] })

    await handleMonitoring({ cid: '3', evil: 'drop-me' }, 'connz', CONNZ_SPEC, (raw: { connections?: unknown[] }) => raw, TEST_CONFIG)

    const requested = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(requested).toContain('cid=3')
    expect(requested).not.toContain('evil')
  })

  it('turns a monitoring outage into an HTTP error carrying the failure payload', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'varz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    const httpError = error as { statusCode?: number, data?: { kind?: string, hint?: string } }
    expect(httpError.statusCode).toBe(503)
    expect(httpError.data?.kind).toBe('unreachable')
    expect(httpError.data?.hint).toContain('NUXT_NATS_MONITOR_URL')
  })

  it('turns a non-JSON response into a bad-payload failure', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>not nats</html>', { status: 200 })) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'varz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)
    const httpError = error as { statusCode?: number, data?: { kind?: string } }

    expect(httpError.statusCode).toBe(502)
    expect(httpError.data?.kind).toBe('bad-payload')
  })

  it('reports a 404 from the monitoring endpoint with an actionable hint', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not found', { status: 404 })) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'subsz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)
    const httpError = error as { statusCode?: number, data?: { kind?: string, hint?: string } }

    expect(httpError.data?.kind).toBe('bad-status')
    expect(httpError.data?.hint).toContain('/subsz')
  })

  it('reports rejected credentials distinctly', async () => {
    globalThis.fetch = vi.fn(async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'varz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)
    const httpError = error as { data?: { kind?: string, hint?: string } }

    expect(httpError.data?.kind).toBe('bad-status')
    expect(httpError.data?.hint).toContain('NUXT_NATS_MONITOR_USER')
  })

  it('surfaces a request timeout as its own failure kind', async () => {
    globalThis.fetch = vi.fn(async () => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      throw error
    }) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'varz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)
    const httpError = error as { statusCode?: number, data?: { kind?: string } }

    expect(httpError.statusCode).toBe(504)
    expect(httpError.data?.kind).toBe('timeout')
  })

  it('rethrows non-monitoring errors untouched', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new MonitoringError({
        kind: 'unreachable',
        message: 'boom',
        hint: 'hint',
        status: 502,
      })
    }) as unknown as typeof fetch

    const error = await handleMonitoring({}, 'varz', {}, normalizeVarz, TEST_CONFIG).catch((caught: unknown) => caught)
    expect((error as { statusCode?: number }).statusCode).toBe(503)
  })
})