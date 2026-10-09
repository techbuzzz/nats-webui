// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',

  devtools: { enabled: false },

  modules: ['@nuxt/eslint'],

  // Formatting is owned by Prettier (see .prettierrc); ESLint deliberately runs
  // without the stylistic ruleset so the two never fight over the same lines.
  eslint: {
    config: {
      stylistic: false,
    },
  },

  // Default fallbacks live in `server/utils/nats-config.ts`, not here: every
  // value below exists so Nitro can map NUXT_* environment variables onto it at
  // *runtime*, which is what makes the container configurable without a rebuild.
  runtimeConfig: {
    nats: {
      monitorUrl: '',
      monitorUser: '',
      monitorPassword: '',
      monitorToken: '',
      monitorTimeoutMs: '',
      clientUrl: '',
    },
    public: {
      nats: {
        websocketUrl: '',
        connectionName: '',
      },
    },
  },

  typescript: {
    strict: true,
  },

  css: ['~/assets/css/main.css'],

  nitro: {
    compressPublicAssets: true,
  },

  app: {
    head: {
      title: 'NATS WebUI',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Monitoring, JetStream and publish playground for a NATS server.',
        },
      ],
      htmlAttrs: { lang: 'en' },
    },
  },
})
