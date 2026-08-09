import {
    appendWalEmbedMarker,
    getWalSegmentKey,
    pruneReconciledWalSegments,
    readPendingWalRecords
} from '../../services/memory-core/helpers/memoryWalStore.mjs';
import {classifyRowVector, VECTOR_REJECTION_REASONS}                   from '../../services/memory-core/helpers/vectorWriteInvariant.mjs';
import {createDrainDispositionTracker}                                 from '../shared/drainDisposition.mjs';
import {OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE, PROVIDER_TIMEOUT_CODE} from '../../provider/createTimeoutError.mjs';
import {runWithProviderActivityContext}                                from '../../services/shared/providerActivityLedger.mjs';

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
 * Wall-clock budget after which `embedBatch` admits no further attempt. It removes the attempt-count
 * multiplier — the pre-bound worst case was a local count times a duration owned by another service —
 * but it is NOT a ceiling on the call: an attempt already in flight when the budget expires runs to
 * its own external deadline, so a single batch can still exceed this number.
 *
 * **Derivation, not a taste value:** the memory WAL drain polls every `pollIntervalMs` (5s default).
 * A batch still admitting new attempts two minutes in has already starved ~24 polls of a queue it
 * shares with every agent's `add_memory`, so the budget sits one order of magnitude above the cadence
 * it must not monopolise. Healthy batches finish in well under a second and never reach it.
 *
 * **Retirement trigger:** `pollIntervalMs` is not currently threaded into `embedBatch`. Once it is,
 * derive this as a multiple of the live cadence and delete the constant — a derived bound cannot
 * drift from the loop it protects, whereas this one can.
 * @type {Number}
 */
export const DEFAULT_MAX_IN_CYCLE_MS = 120000;

/**
 * @summary Runs one WAL-owned collection write with exact provider-stage attribution.
 * @param {Object} collection Memory collection.
 * @param {Object} payload Chroma add payload.
 * @returns {Promise<*>}
 */
function addWalRecords(collection, payload) {
    return runWithProviderActivityContext({
        operationStage: 'mc-wal-drain-embedding',
        service       : 'memory-core'
    }, () => collection.add(payload));
}

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
 * @summary Typed provider error codes meaning "the provider is BUSY", never "the request was bad".
 *
 * Both local inference providers stamp a code on their own timeout: the OpenAI-compatible transport
 * emits `OPENAI_COMPATIBLE_REQUEST_TIMEOUT`, native Ollama owns the shared `PROVIDER_TIMEOUT` shape,
 * and the socket layer contributes the two `*TIMEDOUT` codes. Keyed on `error.code` rather than on
 * message text: codes are a provider-owned protocol constant, whereas the message-shaped half of
 * the classification in `TextEmbeddingService` is coupled to a message THIS module never sees
 * (that file pins its own log string verbatim precisely because its regex reads it). Duplicating
 * the coupled half here would split a matched pair across modules; duplicating the codes does not.
 *
 * **Both codes are IMPORTED from their single owner** (`ai/provider/createTimeoutError.mjs`), so a
 * rename at the source is a compile-visible event in this classifier rather than a silent behaviour
 * change. That matters more here than tidiness: while the value was repeated at the producer and at
 * each consumer, a coordinated producer-plus-producer-test rename could have left this classifier
 * and its fixtures green while restoring the exact retry amplification the classifier exists to
 * prevent. Independently-pinned literals cannot detect coordinated drift; a shared import can.
 * @type {Set<String>}
 */
const PROVIDER_CONTENTION_CODES = Object.freeze(new Set([
    'ESOCKETTIMEDOUT',
    'ETIMEDOUT',
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE
]));

/**
 * @summary Default contention predicate — is this failure the provider being saturated?
 * @param {Error} error Failure raised by `collection.add`.
 * @returns {Boolean}
 */
export function isProviderContentionError(error) {
    return PROVIDER_CONTENTION_CODES.has(error?.code);
}

