<script setup lang="ts">
/** Application shell: sidebar navigation plus the page content area. */
interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/connections', label: 'Connections', icon: '⇄' },
  { to: '/routing', label: 'Routing & Subs', icon: '⌗' },
  { to: '/jetstream', label: 'JetStream', icon: '≡' },
  { to: '/playground', label: 'Playground', icon: '✈' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

const { data: clientConfig } = await useFetch('/api/config', {
  key: 'nats-client-config',
  default: () => ({
    websocketUrl: '',
    connectionName: 'nats-webui',
    authRequired: false,
    serverVersion: '',
  }),
})
</script>

<template>
  <div class="app-layout">
    <aside class="app-sidebar">
      <NuxtLink to="/" class="app-brand">
        <span class="app-brand-mark" aria-hidden="true">N</span>
        <span>NATS WebUI</span>
      </NuxtLink>

      <nav class="app-nav" aria-label="Primary">
        <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="app-nav-link">
          <span aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-status">
        <p class="stat-tile-label">Monitored server</p>
        <p class="sidebar-status-value">
          {{ clientConfig.serverVersion || 'unknown version' }}
        </p>
        <p v-if="clientConfig.authRequired" class="hint-text">
          Authentication is required on this server.
        </p>
      </div>
    </aside>

    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.sidebar-status {
  margin-top: auto;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.sidebar-status-value {
  margin: 4px 0 0;
  font-family: var(--mono);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
</style>
