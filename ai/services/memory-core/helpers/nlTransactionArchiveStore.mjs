import crypto                from 'crypto';
import GraphService          from '../GraphService.mjs';
import RequestContextService from '../../../mcp/server/shared/services/RequestContextService.mjs';

/**
 * @module ai/services/memory-core/helpers/nlTransactionArchiveStore
 * @summary Container-plane home for the Neural Link transaction archive — the shipped save / read /
 * replay-mark contract, relocated off the host's own SQLite file and onto the one graph.
 *
 * **Why this exists rather than the host writing its own store.** `RecorderService` opened
 * `better-sqlite3` directly from a host process, which contradicts the one-graph ruling: NL telemetry and
 * archives accumulated in a file nothing else read, so a replay depended on which checkout you happened
 * to be running from. Neural Link itself stays host-resident — it drives a real browser and must — but its
 * DATA belongs where every other durable fact lives.
 *
 * **The archive is a NODE, not a table, and that is a re-shaping rather than a move.** The host stored
 * `nl_transaction_archive` as rows; `GraphService` is the only sanctioned graph writer and it is
 * node/edge-oriented, so each archive becomes one node whose `properties` carry the record. This is
 * lossless for the shipped contract because the host already serialised `ops` and `originWriter` to JSON
 * strings before insertion — nothing survived the old write that cannot survive this one.
 *
 * **Direction is the security axis.** Every operation here is HOST-INITIATED: the host asks, the container
 * answers. A read returning the archive's payload is a response, not container-initiated access to the
 * host, which is the distinction that keeps `patch_code` / `create_component` unreachable from inside.
 *
 * **Data-only is enforced by the wire, not re-implemented here.** The host asserts data-only before it
 * sends (`RecorderService`'s `assertArchiveDataOnly`, which walks for functions and cycles). Whatever
 * reaches this module has already survived JSON transport, and a function or a cyclic reference cannot.
 * Re-walking it container-side would be a second guard for a property the transport already guarantees;
 * what this module validates instead is STRUCTURE, which JSON does not guarantee.
 */

/**
 * Graph node label for one archived Neural Link transaction. A distinct type keeps the archive
 * enumerable (`listNodeRecordsByType`) without a table, and keeps it out of every other type's queries.
 * @type {String}
 */
export const NL_TRANSACTION_ARCHIVE_NODE_TYPE = 'nl-transaction-archive';

/**
 * @summary The archive's graph node id.
 *
 * Prefixed rather than bare so the archive shares one namespace convention with the recovery-run
 * (`recovery-run:${id}`) and identity nodes: a bare UUID in the node table tells a reader nothing about
 * which subsystem owns it, and the graph is read by humans as often as by code.
 * @param {String} archiveId
 * @returns {String}
 */
export function getNlTransactionArchiveNodeId(archiveId) {
    return `${NL_TRANSACTION_ARCHIVE_NODE_TYPE}:${archiveId}`;
}

/**
 * @summary Validates the transaction against the archive contract's admission rules.
 *
 * These are the host's rules, preserved verbatim in effect: only a COMMITTED transaction with at least
 * one op and an identified origin writer is archivable. They are re-stated container-side because this is
 * now the writer, and a writer that trusts its caller's validation has no admission rule of its own —
 * the host's guard protects the host's caller, not the graph.
 * @param {Object|null} transaction
 * @returns {String|null} A refusal reason, or `null` when the transaction is admissible.
 */
export function refuseTransaction(transaction) {
    if (!transaction || transaction.status !== 'committed' || !Array.isArray(transaction.ops) || transaction.ops.length === 0) {
        return 'invalid-transaction';
    }

    const originWriter = transaction.originWriter ?? transaction.ops[0]?.originWriter;

    if (!originWriter?.agentId || !originWriter?.sessionId) {
        return 'missing-origin-writer';
    }

    return null;
}

/**
 * @summary Saves one committed Neural Link transaction to the container graph.
 *
 * Returns the same `{saved, reason}` / `{saved, archiveId}` shape the host contract already published, so
 * `InstanceService.saveTransaction` keeps its caller-visible behaviour across the relocation. A refusal is
 * a named reason rather than a throw for the same reason it was on the host: a transaction the operator
 * cannot archive must not take down the possession session that produced it.
 *
 * @param {Object} options
 * @param {String} [options.appSessionId] The NL app session the transaction was captured in.
 * @param {String} [options.name] Caller-supplied archive name.
 * @param {Object} options.transaction The committed transaction (`{status, ops, originWriter, id, committedAt}`).
 * @param {Number} [options.now=Date.now()] Injected clock — the archive stamp must be testable.
 * @returns {Object} `{saved: true, archiveId}` on admission, or `{saved: false, reason}` — the reason being
 * `invalid-transaction`, `missing-origin-writer`, or `archive-store-unavailable`.
 */
