/**
 * @module ai/services/fleet/readActiveWakeSubscriptionIdentities
 * @summary The trusted Brain-side observation source for the fleet's wake axis: one bulk scan of
 * ACTIVE wake subscriptions, returning the holder identities — administrative READ-observation
 * under the fleet process's own authority, deliberately NOT the caller-owner management API (which
 * derives its owner from the request context and must never be impersonated).
 *
 * The graph service loads lazily per call: the fleet server pays the memory-core import cost only
 * when a roster read actually needs wake truth, and a fresh scan per snapshot means no long-lived
 * cache to go stale. Any failure — import, init, scan — THROWS, and the wake adapter converts that
 * into honest per-row `unknown` under a degraded capability; this module never fabricates an empty
 * fleet.
 *
 * Durable-first by construction: the fleet server is a SEPARATE PROCESS from the MCP server that
 * writes subscriptions, so the graph's in-memory `nodes.items` cache holds only what THIS process
 * happened to load — a cross-process reader that trusts it would report a subscribed agent as
 * `off`, fabricating the exact blind-switch the S2 axis exists to catch. SQLite is the only shared
 * truth, so the durable query is the production path; the cache scan survives solely as an
 * injected-double seam for tests.
 */

import {
    activeWakeSubscriptionStatusSql,
    isActiveWakeSubscriptionStatus
} from '../memory-core/wakeSubscriptionStatusPolicy.mjs';

/**
 * The durable fleet-wide ACTIVE-subscription query. Mirrors the established WAKE_SUBSCRIPTION
 * durable read (`WakeSubscriptionService#_reconcileDuplicateSubscriptions`) minus its owner
 * predicate — this reader is fleet-wide by design. The status predicate is derived from the shared
 * policy rather than hand-written, so this SQL reader and the JS scan below cannot express
 * different meanings for a missing `status`.
 */
const ACTIVE_IDENTITIES_SQL = `
    SELECT DISTINCT json_extract(data, '$.properties.agentIdentity') AS agentIdentity
    FROM Nodes
    WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
      AND ${activeWakeSubscriptionStatusSql()}
`

/**
 * @summary Scan the graph for ACTIVE wake subscriptions and return their holder identities.
 * @param {Object} [options]
 * @param {Object} [options.graphService] Injectable service exposing `ready()` + `db`; defaults to
 *     the memory-core `GraphService` singleton, imported lazily.
 * @returns {Promise<String[]>} The wake identities holding an active subscription (deduplicated).
 * @throws {Error} When no read surface is reachable — the adapter maps this to honest `unknown`.
 */
export async function readActiveWakeSubscriptionIdentities({graphService = null} = {}) {
    const service = graphService || (await import('../memory-core/GraphService.mjs')).default

    // `db` is populated by async init, not by module import: reading it straight off the fresh
    // import yields undefined. `ready()` is the ONLY architecture-compliant external wait —
    // `core.Base` triggers `initAsync()` itself during `Neo.create()`, so awaiting that method from
    // out here would run it a second time (`src/core/Base.mjs`). Mirrors `WakeSubscriptionService`.
    await service.ready()

    const sqlite = service.db?.storage?.db

    if (sqlite) {
        return sqlite.prepare(ACTIVE_IDENTITIES_SQL)
            .all()
            .map(row => row.agentIdentity)
            .filter(identity => typeof identity === 'string' && identity !== '')
    }

    // Test-double seam only: an injected service with no SQLite handle. Never the production path —
    // see the module note on cross-process cache truth.
    const items = service.db?.nodes?.items

    if (!items) {
        throw new Error('wake subscription scan: graph read surface unavailable')
    }

    const identities = new Set()

    for (const node of items) {
        if (node.label !== 'WAKE_SUBSCRIPTION') continue

        const props = node.properties || {}

        if (isActiveWakeSubscriptionStatus(props.status) && typeof props.agentIdentity === 'string' && props.agentIdentity !== '') {
            identities.add(props.agentIdentity)
        }
    }

    return [...identities]
}
