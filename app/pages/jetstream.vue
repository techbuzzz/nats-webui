<script setup lang="ts">
import type { AccountList, JetStreamOverview } from '#shared/types/monitoring'
import { formatBytes, formatCount } from '#shared/utils/format'

/** JetStream overview (`/jsz`) plus the account list (`/accountz`). */
useHead({ title: 'JetStream' })

type TabKey = 'overview' | 'streams' | 'accounts'

const activeTab = ref<TabKey>('overview')
/** Full stream/consumer detail is expensive, so it is opt-in. */
const loadDetails = ref(false)

const jszUrl = computed(() => {
  if (!loadDetails.value) {
    return '/api/monitor/jsz?config=true'
  }
  return '/api/monitor/jsz?accounts=true&streams=true&consumers=true&config=true'
})

const jsz = useMonitoring<JetStreamOverview>(jszUrl)
const accountz = useMonitoring<AccountList>('/api/monitor/accountz')

const jszLoaded = ref(false)
const accountzLoaded = ref(false)

async function loadTab(tab: TabKey): Promise<void> {
  activeTab.value = tab
  if (tab !== 'accounts' && !jszLoaded.value) {
    await jsz.refresh()
    jszLoaded.value = true
  }
  if (tab === 'accounts' && !accountzLoaded.value) {
    await accountz.refresh()
    accountzLoaded.value = true
  }
}

// Prime the default tab server-side so the first paint shows real data.
await loadTab('overview')

watch(loadDetails, () => loadTab(activeTab.value))

