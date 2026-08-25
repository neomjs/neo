import crypto       from 'crypto';
import GraphService from '../GraphService.mjs';

/**
 * @module ai/services/memory-core/helpers/nlActionTelemetryStore
 * @summary Container-plane admission for Neural Link action telemetry — the OPTIONAL, WRITE-ONLY half of
 * the NL relocation, and deliberately the poorer relation of the transaction archive.
 *
 * **Write-only is the contract, not an oversight.** There is no read operation here on purpose. The
 * archive needs a read because replay is a host-initiated round trip; telemetry does not, because its only
 * production consumers read it through the container-owned graph already (`GapInferenceEngine`'s
 * `inferNlActionDigest`) or from a disposable local aggregate (`genesisProbe`). Adding a remote
 * telemetry-read operation would contradict the direction invariant this relocation establishes, so its
 * absence is an asserted property rather than a gap someone should helpfully close.
 *
 * **The admitted record set is decided, not inherited.** The host's table persisted nine columns; a census
 * of every production READ found that `result`, `agent_id` and `reward` have no reader at all. Porting them
 * because they exist would relocate dead data and, worse, relocate an identity: the host's `sequenceId` was
 * `${agentId}_${turnId}`, so the correlation key WAS the agent's identity.
 *
 * **Correlation token and storage row id are two identifiers, and collapsing them breaks the digest.** The
 * host mints a fresh opaque token per SEQUENCE — it must, because only the host knows which actions share a
 * turn, and rows arrive here one at a time — so many admitted rows legitimately carry the same
 * `sequenceId`, which is exactly what `GapInferenceEngine` groups by. The storage row id is generated here
 * and is never the token, so a caller still cannot address or overwrite another seat's row. Minting the
 * token per row instead would satisfy "fresh and opaque" while giving every sequence exactly one action.
 *
 * **`targets` is a bounded projection, never raw args.** `GapInferenceEngine` consumes only target-bearing
 * fragments, so that is all that crosses: class names and component ids. Raw arguments could carry app
 * state, user content, or a `thought` — none of which telemetry needs and none of which should become
 * durable because a tool call happened to include it.
 */

/**
 * Graph node label for one admitted Neural Link action-telemetry row.
 * @type {String}
 */
export const NL_ACTION_TELEMETRY_NODE_TYPE = 'nl-action-telemetry';

/**
 * The exact fields an admitted row may carry. Anything outside this set is DROPPED rather than stored,
 * and the drop is asserted by spec — omission-by-forgetting and omission-by-contract look identical in a
 * passing test, so the contract has to be the thing under test.
 * @type {String[]}
 */
export const ADMITTED_ACTION_FIELDS = Object.freeze([
    'sequenceId', 'sessionId', 'timestamp', 'tool', 'success', 'durationMs', 'appName', 'targets'
]);

/**
 * The shape an admitted correlation token must have: a bare UUID and nothing else.
 *
 * This is the MECHANICAL half of "explicitly not the `${agentId}_${turnId}` identity encoding". The host
 * mints the token — it has to, because only the host knows which actions share a turn, and rows arrive
 * here one at a time — but a contract the container merely trusts the host to honour is a contract with no
 * enforcement. A UUID cannot carry an agent id, so checking the shape checks the property.
 * @type {RegExp}
 */
const OPAQUE_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @summary Projects one caller-supplied action into the admitted record, dropping everything else.
 *
 * Allowlist rather than denylist, and the difference is load-bearing: a denylist admits every field a
 * future NL version invents, so the first unexpected payload key becomes durable telemetry nobody decided
 * to keep. `targets` is re-projected rather than copied for the same reason.
 * @param {Object} action Caller-supplied action row.
 * @returns {Object} The admitted projection.
 */
