/**
 * @module ai/services/fleet/planeWakeIdentitiesReader
 * @summary The plane-mode bulk wake-subscription reader: composes the identity-proven plane
 * client's `manage_wake_subscription {action: 'fleet-identities'}` call into the wake adapter's
 * `listActiveSubscriptionIdentities` contract.
 *
 * The client's `callTool` returns the PARSED tool payload — its `mapToolResult` unwraps the SDK
 * CallToolResult and throws on malformed content — so this reader consumes `{identities}` directly
 * and MUST NOT parse again: a second envelope-parse pass accepts only CallToolResult shapes, so it
 * rejects every healthy parsed payload and silently degrades the whole plane subscription axis to
 * `unknown`. The guard here is therefore a PAYLOAD-contract guard, not a wire-envelope one:
 * anything without a top-level identities array throws, and the adapter converts that throw into
 * honest per-row `unknown` under a degraded capability — a refused, malformed, or wrong-shape
 * answer never fabricates an empty fleet.
 */

/**
 * @summary Builds the adapter-facing bulk reader over a proven plane client.
 * @param {Object} planeClient A `planeMailboxClient`-contract client: `callTool(name, args)`
 *     resolving to the parsed tool payload (never the wire envelope).
 * @returns {Function} `() => Promise<String[]>` matching the wake adapter's
 *     `listActiveSubscriptionIdentities` bulk-reader seam.
 */
export function createPlaneWakeIdentitiesReader(planeClient) {
    return async () => {
        const payload = await planeClient.callTool('manage_wake_subscription', {action: 'fleet-identities'});

        if (!Array.isArray(payload?.identities)) {
            throw new Error('plane wake fleet-identities answer unreadable')
        }

        return payload.identities
    }
}

/**
 * @summary Builds the observation-carrying bulk reader over a proven plane client — the redacted
 * `{identity, lastPollAt}` rows the route-health axis derives poll recency from.
 *
 * Deployment-lag tolerant by design: a plane that answers identities without `observations` rows
 * (an image predating the recency disclosure) degrades to `lastPollAt: null` per identity —
 * honest absence-of-signal, never a fabricated recency and never a broken subscription axis. A
 * payload without even an identities array still throws, exactly like the sibling reader.
 * @param {Object} planeClient A `planeMailboxClient`-contract client: `callTool(name, args)`
 *     resolving to the parsed tool payload (never the wire envelope).
 * @returns {Function} `() => Promise<Object[]>` yielding `[{identity, lastPollAt}]`, matching the
 *     wake adapter's `listActiveSubscriptionObservations` bulk-reader seam.
 */
export function createPlaneWakeObservationsReader(planeClient) {
    return async () => {
        const payload = await planeClient.callTool('manage_wake_subscription', {action: 'fleet-identities'});

        if (Array.isArray(payload?.observations)) {
            return payload.observations
                .filter(row => typeof row?.identity === 'string' && row.identity !== '')
                .map(row => ({
                    identity  : row.identity,
                    lastPollAt: typeof row.lastPollAt === 'string' && row.lastPollAt !== '' ? row.lastPollAt : null
                }))
        }

        if (!Array.isArray(payload?.identities)) {
            throw new Error('plane wake fleet-identities answer unreadable')
        }

        return payload.identities.map(identity => ({identity, lastPollAt: null}))
    }
}
