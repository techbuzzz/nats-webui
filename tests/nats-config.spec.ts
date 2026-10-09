import { describe, expect, it } from 'vitest'
import {
  buildMonitoringUrl,
  monitoringHeaders,
  publicNatsConfig,
  resolveNatsConfig,
} from '../server/utils/nats-config'
import {
  formatBytes,
  formatCpu,
  formatDuration,
  formatRtt,
} from '../shared/utils/format'
import { toErrorMessage, toMonitoringFailure } from '../shared/utils/api-error'

describe('resolveNatsConfig', () => {
  it('falls back to compose-network defaults when env is unset', () => {
    const config = resolveNatsConfig({ nats: {} })

    expect(config.monitorUrl).toBe('http://nats:8222')
    expect(config.monitorTimeoutMs).toBe(8000)
    expect(config.monitorUser).toBe('')
  })

  it('reads values from the runtime config block', () => {
    const config = resolveNatsConfig({
      nats: {
        monitorUrl: 'http://nats.internal:9333',
        monitorUser: 'ops',
        monitorPassword: 'secret',
        monitorTimeoutMs: '2500',
      },
    })

    expect(config.monitorUrl).toBe('http://nats.internal:9333')
    expect(config.monitorUser).toBe('ops')
    expect(config.monitorPassword).toBe('secret')
    expect(config.monitorTimeoutMs).toBe(2500)
  })

  it('strips a trailing slash so paths do not double up', () => {
    expect(resolveNatsConfig({ nats: { monitorUrl: 'http://nats:8222/' } }).monitorUrl).toBe('http://nats:8222')
  })

  it('survives a missing or malformed config block', () => {
    expect(resolveNatsConfig(undefined).monitorUrl).toBe('http://nats:8222')
    expect(resolveNatsConfig({ nats: 'oops' }).monitorUrl).toBe('http://nats:8222')
  })

  it('ignores a non-positive timeout', () => {
    expect(resolveNatsConfig({ nats: { monitorTimeoutMs: '0' } }).monitorTimeoutMs).toBe(8000)
  })
})

describe('buildMonitoringUrl', () => {
  const config = resolveNatsConfig({ nats: { monitorUrl: 'http://nats:8222' } })

  it('builds an endpoint URL without hardcoded hosts elsewhere', () => {
    expect(buildMonitoringUrl(config, 'varz')).toBe('http://nats:8222/varz')
  })

  it('tolerates a leading slash on the endpoint', () => {
    expect(buildMonitoringUrl(config, '/varz')).toBe('http://nats:8222/varz')
  })

  it('appends the query parameters', () => {
    expect(buildMonitoringUrl(config, 'connz', { cid: '3', auth: 'true' }))
      .toBe('http://nats:8222/connz?cid=3&auth=true')
  })

  it('preserves a base path for reverse-proxied deployments', () => {
    const proxied = resolveNatsConfig({ nats: { monitorUrl: 'http://nats:8222/nats' } })
    expect(buildMonitoringUrl(proxied, 'varz')).toBe('http://nats:8222/nats/varz')
  })
})

describe('monitoringHeaders', () => {
  it('requests JSON', () => {
    expect(monitoringHeaders(resolveNatsConfig({})).Accept).toBe('application/json')
  })

  it('adds a bearer token when configured', () => {
    const headers = monitoringHeaders(resolveNatsConfig({ nats: { monitorToken: 'tok' } }))
    expect(headers.Authorization).toBe('Bearer tok')
  })

  it('adds basic auth when a user is configured', () => {
    const headers = monitoringHeaders(resolveNatsConfig({ nats: { monitorUser: 'ops', monitorPassword: 'pw' } }))
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('ops:pw').toString('base64')}`)
  })

  it('prefers the token over basic auth', () => {
    const headers = monitoringHeaders(resolveNatsConfig({
      nats: { monitorToken: 'tok', monitorUser: 'ops', monitorPassword: 'pw' },
    }))
    expect(headers.Authorization).toBe('Bearer tok')
  })

  it('never emits an Authorization header without credentials', () => {
    expect(monitoringHeaders(resolveNatsConfig({})).Authorization).toBeUndefined()
  })
})

describe('publicNatsConfig', () => {
  it('exposes only the WebSocket settings, never credentials', () => {
    const config = publicNatsConfig({
      nats: { monitorPassword: 'top-secret' },
      public: { nats: { websocketUrl: 'ws://localhost:8080', connectionName: 'ui' } },
    })

    expect(config).toEqual({ websocketUrl: 'ws://localhost:8080', connectionName: 'ui' })
    expect(JSON.stringify(config)).not.toContain('top-secret')
  })

  it('falls back to a browser-reachable default', () => {
    expect(publicNatsConfig({}).websocketUrl).toBe('ws://localhost:8080')
  })
})

describe('formatting helpers', () => {
  it('formats byte counts with binary units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(1_048_576)).toBe('1.0 MiB')
    expect(formatBytes(-2048)).toBe('-2.0 KiB')
  })

  it('formats durations compactly', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(3723)).toBe('1h 2m 3s')
    expect(formatDuration(90061)).toBe('1d 1h 1m 1s')
  })

  it('formats CPU as a percentage of available cores', () => {
    expect(formatCpu(2, 4)).toBe('50.0%')
    expect(formatCpu(1, 0)).toBe('0%')
  })

  it('shows a dash for an unmeasured RTT', () => {
    expect(formatRtt(null)).toBe('—')
    expect(formatRtt(1.2345)).toBe('1.234 ms')
  })
})

describe('toMonitoringFailure', () => {
  it('extracts the failure payload the Nitro layer sets', () => {
    const failure = {
      kind: 'unreachable',
      message: 'Could not reach NATS.',
      hint: 'Check NUXT_NATS_MONITOR_URL.',
      status: 503,
    }
    const error = Object.assign(new Error('fetch failed'), { data: { statusCode: 503, data: failure } })

    expect(toMonitoringFailure(error)).toEqual(failure)
  })

  it('classifies an aborted request as a timeout', () => {
    const error = new Error('aborted')
    error.name = 'AbortError'

    expect(toMonitoringFailure(error).kind).toBe('timeout')
  })

  it('falls back to a generic failure for unknown errors', () => {
    expect(toMonitoringFailure('boom').kind).toBe('unreachable')
    expect(toMonitoringFailure(undefined).kind).toBe('unreachable')
  })

  it('never exposes a raw stack trace as the message', () => {
    const error = new Error('connection refused')
    const failure = toMonitoringFailure(error)

    expect(failure.message).toContain('connection refused')
    expect(failure.hint).not.toBe('')
  })

  it('extracts a message from arbitrary errors', () => {
    expect(toErrorMessage(new Error('nope'))).toBe('nope')
    expect(toErrorMessage('nope')).toBe('Unknown error.')
  })
})