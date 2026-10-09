<script setup lang="ts">
import type { NatsClientConfig } from '#shared/types/monitoring'
import type { RequestOutcome } from '~/composables/useNatsConnection'

/** Publish / request-reply playground over the NATS WebSocket connection. */
useHead({ title: 'Playground' })

const connection = useNatsConnection()

const subject = ref('demo.ping')
const payload = ref('hello from the NATS WebUI')

const subscribeSubject = ref('demo.>')
const requestOutcome = ref<RequestOutcome | null>(null)
const publishError = ref('')
const requestError = ref('')
const requestPending = ref(false)

const { data: clientConfig } = await useFetch<NatsClientConfig>('/api/config', {
  key: 'nats-client-config-playground',
  default: () => ({
    websocketUrl: '',
    connectionName: 'nats-webui',
    authRequired: false,
    serverVersion: '',
  }),
})

const { settings } = useConnectionSettings()

onMounted(() => {
  settings.value.websocketUrl ||= clientConfig.value.websocketUrl
  settings.value.connectionName ||= clientConfig.value.connectionName
})

const serverInfo = computed(() => connection.serverInfo.value)
const serverVersion = computed(() => serverInfo.value.version || 'unknown')

function connect(): void {
  requestOutcome.value = null
  connection.connect({
    url: settings.value.websocketUrl,
    connectionName: settings.value.connectionName,
    user: settings.value.user,
    password: settings.value.password,
    authToken: settings.value.authToken,
  })
}

function disconnect(): void {
  connection.disconnect()
}

function doPublish(): void {
  publishError.value = connection.publish(subject.value, payload.value)
}

function doSubscribe(): void {
  publishError.value = connection.subscribe(subscribeSubject.value)
}

function doUnsubscribe(): void {
  connection.unsubscribe()
}

async function doRequest(): Promise<void> {
  requestError.value = ''
  requestOutcome.value = null
  requestPending.value = true
  try {
    const outcome = await connection.request(subject.value, payload.value)
    requestOutcome.value = outcome
    requestError.value = outcome.ok ? '' : outcome.error
  }
  finally {
    requestPending.value = false
  }
}

