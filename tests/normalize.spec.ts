import { describe, expect, it } from 'vitest'
import {
  normalizeAccountz,
  normalizeConnz,
  normalizeJsz,
  normalizeRoutez,
  normalizeSubsz,
  normalizeVarz,
  normalizeVarzJetStream,
} from '../shared/utils/normalize'
import type {
  RawAccountz,
  RawConnz,
  RawJsz,
  RawRoutez,
  RawSubsz,
  RawVarz,
} from '../shared/types/nats-wire'

describe('normalizeVarz', () => {
  const varz: RawVarz = {
    server_id: 'NAB2',
    server_name: 'peanuts',
    version: '2.12.0',
    go: 'go1.25.1',
    host: '0.0.0.0',
    port: 4222,
    auth_required: true,
    max_payload: 1_048_576,
    max_connections: 65_536,
    uptime: '1h2m3s',
    start: '2026-10-09T10:00:00Z',
    now: '2026-10-09T11:02:03Z',
    connections: 3,
    total_connections: 12,
    subscriptions: 7,
    routes: 2,
    leafnodes: 1,
    in_msgs: 100,
    out_msgs: 90,
    in_bytes: 2048,
    out_bytes: 1024,
    slow_consumers: 0,
    mem: 25_165_824,
    cpu: 0.5,
    cores: 4,
    http_port: 8222,
    cluster: { name: 'east', urls: ['nats-b:6222'] },
    jetstream: {
      config: { max_memory: 1_073_741_824, max_storage: 10_737_418_240, store_dir: '/data/jetstream' },
      stats: { memory: 2048, storage: 4096, reserved_memory: 512 },
      meta: { leader: 'peanuts', cluster_size: 1 },
    },
  }

  it('maps server fields and derives uptime seconds', () => {
    const result = normalizeVarz(varz)

    expect(result.serverId).toBe('NAB2')
    expect(result.version).toBe('2.12.0')
    expect(result.host).toBe('0.0.0.0')
    expect(result.port).toBe(4222)
    expect(result.authRequired).toBe(true)
    expect(result.maxPayload).toBe(1_048_576)
    expect(result.connections).toBe(3)
    expect(result.subscriptions).toBe(7)
    expect(result.monitoringPort).toBe(8222)
    expect(result.clusterName).toBe('east')
    expect(result.clusterUrls).toEqual(['nats-b:6222'])
  })

  it('parses the server-reported uptime into seconds', () => {
    expect(normalizeVarz(varz).uptimeSeconds).toBe(3723)
  })

  it('falls back to start/now when uptime is missing', () => {
    const { uptime, ...withoutUptime } = varz
    expect(uptime).toBe('1h2m3s')
    expect(normalizeVarz(withoutUptime).uptimeSeconds).toBe(3723)
  })

  it('normalizes the modern nested JetStream object', () => {
    const jetstream = normalizeVarz(varz).jetstream

    expect(jetstream.enabled).toBe(true)
    expect(jetstream.memory).toBe(2048)
    expect(jetstream.storage).toBe(4096)
    expect(jetstream.reservedMemory).toBe(512)
    expect(jetstream.maxMemory).toBe(1_073_741_824)
    expect(jetstream.storeDir).toBe('/data/jetstream')
    expect(jetstream.metaLeader).toBe('peanuts')
    expect(jetstream.metaClusterSize).toBe(1)
  })

  it('degrades gracefully on a completely empty payload', () => {
    const result = normalizeVarz({})

    expect(result.serverId).toBe('')
    expect(result.connections).toBe(0)
    expect(result.maxPayload).toBe(0)
    expect(result.jetstream.enabled).toBe(false)
    expect(result.clusterUrls).toEqual([])
  })
})

describe('normalizeVarzJetStream', () => {
  it('handles the pre-2.11 boolean shape', () => {
    expect(normalizeVarzJetStream(true).enabled).toBe(true)
    expect(normalizeVarzJetStream(false).enabled).toBe(false)
    expect(normalizeVarzJetStream(true).memory).toBe(0)
  })

  it('treats a missing field as disabled rather than throwing', () => {
    const result = normalizeVarzJetStream(undefined)

    expect(result.enabled).toBe(false)
    expect(result.maxStorage).toBe(0)
  })

  it('prefers limits from the config block when present', () => {
    const result = normalizeVarzJetStream({
      config: { max_memory: 100 },
      limits: { max_memory: 200 },
    })

    expect(result.maxMemory).toBe(100)
  })

  it('falls back to limits when the config block is absent', () => {
    const result = normalizeVarzJetStream({ limits: { max_storage: 500 } })
    expect(result.maxStorage).toBe(500)
  })
})

