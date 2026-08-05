/**
 * @module ai/mcp/server/knowledge-base/describeCollectionStats
 * @summary Pure render decision for the startup collection-stats line: which log level a corpus
 * observation earns, and what to print. Extracted from the Server so the decision is witnessable
 * without instantiating an MCP server — the class stays a thin caller that forwards to a logger.
 */

/**
 * Log levels this decision can return. `silent` means there is nothing to say at all, which is
 * distinct from having something to say at `info`.
 * @type {Object}
 */
export const STATS_LEVEL = Object.freeze({
    info  : 'info',
    silent: 'silent',
    warn  : 'warn'
});

/**
 * @summary Decides how a Knowledge Base collection observation should be rendered at startup.
 *
 * An empty corpus printed as `info` under the success banner is how a six-day corpus outage stayed
 * invisible: a dockerization migration recreated the canonical collection, ~61,206 documents stayed
 * behind in the previous data root, and startup rendered a green "health check passed" followed by
 * `- Knowledge Base: 0`. The count was never missing — it was framed as success.
 *
 * The correction belongs at the render and deliberately NOT on `health.status`: that field is the
 * container liveness gate, the MCP healthcheck accepts only `healthy` by default, and both ingress
 * and the orchestrator gate on `service_healthy` — so degrading an empty corpus stops a fresh plane
 * from booting at all. Reporting loudly is free; changing the gate is not.
 *
 * Readability is checked with `Number.isFinite` and NOT `typeof count === 'number'`, because
 * `typeof NaN === 'number'` is true: a NaN count clears a typeof guard, then fails the `=== 0` test,
 * and renders as a populated corpus at `info`. That is the original failure mode wearing a new
 * value — the witnessing spec in this module's sibling test caught it on first run. `Number.isFinite`
 * also rejects `Infinity`, `null`, `undefined` and numeric strings without coercing any of them.
 * A partially migrated or mid-swap collection presents exactly this way.
 *
 * @param {Object|null|undefined} knowledgeBase The collection descriptor from a health payload's
 * `database.connection.collections.knowledgeBase`, or a falsy value when the payload carries none.
 * @param {Boolean} [knowledgeBase.exists] Whether the collection was found.
 * @param {Number}  [knowledgeBase.count] Row count observed for the collection.
 * @returns {{level: String, lines: String[]}} The level every line should be emitted at, and the
 * lines themselves. `lines` is empty exactly when `level` is `silent`.
 */
export function describeCollectionStats(knowledgeBase) {
    if (!knowledgeBase) {
        return {level: STATS_LEVEL.silent, lines: []}
    }

    if (!knowledgeBase.exists) {
        return {level: STATS_LEVEL.info, lines: ['   - Knowledge Base: unavailable']}
    }

    const {count} = knowledgeBase;

    if (!Number.isFinite(count)) {
        return {
            level: STATS_LEVEL.warn,
            lines: ['   - Knowledge Base: document count unreadable — corpus size unverified']
        }
    }

    if (count === 0) {
        return {
            level: STATS_LEVEL.warn,
            lines: [
                '   - Knowledge Base: 0 documents — retrieval cannot return a grounded result',
                '     A collection recreated by a migration presents exactly this way. Check whether the',
                '     corpus was left behind in a previous data root before assuming ingestion has not run.'
            ]
        }
    }

    return {level: STATS_LEVEL.info, lines: [`   - Knowledge Base: ${count}`]}
}

export default describeCollectionStats;
