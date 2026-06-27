import {classifyRowVector} from './vectorWriteInvariant.mjs';

/**
 * @summary Post-upsert atomic-write verify for the direct (non-WAL) auto-embed persist sites — the
 * SessionService half of the metadata-only Prevent floor.
 *
 * `SessionService` persists session summaries and ingested plans via `collection.upsert({documents})` with
 * **no explicit `embeddings`**, relying on Chroma's collection embedding-function to auto-generate the vector.
 * That auto-embed is **not atomic**: the provider call can fail (timeout, oversized input, model-not-resident)
 * while the document/metadata still persist, leaving a metadata-only row — the recurring corruption shape — on
 * a write path that has no WAL retry queue behind it.
 *
 * This reads the just-persisted vector back and classifies it with the same {@link classifyRowVector} invariant
 * the explicit-embedding write gate and the drain verify use (single SSOT predicate). Disposition differs from
 * the drain: these rows are **expected, single-shot persists**, so on a missing/invalid vector it logs loud and
 * leaves the row for the autonomous recovery actuator to re-embed. It deliberately:
 * - **never deletes** — the document is real data the caller expects to exist (delete would be data loss);
 * - **never throws** — a verify failure (including a read-back error) must not break the persist path;
 * - **is opt-in** on a known `expectedDimension` — without one it cannot classify, so it no-ops.
 *
 * @param {Object}   collection        The content-store collection just written to (`get({ids, include:['embeddings']})`).
 * @param {String}   id                The id just upserted.
 * @param {Number}   expectedDimension Required vector dimension; non-positive/absent → verify skipped.
 * @param {Object}   [log]             Logger with a `warn(message)` method.
 * @param {String}   [label='row']     Diagnostic label for the log line (e.g. `'session summary'`).
 * @returns {Promise<String|null>} The rejection reason (from `classifyRowVector`), or `null` when the vector is
 *     valid, the dimension is unknown, or the read-back could not confirm.
 */
export async function verifyPersistedVector(collection, id, expectedDimension, log, label = 'row') {
    if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) {
        return null;
    }

    let readBack;

    try {
        readBack = await collection.get({ids: [id], include: ['embeddings']});
    } catch (error) {
        log?.warn?.(`[verifyPersistedVector] read-back failed for ${label} ${id} (${error.message}) — cannot confirm vector; left as-is`);
        return null;
    }

    const index     = (readBack?.ids ?? []).indexOf(id),
          embedding = index >= 0 ? readBack.embeddings?.[index] : undefined,
          reason    = classifyRowVector({id, embedding}, expectedDimension);

    if (reason !== null) {
        log?.warn?.(`[verifyPersistedVector] metadata-only ${label} persisted (${reason}) — id ${id}; left for the recovery actuator to re-embed`);
    }

    return reason;
}