export function projectAdmittedAction(action = {}) {
    const targets = action.targets || {};

    return {
        // The host's opaque correlation token, carried through UNCHANGED — it is what makes a sequence a
        // sequence, and `GapInferenceEngine` groups by it. Minting one here per row would give every
        // sequence exactly one action and silently destroy the digest's unit of analysis. The storage row
        // id is a DIFFERENT identifier, generated in `admitNlActions`.
        sequenceId: typeof action.sequenceId === 'string' ? action.sequenceId : null,
        sessionId : typeof action.sessionId === 'string' ? action.sessionId : null,
        timestamp : Number.isFinite(action.timestamp) ? action.timestamp : null,
        tool      : typeof action.tool === 'string' ? action.tool : null,
        success   : action.success === true,
        durationMs: Number.isFinite(action.durationMs) ? action.durationMs : null,
        appName   : typeof action.appName === 'string' ? action.appName : null,
        targets   : {
            classNames  : Array.isArray(targets.classNames)   ? targets.classNames.filter(v => typeof v === 'string')   : [],
            componentIds: Array.isArray(targets.componentIds) ? targets.componentIds.filter(v => typeof v === 'string') : []
        }
    };
}

/**
 * @summary Admits a bounded batch of Neural Link action telemetry into the container graph.
 *
 * Host-initiated and write-only: the return value reports what was admitted, never the rows themselves.
 * Reporting the stored rows back would make this a read operation wearing a write's name, which is the
 * loophole the write-only contract exists to close.
 *
 * A row that cannot be stored is COUNTED as refused rather than aborting the batch — telemetry is
 * observability and must never take down the possession session that produced it. The count is the signal;
 * silence would let a wholly-failing admission read as a successful one.
 *
 * @param {Object} options
 * @param {Object[]} [options.actions=[]] Caller-supplied action rows.
 * @param {Number} [options.now=Date.now()] Injected clock.
 * @returns {{admitted: Number, refused: Number}}
 */
export function admitNlActions({actions = [], now = Date.now()} = {}) {
    const rows = Array.isArray(actions) ? actions : [];

    let admitted = 0,
        refused  = 0;

    for (const action of rows) {
        if (!action || typeof action !== 'object') {
            refused++;
            continue;
        }

        const projected = projectAdmittedAction(action);

        // A token that is not a bare UUID is refused rather than stored: it is the one field a host could
        // use to make agent identity durable, and the refusal is COUNTED, so a host that starts sending the
        // wrong shape shows up as a refused batch instead of quietly writing identity into the graph.
        if (!OPAQUE_TOKEN.test(projected.sequenceId ?? '')) {
            refused++;
            continue;
        }

        try {
            GraphService.upsertNode({
                // The storage id is generated HERE and is NOT the correlation token, so a caller cannot
                // address, collide with, or overwrite another seat's row by choosing its own key — while
                // many rows still legitimately share one `sequenceId`.
                id        : `${NL_ACTION_TELEMETRY_NODE_TYPE}:${crypto.randomUUID()}`,
                type      : NL_ACTION_TELEMETRY_NODE_TYPE,
                name      : projected.tool ?? NL_ACTION_TELEMETRY_NODE_TYPE,
                updatedAt : now,
                properties: {
                    ...projected,
                    // EXPLICIT shared disposition, not an accident of who happened to write the row.
                    // `upsertNode` stamps `Nodes.user_id` from the requesting context, which would make
                    // this telemetry private to the seat that produced it — and its only consumer is
                    // `GapInferenceEngine`, a swarm-wide digest that mints evidence on shared CLASS and
                    // COMPONENT nodes. Private rows would leave that digest reading nothing, and the
                    // tempting fix — dropping the RLS predicate from the reader — silently turns every
                    // OTHER tenant's private rows readable too. Declaring team visibility here lets the
                    // reader keep its predicate: what it sees is what was deliberately shared.
                    //
                    // Safe to share because the admitted set is already bounded to counts and targets:
                    // no arguments, no results, no agent identity. That is what makes this a disposition
                    // rather than a leak.
                    visibility: 'team'
                }
            });

            admitted++;
        } catch (error) {
            refused++;
        }
    }

    return {admitted, refused};
}

