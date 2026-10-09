import { describe, expect, it } from 'vitest'
import {
  parseGoDurationMs,
  parseGoDurationSeconds,
  secondsBetween,
  toBoolean,
  toNumber,
  toStringArray,
  toText,
} from '../shared/utils/normalize'

describe('primitive coercion', () => {
  it('accepts finite numbers and rejects everything else', () => {
    expect(toNumber(42)).toBe(42)
    expect(toNumber('42')).toBe(42)
    expect(toNumber(0)).toBe(0)
    expect(toNumber(Number.NaN, -1)).toBe(-1)
    expect(toNumber(Number.POSITIVE_INFINITY, -1)).toBe(-1)
    expect(toNumber('abc', 7)).toBe(7)
    expect(toNumber(undefined)).toBe(0)
  })

  it('reads strings only', () => {
    expect(toText('hello')).toBe('hello')
    expect(toText(123)).toBe('')
    expect(toText(undefined, 'fallback')).toBe('fallback')
  })

  it('treats numeric booleans as false/true', () => {
    expect(toBoolean(true)).toBe(true)
    expect(toBoolean(false)).toBe(false)
    expect(toBoolean(1)).toBe(true)
    expect(toBoolean(0)).toBe(false)
    expect(toBoolean('yes')).toBe(false)
  })

  it('keeps only string members of an array', () => {
    expect(toStringArray(['a', 'b'])).toEqual(['a', 'b'])
    expect(toStringArray(['a', 1, null, 'b'])).toEqual(['a', 'b'])
    expect(toStringArray('not-an-array')).toEqual([])
    expect(toStringArray(undefined)).toEqual([])
  })
})

describe('parseGoDurationSeconds', () => {
  it('parses single-unit durations', () => {
    expect(parseGoDurationSeconds('0s')).toBe(0)
    expect(parseGoDurationSeconds('1s')).toBe(1)
    expect(parseGoDurationSeconds('90s')).toBe(90)
    expect(parseGoDurationSeconds('2m')).toBe(120)
    expect(parseGoDurationSeconds('1h')).toBe(3600)
    expect(parseGoDurationSeconds('1d')).toBe(86400)
  })

  it('parses compound durations as NATS reports them for uptime', () => {
    expect(parseGoDurationSeconds('1h2m3s')).toBe(3723)
    expect(parseGoDurationSeconds('2d3h4m5s')).toBe(183845)
  })

  it('parses fractional and sub-second units used for RTT', () => {
    expect(parseGoDurationSeconds('1.5ms')).toBeCloseTo(0.0015, 9)
    expect(parseGoDurationSeconds('250us')).toBeCloseTo(0.00025, 9)
    expect(parseGoDurationSeconds('1.5s')).toBeCloseTo(1.5, 9)
  })

  it('returns zero for junk instead of throwing', () => {
    expect(parseGoDurationSeconds('')).toBe(0)
    expect(parseGoDurationSeconds('later')).toBe(0)
    expect(parseGoDurationSeconds(undefined)).toBe(0)
  })
})

describe('parseGoDurationMs', () => {
  it('converts to milliseconds', () => {
    expect(parseGoDurationMs('1.234ms')).toBeCloseTo(1.234, 6)
    expect(parseGoDurationMs('2s')).toBe(2000)
  })

  it('reports "not measured" as null', () => {
    expect(parseGoDurationMs('0s')).toBeNull()
    expect(parseGoDurationMs('')).toBeNull()
    expect(parseGoDurationMs(undefined)).toBeNull()
  })
})

describe('secondsBetween', () => {
  it('computes the delta between two RFC 3339 timestamps', () => {
    expect(secondsBetween('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')).toBe(60)
  })

  it('never returns a negative delta', () => {
    expect(secondsBetween('2026-01-01T00:01:00Z', '2026-01-01T00:00:00Z')).toBe(0)
  })

  it('returns zero for unparseable input', () => {
    expect(secondsBetween('nope', '2026-01-01T00:00:00Z')).toBe(0)
  })
})