const totals = computed(() => {
  const value = jsz.data.value
  if (!value) {
    return []
  }

  return [
    { label: 'Status', value: value.enabled ? 'Enabled' : 'Disabled', hint: value.domain ? `domain ${value.domain}` : 'No domain configured' },
    { label: 'Streams', value: formatCount(value.streams), hint: `${formatCount(value.streamsLeader)} with a leader here` },
    { label: 'Consumers', value: formatCount(value.consumers), hint: `${formatCount(value.consumersLeader)} with a leader here` },
    { label: 'Messages', value: formatCount(value.messages), hint: formatBytes(value.bytes) },
    { label: 'Memory used', value: formatBytes(value.memory), hint: `limit ${formatBytes(value.maxMemory)}` },
    { label: 'Storage used', value: formatBytes(value.storage), hint: `limit ${formatBytes(value.maxStorage)}` },
    { label: 'Reserved', value: formatBytes(value.reservedMemory + value.reservedStorage), hint: 'Memory + storage reservations' },
    { label: 'JetStream accounts', value: formatCount(value.totalAccounts), hint: 'Accounts with a JS resource' },
    { label: 'API requests', value: formatCount(value.api.total), hint: `${formatCount(value.api.errors)} errors · level ${value.api.level}` },
    { label: 'Meta leader', value: value.metaLeader || 'n/a', hint: `cluster size ${value.metaClusterSize || 1}` },
  ]
})
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>JetStream</h1>
        <p class="app-header-meta">
          Streams, consumers, storage usage and per-account resource limits.
        </p>
      </div>
      <div class="button-row">
        <button type="button" class="button" :disabled="jsz.pending.value" @click="loadTab(activeTab)">
          {{ jsz.pending.value ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="toolbar">
      <label class="field">
        <span class="field-label">Stream / consumer detail</span>
        <select v-model="loadDetails" class="select">
          <option :value="false">
            Totals only (fast)
          </option>
          <option :value="true">
            Include accounts, streams and consumers
          </option>
        </select>
      </label>
      <p class="hint-text" style="margin: 0">
        Full detail sends <code class="inline-code">?accounts=true&amp;streams=true&amp;consumers=true</code>
        and can be slow on big clusters.
      </p>
    </div>

    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'overview' }"
        :aria-selected="activeTab === 'overview'"
        @click="loadTab('overview')"
      >
        Overview
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'streams' }"
        :aria-selected="activeTab === 'streams'"
        @click="loadTab('streams')"
      >
        Streams
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'accounts' }"
        :aria-selected="activeTab === 'accounts'"
        @click="loadTab('accounts')"
      >
        Accounts
      </button>
    </div>

    <!-- Overview -->
    <section v-show="activeTab === 'overview'" class="card">
      <div class="card-header">
        <h2>Server totals</h2>
        <span v-if="jsz.data.value?.storeDir" class="badge is-idle">
          {{ jsz.data.value.storeDir }}
        </span>
      </div>

      <DataState
        :pending="jsz.pending.value"
        :loaded="jsz.loaded.value"
        :failure="jsz.failure.value"
        @retry="jsz.refresh()"
      >
        <div v-if="jsz.data.value && !jsz.data.value.enabled" class="state-block">
          <p class="state-title">
            JetStream is not enabled
          </p>
          <p class="state-hint">
            The server reports JetStream as disabled. Streams and consumers will not appear until a
            <code class="inline-code">jetstream</code> block with a <code class="inline-code">store_dir</code>
            is configured and the server is restarted.
          </p>
        </div>

        <div v-else class="stat-grid">
          <StatTile
            v-for="tile in totals"
            :key="tile.label"
            :label="tile.label"
            :value="tile.value"
            :hint="tile.hint"
          />
        </div>
      </DataState>
    </section>

    <!-- Streams -->
    <section v-show="activeTab === 'streams'" class="card">
      <div class="card-header">
        <h2>Streams &amp; consumers</h2>
        <span class="badge is-idle">
          {{ formatCount(jsz.data.value?.streams ?? 0) }} streams
        </span>
      </div>

      <DataState
        :pending="jsz.pending.value"
        :loaded="jsz.loaded.value"
        :failure="jsz.failure.value"
        :empty="!loadDetails"
        empty-title="Stream detail is not loaded"
        empty-hint="Switch “Stream / consumer detail” to “Include accounts, streams and consumers” above, then refresh."
        @retry="jsz.refresh()"
      >
        <div
          v-for="account in jsz.data.value?.accounts ?? []"
          :key="account.id || account.name"
          class="card"
          style="background: var(--bg-inset)"
        >
          <div class="card-header">
            <h3>
              Account: {{ account.name }}
            </h3>
            <span class="badge is-idle">
              {{ formatBytes(account.memory) }} mem · {{ formatBytes(account.storage) }} store
            </span>
          </div>

          <template v-if="account.streams.length === 0">
            <div class="hint-text">
              No streams in this account.
            </div>
          </template>

          <template v-else>
            <div v-for="stream in account.streams" :key="stream.name" class="stream-block">
            <div class="card-header">
              <h3>
                {{ stream.name }}
                <span class="badge is-idle">{{ stream.storage || 'unknown storage' }}</span>
              </h3>
              <span class="badge is-idle">{{ formatCount(stream.consumers.length) }} consumers</span>
            </div>

            <dl class="definition-list" style="margin-bottom: 12px">
              <DefinitionRow label="Messages" :value="formatCount(stream.messages)" />
              <DefinitionRow label="Bytes" :value="formatBytes(stream.bytes)" />
              <DefinitionRow label="Retention" :value="stream.retention || '—'" />
              <DefinitionRow label="Replicas" :value="stream.replicas" />
              <DefinitionRow label="First seq" :value="formatCount(stream.firstSeq)" />
              <DefinitionRow label="Last seq" :value="formatCount(stream.lastSeq)" />
              <DefinitionRow label="Subjects" :value="formatCount(stream.numSubjects)" />
              <DefinitionRow label="Leader" :value="stream.clusterLeader || '—'" />
            </dl>

            <p class="hint-text">
              Subjects: {{ stream.subjects.length > 0 ? stream.subjects.join(', ') : '—' }}
            </p>

            <div v-if="stream.consumers.length > 0" class="table-scroll" style="margin-top: 10px">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th class="numeric">Pending</th>
                    <th class="numeric">Ack pending</th>
                    <th class="numeric">Redelivered</th>
                    <th class="numeric">Delivered seq</th>
                    <th class="numeric">Ack floor seq</th>
                    <th>Leader</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="consumer in stream.consumers" :key="consumer.name">
                    <td>{{ consumer.name }}</td>
                    <td class="numeric">{{ formatCount(consumer.numPending) }}</td>
                    <td class="numeric">{{ formatCount(consumer.numAckPending) }}</td>
                    <td class="numeric">{{ formatCount(consumer.numRedelivered) }}</td>
                    <td class="numeric">{{ formatCount(consumer.deliveredConsumerSeq) }}</td>
                    <td class="numeric">{{ formatCount(consumer.ackFloorConsumerSeq) }}</td>
                    <td>{{ consumer.leader || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          </template>
        </div>
      </DataState>
    </section>

    <!-- Accounts -->
    <section v-show="activeTab === 'accounts'" class="card">
      <div class="card-header">
        <h2>Accounts</h2>
        <span class="badge is-idle">
          {{ formatCount(accountz.data.value?.accounts.length ?? 0) }} accounts
        </span>
      </div>

      <DataState
        :pending="accountz.pending.value"
        :loaded="accountz.loaded.value"
        :failure="accountz.failure.value"
        :empty="(accountz.data.value?.accounts.length ?? 0) === 0"
        empty-title="No accounts reported"
        empty-hint="A default server always reports at least the global account."
        @retry="accountz.refresh()"
      >
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th class="numeric">Connections</th>
                <th class="numeric">Leafnodes</th>
                <th class="numeric">Subscriptions</th>
                <th class="numeric">Msgs</th>
                <th class="numeric">Bytes</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in accountz.data.value?.accounts ?? []" :key="account.id || account.name">
                <td>{{ account.name || account.id }}</td>
                <td class="numeric">{{ formatCount(account.connections) }}</td>
                <td class="numeric">{{ formatCount(account.leafnodes) }}</td>
                <td class="numeric">{{ formatCount(account.subscriptions) }}</td>
                <td class="numeric">{{ formatCount(account.totalMsgs) }}</td>
                <td class="numeric">{{ formatBytes(account.totalBytes) }}</td>
                <td>
                  <span v-if="account.isSystem" class="badge is-idle">system</span>
                  <span v-if="account.expired" class="badge is-warn">expired</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </section>
  </div>
</template>

<style scoped>
.stream-block + .stream-block {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
</style>