export function saveNlTransaction({appSessionId = null, name = null, transaction, now = Date.now()} = {}) {
    const refusal = refuseTransaction(transaction);

    if (refusal) {
        return {saved: false, reason: refusal};
    }

    const archiveId    = crypto.randomUUID(),
          originWriter = transaction.originWriter ?? transaction.ops[0]?.originWriter,
          trimmedName  = typeof name === 'string' && name.trim() ? name.trim() : null;

    try {
        GraphService.upsertNode({
            id        : getNlTransactionArchiveNodeId(archiveId),
            type      : NL_TRANSACTION_ARCHIVE_NODE_TYPE,
            name      : name ?? archiveId,
            updatedAt : now,
            properties: {
                archiveId,
                // `txId`, not `id` — the App Worker transaction snapshot names it `txId`, and reading the
                // wrong key would archive a null source id that only surfaces at replay time.
                sourceTxId    : transaction.txId ?? null,
                name          : trimmedName,
                appSessionId,
                originWriter,
                // CUSTODY, and it is a different fact from `originWriter` rather than a duplicate of it.
                //
                // `originWriter.agentId` comes from the App Worker's own session context
                // (`src/ai/client/InstanceService.mjs`), so it names a BROWSER-plane agent — a namespace the
                // container has no view of and therefore cannot authenticate. Checking it against the
                // authenticated MCP identity would refuse every legitimate save, because the two are not
                // the same kind of name. So `originWriter` stays what it always was: a caller DECLARATION,
                // load-bearing for replay and worth nothing as a security claim.
                //
                // `custodian` is the identity that actually submitted the write, read from the request
                // context. A caller cannot supply it, and it is defended TWICE — measured, because my first
                // two mutation attempts each left the proof green:
                //   1. `custodian` is absent from `SaveNlTransactionRequest`, and the Zod facade strips
                //      undeclared keys — the same property that keeps the injected clock host-side.
                //   2. This function never reads a caller-supplied custodian; it destructures only
                //      `appSessionId` / `name` / `transaction` / `now`.
                // Either layer alone blocks a forged value, so the composition arm reds only when BOTH are
                // removed. Keep both: layer 1 is the wire contract, layer 2 survives a schema edit.
                // `null` when no context is bound, which is a legitimate state for container-internal
                // writers and is recorded as such rather than fabricated.
                //
                // Net effect: a forged `originWriter` is now ATTRIBUTABLE. That is the honest bound — the
                // container cannot stop a caller declaring one, only record who declared it.
                custodian     : RequestContextService.getUserId() ?? null,
                custodySource : RequestContextService.getSource() ?? null,
                committedAt   : Number.isFinite(transaction.committedAt) ? transaction.committedAt : null,
                archivedAt    : now,
                ops           : transaction.ops,
                replayCount   : 0,
                lastReplayedAt: null
            }
        });
    } catch (error) {
        // The graph being unavailable is the relocation's one new failure mode, and it must be NAMED
        // rather than silently swallowed: the host's fallback was a local write, and re-creating that
        // fallback here would re-create the two realities this work removes. Fail loud, stay honest.
        return {saved: false, reason: `archive-store-unavailable: ${error.message}`};
    }

    // The full success shape the host contract already published — not just `archiveId`. A caller that
    // reads `opCount` or `committedAt` off this result predates the relocation and must keep working.
    return {
        saved      : true,
        archiveId,
        sourceTxId : transaction.txId ?? null,
        archivedAt : now,
        opCount    : transaction.ops.length,
        originWriter,
        committedAt: Number.isFinite(transaction.committedAt) ? transaction.committedAt : null
    };
}

/**
 * @summary Reads one archived transaction back, discriminating ABSENCE from UNREACHABILITY.
 *
 * **Why a status rather than `null`.** The previous shape answered `null` for three different facts: the
 * archive does not exist, the graph threw, and the caller passed no id. A replay then reported
 * `archive-not-found` for a graph that was merely unavailable — which reads as "that archive is gone" to
 * the one caller whose next move depends on the difference. Not-found is now reserved for a SUCCESSFUL
 * read that found no record; a throw is `unavailable` and carries the reason. `status` and the
 * `unavailable` spelling follow {@link Neo.ai.services.memory-core.GraphService#ensureStructuralEdge},
 * which already discriminates its outcomes this way.
 *
 * The record stays FLAT on the success arm rather than nesting under a `record` key, because
 * `saveNlTransaction` above already answers flat-with-a-discriminator and every shipped consumer reads
 * these fields at the top level.
 *
 * An absent or non-string `archiveId` is `not-found` rather than a fourth state: no record can bear it,
 * and the wire schema already requires the field.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Object} `{status: 'found', …record}`, `{status: 'not-found'}`, or `{status: 'unavailable', reason}`.
 */
