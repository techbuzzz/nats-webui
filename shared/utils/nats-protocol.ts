/**
 * Minimal NATS client protocol codec for the browser playground.
 *
 * The playground talks straight to the NATS WebSocket endpoint (`ws://…:8080`)
 * using the documented text protocol, so it needs no runtime dependency on
 * `nats.ws`/`nats.ws` adapters. Everything here is pure: framing, decoding and
 * validation, with no socket or Vue involvement, which keeps it unit-testable.
 *
 * Reference: https://github.com/nats-io/nats-architecture-and-design/blob/main/03-IS/04-NATS-Protocol.md
 */

const CRLF = '\r\n'
const ENCODER = new TextEncoder()
const DECODER = new TextDecoder('utf-8', { fatal: false })

/** Subject tokens are whitespace-free; used to reject malformed input early. */
const SUBJECT_PATTERN = /^[^\s]*$/
/** Subscription ids must be a short, non-empty token without whitespace. */
const SID_PATTERN = /^[^\s]{1,32}$/

/** Server `INFO` document sent immediately after the socket opens. */
export interface NatsInfo {
  server_id?: string
  server_name?: string
  version?: string
  proto?: number
  host?: string
  port?: number
  max_payload?: number
  headers?: boolean
  auth_required?: boolean
  nonce?: string
  tls_required?: boolean
  connect_urls?: string[]
  [key: string]: unknown
}

/** Options accepted by the CONNECT frame we send. */
export interface NatsConnectOptions {
  serverId?: string
  name: string
  lang: string
  version: string
  user?: string
  pass?: string
  authToken?: string
}

export type NatsServerEvent =
  | { type: 'info', info: NatsInfo }
  | { type: 'msg', subject: string, sid: string, reply: string, payload: Uint8Array, text: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'ok' }
  | { type: 'err', message: string }
  | { type: 'unknown', line: string }

export interface ValidationResult {
  valid: boolean
  error: string
}

const VALID: ValidationResult = { valid: true, error: '' }

/** Validates a publish/subscribe subject before it reaches the socket. */
export function validateSubject(subject: string): ValidationResult {
  const trimmed = subject.trim()
  if (trimmed === '') {
    return { valid: false, error: 'Subject is required.' }
  }
  if (!SUBJECT_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Subject must not contain whitespace.' }
  }
  return VALID
}

/** Validates a subscription id used to correlate `SUB` and `UNSUB` frames. */
export function validateSid(sid: string): ValidationResult {
  if (!SID_PATTERN.test(sid)) {
    return { valid: false, error: 'Subscription id must be 1-32 characters without whitespace.' }
  }
  return VALID
}

function frame(line: string): string {
  return `${line}${CRLF}`
}

/** Encodes the `CONNECT` frame. Credentials are only included when supplied. */
export function encodeConnect(options: NatsConnectOptions): string {
  const payload: Record<string, unknown> = {
    verbose: false,
    pedantic: false,
    tls_required: false,
    name: options.name,
    lang: options.lang,
    version: options.version,
  }

  if (options.serverId) {
    payload.server_id = options.serverId
  }
  if (options.user !== undefined && options.user !== '') {
    payload.user = options.user
  }
  if (options.pass !== undefined && options.pass !== '') {
    payload.pass = options.pass
  }
  if (options.authToken !== undefined && options.authToken !== '') {
    payload.auth_token = options.authToken
  }

  return frame(`CONNECT ${JSON.stringify(payload)}`)
}

/** Encodes `PING`. */
export function encodePing(): string {
  return frame('PING')
}

/** Encodes `PONG`, our answer to a server `PING`. */
export function encodePong(): string {
  return frame('PONG')
}

/** Encodes `SUB <subject> [queue group] <sid>`. */
export function encodeSub(subject: string, sid: string, queueGroup?: string): string {
  const parts = queueGroup ? `SUB ${subject} ${queueGroup} ${sid}` : `SUB ${subject} ${sid}`
  return frame(parts)
}

/** Encodes `UNSUB <sid> [max_msgs]`. */
export function encodeUnsub(sid: string, maxMessages?: number): string {
  const parts = maxMessages && maxMessages > 0 ? `UNSUB ${sid} ${maxMessages}` : `UNSUB ${sid}`
  return frame(parts)
}

