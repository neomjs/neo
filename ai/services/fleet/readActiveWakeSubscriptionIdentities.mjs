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
 * fleet. Known bound, stated plainly: cross-process graph reads serve the loaded projection, so a
 * subscription created moments ago in another process may appear one refresh late — an eventual-
 * consistency lag on a telltale, never a wrong `off`.
 */

/**
 * @summary Scan the graph for ACTIVE wake subscriptions and return their holder identities.
 * @param {Object} [options]
 * @param {Object} [options.graphService] Injectable service exposing `db.nodes.items`; defaults to
 *     the memory-core `GraphService` singleton, imported lazily.
 * @returns {Promise<String[]>} The wake identities holding an active subscription (deduplicated).
 */
export async function readActiveWakeSubscriptionIdentities({graphService = null} = {}) {
    const service = graphService || (await import('../memory-core/GraphService.mjs')).default,
          db      = service.db

    if (!db?.nodes?.items) {
        throw new Error('wake subscription scan: graph read surface unavailable')
    }

    const identities = new Set()

    for (const node of db.nodes.items) {
        if (node.label !== 'WAKE_SUBSCRIPTION') continue

        const props = node.properties || {}

        if (props.status === 'active' && typeof props.agentIdentity === 'string' && props.agentIdentity !== '') {
            identities.add(props.agentIdentity)
        }
    }

    return [...identities]
}