describe('normalizeConnz', () => {
  it('normalizes a connection list', () => {
    const raw: RawConnz = {
      server_id: 'NAB2',
      now: '2026-10-09T11:02:03Z',
      num_connections: 1,
      total: 1,
      connections: [
        {
          cid: 7,
          name: 'worker-1',
          ip: '10.0.0.4',
          port: 51234,
          uptime: '2m3s',
          idle: '1s',
          rtt: '1.250ms',
          subscriptions: 4,
          pending_bytes: 128,
          in_msgs: 10,
          out_msgs: 20,
          authorized_user: 'alice',
          account: 'ORDERS',
          subscriptions_list: ['a.>', 'b.c'],
        },
      ],
    }

    const result = normalizeConnz(raw)

    expect(result.serverId).toBe('NAB2')
    expect(result.numConnections).toBe(1)
    expect(result.connections).toHaveLength(1)

    const entry = result.connections[0]!
    expect(entry.cid).toBe(7)
    expect(entry.name).toBe('worker-1')
    expect(entry.ip).toBe('10.0.0.4')
    expect(entry.port).toBe(51234)
    expect(entry.uptimeSeconds).toBe(123)
    expect(entry.idleSeconds).toBe(1)
    expect(entry.rttMs).toBeCloseTo(1.25, 6)
    expect(entry.pendingBytes).toBe(128)
    expect(entry.authorizedUser).toBe('alice')
    expect(entry.account).toBe('ORDERS')
    expect(entry.subscriptionList).toEqual(['a.>', 'b.c'])
  })

  it('reports an absent RTT as null so sorting can place it last', () => {
    const result = normalizeConnz({ connections: [{ cid: 1 }] })
    expect(result.connections[0]!.rttMs).toBeNull()
  })

  it('returns an empty list for an empty payload', () => {
    const result = normalizeConnz({})

    expect(result.connections).toEqual([])
    expect(result.numConnections).toBe(0)
    expect(result.total).toBe(0)
  })
})

describe('normalizeSubsz', () => {
  it('normalizes sublist statistics and the detail list', () => {
    const raw: RawSubsz = {
      server_id: 'NAB2',
      num_subs: 12,
      num_cache: 11,
      num_matches: 40,
      num_cache_hit: 30,
      num_cache_miss: 10,
      num_orphans: 1,
      num_waiting: 0,
      num_pending: 0,
      num_inserts: 5,
      num_removes: 2,
      total: 1,
      offset: 0,
      limit: 1024,
      subscriptions_list: [
        { cid: 3, subject: 'orders.created', qgroup: 'workers', sid: 'abc', msgs: 9, max: 100, account: '$G' },
      ],
    }

    const result = normalizeSubsz(raw)

    expect(result.numSubs).toBe(12)
    expect(result.numCacheHit).toBe(30)
    expect(result.subscriptions[0]).toEqual({
      subject: 'orders.created',
      queue: 'workers',
      sid: 'abc',
      cid: 3,
      msgs: 9,
      maxPending: 100,
      account: '$G',
    })
  })

  it('handles a payload without detail rows', () => {
    const result = normalizeSubsz({ num_subs: 4 })
    expect(result.subscriptions).toEqual([])
    expect(result.total).toBe(0)
  })
})

describe('normalizeRoutez', () => {
  it('normalizes routes and defaults the count to the list length', () => {
    const raw: RawRoutez = {
      server_id: 'NAB2',
      routes: [{ rid: 1, remote_name: 'nats-b', ip: '172.18.0.4', port: 6222, pending_size: 64, in_msgs: 5 }],
    }

    const result = normalizeRoutez(raw)

    expect(result.numRoutes).toBe(1)
    expect(result.routes[0]!.remoteName).toBe('nats-b')
    expect(result.routes[0]!.pendingBytes).toBe(64)
  })

  it('returns an empty list when there are no routes', () => {
    expect(normalizeRoutez({}).routes).toEqual([])
  })
})

