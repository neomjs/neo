import {extractMemoryCoreCollectionData}                          from '../../../scripts/maintenance/repairMemoryCoreStoredEmbeddings.mjs';
import {partitionRowsByVectorValidity, summarizeVectorRejections} from './vectorWriteInvariant.mjs';

/**
 * @summary The autonomous `re-embed-missing` data-heal operation — the actuator terminal that REPAIRS the
 * "metadata/document persisted, vector absent" coverage gap by re-embedding the orphaned rows in place,
 * rather than detecting it and recording a deferral.
 *
 * **The corruption shape it heals.** A WAL-stall / mid-drain interruption can leave Memory Core rows whose
 * metadata + document persisted but whose vector never reached the HNSW index, so `get(include:['embeddings'])`
 * fails `Error finding id`. The detect side surfaces this as a coverage-drift diagnosis; this is the ACT side:
 * the missing rows' documents still materialize, so they can be re-embedded and their vectors written back.
 *
 * **Why an in-place additive upsert — and why NO shadow/snapshot.** This heal is purely additive: it fills a
 * vector for rows that currently have none, reusing each row's existing document + metadata. It never rewrites
 * or deletes intact data, so there is nothing destructive to snapshot-and-restore. That is the structural
 * difference from a full collection defrag (a destructive rewrite that DOES need shadow/parking promotion —
 * a safe multi-collection MC promotion that does not yet exist, which is exactly why MC defrag is disabled).
 * Re-embed-missing sidesteps that un-built promotion entirely: a partial write leaves the same class of state
 * (partial coverage), re-healable on the next cycle, so the operation is idempotent and re-runnable.
 *
 * **The write-boundary invariant is the validation gate.** Before persisting, every re-embedded row is passed
 * through {@link partitionRowsByVectorValidity}: a row missing a valid same-dimension finite vector is REJECTED
 * (fail-loud, counted), never written. So the heal can never itself reintroduce the metadata-only corruption
 * shape it exists to repair — the pre-persist invariant is the in-place analogue of validate-clean-before-promote.
 *
 * **Bounding lives in the dispatch envelope, not here.** This operation is the injected privileged primitive;
 * the surrounding dispatcher records the mutating attempt BEFORE execution (anti-thrash) and fails closed
 * without a recorder, so a throwing or perpetually-partial heal cannot hot-loop. This module therefore stays a
 * pure composition (audit → re-embed → invariant-gate → upsert) and is unit-testable against a mocked Chroma
 * collection with no live store.
 *
 * @module ai/services/memory-core/helpers/reEmbedMissingHeal
 */

/**
 * @summary Builds the `re-embed-missing` heal operation, closing over the injected embed + audit collaborators.
 *
 * The returned function matches the actuator's `healOperations['<action>']` contract
 * (`async ({collection, evidence, now}) => ({status, detail})`), so it drops directly into the dispatch seam.
 *
 * @param {Object}   options
 * @param {Function} options.embedFn `(documents: String[]) => Promise<Number[][]>` — re-embed a batch of
 *     documents via the Memory Core provider (e.g. `TextEmbeddingService.embedTexts` bound to the MC provider
 *     + token budget). Required.
 * @param {Function} options.auditCoverage `async ({collection, evidence}) => {missingVectorIds: String[]}` — the
 *     fresh coverage probe that names the rows whose vectors are absent from the HNSW index. Injected (rather
 *     than read from the possibly-stale diagnosis evidence) so the heal acts on ground truth at heal time.
 *     Required.
 * @param {Number}   options.expectedDimension The required vector dimension; a re-embedded vector of any other
 *     dimension is rejected by the write invariant. A positive integer. Required.
 * @returns {Function} The `async ({collection, evidence, now}) => outcome` heal operation.
 * @throws {TypeError} When `embedFn` / `auditCoverage` is not a function or `expectedDimension` is not a
 *     positive integer — fail-loud at wiring time, never a silent no-op heal at run time.
 */
