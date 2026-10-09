/** Presentation helpers shared by components. Pure and framework-free. */

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const

/** Formats a byte count with binary units, e.g. `1.5 MiB`. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes === 0) {
    return '0 B'
  }
  const sign = bytes < 0 ? '-' : ''
  let value = Math.abs(bytes)
  let unitIndex = 0

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const decimals = unitIndex === 0 ? 0 : fractionDigits
  return `${sign}${value.toFixed(decimals)} ${BYTE_UNITS[unitIndex]}`
}

/** Formats a plain number with locale-independent thousands separators. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '0'
}

/** Formats a seconds count as a compact `1d 2h 3m` style duration. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days}d`)
  }
  if (days > 0 || hours > 0) {
    parts.push(`${hours}h`)
  }
  if (days > 0 || hours > 0 || minutes > 0) {
    parts.push(`${minutes}m`)
  }
  parts.push(`${rest}s`)

  return parts.join(' ')
}

/** Formats a fraction (`cpu` in `/varz` is 0..n cores) as a percentage. */
export function formatCpu(cpu: number, cores: number): string {
  if (!Number.isFinite(cpu) || cores <= 0) {
    return '0%'
  }
  return `${((cpu / cores) * 100).toFixed(1)}%`
}

/** Formats a millisecond RTT value, or an em dash when unmeasured. */
export function formatRtt(rttMs: number | null): string {
  if (rttMs === null || !Number.isFinite(rttMs)) {
    return '—'
  }
  return `${rttMs.toFixed(3)} ms`
}

/** Escapes a value for safe display inside a `<pre>` block (used by tooltips). */
export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) {
    return value
  }
  const half = Math.floor((max - 1) / 2)
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`
}