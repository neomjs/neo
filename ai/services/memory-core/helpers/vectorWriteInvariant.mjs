/**
 * @summary Atomic vector-write invariant: the pure gate-core that makes the "metadata/document persisted,
 * vector absent" corruption shape unrepresentable at the Memory Core write boundary.
 *
 * A prior corruption incident left ~10k Memory Core rows whose metadata persisted but whose vector did not
 * (`Error finding id` on `get(include:['embeddings'])`). The per-cause embedding mitigations each close one
 * way an embedding can fail; this is the structural complement — a pre-persist check that partitions rows
 * into those carrying a valid, same-dimension vector (safe to persist) and those that must be rejected
 * (fail-loud), so a row is never half-written as metadata-only. Mirrors the Knowledge Base's
 * `filterEmbeddingInputBudget` skip-gate, which the Memory Core vector-write path lacks.
 *
 * Pure + I/O-free by design: the caller persists `valid` and routes `rejected` to a fail-loud
 * retry/unrecoverable path. The check is a cheap presence/length/dimension/finiteness test — never a
 * re-embed — so the legitimate append path is not slowed.
 * @module ai/services/memory-core/helpers/vectorWriteInvariant
 */

/**
 * @summary The reasons a row's vector fails the atomic-write invariant, stable for fail-loud reporting.
 */
export const VECTOR_REJECTION_REASONS = Object.freeze({
    missingEmbedding: 'missing-embedding',
    emptyEmbedding  : 'empty-embedding',
    wrongDimension  : 'wrong-dimension',
    nonFiniteValues : 'non-finite-values'
});

/**
 * @summary Classifies one row's embedding against the same-dimension validity invariant.
 *
 * Order matters: a missing embedding is reported before emptiness, emptiness before a dimension
 * mismatch, and a dimension mismatch before non-finite values — so the reason names the first
 * (most fundamental) failure rather than a downstream symptom.
 *
 * @param {Object} row A write-path row carrying at least `id` and `embedding`.
 * @param {Number} expectedDimension The required vector dimension (e.g. `cfg.vectorDimension`).
 * @returns {String|null} A reason from {@link VECTOR_REJECTION_REASONS}, or `null` when the vector is valid.
 */
export function classifyRowVector(row, expectedDimension) {
    const embedding = row?.embedding;

    if (!Array.isArray(embedding)) {
        return VECTOR_REJECTION_REASONS.missingEmbedding;
    }
    if (embedding.length === 0) {
        return VECTOR_REJECTION_REASONS.emptyEmbedding;
    }
    if (embedding.length !== expectedDimension) {
        return VECTOR_REJECTION_REASONS.wrongDimension;
    }
    if (!embedding.every(value => Number.isFinite(value))) {
        return VECTOR_REJECTION_REASONS.nonFiniteValues;
    }

    return null;
}

/**
 * @summary Partitions write-path rows into persist-safe `valid` rows and `rejected` rows (with reasons),
 * enforcing the atomic vector-write invariant: never persist a row without a valid same-dimension vector.
 *
 * @param {Object} options
 * @param {Object[]} options.rows Rows to be persisted, each carrying at least `id` and `embedding`.
 * @param {Number} options.expectedDimension Required vector dimension (a positive integer).
 * @returns {Object} `{valid, rejected}` — `valid` is the persist-safe rows (input order preserved, safe to
 *     `collection.add`/`upsert`); `rejected` is an array of `{id, reason}` to route fail-loud.
 * @throws {TypeError} When `rows` is not an array or `expectedDimension` is not a positive integer.
 */
export function partitionRowsByVectorValidity({rows, expectedDimension} = {}) {
    if (!Array.isArray(rows)) {
        throw new TypeError('partitionRowsByVectorValidity: rows must be an array');
    }
    if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) {
        throw new TypeError('partitionRowsByVectorValidity: expectedDimension must be a positive integer');
    }

    const valid    = [],
          rejected = [];

    for (const row of rows) {
        const reason = classifyRowVector(row, expectedDimension);

        if (reason === null) {
            valid.push(row);
        } else {
            rejected.push({id: row?.id ?? null, reason});
        }
    }

    return {valid, rejected};
}

/**
 * @summary Summarizes rejected rows for fail-loud logging: a total count plus a per-reason breakdown.
 *
 * @param {Object[]} [rejected=[]] The `rejected` array (`{id, reason}` entries) from {@link partitionRowsByVectorValidity}.
 * @returns {Object} `{count, byReason}` — `count` is the total rejected; `byReason` maps each observed reason
 *     to its occurrence count (omitting reasons that did not occur).
 */
export function summarizeVectorRejections(rejected = []) {
    const byReason = {};

    for (const {reason} of rejected) {
        byReason[reason] = (byReason[reason] || 0) + 1;
    }

    return {count: rejected.length, byReason};
}