function logTime(iso: string): string {
  return iso.slice(11, 23)
}
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Playground</h1>
        <p class="app-header-meta">
          Publish and request/reply over the NATS WebSocket port — never through the monitoring endpoint.
        </p>
      </div>
      <div class="button-row">
        <ConnectionStatusBadge
          :state="connection.state.value"
          :detail="connection.closeReason.value || undefined"
        />
        <span v-if="connection.isConnected.value" class="badge is-idle">
          server {{ serverVersion }}
        </span>
      </div>
    </header>

    <section class="card">
      <div class="card-header">
        <h2>Connection</h2>
        <NuxtLink to="/settings" class="button">
          Connection settings
        </NuxtLink>
      </div>

      <div class="toolbar">
        <label class="field" style="flex: 1; min-width: 240px">
          <span class="field-label">WebSocket URL</span>
          <input v-model="settings.websocketUrl" type="text" class="input" placeholder="ws://localhost:8080">
        </label>
        <label class="field" style="min-width: 160px">
          <span class="field-label">Connection name</span>
          <input v-model="settings.connectionName" type="text" class="input">
        </label>
      </div>

      <div class="button-row">
        <button
          type="button"
          class="button button-primary"
          :disabled="connection.state.value === 'connecting' || connection.isConnected.value"
          @click="connect"
        >
          Connect
        </button>
        <button
          type="button"
          class="button button-danger"
          :disabled="!connection.isConnected.value && connection.state.value !== 'error'"
          @click="disconnect"
        >
          Disconnect
        </button>
      </div>

      <div v-if="connection.lastError.value" class="state-block state-error" style="margin-top: 14px; text-align: left">
        <p class="state-title" style="text-align: left">
          {{ connection.lastError.value }}
        </p>
        <p class="state-hint" style="margin: 0">
          Check that the NATS server has a <code class="inline-code">websocket {}</code> block enabled, that the
          URL scheme matches the port, and that the browser can reach it (container hostnames such as
          <code class="inline-code">nats</code> are not resolvable from a browser).
        </p>
      </div>

      <dl v-if="serverInfo.server_id" class="definition-list" style="margin-top: 16px">
        <DefinitionRow label="Server ID" :value="serverInfo.server_id" />
        <DefinitionRow label="Server name" :value="serverInfo.server_name || '—'" />
        <DefinitionRow label="Version" :value="serverVersion" />
        <DefinitionRow label="Max payload" :value="`${serverInfo.max_payload ?? 0} bytes`" />
        <DefinitionRow label="Connect URLs" :value="(serverInfo.connect_urls ?? []).join(', ') || '—'" />
      </dl>
    </section>

    <section class="card">
      <div class="card-header">
        <h2>Publish</h2>
      </div>

      <div class="toolbar">
        <label class="field" style="flex: 1; min-width: 220px">
          <span class="field-label">Subject</span>
          <input v-model="subject" type="text" class="input" placeholder="demo.ping">
        </label>
        <label class="field" style="flex: 1; min-width: 220px">
          <span class="field-label">Subscribe wildcard (optional)</span>
          <input v-model="subscribeSubject" type="text" class="input" placeholder="demo.>">
        </label>
      </div>

      <label class="field">
        <span class="field-label">Payload</span>
        <textarea v-model="payload" class="textarea" rows="4" spellcheck="false" />
      </label>

      <div class="button-row" style="margin-top: 12px">
        <button type="button" class="button button-primary" :disabled="!connection.isConnected.value" @click="doPublish">
          Publish
        </button>
        <button type="button" class="button" :disabled="!connection.isConnected.value" @click="doSubscribe">
          Subscribe
        </button>
        <button
          type="button"
          class="button"
          :disabled="connection.subscribedSubject.value === ''"
          @click="doUnsubscribe"
        >
          Unsubscribe
        </button>
        <button
          type="button"
          class="button"
          :disabled="!connection.isConnected.value || requestPending"
          @click="doRequest"
        >
          {{ requestPending ? 'Requesting…' : 'Request / reply' }}
        </button>
      </div>

      <p v-if="publishError" class="hint-text" style="color: var(--danger)">
        {{ publishError }}
      </p>
      <p v-if="connection.subscribedSubject.value" class="hint-text">
        Subscribed to <code class="inline-code">{{ connection.subscribedSubject.value }}</code>.
      </p>

      <div v-if="requestOutcome || requestError" class="card" style="background: var(--bg-inset); margin-top: 14px">
        <div class="card-header">
          <h3>Reply</h3>
          <span v-if="requestOutcome?.ok" class="badge is-ok">
            <span class="badge-dot" />{{ requestOutcome.elapsedMs }} ms
          </span>
          <span v-else-if="requestError" class="badge is-warn">
            <span class="badge-dot" />No reply
          </span>
        </div>
        <pre v-if="requestOutcome?.payload" class="log-panel">{{ requestOutcome.payload }}</pre>
        <p v-else-if="requestError" class="hint-text" style="margin: 0">
          {{ requestError }}
        </p>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2>Protocol log</h2>
        <div class="button-row">
          <span class="badge is-idle">{{ connection.log.value.length }} entries</span>
          <button type="button" class="button" :disabled="connection.log.value.length === 0" @click="connection.clearLog()">
            Clear
          </button>
        </div>
      </div>

      <div v-if="connection.log.value.length === 0" class="state-block">
        <p class="state-title">
          Nothing logged yet
        </p>
        <p class="state-hint">
          Connect, then publish or request. Raw protocol frames appear here; credentials are never written to the log.
        </p>
      </div>

      <div v-else class="log-panel">
        <div
          v-for="entry in connection.log.value"
          :key="entry.id"
          class="log-row"
          :class="`is-${entry.direction}`"
        >
          <span class="log-time">{{ logTime(entry.at) }}</span>
          <span class="log-label">{{ entry.label }}</span>
          <span class="log-text">{{ entry.text }}</span>
        </div>
      </div>
    </section>
  </div>
</template>