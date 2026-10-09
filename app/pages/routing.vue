<script setup lang="ts">
import type {
  GatewayList,
  LeafNodeList,
  RouteList,
  SubscriptionList,
} from '#shared/types/monitoring'
import { formatBytes, formatCount } from '#shared/utils/format'

/** Routes, subscriptions, leafnodes and gateways in one tabbed view. */
useHead({ title: 'Routing & Subscriptions' })

type TabKey = 'routes' | 'subs' | 'leafnodes' | 'gateways'

const activeTab = ref<TabKey>('routes')

const includeSubs = ref(true)

const asBool = (value: boolean): string => (value ? 'true' : 'false')

const routes = useMonitoring<RouteList>(computed(() => `/api/monitor/routez?subs=${asBool(includeSubs.value)}`))
const subs = useMonitoring<SubscriptionList>(
  computed(() => `/api/monitor/subsz?subs=${asBool(includeSubs.value)}&limit=1024`),
)
const leafnodes = useMonitoring<LeafNodeList>('/api/monitor/leafz')
const gateways = useMonitoring<GatewayList>('/api/monitor/gatewayz')

/** Loads the active tab's endpoint; other tabs load on first reveal. */
const loadedOnce = reactive<Record<TabKey, boolean>>({
  routes: false,
  subs: false,
  leafnodes: false,
  gateways: false,
})

const requests = {
  routes: routes,
  subs: subs,
  leafnodes: leafnodes,
  gateways: gateways,
} as const

async function loadTab(tab: TabKey): Promise<void> {
  activeTab.value = tab
  const request = requests[tab]
  if (!loadedOnce[tab]) {
    await request.refresh()
    loadedOnce[tab] = true
  }
}

// Prime the default tab server-side so the first paint shows real data.
await loadTab('routes')

const sublistRows = computed(() => {
  const rows: { label: string, value: string }[] = []
  const value = subs.data.value
  if (!value) {
    return rows
  }

  rows.push({ label: 'Total subs', value: formatCount(value.numSubs) })
  rows.push({ label: 'In matching cache', value: formatCount(value.numCache) })
  rows.push({ label: 'Cache hits', value: formatCount(value.numCacheHit) })
  rows.push({ label: 'Cache misses', value: formatCount(value.numCacheMiss) })
  rows.push({ label: 'Matched lookups', value: formatCount(value.numMatches) })
  rows.push({ label: 'Orphan subs', value: formatCount(value.numOrphans) })
  rows.push({ label: 'Waiting (cache full)', value: formatCount(value.numWaiting) })
  rows.push({ label: 'Pending inserts', value: formatCount(value.numPending) })
  return rows
})
</script>