/**
 * @summary Embeds one batch of WAL records via `collection.add`, retrying transient failures.
 *
 * Whole-batch first (one round-trip for the common case), with `maxRetries` exponential-backoff
 * attempts for transient outages. If the batch still fails, falls back to per-record adds so a
 * single poison record cannot hold the rest of the backlog hostage — per-record failures are
 * reported back for cross-cycle cooldown bookkeeping rather than retried inline.
 *
 * **Contention is not an outage, and the two need opposite responses.** A transient outage resolves
 * while you wait, so backoff is correct: the cost of the failure is the INTERVAL. Under saturation
 * the provider is up and its queue IS the failure, so the cost is the ATTEMPT — re-offering the same
 * batch adds load to the exact queue that caused the timeout, and the per-record pass would then
 * multiply the offered requests by `records.length` at the worst possible moment. A saturated
 * provider is not a poison record. So a contention failure returns IMMEDIATELY, skipping both the
 * retry loop and isolation; the records come back as `failed`, which the caller already spaces out
 * via the cross-cycle `retryState` cooldown — deferred, never dropped.
 *
 * Empirical anchor: one batch consumed ~21 minutes as six 300s attempts against a provider that was
 * serving the whole time (a 129-deep embedding queue), and only an operator restart cleared it.
 *
 * **Local ADMISSION bound — not a total wall-clock bound.** Attempt COUNT is declared here
 * (`maxRetries`) while attempt DURATION is declared in another service
 * (`openAiCompatible.batchEmbeddingTimeoutMs`), so the pre-bound worst case was the PRODUCT of two
 * leaves neither owner could see. `maxInCycleMs` removes the multiplier: once the budget is spent no
 * NEW attempt is admitted, whether the boundary was crossed by an attempt or by a backoff.
 *
 * It deliberately does NOT race an in-flight `collection.add` — abandoning a write that may still
 * land is how a timeout turns into a duplicate — so **a single call may still run arbitrarily long
 * as far as this module is concerned**, and the total duration is therefore NOT derivable here.
 * What is derivable here is the attempt COUNT. State it that way: the product is gone, one external
 * duration remains, and pretending otherwise would be a comment that outruns its code.
 *
 * @param {Object}   options
 * @param {Object}   options.collection    Content-store collection (`add({ids, metadatas, documents})`).
 * @param {Object[]} options.records       Pending WAL records (`{id, metadata, document, segmentKey}`).
 * @param {Number}   options.maxRetries    In-cycle whole-batch retry bound.
 * @param {Number}   options.backoffBaseMs Exponential backoff base for in-cycle retries.
 * @param {Function} options.sleep         `ms => Promise` delay primitive (injected for specs).
 * @param {Function} options.log           `(level, message)` sink.
 * @param {Function} [options.isContentionError=isProviderContentionError] Saturation classifier
 *     (injected so the pure core stays free of the Neo-class provider module).
 * @param {Number}   [options.maxInCycleMs=DEFAULT_MAX_IN_CYCLE_MS] Wall-clock budget after which no
 *     further attempt is admitted; an in-flight attempt still runs to its own external deadline.
 * @param {Function} [options.now=Date.now] Clock seam (injected for deterministic specs).
 * @returns {Promise<{succeeded: Object[], failed: Array<{record: Object, error: Error}>}>}
 */
