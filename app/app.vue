<script setup lang="ts">
/** Root component: renders the layout and the active page. */
useHead({
  titleTemplate: (title?: string) => (title ? `${title} · NATS WebUI` : 'NATS WebUI'),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>