import crypto from 'crypto';

/**
 * @summary The versioned canonical batch contract for community-activity admission.
 * Providers acquire and normalize; Memory Core validates and admits. Bumping this string is a
 * breaking contract change — admission refuses any batch that does not declare exactly this version,
 * so an older connector fails loudly at the boundary instead of half-admitting an unknown shape.
 * @member {String}
 */
export const BATCH_SCHEMA_VERSION = 'community-activity-batch.v1';

const
    REQUIRED_BATCH_KEYS      = ['schemaVersion', 'batchId', 'sourceInstanceId', 'registrationEpoch', 'partition', 'coverage', 'occurrences'],
    REQUIRED_COVERAGE_KEYS   = ['fromBasis', 'toBasis', 'complete'],
    REQUIRED_OCCURRENCE_KEYS = ['providerEntityId', 'occurrenceKind', 'occurredAt'],
    /**
     * Provider prose never enters an automatic durable row. A batch carrying any of these is
     * REJECTED rather than silently stripped: stripping would let a connector believe prose was
     * admitted and stored, which is a worse contract than a loud refusal.
     */
    PROSE_KEYS               = new Set(['body', 'bodyHTML', 'bodyText', 'excerpt', 'summary', 'text', 'title']),
    /** Absence is never inferred — it is one of three explicitly-evidenced dispositions. */
    ABSENCE_DISPOSITIONS     = new Set(['deleted', 'inaccessible', 'unknown']);

/**
 * @summary Deterministically serializes a value so equal payloads yield equal strings.
 *
 * Object keys are sorted. Arrays deliberately keep their order here: array-ordering policy is a
 * per-collection semantic decision, not a global one, and a blanket sort is exactly the trap that
 * would silently weaken corruption detection. The one collection whose order is normalized is the
 * occurrence list, and that happens once, explicitly, in {@link canonicalBatchDigest}.
 * @param {*} value
 * @returns {String}
 */
function canonicalize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
    }

    return JSON.stringify(value === undefined ? null : value)
}

/**
 * @summary The corruption detector: a stable digest over a batch's semantic payload.
 *
 * Admission treats `batchId` + this digest as the idempotency key — same id and same digest is a
 * retry, same id and a different digest is an integrity conflict. Transport-only fields are excluded
 * so a redelivery cannot masquerade as corruption.
 *
 * **Ordering decision (deliberate, witness-pinned):** the occurrence collection is normalized
 * order-INSENSITIVELY. Ordering authority does not live in the payload — the admitted sequence is
 * server-assigned and distinct from batch identity — so array position carries no durable meaning,
 * and sorting normalizes away a non-authoritative field rather than discarding information. The
 * alternative would raise an integrity conflict every time a connector re-serializes from a map.
 * @param {Object} batch
 * @returns {String} `sha256:<hex>`
 */
export function canonicalBatchDigest(batch) {
    const
        {batchId, sourceInstanceId, registrationEpoch, partition, coverage, occurrences = []} = batch,
        // Sort by each occurrence's own canonical form: a total, input-order-independent order.
        orderedOccurrences = occurrences
            .map(canonicalize)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        payload = canonicalize({
            batchId,
            coverage,
            partition,
            registrationEpoch,
            schemaVersion: BATCH_SCHEMA_VERSION,
            sourceInstanceId
        });

    return `sha256:${crypto.createHash('sha256').update(`${payload}|[${orderedOccurrences.join(',')}]`).digest('hex')}`
}

/**
 * @summary Validates a batch against the v1 contract. Pure — no I/O, no tenant resolution.
 *
 * Structural validity only: identity/authority checks (registration epoch currency, tenant scoping)
 * belong to the admission service, which owns the server-side authority those decisions require.
 * @param {Object} batch
 * @returns {{valid: Boolean, errors: String[]}}
 */
export function validateBatch(batch) {
    const errors = [];

    if (!batch || typeof batch !== 'object') {
        return {valid: false, errors: ['BATCH_NOT_AN_OBJECT']}
    }

    if (batch.schemaVersion !== BATCH_SCHEMA_VERSION) {
        errors.push('BATCH_SCHEMA_VERSION_UNSUPPORTED')
    }

    REQUIRED_BATCH_KEYS.forEach(key => {
        if (batch[key] === undefined || batch[key] === null) errors.push(`BATCH_MISSING_${key.toUpperCase()}`)
    });

    if (!Number.isInteger(batch.registrationEpoch) || batch.registrationEpoch < 1) {
        errors.push('BATCH_REGISTRATION_EPOCH_INVALID')
    }

    const {coverage} = batch;

    if (coverage && typeof coverage === 'object') {
        REQUIRED_COVERAGE_KEYS.forEach(key => {
            if (coverage[key] === undefined || coverage[key] === null) errors.push(`COVERAGE_MISSING_${key.toUpperCase()}`)
        });

        if (typeof coverage.complete === 'boolean') {
            const gaps = coverage.gaps || [];

            if (!Array.isArray(gaps)) {
                errors.push('COVERAGE_GAPS_NOT_AN_ARRAY')
            } else if (coverage.complete && gaps.length) {
                // A window cannot be simultaneously complete and gapped — that is a dishonest
                // coverage claim, and honest gaps are the whole point of carrying them.
                errors.push('COVERAGE_COMPLETE_CONTRADICTS_GAPS')
            } else if (!coverage.complete && !gaps.length) {
                errors.push('COVERAGE_INCOMPLETE_WITHOUT_GAPS')
            }
        }
    }

    if (!Array.isArray(batch.occurrences)) {
        errors.push('BATCH_OCCURRENCES_NOT_AN_ARRAY')
    } else {
        batch.occurrences.forEach((occurrence, index) => {
            if (!occurrence || typeof occurrence !== 'object') {
                errors.push(`OCCURRENCE_${index}_NOT_AN_OBJECT`);
                return
            }

            REQUIRED_OCCURRENCE_KEYS.forEach(key => {
                if (occurrence[key] === undefined || occurrence[key] === null) errors.push(`OCCURRENCE_${index}_MISSING_${key.toUpperCase()}`)
            });

            Object.keys(occurrence).forEach(key => {
                if (PROSE_KEYS.has(key)) errors.push(`OCCURRENCE_${index}_CARRIES_PROSE_${key.toUpperCase()}`)
            });

            if (occurrence.absence !== undefined && !ABSENCE_DISPOSITIONS.has(occurrence.absence)) {
                errors.push(`OCCURRENCE_${index}_ABSENCE_DISPOSITION_INVALID`)
            }
        })
    }

    return {valid: errors.length === 0, errors}
}