<template>
  <div>
    <header class="app-header">
      <div>
        <h1>Routing &amp; subscriptions</h1>
        <p class="app-header-meta">
          Cluster routes, the subscription list sublist, leafnodes and gateways.
        </p>
      </div>
      <div class="button-row">
        <label class="field">
          <span class="field-label">Include subject lists</span>
          <select v-model="includeSubs" class="select" @change="loadTab(activeTab)">
            <option :value="true">
              Yes
            </option>
            <option :value="false">
              No
            </option>
          </select>
        </label>
      </div>
    </header>

    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'routes' }"
        :aria-selected="activeTab === 'routes'"
        @click="loadTab('routes')"
      >
        Routes
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'subs' }"
        :aria-selected="activeTab === 'subs'"
        @click="loadTab('subs')"
      >
        Subscriptions
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'leafnodes' }"
        :aria-selected="activeTab === 'leafnodes'"
        @click="loadTab('leafnodes')"
      >
        Leafnodes
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'is-active': activeTab === 'gateways' }"
        :aria-selected="activeTab === 'gateways'"
        @click="loadTab('gateways')"
      >
        Gateways
      </button>
    </div>

    <!-- Routes -->
    <section v-show="activeTab === 'routes'" class="card">
      <div class="card-header">
        <h2>Cluster routes</h2>
        <span class="badge is-idle">{{ formatCount(routes.data.value?.numRoutes ?? 0) }} routes</span>
      </div>

      <DataState
        :pending="routes.pending.value"
        :loaded="routes.loaded.value"
        :failure="routes.failure.value"
        :empty="(routes.data.value?.routes.length ?? 0) === 0"
        empty-title="No cluster routes"
        empty-hint="This server is not clustered. Add a cluster block with routes to the configuration to form a cluster."
        @retry="routes.refresh()"
      >
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th class="numeric">RID</th>
                <th>Remote name</th>
                <th>Address</th>
                <th class="numeric">Subs</th>
                <th class="numeric">Pending</th>
                <th class="numeric">In msgs</th>
                <th class="numeric">Out msgs</th>
                <th>Uptime</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="route in routes.data.value?.routes ?? []" :key="route.rid">
                <td class="numeric">{{ route.rid }}</td>
                <td>{{ route.remoteName || route.remoteId || 'unnamed' }}</td>
                <td>{{ route.ip }}:{{ route.port }}</td>
                <td class="numeric">{{ formatCount(route.subscriptions) }}</td>
                <td class="numeric">{{ formatBytes(route.pendingBytes) }}</td>
                <td class="numeric">{{ formatCount(route.inMsgs) }}</td>
                <td class="numeric">{{ formatCount(route.outMsgs) }}</td>
                <td>{{ route.uptime }}</td>
                <td>
                  <span v-if="route.isConfigured" class="badge is-idle">configured</span>
                  <span v-else class="badge is-idle">solicited</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </section>

    <!-- Subscriptions -->
    <section v-show="activeTab === 'subs'" class="card">
      <div class="card-header">
        <h2>Subscription list sublist</h2>
        <span class="badge is-idle">
          {{ formatCount(subs.data.value?.total ?? 0) }} detailed
        </span>
      </div>

      <DataState
        :pending="subs.pending.value"
        :loaded="subs.loaded.value"
        :failure="subs.failure.value"
        @retry="subs.refresh()"
      >
        <div class="stat-grid" style="margin-bottom: 16px">
          <StatTile
            v-for="row in sublistRows"
            :key="row.label"
            :label="row.label"
            :value="row.value"
          />
        </div>

        <div
          v-if="(subs.data.value?.subscriptions.length ?? 0) > 0"
          class="table-scroll"
        >
          <table class="data-table">
            <thead>
              <tr>
                <th class="numeric">CID</th>
                <th>Subject</th>
                <th>Queue group</th>
                <th class="numeric">Msgs</th>
                <th class="numeric">Max pending</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sub in subs.data.value?.subscriptions ?? []" :key="`${sub.sid}-${sub.cid}`">
                <td class="numeric">{{ sub.cid }}</td>
                <td>{{ sub.subject }}</td>
                <td>{{ sub.queue || '—' }}</td>
                <td class="numeric">{{ formatCount(sub.msgs) }}</td>
                <td class="numeric">{{ sub.maxPending }}</td>
                <td>{{ sub.account || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-else class="hint-text">
          No detailed subscriptions returned. The server only includes them when asked
          (<code class="inline-code">subs=true</code>) and the count can still be large — filter by account
          server-side if this stays slow.
        </p>
      </DataState>
    </section>

    <!-- Leafnodes -->
    <section v-show="activeTab === 'leafnodes'" class="card">
      <div class="card-header">
        <h2>Leafnodes</h2>
        <span class="badge is-idle">{{ formatCount(leafnodes.data.value?.numLeafnodes ?? 0) }} connections</span>
      </div>

      <DataState
        :pending="leafnodes.pending.value"
        :loaded="leafnodes.loaded.value"
        :failure="leafnodes.failure.value"
        :empty="(leafnodes.data.value?.leafnodes.length ?? 0) === 0"
        empty-title="No leafnode connections"
        empty-hint="Add a leafnodes block with remotes to the server configuration to connect edge servers."
        @retry="leafnodes.refresh()"
      >
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th class="numeric">RLID</th>
                <th>Remote name</th>
                <th>Address</th>
                <th class="numeric">Subs</th>
                <th class="numeric">Pending</th>
                <th class="numeric">In msgs</th>
                <th class="numeric">Out msgs</th>
                <th>Uptime</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="leaf in leafnodes.data.value?.leafnodes ?? []" :key="leaf.rlid">
                <td class="numeric">{{ leaf.rlid }}</td>
                <td>{{ leaf.remoteName || leaf.remoteId || 'unnamed' }}</td>
                <td>{{ leaf.ip }}:{{ leaf.port }}</td>
                <td class="numeric">{{ formatCount(leaf.subscriptions) }}</td>
                <td class="numeric">{{ formatBytes(leaf.pendingBytes) }}</td>
                <td class="numeric">{{ formatCount(leaf.inMsgs) }}</td>
                <td class="numeric">{{ formatCount(leaf.outMsgs) }}</td>
                <td>{{ leaf.uptime }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </section>

    <!-- Gateways -->
    <section v-show="activeTab === 'gateways'" class="card">
      <div class="card-header">
        <h2>Gateways</h2>
        <span class="badge is-idle">{{ formatCount(gateways.data.value?.numGateways ?? 0) }} gateways</span>
      </div>

      <DataState
        :pending="gateways.pending.value"
        :loaded="gateways.loaded.value"
        :failure="gateways.failure.value"
        :empty="(gateways.data.value?.gateways.length ?? 0) === 0"
        empty-title="No gateways"
        empty-hint="Gateways join clusters into a supercluster. Add a gateway block with remotes to enable them."
        @retry="gateways.refresh()"
      >
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th class="numeric">Subs</th>
                <th class="numeric">Pending</th>
                <th class="numeric">In msgs</th>
                <th class="numeric">Out msgs</th>
                <th class="numeric">Accounts</th>
                <th>Uptime</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="gateway in gateways.data.value?.gateways ?? []" :key="gateway.name">
                <td>{{ gateway.name }}</td>
                <td>{{ gateway.url || `${gateway.host}:${gateway.port}` }}</td>
                <td class="numeric">{{ formatCount(gateway.subscriptions) }}</td>
                <td class="numeric">{{ formatBytes(gateway.pendingBytes) }}</td>
                <td class="numeric">{{ formatCount(gateway.inMsgs) }}</td>
                <td class="numeric">{{ formatCount(gateway.outMsgs) }}</td>
                <td class="numeric">{{ formatCount(gateway.accounts) }}</td>
                <td>{{ gateway.uptime }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </section>

    <p class="app-footer-note">
      Subject lists are attached by the server only when asked. Turn them off on large deployments —
      <code class="inline-code">/subsz?subs=true</code> and <code class="inline-code">/routez?subs=true</code>
      return every subject on the node.
    </p>
  </div>
</template>