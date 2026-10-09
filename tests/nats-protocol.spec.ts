import { describe, expect, it } from 'vitest'
import {
  NatsProtocolParser,
  encodeConnect,
  encodePing,
  encodePong,
  encodePub,
  encodePubText,
  encodeSub,
  encodeUnsub,
  parseInfo,
  validateSid,
  validateSubject,
} from '../shared/utils/nats-protocol'

const encoder = new TextEncoder()

function frame(text: string): Uint8Array {
  return encoder.encode(text)
}

describe('frame encoders', () => {
  it('encodes CONNECT with the connection identity', () => {
    const result = encodeConnect({ name: 'peanuts-ui', lang: 'typescript', version: '1.0.0' })

    expect(result.endsWith('\r\n')).toBe(true)
    expect(result.startsWith('CONNECT ')).toBe(true)

    const payload = JSON.parse(result.slice('CONNECT '.length, -2)) as Record<string, unknown>
    expect(payload.name).toBe('peanuts-ui')
    expect(payload.lang).toBe('typescript')
    expect(payload.verbose).toBe(false)
    expect(payload.tls_required).toBe(false)
  })

  it('omits credentials when none are configured', () => {
    const payload = JSON.parse(
      encodeConnect({ name: 'n', lang: 'typescript', version: '1' }).slice(8, -2),
    ) as Record<string, unknown>

    expect(payload.user).toBeUndefined()
    expect(payload.pass).toBeUndefined()
    expect(payload.auth_token).toBeUndefined()
  })

  it('includes credentials only when supplied', () => {
    const payload = JSON.parse(
      encodeConnect({ name: 'n', lang: 'typescript', version: '1', user: 'a', pass: 'b' }).slice(8, -2),
    ) as Record<string, unknown>

    expect(payload.user).toBe('a')
    expect(payload.pass).toBe('b')
  })

  it('encodes PING, PONG and SUB/UNSUB', () => {
    expect(encodePing()).toBe('PING\r\n')
    expect(encodePong()).toBe('PONG\r\n')
    expect(encodeSub('a.b', '1')).toBe('SUB a.b 1\r\n')
    expect(encodeSub('a.b', '1', 'workers')).toBe('SUB a.b workers 1\r\n')
    expect(encodeUnsub('1')).toBe('UNSUB 1\r\n')
    expect(encodeUnsub('1', 5)).toBe('UNSUB 1 5\r\n')
  })

  it('measures payload length in bytes, not characters', () => {
    // "é" is two bytes in UTF-8.
    const result = encodePubText('a.b', 'é')
    expect(result.startsWith('PUB a.b 2\r\n')).toBe(true)
    expect(result.endsWith('\r\n')).toBe(true)
  })

  it('adds a reply-to slot when present', () => {
    const result = encodePub('a.b', encoder.encode('hi'), '_INBOX.abc')
    expect(result.startsWith('PUB a.b _INBOX.abc 2\r\n')).toBe(true)
  })
})

describe('validators', () => {
  it('accepts wildcard and plain subjects', () => {
    expect(validateSubject('demo.ping').valid).toBe(true)
    expect(validateSubject('demo.>').valid).toBe(true)
  })

  it('rejects empty subjects and subjects with whitespace', () => {
    expect(validateSubject('  ').valid).toBe(false)
    expect(validateSubject('has space').valid).toBe(false)
    expect(validateSubject('has space').error).toBeTruthy()
  })

  it('bounds subscription ids', () => {
    expect(validateSid('1').valid).toBe(true)
    expect(validateSid('').valid).toBe(false)
    expect(validateSid('a'.repeat(33)).valid).toBe(false)
    expect(validateSid('has space').valid).toBe(false)
  })
})

describe('parseInfo', () => {
  it('parses the server INFO document', () => {
    const info = parseInfo('INFO {"server_id":"NAB2","version":"2.12.0","max_payload":1048576}')

    expect(info.server_id).toBe('NAB2')
    expect(info.version).toBe('2.12.0')
    expect(info.max_payload).toBe(1_048_576)
  })

  it('returns an empty object for malformed JSON instead of throwing', () => {
    expect(parseInfo('INFO {not json')).toEqual({})
  })
})

