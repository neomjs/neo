/**
 * @module ai/services/memory-core/helpers/sessionSummaryReader
 * @summary Adapts Memory Core's `listSummaries` into the team-visible session-summary leg of the temporal
 * Bird View's coverage — the second source the chronological spine consumes alongside `query_recent_turns`.
 *
 * `query_recent_turns` is tenant-bound by deliberate multi-tenant design (it AND-filters the requested
 * identity with the CALLER's userId), so a `unified` walk cannot see a PEER's turns — their turns live under
 * the peer's userId. `listSummaries` reads the team-visible summary index (deployment-wide under the additive
 * team policy), so session summaries recover the peer sessions the recency walk structurally cannot, and the
 * `unified` window stops silently declaring peers exhausted. Summaries are session-grain (`type:'session'`),
 * carry `impact` (so citationProminence can direct-cite the high-impact ones) and `sessionId` (drill-down).
 *
 * This is a COVERAGE source, not enrichment: a read failure degrades coverage honestly rather than being
 * treated as an empty window.
 */

/**
 * @summary Coerces a Date / ISO-8601 string / epoch-ms number to finite epoch milliseconds, or `null`.
 * @param {(Date|String|Number)} value
 * @returns {(Number|null)}
 */
function toEpochMs(value) {
    if (value == null) return null;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms
}

/**
 * @summary Builds a `fetchWindowSessions({windowStart, windowEnd, partition})` closure over an injected
 * `listSummaries`. Walks the timestamp-DESC summary index page-by-page, collecting the summaries inside the
 * half-open window and stopping once a page runs older than `windowStart` (the index is sorted, so nothing
 * older can follow).
 * @param {Object} options
 * @param {Function} options.listSummaries The bound Memory Core method (injected — keeps this testable).
 * @param {Number} [options.pageSize=50] Page size for the offset walk.
 * @returns {Function} `async ({windowStart, windowEnd, partition}) => {sources: Object[], degraded, reason}`.
 */
export function makeSessionSummaryReader({listSummaries, pageSize = 50} = {}) {
    if (typeof listSummaries !== 'function') {
        throw new Error('makeSessionSummaryReader: an injected `listSummaries` function is required')
    }

    return async function fetchWindowSessions({windowStart, windowEnd, partition = 'unified'} = {}) {
        const startMs = toEpochMs(windowStart) ?? -Infinity,
              endMs   = toEpochMs(windowEnd)   ??  Infinity,
              // `unified` reads team-wide (no author scope); a `@identity` partition scopes to that author.
              listArgs = partition && partition !== 'unified' ? {agentIdentity: partition} : {},
              sources  = [];

        let offset = 0;

        while (true) {
            let page;

            try {
                page = await listSummaries({...listArgs, limit: pageSize, offset})
            } catch (error) {
                return {sources, degraded: true, reason: `session-summary-read-failed: ${error instanceof Error ? error.message : String(error)}`}
            }

            if (page?.error) {
                return {sources, degraded: true, reason: `session-summary-read-error: ${page.error}`}
            }

            const summaries = Array.isArray(page?.summaries) ? page.summaries : [];
            if (summaries.length === 0) break;

            let ranOlderThanWindow = false;
            for (const summary of summaries) {
                const ts = toEpochMs(summary?.timestamp);
                if (ts == null) continue;                       // no verifiable timestamp — cannot place in-window
                if (ts < startMs) { ranOlderThanWindow = true; break } // sorted DESC → nothing newer follows
                if (ts < endMs) {
                    sources.push({
                        id       : summary.id,
                        timestamp: summary.timestamp,
                        type     : 'session',
                        sessionId: summary.sessionId,
                        impact   : summary.impact,
                        summary  : summary.summary || summary.title
                    })
                }
            }

            if (ranOlderThanWindow || summaries.length < pageSize) break;
            offset += summaries.length
        }

        return {sources, degraded: false, reason: null}
    }
}