export function createReEmbedMissingHeal({embedFn, auditCoverage, expectedDimension} = {}) {
    if (typeof embedFn !== 'function') {
        throw new TypeError('createReEmbedMissingHeal: embedFn (documents -> embeddings) is required');
    }
    if (typeof auditCoverage !== 'function') {
        throw new TypeError('createReEmbedMissingHeal: auditCoverage (collection -> {missingVectorIds}) is required');
    }
    if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) {
        throw new TypeError('createReEmbedMissingHeal: expectedDimension must be a positive integer');
    }

    /**
     * @param {Object} options
     * @param {Object} options.collection The target Chroma collection handle (`.get` / `.upsert`).
     * @param {Object} [options.evidence] The diagnosis evidence (passed through to the coverage probe).
     * @param {Number} [options.now] Epoch milliseconds (the injected clock, supplied by the dispatcher).
     * @returns {Promise<Object>} `{status, detail}` — `status` is `healed` when ≥1 vector was written, `no-op`
     *     when there was nothing missing to repair, and `failed` when rows were missing but none could be
     *     recovered (all unrecoverable or invariant-rejected). `detail` carries the fail-loud counts.
     */
    return async function reEmbedMissing({collection, evidence, now} = {}) {
        const coverage         = await auditCoverage({collection, evidence}),
              missingVectorIds = Array.isArray(coverage?.missingVectorIds) ? coverage.missingVectorIds : [];

        // Nothing missing → a clean no-op (never a false "healed").
        if (missingVectorIds.length === 0) {
            return {status: 'no-op', detail: {reEmbedded: 0, attempted: 0, reason: 'no-missing-vectors', healedAt: now}};
        }

        // Re-embed ONLY the missing rows: passing `allIds === missingVectorIds` empties the intact partition,
        // so the extractor re-embeds every target from its document and skips the intact-vector fetch entirely.
        const {data, counts, unrecoverableIds} = await extractMemoryCoreCollectionData({
            collection,
            allIds          : missingVectorIds,
            missingVectorIds,
            embedFn
        });

        // Write-boundary invariant: a re-embedded row without a valid same-dimension finite vector is rejected
        // fail-loud, never persisted — the heal cannot reintroduce the metadata-only shape it repairs.
        const rows = data.ids.map((id, index) => ({
            id,
            embedding: data.embeddings[index],
            document : data.documents[index],
            metadata : data.metadatas[index]
        }));

        const {valid, rejected} = partitionRowsByVectorValidity({rows, expectedDimension}),
              rejectionSummary  = summarizeVectorRejections(rejected);

        // In-place additive promotion: fill the absent vectors for their existing ids. Idempotent and
        // re-runnable — re-embedding an already-present vector is a harmless overwrite, a partial write is
        // re-healed next cycle.
        if (valid.length > 0) {
            await collection.upsert({
                ids       : valid.map(row => row.id),
                embeddings: valid.map(row => row.embedding),
                documents : valid.map(row => row.document),
                metadatas : valid.map(row => row.metadata)
            });
        }

        const reEmbedded    = valid.length,
              unhealedCount = counts.unrecoverable + rejectionSummary.count,
              status        = reEmbedded > 0 ? 'healed' : (unhealedCount > 0 ? 'failed' : 'no-op');

        return {
            status,
            detail: {
                reEmbedded,
                attempted    : missingVectorIds.length,
                unrecoverable: counts.unrecoverable,
                unrecoverableIds,
                rejected     : rejectionSummary,
                healedAt     : now
            }
        };
    };
}

/**
 * @summary Wraps the pure re-embed-missing op as the actuator's `healOperations['re-embed-missing']`
 * terminal, bridging the runtime↔op shape gap. The data-integrity runner dispatches with a collection
 * NAME and count-only evidence (the coverage diagnosis carries a missing-vector COUNT, not the ids),
 * while the pure op needs a live collection HANDLE and the absent ids. This resolver supplies both —
 * the heal-time re-audit recovers the ids, `getMemoryCollection` resolves the handle — and REFUSES to
 * act when the resolved handle is not the diagnosed collection, so recovered vectors can never be
 * upserted into the wrong store (the one mutation the pure op cannot guard, because it trusts its handle).
 *
 * Kept separate from the pure op so the adapter's branch logic (the cross-store guard + the resolve →
 * delegate path) is unit-testable against mocked collaborators, with no live store / provider / Chroma.
 *
 * @param {Object}   options
 * @param {Function} options.reEmbedMissing The pure op from {@link createReEmbedMissingHeal}.
 * @param {Function} options.getMemoryCollection `async () => collectionHandle` — resolves the live MC handle.
 * @param {Function} options.resolveMissingVectorIds `async (collectionName) => String[]` — the heal-time
 *     re-audit that recovers the absent vector ids the count-only diagnosis omits.
 * @param {Function} [options.ready] `async () => void` — optional storage-readiness barrier awaited first.
 * @returns {Function} The `async ({collection, evidence, now}) => outcome` heal operation.
 * @throws {TypeError} When `reEmbedMissing` / `getMemoryCollection` / `resolveMissingVectorIds` is missing —
 *     fail-loud at wiring time, never a silent no-op heal at run time.
 */
export function createReEmbedMissingHealOperation({reEmbedMissing, getMemoryCollection, resolveMissingVectorIds, ready} = {}) {
    if (typeof reEmbedMissing !== 'function') {
        throw new TypeError('createReEmbedMissingHealOperation: reEmbedMissing op is required');
    }
    if (typeof getMemoryCollection !== 'function') {
        throw new TypeError('createReEmbedMissingHealOperation: getMemoryCollection (-> collection handle) is required');
    }
    if (typeof resolveMissingVectorIds !== 'function') {
        throw new TypeError('createReEmbedMissingHealOperation: resolveMissingVectorIds (collectionName -> ids) is required');
    }

    return async function reEmbedMissingHealOperation({collection: collectionName, evidence, now} = {}) {
        if (typeof ready === 'function') {
            await ready();
        }

        const collection = await getMemoryCollection();

        // Cross-store guard: never upsert recovered vectors into a different collection than the one the
        // coverage gap was diagnosed in. The pure op trusts whatever handle it receives, so the match is
        // asserted HERE, where the name-less handle resolution and the named diagnosis meet.
        if (collection?.name && collectionName && collection.name !== collectionName) {
            return {status: 'no-op', detail: {reason: 're-embed-missing targets the Memory Core collection only', collectionName, healedAt: now}};
        }

        const missingVectorIds = await resolveMissingVectorIds(collectionName);

        return reEmbedMissing({collection, evidence: {missingVectorIds}, now});
    };
}