export async function embedBatch({
    collection,
    records,
    maxRetries,
    backoffBaseMs,
    sleep,
    log,
    isContentionError = isProviderContentionError,
    maxInCycleMs      = DEFAULT_MAX_IN_CYCLE_MS,
    now               = Date.now
}) {
    const payload = {
            ids      : records.map(record => record.id),
            metadatas: records.map(record => record.metadata),
            documents: records.map(record => record.document)
        },
        startedAt = now(),
        budgetSpent = () => Number.isFinite(maxInCycleMs) && maxInCycleMs > 0 && now() - startedAt >= maxInCycleMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await addWalRecords(collection, payload);
            return {succeeded: [...records], failed: []};
        } catch (error) {
            if (isContentionError(error)) {
                // Yield the whole cycle: no in-cycle retry, and no isolation pass either. Both would
                // re-offer work to the queue that just timed out. `retryState` defers these records
                // with escalating spacing, so the backlog survives and the provider gets room.
                log('INFO', `Batch embed hit provider contention (${error.message}) — deferring ` +
                    `${records.length} record(s) to a later cycle without retry`);

                return {succeeded: [], failed: records.map(record => ({record, error}))};
            }

            if (budgetSpent()) {
                // The wall-clock ceiling is spent. Stop before starting anything new — including the
                // isolation pass, which would otherwise add `records.length` more externally-bounded
                // attempts to a cycle that has already overrun.
                log('ERROR', `Batch embed exceeded its ${maxInCycleMs}ms in-cycle budget after ` +
                    `${attempt + 1} attempt(s) (${error.message}) — deferring ${records.length} record(s)`);

                return {succeeded: [], failed: records.map(record => ({record, error}))};
            }

            if (attempt < maxRetries) {
                const delay = getBackoffDelayMs(backoffBaseMs, attempt);
                log('INFO', `Batch embed attempt ${attempt + 1}/${maxRetries + 1} failed (${error.message}) — backing off ${delay}ms`);
                await sleep(delay);

                // Re-check AFTER the backoff, not only after the failure: the sleep itself can cross
                // the boundary, and a guard that only runs post-failure would let the next iteration
                // start an external request from beyond the budget it was meant to bound.
                if (budgetSpent()) {
                    log('ERROR', `Batch embed exhausted its ${maxInCycleMs}ms in-cycle budget during backoff after ` +
                        `${attempt + 1} attempt(s) — deferring ${records.length} record(s)`);

                    return {succeeded: [], failed: records.map(record => ({record, error}))};
                }
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
        if (budgetSpent()) {
            // Mid-pass exhaustion: the remaining records are deferred rather than attempted, so the
            // ceiling bounds the isolation pass too and not merely the whole-batch loop.
            failed.push({record, error: new Error(`in-cycle budget of ${maxInCycleMs}ms exhausted before isolation`)});
            continue;
        }

        try {
            await addWalRecords(collection, {ids: [record.id], metadatas: [record.metadata], documents: [record.document]});
            succeeded.push(record);
        } catch (error) {
            failed.push({record, error});
        }
    }

    return {succeeded, failed};
}

/**
 * @summary Verifies that an `add`-succeeded batch actually persisted a valid vector — the atomic-write
 * Prevent floor for the auto-embed drain path.
 *
 * `embedBatch` calls `collection.add({ids, metadatas, documents})` with **no `embeddings`** — it relies on
 * Chroma's collection embedding-function to auto-generate the vector. That auto-embed is **not atomic**: the
 * provider call can fail (timeout, oversized input, model-not-resident) while the document/metadata still
 * persist, leaving a metadata-only row — the recurring corruption shape — on the *highest-volume* write path.
 * `add`-success therefore does NOT imply embed-success, so this reads the persisted vectors back and classifies
 * each with the same {@link classifyRowVector} invariant the explicit-embedding write gate uses.
 *
 * Disposition per outcome:
 * - **valid vector** → `embedded` (safe to mark reconciled).
 * - **confirmed metadata-only** (read-back returns a missing/empty/wrong-dimension vector, OR a single-id read
 *   throws the documented vector-absent signature — {@link isVectorAbsentError}, `Error finding id`) → `metadataOnly`,
 *   and the persisted row is **deleted** so the cooldown retry's `add` re-embeds cleanly (`add` is create-not-upsert;
 *   a lingering row would no-op the retry). The autonomous recovery actuator remains the backstop for any that slip.
 * - **unverifiable** (a read throws a non-vector-absent / transient error) → `unverifiable`, **not** deleted —
 *   a transient read failure must never destroy possibly-valid rows; the row stays pending for a clean re-verify.
 *
 * A *batch* read-back throw cannot name which id failed, so it routes to a bounded per-record re-read
 * ({@link verifyRecordsPerId}) that isolates the metadata-only signature from a transient error before deciding
 * delete-vs-retry. Verify is opt-in on a known `expectedDimension`: without one it cannot classify, so it falls
 * back (logged) to the prior add-success⟹embed-success behavior rather than rejecting every row.
 *
 * @param {Object}   options
 * @param {Object}   options.collection        Content-store collection (`get({ids, include:['embeddings']})` + `delete`).
 * @param {Object[]} options.records           The `add`-succeeded WAL records to verify (`{id, ...}`).
 * @param {Number}   options.expectedDimension Required vector dimension; non-positive/absent → verify skipped.
 * @param {Function} options.log               `(level, message)` sink.
 * @returns {Promise<{embedded: Object[], metadataOnly: Array<{record: Object, error: Error}>, unverifiable: Array<{record: Object, error: Error}>}>}
 */