/** Encodes `PUB <subject> [reply-to] <#bytes>` followed by the payload. */
export function encodePub(subject: string, payload: Uint8Array, replyTo?: string): string {
  const header = replyTo
    ? `PUB ${subject} ${replyTo} ${payload.byteLength}`
    : `PUB ${subject} ${payload.byteLength}`
  return `${frame(header)}${DECODER.decode(payload)}${CRLF}`
}

/** Encodes a publish frame from a JS string, measuring its UTF-8 byte length. */
export function encodePubText(subject: string, body: string, replyTo?: string): string {
  return encodePub(subject, ENCODER.encode(body), replyTo)
}

/** Parses `INFO {...}` without throwing on malformed JSON. */
export function parseInfo(line: string): NatsInfo {
  const json = line.slice(line.indexOf(' ') + 1)
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as NatsInfo
    }
  } catch {
    // A malformed INFO is non-fatal: the socket still works, we just lose metadata.
  }
  return {}
}

function indexOfCrlf(buffer: Uint8Array): number {
  for (let i = 0; i < buffer.length - 1; i += 1) {
    if (buffer[i] === 13 && buffer[i + 1] === 10) {
      return i
    }
  }
  return -1
}

/**
 * Incremental protocol parser.
 *
 * Feed it raw socket chunks; it buffers partial frames and returns only the
 * events that are fully decodable. Safe to reuse across reconnects by calling
 * `reset()`.
 */
export class NatsProtocolParser {
  private buffer: Uint8Array = new Uint8Array(0)

  /** Number of bytes buffered awaiting more input, for diagnostics. */
  get bufferedBytes(): number {
    return this.buffer.byteLength
  }

  /** Drops any partially received frame. Call before reusing after a drop. */
  reset(): void {
    this.buffer = new Uint8Array(0)
  }

  /** Consumes a chunk and returns every event it completes. */
  push(chunk: Uint8Array): NatsServerEvent[] {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength)
    merged.set(this.buffer, 0)
    merged.set(chunk, this.buffer.byteLength)
    this.buffer = merged

    const events: NatsServerEvent[] = []
    let consumed = 0

    for (;;) {
      const crlf = indexOfCrlf(this.buffer.subarray(consumed))
      if (crlf === -1) {
        break
      }

      const line = DECODER.decode(this.buffer.subarray(consumed, consumed + crlf))
      const tokens = line.split(' ')

      // `MSG <subject> <sid> [reply] <#bytes>` and `HMSG <subject> <sid>
      // [reply] <#hdr> <#total>` both end with a byte count for the payload.
      if (tokens[0] === 'MSG' || tokens[0] === 'HMSG') {
        const isHeader = tokens[0] === 'HMSG'
        const byteCount = Number(isHeader ? tokens[5] : tokens[tokens.length - 1])

        if (!Number.isInteger(byteCount) || byteCount < 0) {
          // Unparseable frame: drop the line and keep going.
          events.push({ type: 'unknown', line })
          consumed += crlf + 2
          continue
        }

        const payloadStart = consumed + crlf + 2
        const payloadEnd = payloadStart + byteCount
        // Payload plus its trailing CRLF must have arrived.
        if (this.buffer.byteLength < payloadEnd + 2) {
          break
        }

        const payload = this.buffer.slice(payloadStart, payloadEnd)
        // A reply-to token is present when the frame has one more token than the
        // minimum for its kind (MSG: 4, HMSG: 5).
        const hasReply = tokens.length >= (isHeader ? 6 : 5)
        events.push({
          type: 'msg',
          subject: tokens[1] ?? '',
          sid: tokens[2] ?? '',
          reply: hasReply ? (tokens[3] ?? '') : '',
          payload,
          text: DECODER.decode(payload),
        })
        consumed = payloadEnd + 2
        continue
      }

      switch (tokens[0]) {
        case 'INFO':
          events.push({ type: 'info', info: parseInfo(line) })
          break
        case 'PING':
          events.push({ type: 'ping' })
          break
        case 'PONG':
          events.push({ type: 'pong' })
          break
        case '+OK':
          events.push({ type: 'ok' })
          break
        case '-ERR':
          events.push({ type: 'err', message: line.slice(5).replace(/^'/, '').replace(/'$/, '') })
          break
        default:
          events.push({ type: 'unknown', line })
      }
      consumed += crlf + 2
    }

    this.buffer = this.buffer.slice(consumed)
    return events
  }
}