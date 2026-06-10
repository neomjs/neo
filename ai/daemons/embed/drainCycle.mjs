import {
    appendWalEmbedMarker,
    getWalSegmentKey,
    pruneReconciledWalSegments,
    readPendingWalRecords
} from '../../services/memory-core/helpers/memoryWalStore.mjs';

/**
 * @summary One durable drain pass over the `add_memory` write-ahead log.
 *
 * The pure logic core of the embed daemon (`ai/daemons/embed/daemon.mjs`): reads the pending
 * WAL backlog, embeds it into the memory content store with retry/backoff, reconciles markers,
 * compensates purge races, and prunes fully-reconciled segments. Every collaborator is injected
 * (collection, clock, sleep, logger, retry state), so specs exercise the exact production drain
 * against a fake collection without spawning a process — the same seam
 * `MemoryService.WriteAhead.spec.mjs` established for the Phase-1 write path.
 *
 * ## Sole-drainer invariant (load-bearing)
 *
 * This module is the ONLY writer of embed markers in the daemon era — `MemoryService.addMemory`
 * appends records but never markers, and `SessionService.purgeSession` appends markers only as
 * purge TOMBSTONES (and always BEFORE its content-store delete). That ordering is what makes the
 * mid-drain purge race decidable: after a successful `collection.add`, any batch id that is no
 * longer pending must have been tombstoned by a purge mid-embed — so the drain compensates with
 * a `collection.delete` for exactly those ids instead of marking them (see {@link drainWalOnce}).
 *
 * ## Scan-cost bound (AC10)
 *
 * `readPendingWalRecords` scans every WAL segment file per call. The fan-out is bounded by
 * `memoryWal.retentionLimit` reconciled day-segments on disk (write-side pruning) plus however
 * many segments hold pending records — and THIS daemon's drain cadence (`memoryWal.pollIntervalMs`)
 * is what keeps the pending set small: even under a sustained embedder outage the backlog grows by
 * one record per agent turn (minutes apart), not per second, and drains in `batchSize` chunks per
 * cycle once the embedder recovers.
 *
 * @module ai/daemons/embed/drainCycle
 * @see module:ai/services/memory-core/helpers/memoryWalStore
 */

/**
 * Hard ceiling for the per-record cross-cycle retry cooldown. A persistently failing
 * ("poison") record is retried with exponential spacing up to this bound — never abandoned
 * (a process restart or an embedder recovery may heal it), never allowed to hot-loop the
 * embedder every poll either.
 * @type {Number}
 */
export const MAX_RECORD_COOLDOWN_MS = 3600000;

/**
 * @summary Computes the exponential backoff delay for a retry attempt.
 *
 * `base * 2^attempt`, capped at {@link MAX_RECORD_COOLDOWN_MS}. Pure; shared by the in-cycle
 * batch retry loop and the cross-cycle per-record cooldown so both schedules stay coherent.
 *
 * @param {Number} backoffBaseMs Base delay (the `memoryWal.backoffBaseMs` leaf).
 * @param {Number} attempt       Zero-based attempt index.
 * @returns {Number} Delay in ms.
 */
export function getBackoffDelayMs(backoffBaseMs, attempt) {
    return Math.min(backoffBaseMs * 2 ** attempt, MAX_RECORD_COOLDOWN_MS);
}

/**
 * @summary Embeds one batch of WAL records via `collection.add`, retrying transient failures.
 *
 * Whole-batch first (one round-trip for the common case), with `maxRetries` exponential-backoff
 * attempts for transient outages. If the batch still fails, falls back to per-record adds so a
 * single poison record cannot hold the rest of the backlog hostage — per-record failures are
 * reported back for cross-cycle cooldown bookkeeping rather than retried inline.
 *
 * @param {Object}   options
 * @param {Object}   options.collection    Content-store collection (`add({ids, metadatas, documents})`).
 * @param {Object[]} options.records       Pending WAL records (`{id, metadata, document, segmentKey}`).
 * @param {Number}   options.maxRetries    In-cycle whole-batch retry bound.
 * @param {Number}   options.backoffBaseMs Exponential backoff base for in-cycle retries.
 * @param {Function} options.sleep         `ms => Promise` delay primitive (injected for specs).
 * @param {Function} options.log           `(level, message)` sink.
 * @returns {Promise<{succeeded: Object[], failed: Array<{record: Object, error: Error}>}>}
 */