export function isVectorAbsentError(error) {
    return /error finding id/i.test(error?.message ?? '');
}

export async function verifyEmbeddedVectors({collection, records, expectedDimension, log}) {
    if (records.length === 0) {
        return {embedded: [], metadataOnly: [], unverifiable: []};
    }

    if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) {
        log('WARN', `Post-add vector verify skipped — expectedDimension not configured (${expectedDimension}); add-success treated as embed-success`);
        return {embedded: [...records], metadataOnly: [], unverifiable: []};
    }

    const ids = records.map(record => record.id);
    let readBack;

    try {
        readBack = await collection.get({ids, include: ['embeddings']});
    } catch (batchError) {
        // The batch read-back threw. The content store throws the vector-absent signature (`Error finding id`)
        // precisely for a metadata-only row — but a batch throw cannot name WHICH id, and may also be transient.
        // Fall back to per-id verification so the known metadata-only signature is caught (delete + retry)
        // rather than collapsed into "unverifiable, do not delete".
        log('WARN', `Post-add batch vector verify threw (${batchError.message}) — isolating per record`);
        return verifyRecordsPerId({collection, records, expectedDimension, log});
    }

    const embeddingById = new Map();
    (readBack?.ids ?? []).forEach((id, index) => embeddingById.set(id, readBack.embeddings?.[index]));

    const embedded     = [];
    const metadataOnly = [];

    for (const record of records) {
        const reason = classifyRowVector({id: record.id, embedding: embeddingById.get(record.id)}, expectedDimension);

        if (reason === null) {
            embedded.push(record);
        } else {
            metadataOnly.push({record, error: new Error(`metadata-only row (${reason}) — auto-embed persisted no valid vector`)});
        }
    }

    await deleteMetadataOnlyRows({collection, metadataOnly, log});

    return {embedded, metadataOnly, unverifiable: []};
}

/**
 * @summary Per-record verify fallback for when the batch read-back throws. Isolates each record with a single-id
 * read: a returned vector is classified by {@link classifyRowVector}; a thrown vector-absent signature
 * ({@link isVectorAbsentError}) is the confirmed metadata-only shape (delete + retry); any other thrown error is
 * genuinely unverifiable (retry, never deleted). Bounded to the exceptional path — the happy path is one batched read.
 * @param {Object} options See {@link verifyEmbeddedVectors}.
 * @returns {Promise<{embedded: Object[], metadataOnly: Array<{record, error}>, unverifiable: Array<{record, error}>}>}
 */
