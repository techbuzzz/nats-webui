# Screenshots

The PNGs in this directory are real captures of a **running** `nats-webui`, not
mockups or renders. They are referenced from the tables in the root
[`README.md`](../../README.md), so the filenames are part of the repository's
contract — keep them stable.

| File                                                  | View                                            |
| ----------------------------------------------------- | ----------------------------------------------- |
| [`dashboard.png`](./dashboard.png)                    | Dashboard — `/varz`, connections, JetStream usage |
| [`connections.png`](./connections.png)                | Connections — the sortable, filterable `/connz` table |
| [`connection-detail.png`](./connection-detail.png)    | Connection detail — `/connz?cid=N` and its subscriptions |
| [`routing.png`](./routing.png)                        | Routing & Subscriptions — `/routez`, `/subsz`, `/leafz`, `/gatewayz` |
| [`jetstream.png`](./jetstream.png)                    | JetStream — `/jsz`, `/accountz`, storage and per-account breakdown |
| [`playground.png`](./playground.png)                  | Playground — publish / subscribe / request-reply |
| [`playground-log.png`](./playground-log.png)          | Playground with the raw NATS protocol log open  |

## What stack they came from

- `nats-webui` built locally from this repository (`docker compose build`).
- `nats:2.11.17` from Docker Hub, using `nats/nats-server.conf` unmodified,
  including its `websocket {}` block — the playground needs that port.
- The default `docker-compose.yml`: WebUI on `:3000`, NATS client on `:4222`,
  WebSocket on `:8080`, monitoring on `:8222` reachable only from the WebUI on
  the internal network.

The state in the images was seeded deliberately (a stream, a consumer, live
connections and a short playground exchange) so the tables and panels are not
empty. Nothing in them is real: hostnames, client names, subject names and
payloads are all fabricated for the capture.

## How to regenerate

Full instructions live in [CONTRIBUTING.md](../../CONTRIBUTING.md#regenerating-the-screenshots).
In short:

1. `docker compose up -d --build`
2. Seed a stream/consumer and a playground exchange so the views have content.
3. Capture each view at **1440×900** in a normal browser window — no
   full-page capture, no retina device pixel ratio.
4. Replace the files, keep the filenames, and check the diff for hostnames,
   tokens or client names before committing.

If a UI change makes a screenshot stale, regenerating it belongs in the same PR
as the change — not in a later cleanup commit.