<script setup lang="ts">
import type { ServerOverview } from '#shared/types/monitoring'
import { formatBytes, formatCount, formatCpu, formatDuration } from '#shared/utils/format'

/** Server dashboard backed by `/varz`. */
useHead({ title: 'Dashboard' })

const REFRESH_INTERVAL_MS = 5000

const { data, pending, failure, loaded, refresh } = useMonitoring<ServerOverview>('/api/monitor/varz')

const polling = usePolling(refresh, REFRESH_INTERVAL_MS)

// Server-render the first snapshot so the dashboard paints live data instead of
// a skeleton; polling keeps it fresh afterwards.
await refresh()

onMounted(() => polling.start())

const server = computed(() => data.value)

const tiles = computed(() => {
  const value = server.value
  if (!value) {
    return []
  }

  return [
    { label: 'Version', value: value.version || '—', hint: `Go ${value.goVersion || 'unknown'}` },
    { label: 'Uptime', value: formatDuration(value.uptimeSeconds), hint: value.uptime },
    { label: 'Connections', value: formatCount(value.connections), hint: `${formatCount(value.totalConnections)} total since start` },
    { label: 'Subscriptions', value: formatCount(value.subscriptions), hint: 'Active interest' },
    { label: 'Routes', value: formatCount(value.routes), hint: value.clusterName ? `cluster ${value.clusterName}` : 'Not clustered' },
    { label: 'Leafnodes', value: formatCount(value.leafnodes), hint: 'Leaf connections' },
    { label: 'Gateways', value: formatCount(value.gateways), hint: 'Super-cluster remotes' },
    { label: 'Messages in', value: formatCount(value.inMsgs), hint: `${formatBytes(value.inBytes)} received` },
    { label: 'Messages out', value: formatCount(value.outMsgs), hint: `${formatBytes(value.outBytes)} sent` },
    { label: 'Max payload', value: formatBytes(value.maxPayload), hint: 'Per message limit' },
    { label: 'Max connections', value: formatCount(value.maxConnections), hint: 'Configured ceiling' },
    { label: 'Memory', value: formatBytes(value.memory), hint: `${value.cores} cores` },
    { label: 'CPU', value: formatCpu(value.cpu, value.cores), hint: 'Load across cores' },
    { label: 'Slow consumers', value: formatCount(value.slowConsumers), hint: 'Disconnected since start' },
  ]
})
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Server dashboard</h1>
        <p v-if="server" class="app-header-meta">
          {{ server.serverName || server.serverId }}
          · {{ server.host }}:{{ server.port }}
          <template v-if="server.ip">
            ({{ server.ip }})
          </template>
          · monitoring on port {{ server.monitoringPort }}
        </p>
      </div>
      <div class="button-row">
        <span v-if="polling.isActive.value" class="badge is-ok">
          <span class="badge-dot" />Live · {{ REFRESH_INTERVAL_MS / 1000 }}s
        </span>
        <button type="button" class="button" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <DataState
      :pending="pending"
      :loaded="loaded"
      :failure="failure"
      retry-label="Try again"
      @retry="refresh()"
    >
      <section class="card">
        <div class="card-header">
          <h2>Overview</h2>
          <span class="badge" :class="server?.authRequired ? 'is-warn' : 'is-idle'">
            <span class="badge-dot" />
            {{ server?.authRequired ? 'Auth required' : 'No auth' }}
          </span>
        </div>
        <div class="stat-grid">
          <StatTile
            v-for="tile in tiles"
            :key="tile.label"
            :label="tile.label"
            :value="tile.value"
            :hint="tile.hint"
          />
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>JetStream</h2>
          <NuxtLink to="/jetstream" class="button">
            JetStream detail
          </NuxtLink>
        </div>

        <div v-if="server?.jetstream.enabled" class="stat-grid">
          <StatTile
            label="Status"
            value="Enabled"
            :hint="server.jetstream.domain ? `domain ${server.jetstream.domain}` : 'Single server'"
          />
          <StatTile
            label="Memory store"
            :value="formatBytes(server.jetstream.memory)"
            :hint="`limit ${formatBytes(server.jetstream.maxMemory)}`"
          />
          <StatTile
            label="File store"
            :value="formatBytes(server.jetstream.storage)"
            :hint="`limit ${formatBytes(server.jetstream.maxStorage)}`"
          />
          <StatTile
            label="Reserved"
            :value="formatBytes(server.jetstream.reservedMemory + server.jetstream.reservedStorage)"
            hint="Memory + storage reservations"
          />
          <StatTile
            label="Meta leader"
            :value="server.jetstream.metaLeader || 'n/a'"
            :hint="`cluster size ${server.jetstream.metaClusterSize || 1}`"
          />
        </div>

        <div v-else class="state-block">
          <p class="state-title">
            JetStream is not enabled on this server
          </p>
          <p class="state-hint">
            Add a <code class="inline-code">jetstream {}</code> block with a
            <code class="inline-code">store_dir</code> to the server configuration to enable it.
          </p>
        </div>
      </section>
    </DataState>

    <p class="app-footer-note">
      Data is read through the WebUI's own Nitro proxy; the browser never contacts the NATS monitoring port directly.
    </p>
  </div>
</template>