export async function embedBatch({collection, records, maxRetries, backoffBaseMs, sleep, log}) {
    const payload = {
        ids      : records.map(record => record.id),
        metadatas: records.map(record => record.metadata),
        documents: records.map(record => record.document)
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await collection.add(payload);
            return {succeeded: [...records], failed: []};
        } catch (error) {
            if (attempt < maxRetries) {
                const delay = getBackoffDelayMs(backoffBaseMs, attempt);
                log('INFO', `Batch embed attempt ${attempt + 1}/${maxRetries + 1} failed (${error.message}) — backing off ${delay}ms`);
                await sleep(delay);
            } else {
                log('ERROR', `Batch embed exhausted ${maxRetries + 1} attempts (${error.message}) — isolating per record`);
            }
        }
    }

    // Per-record isolation pass: exactly one attempt each — a poison record surfaces here as the
    // only failure while its healthy batch-mates proceed; cross-cycle cooldown spaces its retries.
    const succeeded = [];
    const failed    = [];

    for (const record of records) {
        try {
            await collection.add({ids: [record.id], metadatas: [record.metadata], documents: [record.document]});
            succeeded.push(record);
        } catch (error) {
            failed.push({record, error});
        }
    }

    return {succeeded, failed};
}

/**
 * @summary Executes one full drain cycle: read pending → embed → reconcile/compensate → prune.
 *
 * **Reconcile vs compensate:** after a successful embed, the cycle re-reads the pending state for
 * exactly the embedded ids. Ids still pending get their embed marker (the normal path). Ids that
 * VANISHED from the pending set mid-embed were tombstoned by `SessionService.purgeSession`
 * (sole-drainer invariant — nothing else writes markers), meaning the purge's content-store
 * delete may have run before our `add` resurrected the document: the cycle compensates with
 * `collection.delete` for those ids and writes no marker (the purge already did).
 *
 * **Failure isolation:** records failing the per-record pass enter `retryState`
 * (`id → {failures, nextAttemptAt}`) and are skipped while cooling down — exponentially spaced
 * via {@link getBackoffDelayMs}, never abandoned. The state is in-memory by design: a daemon
 * restart simply retries sooner, and the WAL remains the durable source of truth throughout.
 *
 * @param {Object}   options
 * @param {String}   options.dir              WAL segment directory (resolved `memoryWal.dir` leaf).
 * @param {Object}   options.collection       Content-store collection (`add` + `delete`).
 * @param {String[]} [options.ids]            Targeted drain: only these record ids are considered.
 *     The daemon loop never passes this (it drains the whole backlog); explicit flush callers
 *     (specs, future on-demand drains) use it to reconcile specific records without touching
 *     unrelated pending state.
 * @param {Number}   options.batchSize        Maximum records embedded per cycle.
 * @param {Number}   options.maxRetries       In-cycle whole-batch retry bound.
 * @param {Number}   options.backoffBaseMs    Exponential backoff base.
 * @param {Number}   options.retentionLimit   Reconciled-segment retention bound for pruning.
 * @param {Map}      [options.retryState]     Cross-cycle per-record cooldown state (caller-owned).
 * @param {Function} [options.log]            `(level, message)` sink. Defaults to a no-op.
 * @param {Function} [options.sleep]          Delay primitive. Defaults to a real timer.
 * @param {Function} [options.now]            Clock source (epoch ms). Defaults to `Date.now`.
 * @returns {Promise<{pending: Number, embedded: Number, compensated: Number, failed: Number, cooling: Number, prunedSegments: Number}>}
 *     Cycle summary for the daemon's log line.
 */
