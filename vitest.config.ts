import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Vitest runs the pure `shared/` layer and the Nitro server utilities in a plain
 * Node environment, so `#shared` is mapped here rather than relying on Nuxt's
 * generated aliases.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})