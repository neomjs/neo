/**
 * @module ai/services/fleet/planeWhoIsOnlineReader
 * @summary The plane-mode presence reader: composes the identity-proven plane client's
 * `who_is_online` call into the wake-routes source's `readPresence` contract.
 *
 * The client's `callTool` returns the PARSED tool payload (its `mapToolResult` owns envelope
 * handling) — this reader passes it through after one payload-contract guard: anything without a
 * top-level `agents` array throws, and the source converts that throw into an honest per-seat
 * `unknown` under a degraded capability. A refused or wrong-shape answer never fabricates an
 * absent fleet.
 */

/**
 * @summary Builds the source-facing presence reader over a proven plane client.
 * @param {Object} planeClient A `planeMailboxClient`-contract client: `callTool(name, args)`
 *     resolving to the parsed tool payload (never the wire envelope).
 * @returns {Function} `() => Promise<Object>` matching the wake-routes source's `readPresence` seam.
 */
export function createPlaneWhoIsOnlineReader(planeClient) {
    return async () => {
        // The verbose contract is load-bearing: the terse report omits the per-agent `agents`
        // rows this reader exists to fetch, so a terse request would throw on every healthy call.
        const payload = await planeClient.callTool('who_is_online', {verbose: true})

        if (!Array.isArray(payload?.agents)) {
            throw new Error('plane who_is_online answer unreadable')
        }

        return payload
    }
}

export default createPlaneWhoIsOnlineReader;