async function verifyRecordsPerId({collection, records, expectedDimension, log}) {
    const embedded     = [];
    const metadataOnly = [];
    const unverifiable = [];

    for (const record of records) {
        let reason;

        try {
            const back  = await collection.get({ids: [record.id], include: ['embeddings']});
            const index = (back?.ids ?? []).indexOf(record.id);

            reason = classifyRowVector({id: record.id, embedding: index >= 0 ? back.embeddings?.[index] : undefined}, expectedDimension);
        } catch (perIdError) {
            if (isVectorAbsentError(perIdError)) {
                reason = VECTOR_REJECTION_REASONS.missingEmbedding; // the documented metadata-only thrown shape
            } else {
                unverifiable.push({record, error: perIdError}); // transient — retry next cycle, never delete
                continue;
            }
        }

        if (reason === null) {
            embedded.push(record);
        } else {
            metadataOnly.push({record, error: new Error(`metadata-only row (${reason}) — auto-embed persisted no valid vector`)});
        }
    }

    await deleteMetadataOnlyRows({collection, metadataOnly, log});

    return {embedded, metadataOnly, unverifiable};
}

/**
 * @summary Deletes confirmed metadata-only rows so the cooldown retry's `add` re-embeds cleanly (`add` is
 * create-not-upsert; a lingering row would no-op the retry). A failed delete is logged loud — the autonomous
 * recovery actuator remains the backstop.
 * @param {Object}   options
 * @param {Object}   options.collection
 * @param {Object[]} options.metadataOnly `{record, error}` entries to delete.
 * @param {Function} options.log
 * @returns {Promise<void>}
 */
