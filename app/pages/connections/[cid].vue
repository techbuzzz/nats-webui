<script setup lang="ts">
import type { ConnectionList } from '#shared/types/monitoring'
import { formatBytes, formatCount, formatDuration, formatRtt } from '#shared/utils/format'

/** Single connection detail, backed by `/connz?cid=N`. */
const route = useRoute()
const cid = computed(() => String(route.params.cid ?? ''))

useHead({ title: `Connection ${cid.value}` })

const state = ref<'open' | 'closed' | 'all'>('all')
// `subs=true` is what makes the server include `subscriptions_list`.
const url = computed(() => `/api/monitor/connz?cid=${encodeURIComponent(cid.value)}&auth=true&subs=true&state=${state.value}`)
const { data, pending, failure, loaded, refresh } = useMonitoring<ConnectionList>(url)

const polling = usePolling(refresh, 5000)

await refresh()

onMounted(() => polling.start())

const connection = computed(() => data.value?.connections[0] ?? null)

const rows = computed(() => {
  const entry = connection.value
  if (!entry) {
    return []
  }

  return [
    { label: 'CID', value: entry.cid },
    { label: 'Name', value: entry.name || '—' },
    { label: 'Kind', value: entry.kind || '—' },
    { label: 'Type', value: entry.type || '—' },
    { label: 'Address', value: `${entry.ip}:${entry.port}` },
    { label: 'Uptime', value: entry.uptime || formatDuration(entry.uptimeSeconds) },
    { label: 'Idle', value: entry.idle || formatDuration(entry.idleSeconds) },
    { label: 'RTT', value: entry.rtt || formatRtt(entry.rttMs) },
    { label: 'Subscriptions', value: formatCount(entry.subscriptions) },
    { label: 'Pending bytes', value: formatBytes(entry.pendingBytes) },
    { label: 'In messages', value: formatCount(entry.inMsgs) },
    { label: 'Out messages', value: formatCount(entry.outMsgs) },
    { label: 'In bytes', value: formatBytes(entry.inBytes) },
    { label: 'Out bytes', value: formatBytes(entry.outBytes) },
    { label: 'Account', value: entry.account || '—' },
    { label: 'Authorized user', value: entry.authorizedUser || '—' },
    { label: 'Client lang', value: entry.lang || '—' },
    { label: 'Client version', value: entry.version || '—' },
    { label: 'Started', value: entry.start || '—' },
    { label: 'Last activity', value: entry.lastActivity || '—' },
  ]
})
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Connection {{ cid }}</h1>
        <p class="app-header-meta">
          <NuxtLink to="/connections">← Back to connections</NuxtLink>
        </p>
      </div>
      <div class="button-row">
        <label class="field">
          <span class="field-label">Include</span>
          <select v-model="state" class="select" @change="refresh()">
            <option value="all">Open + closed</option>
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
          </select>
        </label>
        <button type="button" class="button" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <DataState
      :pending="pending"
      :loaded="loaded"
      :failure="failure"
      :empty="connection === null"
      :empty-title="`No connection with CID ${cid}`"
      empty-hint="The connection may have closed. Switch to “Open + closed” to look for recently closed clients."
      @retry="refresh()"
    >
      <section class="card">
        <div class="card-header">
          <h2>Session</h2>
        </div>
        <dl class="definition-list">
          <DefinitionRow v-for="row in rows" :key="row.label" :label="row.label" :value="row.value" />
        </dl>
        <p v-if="connection?.reason" class="hint-text">
          Close reason: {{ connection.reason }}
        </p>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>Subscriptions</h2>
          <span class="badge is-idle">{{ connection?.subscriptionList.length ?? 0 }} listed</span>
        </div>

        <div v-if="connection && connection.subscriptionList.length > 0" class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(subject, index) in connection.subscriptionList" :key="`${subject}-${index}`">
                <td class="numeric">{{ index + 1 }}</td>
                <td>{{ subject }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="hint-text">
          No subscription list returned. The server only includes it when the request asks for it
          (<code class="inline-code">subs=true</code>).
        </p>
      </section>
    </DataState>
  </div>
</template>