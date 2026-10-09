# Contributing

Thanks for taking a look. This project is small on purpose, so the bar for a
change is mostly: does it keep the four checks green, and does it have a test?

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js 22+** (see `engines` in `package.json`)
- **npm 10+** (ships with Node 22)
- **Docker** — only needed for the local NATS server and for verifying the image

## Getting set up

```bash
git clone https://github.com/techbuzzz/nats-webui.git
cd nats-webui
npm ci
npm run postinstall          # generates .nuxt/ (types + the ESLint flat config)
```

You still need a NATS server with monitoring and the WebSocket port enabled.
The simplest way is to start just that service from the compose file:

```bash
docker compose up -d nats    # :4222 client, :8080 websocket, :8222 internal
npm run dev                  # http://localhost:3000
```

To exercise the whole stack, including the built image:

```bash
docker compose up -d         # nats + webui
curl -s http://localhost:3000/api/health
```

`npm ci` must be used rather than `npm install` — CI does the same, and a dirty
lockfile will fail there but not locally.

## The four required checks

These run on every push to `main` and every PR. All four must pass.

```bash
npm run lint        # eslint . — flat config via @nuxt/eslint, type-aware
npm run typecheck   # vue-tsc, strict
npm test            # vitest run
npm run build       # nuxt build -> .output/
```

Fix formatting with Prettier:

```bash
npm run format         # rewrite the whole tree
npm run format:check   # verify
```

Note: `format:check` is **not** part of CI. Prettier was adopted after the
codebase was written and reformatting 39 files would obscure the real diff of
any behavioural change. Run `npm run format` on the files you touch; a PR does
not need to reformat the world.

ESLint and Prettier deliberately do not overlap: ESLint runs with the stylistic
ruleset off and `eslint-config-prettier` applied last, so a line is either
linted or formatted, never both. If you add a lint rule that touches layout, add
it to `.prettierrc` instead.

> `npm run typecheck` prints a non-fatal
> `ERR_PACKAGE_PATH_NOT_EXPORTED` warning for `vue-router/volar/sfc-route-blocks`
> on stderr and still exits 0. That is an upstream packaging issue, not a
> failure here. Do not try to "fix" it.

## Do not run `npm audit fix`

`npm audit` currently reports 14 advisories against the Nuxt toolchain — 7
critical, 7 high. Every one of them is **transitive**, reached through
`@nuxt/devtools`, `@nuxt/vite-builder`, `@nuxt/vite-server`,
`@nuxt/nitro-server`, `simple-git`, `globby`/`fast-glob`/`braces`/`micromatch`,
`listhen` and `node-forge`.

None of them ship. The runtime image is a multi-stage build that copies only
`.output`, and a `package.json` scan of `.output/server/node_modules` shows the
shipped set is `nuxt`, `vue`, `@unhead/vue`, `@vue/server-renderer`,
`devalue`, `ufo`, `pathe`, `hookable`, `estree-walker`, `destr` and a handful
of small helpers. No build or devtools package is reachable at runtime, and
`devtools` is disabled in `nuxt.config.ts`.

The reason to write this down: `npm audit fix` claims the fix for these is
`nuxt@3.7.4` — a *downgrade* two majors back. Running it silently replaces a
Nuxt 4 project with Nuxt 3, breaks every test, and looks like a security fix
rather than the regression it is. CI does not run `npm audit`, by design.

If a future Nuxt release actually lands the fix, take the upgrade deliberately
through the four required checks above.

## Tests

The suites live in `tests/` and run under Vitest in a plain Node environment —
they import the pure `shared/` layer and the Nitro utilities directly, not
through a browser.

```bash
npm test                        # single run
npm run test:watch              # watch mode
npx vitest run tests/nats-protocol.spec.ts   # one file
```

What each suite pins:

| File                            | Covers                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `tests/normalize.spec.ts`       | every monitoring normalizer, both JetStream payload shapes, empty payloads     |
| `tests/normalize-primitives.spec.ts` | coercion helpers and Go duration parsing (`1h2m3s`, `1.234ms`, `250us`) |
| `tests/nats-protocol.spec.ts`   | the NATS wire codec: frame encoding, byte-accurate lengths, chunk reassembly   |
| `tests/api-route.spec.ts`       | `/api/monitor/**`: query sanitization, normalization, status/hint mapping       |
| `tests/nats-config.spec.ts`     | URL construction, auth header choice, credential non-leakage                    |

Two rules of thumb:

- **A normalizer must never silently degrade.** An unknown payload has to
  produce the "empty" view model, and the test for it has to say so.
- **Frame lengths are bytes, not characters.** Anything touching
  `shared/utils/nats-protocol.ts` needs a byte-exact assertion.

## Commits and pull requests

- Branch from `main`; one logical change per PR.
- Write commit messages in the imperative mood and explain *why*, not *what*.
  The diff already says what.
- Fill in the PR template. If CI is red, the PR is not ready — every check in
  the template is mandatory.
- Expect review on anything touching `server/`, `shared/`, the normalizers, the
  wire codec, or the Docker security posture. Additions to the pages are
  reviewed more lightly.

### Things that will be declined

- Changes to application behaviour that arrive without tests.
- Pulling in the NATS server's monitoring endpoint through the browser directly.
  The Nitro proxy exists so `:8222` stays internal and credentials stay
  server-side; routing around it is a regression, not an optimisation.
- Publishing the monitoring port, or building secrets into the image.
- Reformatting code with a tool other than the configured Prettier.

## Regenerating the screenshots

`docs/screenshots/*.png` are real captures of a running stack — dashboard,
connections, connection detail, routing, JetStream, and the playground with its
protocol log. **Do not hand-edit them**, and do not commit a capture made with
your own data still in it.

To regenerate:

1. Start a clean stack from the repository's own compose file:

   ```bash
   docker compose up -d --build
   ```

2. Seed some state so the views are not empty. The capture in the repository was
   taken against `nats:2.11.17`. Create at least one stream and consumer (or
   publish and request a few messages in the playground) so the tables, the
   JetStream panels, and the protocol log all have content.

3. Capture each view at **1440×900** in a normal browser window — not a
   full-page screenshot, and not a retina device pixel ratio. Each PNG is
   referenced from the README table, so keep the names:
   `dashboard.png`, `connections.png`, `connection-detail.png`, `routing.png`,
   `jetstream.png`, `playground.png`, `playground-log.png`.

4. Drop the new files over `docs/screenshots/` and check the diff. Anything that
   looks like real hostnames, tokens, client names or message payloads must be
   fixed before committing.

5. Mention the regeneration in the PR description — these are user-visible
   images and reviewers should know they moved.

## Reporting bugs and security issues

- Bugs and feature requests: the issue templates under `.github/ISSUE_TEMPLATE/`.
  Please fill in the NATS version and config; a report without them cannot be
  reproduced.
- Security problems: **not** a public issue. See [SECURITY.md](SECURITY.md).

## License

Contributions are accepted under the [Apache-2.0](LICENSE) license, the same as
the project.