describe('normalizeAccountz', () => {
  it('normalizes account entries', () => {
    const raw: RawAccountz = {
      server_id: 'NAB2',
      account_detail: [
        { name: 'ORDERS', id: 'ORDERS', connections: 2, subscriptions: 5, total_msgs_size: 10, is_system: false },
      ],
    }

    const result = normalizeAccountz(raw)

    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]!.name).toBe('ORDERS')
    expect(result.accounts[0]!.connections).toBe(2)
    expect(result.accounts[0]!.totalMsgs).toBe(10)
    expect(result.accounts[0]!.isSystem).toBe(false)
  })
})

describe('normalizeJsz', () => {
  it('normalizes totals, accounts, streams and consumers', () => {
    const raw: RawJsz = {
      server_id: 'NAB2',
      now: '2026-10-09T11:02:03Z',
      streams: 2,
      consumers: 3,
      messages: 1000,
      bytes: 4096,
      total: 1,
      memory: 2048,
      storage: 8192,
      config: { max_memory: 1024, max_storage: 2048, store_dir: '/data/js', domain: 'hub' },
      api: { level: 2, total: 42, errors: 1 },
      meta_cluster: { leader: 'peanuts', cluster_size: 3 },
      account_details: [
        {
          name: 'ORDERS',
          id: 'ORDERS',
          memory: 2048,
          storage: 8192,
          api: { total: 42, errors: 1 },
          stream_detail: [
            {
              name: 'ORDERS_S',
              created: '2026-10-09T10:00:00Z',
              config: {
                name: 'ORDERS_S',
                subjects: ['orders.>'],
                storage: 'file',
                retention: 'limits',
                num_replicas: 1,
              },
              state: { messages: 1000, bytes: 4096, first_seq: 1, last_seq: 1000, consumer_count: 3, num_subjects: 2 },
              cluster: { leader: 'peanuts' },
              consumer_detail: [
                {
                  name: 'workers',
                  num_pending: 4,
                  num_ack_pending: 1,
                  delivered: { consumer_seq: 10, stream_seq: 20 },
                  ack_floor: { consumer_seq: 9, stream_seq: 19 },
                  cluster: { leader: 'peanuts' },
                },
              ],
            },
          ],
        },
      ],
    }

    const result = normalizeJsz(raw)

    expect(result.enabled).toBe(true)
    expect(result.streams).toBe(2)
    expect(result.consumers).toBe(3)
    expect(result.messages).toBe(1000)
    expect(result.maxStorage).toBe(2048)
    expect(result.storeDir).toBe('/data/js')
    expect(result.domain).toBe('hub')
    expect(result.api.total).toBe(42)
    expect(result.api.errors).toBe(1)
    expect(result.metaLeader).toBe('peanuts')
    expect(result.metaClusterSize).toBe(3)

    const account = result.accounts[0]!
    expect(account.name).toBe('ORDERS')
    expect(account.storage).toBe(8192)

    const stream = account.streams[0]!
    expect(stream.name).toBe('ORDERS_S')
    expect(stream.subjects).toEqual(['orders.>'])
    expect(stream.storage).toBe('file')
    expect(stream.retention).toBe('limits')
    expect(stream.messages).toBe(1000)
    expect(stream.consumerCount).toBe(3)
    expect(stream.clusterLeader).toBe('peanuts')
    expect(stream.consumers[0]!.name).toBe('workers')
    expect(stream.consumers[0]!.deliveredConsumerSeq).toBe(10)
    expect(stream.consumers[0]!.ackFloorStreamSeq).toBe(19)
  })

  it('marks a disabled JetStream instance', () => {
    const result = normalizeJsz({ disabled: true })

    expect(result.enabled).toBe(false)
    expect(result.accounts).toEqual([])
    expect(result.api.total).toBe(0)
  })

  it('names a stream from its config when the top-level name is missing', () => {
    const result = normalizeJsz({
      account_details: [{ name: 'A', stream_detail: [{ config: { name: 'FROM_CONFIG' } }] }],
    })

    expect(result.accounts[0]!.streams[0]!.name).toBe('FROM_CONFIG')
  })
})