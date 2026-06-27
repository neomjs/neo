import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/dimensionConsistencyDiagnosis
 * @summary Pure detect-producer for the embedding-dimension consistency signal — a leaf of the
 * data-integrity detect-signal class (sibling of `dataIntegrityCoverageDiagnosis` / `vectorCountMonotonicityDiagnosis`).
 * Every stored Memory Core vector must be the configured embedding dimension; a wrong-dimension vector is
 * unambiguous corruption (it breaks similarity search, and — unlike a count regression — has no legitimate
 * case). It turns per-collection dimension-audit samples into a `recovery-diagnosis` when any collection
 * holds mismatched-dimension vectors, so the immune system can heal autonomously rather than serve a corrupt index.
 *
 * Detect-only by construction: it consumes audit samples and emits a diagnosis — no repair / re-embed /
 * restore / mutation. It emits `recoveryClass: 'data-integrity'` + raw `evidenceFacts` (the autonomous classifier's input),
 * targeting the Memory Core `compose-service` (per-collection mismatch carried in `evidenceFacts`). Mirrors
 * the sibling producers' pure shape: the samples (the dimension audit) are injected — the audit + scheduling
 * are the consumer/daemon's concern — so it is testable in isolation.
 */

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from per-collection embedding-dimension samples.
 *
 * Pure — no I/O. Returns a diagnosis when ANY collection reports `mismatchedVectorCount > 0` (a stored
 * vector whose dimension ≠ the configured embedding dimension); returns `null` when every sampled collection
 * is clean (never a false positive). Samples whose `mismatchedVectorCount` is not a finite number are
 * ignored (an unread collection is not corruption).
 *
 * @param {Object} options
 * @param {Array<Object>} options.samples Per-collection dimension samples — `[{collection, expectedDimension, mismatchedVectorCount}]`.
 * @param {Number} options.observedAt Epoch milliseconds when the audit was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity`, raw evidence) when a mismatch is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildDimensionConsistencyDiagnosis({samples, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildDimensionConsistencyDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildDimensionConsistencyDiagnosis: observedAt must be a finite number');
    }

    const rows       = Array.isArray(samples) ? samples : [],
          mismatched = rows.filter(sample =>
              Number.isFinite(sample?.mismatchedVectorCount) && sample.mismatchedVectorCount > 0
          );

    // Every sampled collection dimension-consistent → no diagnosis (never a false positive).
    if (mismatched.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:dimension-mismatch:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : mismatched.map(sample => ({
            type                 : 'vector-dimension-mismatch',
            collection           : sample.collection,
            expectedDimension    : sample.expectedDimension,
            mismatchedVectorCount: sample.mismatchedVectorCount
        })),
        observedAt,
        source : 'data-integrity-dimension-monitor',
        details: {
            reasonCode           : 'data-integrity-dimension-mismatch',
            mismatchedCollections: mismatched.map(sample => sample.collection)
        }
    });
}