describe('NatsProtocolParser', () => {
  it('decodes INFO and PONG', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('INFO {"server_id":"NAB2"}\r\nPONG\r\n'))

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'info', info: { server_id: 'NAB2' } })
    expect(events[1]).toEqual({ type: 'pong' })
  })

  it('decodes a server PING so the client can answer', () => {
    const parser = new NatsProtocolParser()
    expect(parser.push(frame('PING\r\n'))).toEqual([{ type: 'ping' }])
  })

  it('decodes -ERR messages without the surrounding quotes', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame("-ERR 'Authorization Violation'\r\n"))

    expect(events).toEqual([{ type: 'err', message: 'Authorization Violation' }])
  })

  it('decodes a MSG without a reply subject', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('MSG demo.ping 1 5\r\nhello\r\n'))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'msg', subject: 'demo.ping', sid: '1', reply: '', text: 'hello' })
  })

  it('decodes a MSG carrying a reply subject', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('MSG demo.ping 1 _INBOX.abc 5\r\nhello\r\n'))

    expect(events[0]).toMatchObject({ type: 'msg', sid: '1', reply: '_INBOX.abc', text: 'hello' })
  })

  it('handles an empty payload', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('MSG demo.ping 1 0\r\n\r\n'))

    expect(events[0]).toMatchObject({ type: 'msg', text: '' })
  })

  it('decodes multi-byte payloads by byte length, not character count', () => {
    const parser = new NatsProtocolParser()
    // "héllo" is 6 bytes in UTF-8.
    const events = parser.push(frame('MSG demo.ping 1 6\r\nhéllo\r\n'))

    expect(events[0]).toMatchObject({ type: 'msg', text: 'héllo' })
  })

  it('reassembles a frame split across chunks', () => {
    const parser = new NatsProtocolParser()
    const bytes = frame('MSG demo.ping 1 5\r\nhello\r\n')

    expect(parser.push(bytes.slice(0, 12))).toEqual([])
    expect(parser.bufferedBytes).toBe(12)
    expect(parser.push(bytes.slice(12))).toHaveLength(1)
    expect(parser.bufferedBytes).toBe(0)
  })

  it('reassembles a split control frame', () => {
    const parser = new NatsProtocolParser()

    expect(parser.push(frame('PO'))).toEqual([])
    expect(parser.push(frame('NG\r\n'))).toEqual([{ type: 'pong' }])
  })

  it('decodes several frames arriving in one chunk', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('PING\r\nPONG\r\nMSG a.b 1 2\r\nhi\r\n'))

    expect(events.map(event => event.type)).toEqual(['ping', 'pong', 'msg'])
  })

  it('survives a payload that arrives before its trailing CRLF', () => {
    const parser = new NatsProtocolParser()

    expect(parser.push(frame('MSG demo.ping 1 5\r\nhel'))).toEqual([])
    const events = parser.push(frame('lo\r\n'))

    expect(events[0]).toMatchObject({ type: 'msg', text: 'hello' })
  })

  it('treats an unparseable frame as unknown and keeps parsing', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('MSG demo.ping 1 notanumber\r\nPONG\r\n'))

    expect(events[0]).toEqual({ type: 'unknown', line: 'MSG demo.ping 1 notanumber' })
    expect(events[1]).toEqual({ type: 'pong' })
  })

  it('resets buffered bytes on demand', () => {
    const parser = new NatsProtocolParser()
    parser.push(frame('MSG demo.ping 1 5\r\nhel'))

    expect(parser.bufferedBytes).toBeGreaterThan(0)
    parser.reset()
    expect(parser.bufferedBytes).toBe(0)
  })

  it('decodes an HMSG frame and its reply token', () => {
    const parser = new NatsProtocolParser()
    const events = parser.push(frame('HMSG demo.ping 1 _INBOX.abc 0 5\r\nhello\r\n'))

    expect(events[0]).toMatchObject({ type: 'msg', sid: '1', reply: '_INBOX.abc', text: 'hello' })
  })
})