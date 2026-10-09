# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it through GitHub's private vulnerability advisory for this repository:

> <https://github.com/nats-webui/nats-webui/security/advisories/new>
>
> (Repository → *Security* → *Report a vulnerability*)

That channel is private between you and the maintainers. It lets us acknowledge
the report, agree on a disclosure timeline, and prepare a fix and an advisory
before anything public is visible.

Include, as far as you can:

- the affected WebUI version (tag, image digest, or `git describe` output);
- how you deployed it (`docker compose`, `docker run`, or a local build);
- the NATS server version and the relevant parts of its config, **redacted** —
  no tokens or passwords;
- the steps to reproduce, and what an attacker gains;
- any proof-of-concept output, with credentials removed.

We will acknowledge a report within a few days and will keep you informed as the
fix progresses. Please allow a reasonable window for a released fix before
disclosing publicly.

## Scope

In scope:

- the WebUI image and its Nitro server layer (`server/**`);
- the monitoring proxy (`server/api/monitor/**`, `server/utils/`);
- the playground's NATS WebSocket client (`shared/utils/nats-protocol.ts`);
- the Docker build and the published GHCR image.

Out of scope — report upstream instead:

- the NATS server itself: <https://github.com/nats-io/nats-server>
- Nuxt, Nitro, Vue or Vue Router vulnerabilities: report to their own projects.

## Deployment assumptions

The published image is a **monitoring UI**, and the default `docker-compose.yml`
is a **local development** setup. Read this before reporting something that
depends on it:

- The NATS monitoring endpoint (`:8222`) is unauthenticated by default. In the
  shipped compose file it is **not** published to the host and is reachable only
  from the WebUI on the internal network. Publishing it puts an
  unauthenticated view of your server on the network.
- The NATS client (`:4222`) and WebSocket (`:8080`) ports **are** published, and
  the shipped `nats-server.conf` enables no authentication. That is fine on a
  laptop and wrong anywhere else. Enable `authorization {}` before exposing them.
- The WebUI itself has no authentication. Anyone who can reach port 3000 can
  read your monitoring data and publish on the playground. Terminate auth in
  front of it, or bind it to an internal network.
- Per-browser credentials can be persisted to `localStorage` in plain text if
  the operator opts in on the Settings page. That is a deliberate trade-off for
  trusted machines only.

Reports that depend on "the sidecar is reachable by an untrusted network" while
using the default configuration are configuration issues, not vulnerabilities —
but they are real, and the fix belongs in the documentation or the compose file,
so open an issue.