export function getNlTransaction({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return {status: 'not-found'};
    }

    let record;

    try {
        record = GraphService.getNodeRecord({id: getNlTransactionArchiveNodeId(archiveId)});
    } catch (error) {
        return {status: 'unavailable', reason: `archive-store-unavailable: ${error.message}`};
    }

    if (!record || record.type !== NL_TRANSACTION_ARCHIVE_NODE_TYPE) {
        return {status: 'not-found'};
    }

    const p = record.properties || {};

    return {
        status        : 'found',
        archiveId     : p.archiveId ?? archiveId,
        name          : p.name ?? null,
        sourceTxId    : p.sourceTxId ?? null,
        appSessionId  : p.appSessionId ?? null,
        originWriter  : p.originWriter ?? null,
        custodian     : p.custodian ?? null,
        committedAt   : p.committedAt ?? null,
        archivedAt    : p.archivedAt ?? null,
        ops           : Array.isArray(p.ops) ? p.ops : [],
        replayCount   : Number.isFinite(p.replayCount) ? p.replayCount : 0,
        lastReplayedAt: p.lastReplayedAt ?? null
    };
}

/**
 * @summary Marks one archive as replayed: increments its count and stamps the time.
 *
 * Read-modify-upsert rather than an in-place UPDATE, because the graph has no row to update. The read is
 * what makes the increment honest — an absent archive is refused instead of creating a node with
 * `replayCount: 1`, which would invent a replay of something never archived. A failure to mark is
 * reported with the same `status` vocabulary as the read, so a caller can tell "there is nothing to mark"
 * from "the store could not be reached".
 *
 * **Atomicity, stated precisely.** The old store did this in ONE statement — `SET replay_count =
 * replay_count + 1` — which read and wrote the row itself. What keeps the read-modify-write below
 * equivalent for concurrent marks is that BOTH halves are SYNCHRONOUS: `getNodeRecord` and `upsertNode`
 * return without awaiting, so no other JS can run in the gap and no increment can be lost.
 * ⚠️ An `await` introduced between them would silently break that, which is why a spec pins it.
 *
 * What this does NOT claim is the old statement's cross-process property, and a graph transaction would
 * not restore it: `GraphService` serves both halves from `this.db.nodes`, a process-wide cache, so
 * another process's increment is invisible to this read rather than merely unserialised. Restoring it
 * needs row-level increment plus cache coherence inside `GraphService` — a change to the graph writer
 * itself, which does not belong in this relocation.
 *
 * **Only the two changed keys are written.** Spreading the whole read-back record into `properties` was
 * both redundant — `upsertNode` merges into existing properties — and unsafe: the read REBUILDS the
 * record with defaults (`ops: []` when the stored value is not an array), so a mark could have written
 * that default back over a real payload. A replay mark must not be able to damage the archive it marks.
 * @param {Object} options
 * @param {String} options.archiveId
 * @param {Number} [options.now=Date.now()] Injected clock.
 * @returns {Object} `{updated: true, replayCount, lastReplayedAt}`, or `{updated: false, status, reason?}`.
 */
export function markNlTransactionReplayed({archiveId, now = Date.now()} = {}) {
    const existing = getNlTransaction({archiveId});

    if (existing.status !== 'found') {
        return {updated: false, status: existing.status, ...(existing.reason ? {reason: existing.reason} : {})};
    }

    const replayCount = existing.replayCount + 1;

    try {
        GraphService.upsertNode({
            id        : getNlTransactionArchiveNodeId(existing.archiveId),
            type      : NL_TRANSACTION_ARCHIVE_NODE_TYPE,
            name      : existing.name ?? existing.archiveId,
            updatedAt : now,
            properties: {replayCount, lastReplayedAt: now}
        });
    } catch (error) {
        return {updated: false, status: 'unavailable', reason: `archive-store-unavailable: ${error.message}`};
    }

    // The new count travels back so a caller can record what it observed rather than re-reading — the
    // re-read is the one thing guaranteed to race with the next mark.
    return {updated: true, replayCount, lastReplayedAt: now};
}
