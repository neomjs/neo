import crypto       from 'crypto';
import GraphService from '../GraphService.mjs';

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
          originWriter = transaction.originWriter ?? transaction.ops[0]?.originWriter;

    try {
        GraphService.upsertNode({
            id        : getNlTransactionArchiveNodeId(archiveId),
            type      : NL_TRANSACTION_ARCHIVE_NODE_TYPE,
            name      : name ?? archiveId,
            updatedAt : now,
            properties: {
                archiveId,
                name,
                appSessionId,
                sourceTxId    : transaction.id ?? null,
                originWriter,
                committedAt   : transaction.committedAt ?? null,
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

    return {saved: true, archiveId};
}

/**
 * @summary Reads one archived transaction back, or `null` when it does not exist.
 *
 * The returned shape is the host contract's record, rebuilt from the node's `properties` — `ops` and
 * `originWriter` come back as the structures they went in as, because the graph stores them as values
 * rather than as the JSON strings the SQLite columns held.
 * @param {Object} options
 * @param {String} options.archiveId
 * @returns {Object|null}
 */
export function getNlTransaction({archiveId} = {}) {
    if (typeof archiveId !== 'string' || archiveId === '') {
        return null;
    }

    let record;

    try {
        record = GraphService.getNodeRecord({id: getNlTransactionArchiveNodeId(archiveId)});
    } catch (error) {
        return null;
    }

    if (!record || record.type !== NL_TRANSACTION_ARCHIVE_NODE_TYPE) {
        return null;
    }

    const p = record.properties || {};

    return {
        archiveId     : p.archiveId ?? archiveId,
        name          : p.name ?? null,
        sourceTxId    : p.sourceTxId ?? null,
        appSessionId  : p.appSessionId ?? null,
        originWriter  : p.originWriter ?? null,
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
 * what makes the increment honest — an absent archive returns `{updated: false}` instead of creating a
 * node with `replayCount: 1`, which would invent a replay of something never archived.
 * @param {Object} options
 * @param {String} options.archiveId
 * @param {Number} [options.now=Date.now()] Injected clock.
 * @returns {{updated: Boolean}}
 */
export function markNlTransactionReplayed({archiveId, now = Date.now()} = {}) {
    const existing = getNlTransaction({archiveId});

    if (!existing) {
        return {updated: false};
    }

    try {
        GraphService.upsertNode({
            id        : getNlTransactionArchiveNodeId(existing.archiveId),
            type      : NL_TRANSACTION_ARCHIVE_NODE_TYPE,
            name      : existing.name ?? existing.archiveId,
            updatedAt : now,
            properties: {...existing, replayCount: existing.replayCount + 1, lastReplayedAt: now}
        });
    } catch (error) {
        return {updated: false};
    }

    return {updated: true};
}
