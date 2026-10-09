<script setup lang="ts">
import type { ConnectionEntry, ConnectionList } from '#shared/types/monitoring'
import { formatBytes, formatCount, formatDuration, formatRtt } from '#shared/utils/format'

/** Connections explorer backed by `/connz`. */
useHead({ title: 'Connections' })

type SortKey = 'cid' | 'name' | 'subscriptions' | 'pendingBytes' | 'uptimeSeconds' | 'rttMs'
type SortDirection = 'asc' | 'desc'

const REFRESH_INTERVAL_MS = 5000
const PAGE_LIMIT = 1024

const state = ref<'open' | 'closed' | 'all'>('open')
const search = ref('')
const sortKey = ref<SortKey>('cid')
const sortDirection = ref<SortDirection>('asc')

const url = computed(() => `/api/monitor/connz?limit=${PAGE_LIMIT}&state=${state.value}`)
const { data, pending, failure, loaded, refresh } = useMonitoring<ConnectionList>(url)

const polling = usePolling(refresh, REFRESH_INTERVAL_MS)

await refresh()

onMounted(() => polling.start())

const connections = computed<ConnectionEntry[]>(() => data.value?.connections ?? [])

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const rows = needle === ''
    ? connections.value
    : connections.value.filter((entry) =>
        entry.cid.toString() === needle
        || entry.name.toLowerCase().includes(needle)
        || entry.ip.toLowerCase().includes(needle)
        || entry.authorizedUser.toLowerCase().includes(needle),
      )

  const factor = sortDirection.value === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    const left = a[sortKey.value]
    const right = b[sortKey.value]

    // `null` RTTs always sort last, whichever direction is active.
    if (left === null || right === null) {
      if (left === right) {
        return a.cid - b.cid
      }
      return left === null ? 1 : -1
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor
    }
    return String(left).localeCompare(String(right)) * factor
  })
})

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDirection.value = key === 'cid' || key === 'name' ? 'asc' : 'desc'
}

const columns: { key: SortKey, label: string, numeric?: boolean }[] = [
  { key: 'cid', label: 'CID', numeric: true },
  { key: 'name', label: 'Name / client' },
  { key: 'subscriptions', label: 'Subs', numeric: true },
  { key: 'pendingBytes', label: 'Pending', numeric: true },
  { key: 'uptimeSeconds', label: 'Uptime', numeric: true },
  { key: 'rttMs', label: 'RTT', numeric: true },
]
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Connections</h1>
        <p class="app-header-meta">
          {{ formatCount(filtered.length) }} shown
          <template v-if="filtered.length !== connections.length">
            of {{ formatCount(connections.length) }} returned
          </template>
          · from <code class="inline-code">/connz</code>
        </p>
      </div>
      <div class="button-row">
        <button type="button" class="button" :disabled="pending" @click="refresh()">
          {{ pending ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="toolbar">
      <label class="field">
        <span class="field-label">State</span>
        <select v-model="state" class="select" @change="refresh()">
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </label>

      <label class="field" style="flex: 1; min-width: 200px">
        <span class="field-label">Filter (CID, name, IP, user)</span>
        <input
          v-model="search"
          type="search"
          class="input"
          placeholder="e.g. 3, web-1, 10.0.0.4, alice"
        >
      </label>
    </div>

    <DataState
      :pending="pending"
      :loaded="loaded"
      :failure="failure"
      :empty="filtered.length === 0"
      empty-title="No connections match"
      empty-hint="Adjust the state filter or clear the text filter. A closed-only view is empty unless clients have recently disconnected."
      @retry="refresh()"
    >
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                :class="{ numeric: column.numeric }"
                :aria-sort="sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'"
              >
                <button type="button" class="table-sort-button" @click="toggleSort(column.key)">
                  {{ column.label }}
                  <span v-if="sortKey === column.key" aria-hidden="true">
                    {{ sortDirection === 'asc' ? '▲' : '▼' }}
                  </span>
                </button>
              </th>
              <th>Address</th>
              <th>Account / user</th>
              <th class="numeric">
                In / out
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in filtered" :key="entry.cid">
              <td class="numeric">{{ entry.cid }}</td>
              <td>
                {{ entry.name || entry.type || 'unnamed' }}
                <span v-if="entry.version" class="hint-text" style="display: inline; margin-left: 6px">
                  {{ entry.version }}
                </span>
              </td>
              <td class="numeric">{{ formatCount(entry.subscriptions) }}</td>
              <td class="numeric">{{ formatBytes(entry.pendingBytes) }}</td>
              <td class="numeric">{{ formatDuration(entry.uptimeSeconds) }}</td>
              <td class="numeric">{{ formatRtt(entry.rttMs) }}</td>
              <td>{{ entry.ip }}:{{ entry.port }}</td>
              <td>
                {{ entry.account || '—' }}
                <span v-if="entry.authorizedUser" class="hint-text" style="display: inline; margin-left: 6px">
                  {{ entry.authorizedUser }}
                </span>
              </td>
              <td class="numeric">
                {{ formatCount(entry.inMsgs) }} / {{ formatCount(entry.outMsgs) }}
              </td>
              <td>
                <NuxtLink :to="`/connections/${entry.cid}`" class="button">
                  Details
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>