/**
 * @module ai/services/graph/produceLifecycleFrontier
 * @summary Composes the injected source reads into one `lifecycle-frontier.v1` envelope — the surface
 * answering "what already requires MY response right now".
 *
 * The three layers stay separate on purpose: the admission predicates decide what counts, the envelope
 * enforces the contract, and this composition owns only the impure edges — reading each source,
 * surviving a source that fails, and refusing to read at all for an agent whose binding was never
 * attested. The sources are owned elsewhere (GitHub Workflow owns PR/review/check facts; Memory Core
 * A2A owns claimed-task and direct-message facts); this normalizes what they return and never
 * re-derives their truth.
 *
 * Two honesty rules shape the whole module:
 *
 * - **Never-foreign beats complete.** An unattested binding reads no sources and carries no items.
 *   Showing one peer another peer's obligations is worse than showing nothing, so the unattested path
 *   short-circuits before any read rather than filtering afterwards.
 * - **A source that failed is not a source that was empty.** Each read degrades independently and names
 *   itself in `coverage.degradedSources`. A frontier missing a whole source must never read as "nothing
 *   awaits you" — that is the one wrong answer this surface can give, because a peer acts on it.
 */

import {buildLifecycleFrontier} from './lifecycleFrontier.mjs';
import {collectLifecycleItems}  from './lifecycleAdmission.mjs';

/**
 * @summary The source names carried in `coverage`. Each maps to one injected read and degrades alone.
 * @type {String[]}
 */
export const LIFECYCLE_SOURCES = Object.freeze(['pull-requests', 'tasks', 'messages']);

/**
 * @summary The only bindings that may carry a lifecycle overlay. Everything else — absent, inferred,
 * conflicted, or simply unrecognized — is unattested and reads nothing.
 * @type {Set<String>}
 */
const ATTESTED_RESOLUTIONS = Object.freeze(new Set(['agent-instance', 'agent']));

/**
 * @summary Runs one injected source read, converting a failure OR an unusable answer into a named
 * degradation rather than a thrown pass or a false emptiness.
 *
 * A source read is impure and may fail for reasons that say nothing about the agent's obligations (a
 * rate limit, a cold service). Losing the other sources to it would turn a partial outage into a false
 * "nothing awaits you", so the failure is contained and named here.
 *
 * A source that returns something other than a list of rows is degraded, NOT empty. Coercing a
 * malformed answer to `[]` would launder "I could not read this" into "there is nothing here" — the one
 * wrong answer this surface can give, and the exact defect the module contract forbids. An unusable
 * answer is an unknown, and only the source's own shape can distinguish it from a real absence.
 *
 * @param {String} name The source name recorded in coverage.
 * @param {Function} read `async () => rows`.
 * @returns {Promise<{name: String, rows: Object[], degraded: Boolean, reason: String|null}>}
 */
async function readSource(name, read) {
    try {
        const rows = await read();

        if (!Array.isArray(rows)) {
            return {
                name,
                rows    : [],
                degraded: true,
                reason  : `${name}: source returned ${rows === null ? 'null' : typeof rows}, not a row list`
            }
        }

        return {name, rows, degraded: false, reason: null}
    } catch (error) {
        return {
            name,
            rows    : [],
            degraded: true,
            reason  : `${name}: ${error instanceof Error ? error.message : String(error)}`
        }
    }
}

/**
 * @summary Produces the lifecycle frontier for one attested agent from injected source reads.
 *
 * Fail-closed by construction: an unattested binding returns an omitted overlay without reading, and a
 * failing source degrades only its own coverage row. The composition itself never throws — a contract
 * violation still fails loud inside {@link buildLifecycleFrontier}, because that would be a producer
 * bug rather than a source outage.
 *
 * @param {Object}   params
 * @param {Object}   params.scope `{agentId, harnessInstance, resolution}` — the attested binding,
 *   resolved by the caller that owns identity. `resolution: 'omitted'` skips every read.
 * @param {Object}   params.sources Injected reads: `{readPullRequests, readTasks, readMessages}`, each
 *   `async () => rows` from the service that owns those facts.
 * @param {Date}     params.now Capture time (injected — no hidden clock).
 * @param {Number}   params.ttlMs How long the frontier stays fresh; a lifecycle answer is perishable,
 *   so the expiry is explicit rather than assumed by a reader.
 * @param {String}   [params.omittedReason] Why the binding was not attested, when it was not.
 * @returns {Promise<Object>} A frozen `lifecycle-frontier.v1` envelope.
 * @throws {TypeError} When a required injection is missing — a wiring bug is not a degradation.
 */
export async function produceLifecycleFrontier({scope, sources, now, ttlMs, omittedReason} = {}) {
    const capturedDate = now instanceof Date ? now : new Date(now);

    if (Number.isNaN(capturedDate.getTime())) {
        throw new TypeError('[produceLifecycleFrontier] now must be a valid Date/timestamp (inject the clock).')
    }

    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new TypeError('[produceLifecycleFrontier] a positive ttlMs is required (inject it from config).')
    }

    const capturedAt = capturedDate.toISOString(),
          expiresAt  = new Date(capturedDate.getTime() + ttlMs).toISOString();

    // Never-foreign: anything that is not a POSITIVELY attested binding short-circuits before any read.
    //
    // The gate is an allow-list, not a check for one known-bad value. Testing `resolution === 'omitted'`
    // would let every other non-attested category — inferred, conflicted, absent, or a value this
    // version does not recognize — reach the source reads and be rejected only downstream, after
    // foreign-capable obligations were already in memory. Rejecting late is not never-foreign; it is
    // filtering, which is precisely what this contract forbids.
    const attested = ATTESTED_RESOLUTIONS.has(scope?.resolution) && typeof scope?.agentId === 'string' && scope.agentId.length > 0;

    if (!attested) {
        return buildLifecycleFrontier({
            scope          : {...scope, resolution: 'omitted'},
            status         : 'missing',
            capturedAt,
            sourceWatermark: capturedAt,
            expiresAt,
            coverage       : {sources: [], degradedSources: []},
            items          : [],
            omittedReason  : omittedReason || `unattested-binding: ${scope?.resolution ?? 'absent'}`
        })
    }

    const {readPullRequests, readTasks, readMessages} = sources || {};

    if (typeof readPullRequests !== 'function' || typeof readTasks !== 'function' || typeof readMessages !== 'function') {
        throw new TypeError('[produceLifecycleFrontier] sources must supply readPullRequests, readTasks, and readMessages.')
    }

    const results = await Promise.all([
        readSource('pull-requests', readPullRequests),
        readSource('tasks',         readTasks),
        readSource('messages',      readMessages)
    ]);

    const [prs, tasks, messages] = results.map(result => result.rows),
          degradedSources        = results.filter(result => result.degraded).map(result => result.reason);

    const items = collectLifecycleItems({agentId: scope?.agentId, prs, tasks, messages});

    // Status is derived from what the READ proved, never from the item count: a degraded source with
    // zero admitted items is not an empty frontier, it is an unknown one, and only the first reading
    // lets a peer judge what the answer is worth.
    const status = degradedSources.length > 0 ? 'degraded' : (items.length > 0 ? 'fresh' : 'empty');

    return buildLifecycleFrontier({
        scope,
        status,
        capturedAt,
        sourceWatermark: capturedAt,
        expiresAt,
        coverage       : {sources: LIFECYCLE_SOURCES, degradedSources},
        items
    })
}
