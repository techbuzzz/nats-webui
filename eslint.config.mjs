// Flat ESLint config. `@nuxt/eslint` builds on eslint-plugin-vue,
// eslint-plugin-typescript and @typescript-eslint with type-aware rules resolved
// against the tsconfigs Nuxt generates, which is why the lint script is `eslint .`
// run after `nuxt prepare` rather than a bare eslint invocation.
//
// Formatting (quotes, semicolons, wrapping) is intentionally NOT enforced here:
// it is owned by Prettier, and `eslint-config-prettier` disables any overlapping
// stylistic rule so the two tools cannot disagree.

import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'

export default withNuxt(
  // Runs last so it wins over any stylistic rule Nuxt enables.
  eslintConfigPrettier,
  {
    ignores: [
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      '.data/**',
      'dist/**',
      'docs/screenshots/**',
    ],
  },
  {
    rules: {
      // Single-word page/component names (`app.vue`, `index.vue`) are the Nuxt
      // convention, not an oversight.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Known finding, scoped to the exact file rather than switched off
    // project-wide, so the rest of the tree stays covered.
    files: ['server/api/config.get.ts'],
    rules: {
      // Declaring `authRequired`/`serverVersion` before the try block and
      // re-initialising them in `catch` is the intended readable shape here:
      // both values must exist regardless of whether /varz answered.
      'no-useless-assignment': 'off',
    },
  },
)