/**
 * @summary Deletes admitted telemetry older than a cutoff. The retention path the relocation owes.
 *
 * **Who enforces retention, and why it is here.** The host used to prune its own SQLite log; the log is
 * gone, so the policy had no store and no enforcer — an unused leaf beside graph nodes that grew forever.
 * Retention is now the container's, enforced from the digest run (`GapInferenceEngine.inferNlActionDigest`,
 * scheduled cycle-scoped by `DreamService`), which is a live production caller rather than a method waiting
 * for one.
 *
 * **The cutoff is the digest's own lookback, deliberately NOT a second policy number.** The digest is this
 * telemetry's only production consumer and it reads `nlActionDigestLookbackMs` back; a row older than that
 * is already unreadable by everything that reads it. Declaring a separate retention window would put two
 * same-meaning leaves in the config SSOT — a named antipattern there — and let them drift into a state
 * where rows are kept precisely as long as nothing can use them. So the caller passes the window it
 * already resolved.
 *
 * Deletes by ID through `GraphService.removeNodes` rather than by SQL `DELETE`, so the in-memory node cache
 * and the row leave together; a direct `DELETE` would strand the cached copies and the next read would
 * serve rows that no longer exist on disk.
 *
 * @param {Object} options
 * @param {Number} options.olderThanTimestamp Rows whose `timestamp` is strictly below this are deleted.
 * @param {Number} [options.limit=5000] Bound on one sweep, so a long-neglected store cannot stall a cycle.
 * @returns {{status: String, deleted: Number, reason: String|undefined}}
 */
export function pruneNlActionTelemetry({olderThanTimestamp, limit = 5000} = {}) {
    const sqlite = GraphService.db?.storage?.db;

    if (!sqlite) {
        return {status: 'skipped', deleted: 0, reason: 'graph-sqlite-unavailable'};
    }

    if (!Number.isFinite(olderThanTimestamp)) {
        // A missing cutoff must never mean "prune everything". Refusing is the only safe reading.
        return {status: 'skipped', deleted: 0, reason: 'no-cutoff'};
    }

    try {
        // Mirrors the reader's selection (`readNlActionRows`) so retention and readability cannot disagree
        // about which rows are in scope.
        //
        // The `IS NOT NULL` clause is EXPLICITNESS, not today's enforcer, and I measured that rather than
        // assuming it: SQLite evaluates `NULL < ?` as NULL, which is falsy in `WHERE`, so a row with no
        // `timestamp` is already never selected — dropping the clause changes nothing. It stays because the
        // obvious future edit is a coalescing comparison (`COALESCE(timestamp, 0) < ?`), which WOULD sweep
        // every null-timestamp row on the first run, and this clause is what makes that rewrite fail
        // loudly instead of silently deleting them.
        const expired = sqlite.prepare(`
            SELECT id
            FROM Nodes
            WHERE json_extract(data, '$.label') = ?
              AND json_extract(data, '$.properties.timestamp') IS NOT NULL
              AND json_extract(data, '$.properties.timestamp') < ?
            LIMIT ?
        `).all(NL_ACTION_TELEMETRY_NODE_TYPE, olderThanTimestamp, Math.max(1, Number(limit) || 1))
            .map(row => row.id)
            .filter(id => typeof id === 'string' && id !== '');

        if (expired.length === 0) {
            return {status: 'ok', deleted: 0};
        }

        GraphService.removeNodes(expired);

        return {status: 'ok', deleted: expired.length};
    } catch (error) {
        // Retention is maintenance: it must not fail the digest that hosts it, and a silent no-op would
        // read as "nothing to prune" forever.
        return {status: 'failed', deleted: 0, reason: error.message};
    }
}
