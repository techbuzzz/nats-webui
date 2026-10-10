<script setup lang="ts">
/**
 * Connection settings for the playground WebSocket.
 *
 * The server-side env config is the default; overrides here live in the browser
 * only. Secrets go to `sessionStorage` unless the operator explicitly opts into
 * persisting them.
 */
useHead({ title: 'Settings' })

const { data: clientConfig } = await useFetch('/api/config', {
  key: 'nats-client-config-settings',
  default: () => ({
    websocketUrl: '',
    connectionName: 'nats-webui',
    authRequired: false,
    serverVersion: '',
  }),
})

const { settings, hydrate, persist, reset } = useConnectionSettings()

onMounted(() => {
  hydrate({
    websocketUrl: clientConfig.value.websocketUrl,
    connectionName: clientConfig.value.connectionName,
  })
})

const saved = ref(false)
const wasAuthRequired = computed(() => clientConfig.value.authRequired)

function save(): void {
  persist()
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2500)
}

function restoreDefaults(): void {
  reset({
    websocketUrl: clientConfig.value.websocketUrl,
    connectionName: clientConfig.value.connectionName,
  })
}
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Connection settings</h1>
        <p class="app-header-meta">
          Overrides for the browser playground. The Nitro proxy always uses the server-side
          <code class="inline-code">NUXT_NATS_*</code> configuration.
        </p>
      </div>
    </header>

    <section
      v-if="wasAuthRequired"
      class="state-block"
      style="margin-bottom: 16px; text-align: left"
    >
      <p class="state-title" style="text-align: left">This server requires authentication</p>
      <p class="state-hint" style="margin: 0">
        Fill in the username/password or auth token below before connecting the playground,
        otherwise the server closes the connection with
        <code class="inline-code">-ERR 'Authorization Violation'</code>.
      </p>
    </section>

    <section class="card">
      <div class="card-header">
        <h2>WebSocket endpoint</h2>
      </div>

      <div class="toolbar">
        <label class="field" style="flex: 1; min-width: 260px">
          <span class="field-label">WebSocket URL</span>
          <input
            v-model="settings.websocketUrl"
            type="text"
            class="input"
            placeholder="ws://localhost:8080"
          />
        </label>
        <label class="field" style="min-width: 200px">
          <span class="field-label">Connection name</span>
          <input v-model="settings.connectionName" type="text" class="input" />
        </label>
      </div>

      <p class="hint-text">
        Server default:
        <code class="inline-code">{{ clientConfig.websocketUrl || 'not configured' }}</code
        >. The URL must be reachable <em>from your browser</em>, so a Docker-internal hostname like
        <code class="inline-code">nats</code> will not resolve outside the compose network.
      </p>
    </section>

    <section class="card">
      <div class="card-header">
        <h2>Credentials</h2>
        <span class="badge" :class="settings.rememberSecret ? 'is-warn' : 'is-idle'">
          <span class="badge-dot" />
          {{ settings.rememberSecret ? 'Stored in localStorage' : 'Stored for this tab only' }}
        </span>
      </div>

      <div class="toolbar">
        <label class="field" style="min-width: 200px">
          <span class="field-label">Username</span>
          <input v-model="settings.user" type="text" class="input" autocomplete="off" />
        </label>
        <label class="field" style="min-width: 200px">
          <span class="field-label">Password</span>
          <input v-model="settings.password" type="password" class="input" autocomplete="off" />
        </label>
        <label class="field" style="min-width: 200px">
          <span class="field-label">Auth token (JWT / token auth)</span>
          <input v-model="settings.authToken" type="password" class="input" autocomplete="off" />
        </label>
      </div>

      <label class="field" style="margin-top: 6px">
        <span class="field-label">
          <input v-model="settings.rememberSecret" type="checkbox" />
          Remember the password and token in this browser
        </span>
      </label>

      <p class="hint-text">
        Unchecked, secrets live in <code class="inline-code">sessionStorage</code> and disappear
        when the tab closes. Checked, they are written to
        <code class="inline-code">localStorage</code> in plain text — only do this on a machine you
        trust. Nothing here is ever sent to the WebUI server.
      </p>
    </section>

    <section class="card">
      <div class="card-header">
        <h2>Server-side configuration</h2>
      </div>

      <p class="hint-text" style="margin-top: 0">
        These come from the container environment and cannot be changed from the browser. Edit the
        <code class="inline-code">NUXT_NATS_*</code> variables in
        <code class="inline-code">docker-compose.yml</code>
        (or your orchestrator) and restart the WebUI.
      </p>

      <dl class="definition-list">
        <DefinitionRow
          label="WebSocket URL (NUXT_PUBLIC_NATS_WS_URL)"
          :value="clientConfig.websocketUrl || '—'"
        />
        <DefinitionRow
          label="Connection name (NUXT_PUBLIC_NATS_CONNECTION_NAME)"
          :value="clientConfig.connectionName || '—'"
        />
        <DefinitionRow
          label="Server version (from /varz)"
          :value="clientConfig.serverVersion || 'unavailable'"
        />
        <DefinitionRow
          label="Auth required (from /varz)"
          :value="clientConfig.authRequired ? 'yes' : 'no'"
        />
      </dl>
    </section>

    <div class="button-row" style="margin-top: 16px">
      <button type="button" class="button button-primary" @click="save">Save settings</button>
      <button type="button" class="button" @click="restoreDefaults">
        Reset to server defaults
      </button>
      <span v-if="saved" class="badge is-ok"> <span class="badge-dot" />Saved </span>
    </div>
  </div>
</template>