export async function drainWalOnce({
    dir,
    collection,
    ids,
    batchSize,
    maxRetries,
    backoffBaseMs,
    retentionLimit,
    retryState = new Map(),
    log        = () => {},
    sleep      = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now        = Date.now
} = {}) {
    const summary = {pending: 0, embedded: 0, compensated: 0, failed: 0, cooling: 0, prunedSegments: 0};

    // Full pending read (not limit-bounded): a newest-first limited read would let records
    // cooling down at the head permanently shadow older drainable ones. Scan cost is bounded —
    // see the module-level "Scan-cost bound (AC10)" note.
    const allPending = await readPendingWalRecords({dir, ids});
    summary.pending  = allPending.length;

    const cycleStart = now();
    const drainable  = [];

    for (const record of allPending) {
        if (drainable.length >= batchSize) break;

        const cooldown = retryState.get(record.id);
        if (cooldown && cooldown.nextAttemptAt > cycleStart) {
            summary.cooling++;
            continue;
        }

        drainable.push(record);
    }

    if (drainable.length > 0) {
        const {succeeded, failed} = await embedBatch({collection, records: drainable, maxRetries, backoffBaseMs, sleep, log});

        summary.failed = failed.length;

        for (const {record, error} of failed) {
            const failures = (retryState.get(record.id)?.failures ?? 0) + 1;

            retryState.set(record.id, {failures, nextAttemptAt: now() + getBackoffDelayMs(backoffBaseMs, failures)});
            log('ERROR', `Record ${record.id} failed embed #${failures} (${error.message}) — cooling down`);
        }

        if (succeeded.length > 0) {
            // Purge-race compensation window: re-read pending state for exactly the embedded ids.
            const succeededIds = succeeded.map(record => record.id);
            const stillPending = new Set((await readPendingWalRecords({dir, ids: succeededIds})).map(record => record.id));
            const tombstoned   = succeeded.filter(record => !stillPending.has(record.id));

            if (tombstoned.length > 0) {
                // Tombstoned mid-embed: purgeSession marked these records (always BEFORE its own
                // content-store delete), so our add may have resurrected purged documents — undo it.
                // A failed compensation delete cannot be retried from the WAL (the records are
                // already reconciled by the purge's tombstone), so it is logged loudly with the
                // exact ids instead of rethrowing the whole cycle.
                const tombstonedIds = tombstoned.map(record => record.id);
                try {
                    await collection.delete({ids: tombstonedIds});
                    summary.compensated = tombstoned.length;
                    log('INFO', `Compensated ${tombstoned.length} record(s) purged mid-embed`);
                } catch (error) {
                    log('ERROR', `Compensation delete failed (${error.message}) — purged doc(s) may persist in the content store: ${tombstonedIds.join(', ')}`);
                }
            }

            for (const record of succeeded) {
                retryState.delete(record.id);

                if (!stillPending.has(record.id)) continue;

                await appendWalEmbedMarker({id: record.id, segmentKey: record.segmentKey, embeddedAt: now()}, {dir});
                summary.embedded++;
            }
        }
    }

    summary.prunedSegments = await pruneReconciledWalSegments({
        dir,
        retentionLimit,
        activeSegmentKey: getWalSegmentKey(now())
    });

    return summary;
}

/**
 * @summary Hosts the drain loop: `setTimeout`-chained {@link drainWalOnce} cycles until stopped.
 *
 * The loop is host-agnostic on purpose — the same single implementation runs in BOTH drain
 * deployment modes:
 *
 * - **Supervised daemon process** (`ai/daemons/embed/daemon.mjs`): the local-profile shape,
 *   orchestrator-managed with PID lock + rotating log.
 * - **In-process inside the memory-core server** (`memoryWal.inProcessDrain` leaf): the
 *   containerized / single-process deployment shape, where no orchestrator or daemon process
 *   exists (e.g. the dockerized MC containers, `npx neo-app`-class workspaces).
 *
 * **Sole-drainer invariant (drain-lock enforced):** exactly ONE drain loop may run per WAL
 * directory — two loops would race the marker files and break the purge-compensation logic, which
 * relies on "a marker I didn't write = purge tombstone". Both hosts claim a per-directory
 * `.drain-lock` before starting (see `./drainLock.mjs`); a second live host refuses and fails loud,
 * so enabling `inProcessDrain` where the embed daemon also runs is now caught at startup instead of
 * silently corrupting markers.
 *
 * Cycle failures are logged and absorbed (the WAL retains the backlog; the loop must outlive any
 * single bad pass). Config is re-read via `getConfig()` every cycle and the collection handle is
 * re-resolved via `getCollection()` every cycle, so a recycled content-store daemon never strands
 * the loop on a stale connection.
 *
 * @param {Object}   options
 * @param {Function} options.getCollection Async resolver for the content-store collection.
 * @param {Function} options.getConfig     Returns the `memoryWal` config slice (read per cycle).
 * @param {Function} [options.log]         `(level, message)` sink. Defaults to a no-op.
 * @param {Map}      [options.retryState]  Cross-cycle per-record cooldown state.
 * @returns {{stop: Function}} Handle whose `stop()` ends the loop (idempotent).
 */
export function startDrainLoop({getCollection, getConfig, log = () => {}, retryState = new Map()}) {
    let stopped = false;
    let timer   = null;

    const tick = async () => {
        const {dir, batchSize, maxRetries, backoffBaseMs, retentionLimit, pollIntervalMs} = getConfig();

        try {
            const collection = await getCollection();
            const summary    = await drainWalOnce({dir, collection, batchSize, maxRetries, backoffBaseMs, retentionLimit, retryState, log});

            // Idle cycles stay silent — at a multi-second poll interval, per-cycle no-op lines
            // would dominate the log without adding signal.
            if (summary.pending > 0 || summary.prunedSegments > 0) {
                log('INFO', `WAL drain cycle: ${JSON.stringify(summary)}`);
            }
        } catch (error) {
            log('ERROR', `WAL drain cycle failed: ${error.message || error}`);
        }

        if (!stopped) {
            timer = setTimeout(tick, pollIntervalMs);
        }
    };

    // First cycle on the next macrotask: starting the loop must never block the host's boot.
    timer = setTimeout(tick, 0);

    return {
        stop() {
            stopped = true;
            clearTimeout(timer);
        }
    };
}