async function deleteMetadataOnlyRows({collection, metadataOnly, log}) {
    if (metadataOnly.length === 0) {
        return;
    }

    const ids = metadataOnly.map(({record}) => record.id);

    try {
        await collection.delete({ids});
        log('ERROR', `Post-add verify: deleted ${ids.length} metadata-only row(s) for re-embed: ${ids.join(', ')}`);
    } catch (error) {
        log('ERROR', `Post-add verify: metadata-only delete failed (${error.message}) — rows remain for the recovery actuator: ${ids.join(', ')}`);
    }
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
 * @param {Number}   [options.expectedDimension] Required vector dimension for the post-add atomic-write verify;
 *     absent/non-positive → verify skipped (add-success⟹embed-success, the prior behavior).
 * @param {Map}      [options.retryState]     Cross-cycle per-record cooldown state (caller-owned).
 * @param {Function} [options.log]            `(level, message)` sink. Defaults to a no-op.
 * @param {Function} [options.sleep]          Delay primitive. Defaults to a real timer.
 * @param {Function} [options.now]            Clock source (epoch ms). Defaults to `Date.now`.
 * @returns {Promise<{pending: Number, embedded: Number, compensated: Number, failed: Number, metadataOnly: Number, unverifiable: Number, cooling: Number, prunedSegments: Number, outstanding: Number}>}
 *     Cycle summary for the daemon's log line. `outstanding` is the post-cycle residue
 *     (`pending - embedded - compensated`) — the canonical field a disposition receipt reads for
 *     cleanliness; `pending` is a pre-drain observation and must never be read as work-left.
 */
export async function drainWalOnce({
    dir,
    collection,
    ids,
    batchSize,
    maxRetries,
    backoffBaseMs,
    retentionLimit,
    expectedDimension,
    retryState = new Map(),
    log        = () => {},
    sleep      = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now        = Date.now
} = {}) {
    const summary = {pending: 0, embedded: 0, compensated: 0, failed: 0, metadataOnly: 0, unverifiable: 0, cooling: 0, prunedSegments: 0};

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

        // Atomic-write Prevent floor: add-success ≠ embed-success on the auto-embed path, so verify the
        // persisted vector before reconciling. Metadata-only rows are routed to retry, never marked embedded.
        const {embedded, metadataOnly, unverifiable} = await verifyEmbeddedVectors({collection, records: succeeded, expectedDimension, log});
        const failedRecords                          = [...failed, ...metadataOnly, ...unverifiable];

        summary.failed       = failed.length;
        summary.metadataOnly = metadataOnly.length;
        summary.unverifiable = unverifiable.length;

        for (const {record, error} of failedRecords) {
            const failures = (retryState.get(record.id)?.failures ?? 0) + 1;

            retryState.set(record.id, {failures, nextAttemptAt: now() + getBackoffDelayMs(backoffBaseMs, failures)});
            log('ERROR', `Record ${record.id} failed embed #${failures} (${error.message}) — cooling down`);
        }

        if (embedded.length > 0) {
            // Purge-race compensation window: re-read pending state for exactly the embedded ids.
            const succeededIds = embedded.map(record => record.id);
            const stillPending = new Set((await readPendingWalRecords({dir, ids: succeededIds})).map(record => record.id));
            const tombstoned   = embedded.filter(record => !stillPending.has(record.id));

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

            for (const record of embedded) {
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

    // Post-cycle residue — the ONE field a disposition consumer may read for cleanliness. `pending`
    // is the PRE-drain observation (records read at the top of the cycle), so it is not a measure of
    // work left; a consumer that treats it as such reports `dirty` after fully draining its only
    // record, and continuous traffic never lets it go `clean`. Everything drained or removed this
    // cycle is subtracted: `embedded` (reconciled) and `compensated` (tombstoned/undone). What
    // remains is every record still pending — batch-overflowed, cooling, failed, metadata-only, and
    // unverifiable alike, since each of those stayed in the pending set this cycle touched.
    summary.outstanding = summary.pending - summary.embedded - summary.compensated;

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
 * @param {Number}   [options.expectedDimension] Required vector dimension for the post-add atomic-write verify
 *     (deploy-fixed; read once at wire-up). Absent → verify skipped (logged) — wire it in production.
 * @param {Function} [options.log]         `(level, message)` sink. Defaults to a no-op.
 * @param {Map}      [options.retryState]  Cross-cycle per-record cooldown state.
 * @param {Function} [options.now]         Clock source (epoch ms), injected into the disposition
 *     receipt so its `at` timestamp is testable without a real clock. Defaults to `Date.now`.
 * @returns {{stop: Function, getDisposition: Function}} Loop handle. `stop()` ends the loop
 *     (idempotent); `getDisposition()` returns this plane's drain receipt
 *     (`{state, drainedClean, reason, counts, at}` — see {@link createDrainDispositionTracker}),
 *     the field the parity pilot consumes to decide a seat's WAL write disposition.
 */
export function startDrainLoop({getCollection, getConfig, expectedDimension, log = () => {}, retryState = new Map(), now = Date.now}) {
    let stopped = false;
    let timer   = null;

    // The per-cycle summary was computed, logged conditionally, and discarded. Retained now as a
    // receipt: the parity pilot consumes a plane's drain disposition, and "no cycle has run yet"
    // must never read as "drained clean".
    const disposition = createDrainDispositionTracker({now});

    const tick = async () => {
        const {dir, batchSize, maxRetries, backoffBaseMs, retentionLimit, pollIntervalMs} = getConfig();

        try {
            const collection = await getCollection();
            const summary    = await drainWalOnce({dir, collection, batchSize, maxRetries, backoffBaseMs, retentionLimit, expectedDimension, retryState, log});

            // Idle cycles stay silent — at a multi-second poll interval, per-cycle no-op lines
            // would dominate the log without adding signal.
            disposition.recordCycle(summary);

            if (summary.pending > 0 || summary.prunedSegments > 0) {
                log('INFO', `WAL drain cycle: ${JSON.stringify(summary)}`);
            }
        } catch (error) {
            disposition.recordFailure(error);
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
        },

        /**
         * @summary The drain receipt for this plane — see `createDrainDispositionTracker`.
         * @returns {Object}
         */
        getDisposition: disposition.getDisposition
    };
}
