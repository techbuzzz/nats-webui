/**
 * Browser-side NATS WebSocket connection for the playground.
 *
 * Speaks the NATS protocol directly (see `shared/utils/nats-protocol.ts`) over
 * the WebSocket endpoint, so publish and request/reply never traverse the
 * monitoring port.
 */

import {
  NatsProtocolParser,
  encodeConnect,
  encodePing,
  encodePong,
  encodePubText,
  encodeSub,
  encodeUnsub,
  validateSubject,
} from '#shared/utils/nats-protocol'
import type { NatsInfo, NatsServerEvent } from '#shared/utils/nats-protocol'
import { toErrorMessage } from '#shared/utils/api-error'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface PlaygroundLogEntry {
  id: number
  direction: 'in' | 'out' | 'system'
  at: string
  label: string
  text: string
}

export interface RequestOutcome {
  ok: boolean
  payload: string
  elapsedMs: number
  error: string
}

export interface NatsConnectionOptions {
  url: string
  connectionName: string
  user: string
  password: string
  authToken: string
}

const CLIENT_VERSION = '1.0.0'
const CLIENT_LANG = 'typescript'
const REQUEST_TIMEOUT_MS = 5000
const PONG_TIMEOUT_MS = 5000

function randomToken(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('')
}

export function useNatsConnection() {
  const state = ref<ConnectionState>('idle')
  const serverInfo = ref<NatsInfo>({})
  const lastError = ref('')
  const closeReason = ref('')
  const log = ref<PlaygroundLogEntry[]>([])
  /** Subject the playground subscribes to, if any. */
  const subscribedSubject = ref('')

  let socket: WebSocket | null = null
  let parser: NatsProtocolParser | null = null
  let sidCounter = 0
  let logCounter = 0
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let pendingRequest: {
    sid: string
    startedAt: number
    resolve: (value: RequestOutcome) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  const isConnected = computed(() => state.value === 'connected')

  function append(direction: PlaygroundLogEntry['direction'], label: string, text: string): void {
    logCounter += 1
    log.value = [
      ...log.value.slice(-199),
      {
        id: logCounter,
        direction,
        at: new Date().toISOString(),
        label,
        text,
      },
    ]
  }

  function send(frame: string, label: string): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      lastError.value = 'The WebSocket is not open.'
      return false
    }
    socket.send(frame)
    append('out', label, frame.length > 240 ? `${frame.slice(0, 240)}…` : frame)
    return true
  }

  function nextSid(): string {
    sidCounter += 1
    return `sid${sidCounter}`
  }

  function handleEvents(events: NatsServerEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'info':
          serverInfo.value = event.info
          append('in', 'INFO', JSON.stringify(event.info))
          break

        case 'msg':
          append('in', `MSG ${event.subject}`, event.text)
          if (pendingRequest && event.sid === pendingRequest.sid) {
            clearTimeout(pendingRequest.timer)
            pendingRequest.resolve({
              ok: true,
              payload: event.text,
              elapsedMs: Date.now() - pendingRequest.startedAt,
              error: '',
            })
            pendingRequest = null
          }
          break

        case 'ping':
          // Keep-alive from the server: acknowledge immediately.
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(encodePong())
          }
          break

        case 'pong':
          if (pongTimer !== null) {
            clearTimeout(pongTimer)
            pongTimer = null
          }
          state.value = 'connected'
          append('system', 'PONG', 'Handshake complete.')
          break

        case 'ok':
          break

        case 'err':
          lastError.value = event.message
          state.value = 'error'
          append('system', '-ERR', event.message)
          break

        case 'unknown':
          append('system', 'unknown', event.line)
          break
      }
    }
  }

  function failConnection(message: string): void {
    lastError.value = message
    state.value = 'error'
    append('system', 'error', message)
  }

  function connect(options: NatsConnectionOptions): void {
    if (!import.meta.client) {
      return
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    if (options.connectionName.trim() === '') {
      failConnection('The connection name must not be empty.')
      return
    }

    lastError.value = ''
    closeReason.value = ''
    state.value = 'connecting'
    append('system', 'connect', `Opening ${options.url}`)

    parser = new NatsProtocolParser()

    try {
      socket = new WebSocket(options.url)
    }
    catch (error) {
      failConnection(toErrorMessage(error))
      return
    }

    socket.binaryType = 'arraybuffer'

    socket.onopen = () => {
      append('system', 'socket', 'Socket open; sending CONNECT.')
      const frame = encodeConnect({
        name: options.connectionName,
        lang: CLIENT_LANG,
        version: CLIENT_VERSION,
        user: options.user,
        pass: options.password,
        authToken: options.authToken,
      })
      // Credentials go out on the wire only; never logged.
      socket?.send(frame)
      append('out', 'CONNECT', 'CONNECT {...}')

      pongTimer = setTimeout(() => {
        failConnection('Timed out waiting for PONG. The server accepted the socket but not the CONNECT frame.')
      }, PONG_TIMEOUT_MS)

      socket?.send(encodePing())
    }

    socket.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (!parser) {
        return
      }
      const chunk = typeof event.data === 'string' ? new TextEncoder().encode(event.data) : new Uint8Array(event.data)
      handleEvents(parser.push(chunk))
    }

    socket.onerror = () => {
      failConnection('WebSocket error. The endpoint may be unreachable, or the URL scheme may be wrong (ws:// vs wss://).')
    }

    socket.onclose = (event: CloseEvent) => {
      if (pongTimer !== null) {
        clearTimeout(pongTimer)
        pongTimer = null
      }
      if (pendingRequest) {
        clearTimeout(pendingRequest.timer)
        pendingRequest.resolve({ ok: false, payload: '', elapsedMs: 0, error: 'Connection closed before a reply arrived.' })
        pendingRequest = null
      }

      closeReason.value = event.reason === '' ? `code ${event.code}` : event.reason
      state.value = 'disconnected'
      subscribedSubject.value = ''
      append('system', 'close', `Disconnected (${closeReason.value}).`)
    }
  }

  function disconnect(): void {
    if (socket) {
      // Closing without a prior CONNECT teardown is enough for the playground.
      socket.close(1000, 'closed by operator')
    }
    socket = null
    parser = null
    state.value = 'disconnected'
  }

  /** Publishes a payload on a subject. Returns an error string, or '' on success. */
  function publish(subject: string, body: string): string {
    const validation = validateSubject(subject)
    if (!validation.valid) {
      return validation.error
    }
    return send(encodePubText(subject.trim(), body), `PUB ${subject.trim()}`) ? '' : 'Not connected.'
  }

  /** Subscribes to a subject and streams incoming messages into the log. */
  function subscribe(subject: string): string {
    const validation = validateSubject(subject)
    if (!validation.valid) {
      return validation.error
    }
    if (subscribedSubject.value !== '') {
      send(encodeUnsub('1'), 'UNSUB')
    }
    if (!send(encodeSub(subject.trim(), '1'), `SUB ${subject.trim()}`)) {
      return 'Not connected.'
    }
    subscribedSubject.value = subject.trim()
    return ''
  }

  function unsubscribe(): void {
    if (subscribedSubject.value === '') {
      return
    }
    send(encodeUnsub('1'), 'UNSUB')
    subscribedSubject.value = ''
  }

  /** Performs a request/reply round-trip against a responder on `subject`. */
  function request(subject: string, body: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<RequestOutcome> {
    const validation = validateSubject(subject)
    if (!validation.valid) {
      return Promise.resolve({ ok: false, payload: '', elapsedMs: 0, error: validation.error })
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, payload: '', elapsedMs: 0, error: 'Not connected.' })
    }

    const inbox = `_INBOX.${randomToken()}`
    const sid = nextSid()
    const startedAt = Date.now()

    return new Promise<RequestOutcome>((resolve) => {
      const timer = setTimeout(() => {
        send(encodeUnsub(sid), 'UNSUB')
        pendingRequest = null
        resolve({
          ok: false,
          payload: '',
          elapsedMs: Date.now() - startedAt,
          error: `No responder replied within ${timeoutMs}ms. Something must be subscribed to ${subject.trim()}.`,
        })
      }, timeoutMs)

      pendingRequest = { sid, startedAt, resolve, timer }

      if (!send(encodeSub(subject.trim(), sid), `SUB ${subject.trim()}`)) {
        clearTimeout(timer)
        pendingRequest = null
        resolve({ ok: false, payload: '', elapsedMs: 0, error: 'Not connected.' })
        return
      }

      const frame = encodePubText(subject.trim(), body, inbox)
      if (!send(frame, `PUB ${subject.trim()} (request)`)) {
        clearTimeout(timer)
        pendingRequest = null
        resolve({ ok: false, payload: '', elapsedMs: 0, error: 'Not connected.' })
      }
    })
  }

  function clearLog(): void {
    log.value = []
  }

  onBeforeUnmount(() => {
    if (pongTimer !== null) {
      clearTimeout(pongTimer)
    }
    if (pendingRequest) {
      clearTimeout(pendingRequest.timer)
    }
    socket?.close()
  })

  return {
    state,
    serverInfo,
    lastError,
    closeReason,
    log,
    subscribedSubject,
    isConnected,
    connect,
    disconnect,
    publish,
    subscribe,
    unsubscribe,
    request,
    clearLog,
  }
}