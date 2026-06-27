import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/vectorCountMonotonicityDiagnosis
 * @summary Pure detect-producer for the vector-count monotonicity signal — the second leaf of the
 * data-integrity detect-signal class (sibling of `dataIntegrityCoverageDiagnosis`). Memory Core collections
 * are append-mostly, so a vector-count DECREASE between samples is a near-unambiguous, threshold-free
 * data-loss signal. It turns per-collection `(previousCount, currentCount)` sample pairs into a
 * `recovery-diagnosis` when any collection regressed, so the immune system can heal autonomously rather than report
 * a store that silently shrank as healthy.
 *
 * Detect-only by construction: it consumes count samples and emits a diagnosis — it performs no repair /
 * re-embed / restore / mutation. It emits `recoveryClass: 'data-integrity'` + raw `evidenceFacts` (the autonomous classifier's input),
 * targeting the Memory Core `compose-service` (per-collection regression carried in `evidenceFacts`). Mirrors
 * the coverage-drift producer's pure shape: the samples are injected (the historical sample store + scheduling
 * are the consumer/daemon's concern), so it is testable in isolation.
 */

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from per-collection vector-count samples.
 *
 * Pure — no I/O. Returns a diagnosis when ANY collection's `currentCount` is strictly less than its
 * `previousCount` (a regression in an append-mostly store); returns `null` when every collection is monotonic
 * (never a false positive). Samples whose counts are not both finite numbers are ignored — a missing
 * baseline is not a loss.
 *
 * @param {Object} options
 * @param {Array<Object>} options.samples Per-collection count samples — `[{collection, previousCount, currentCount}]`.
 * @param {Number} options.observedAt Epoch milliseconds when the sample was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity`, raw evidence) when a regression is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildVectorCountMonotonicityDiagnosis({samples, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildVectorCountMonotonicityDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildVectorCountMonotonicityDiagnosis: observedAt must be a finite number');
    }

    const rows      = Array.isArray(samples) ? samples : [],
          regressed = rows.filter(sample =>
              Number.isFinite(sample?.previousCount) &&
              Number.isFinite(sample?.currentCount)  &&
              sample.currentCount < sample.previousCount
          );

    // Every collection monotonic (or no comparable samples) → no diagnosis (never a false positive).
    if (regressed.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:vector-count-regression:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : regressed.map(sample => ({
            type         : 'vector-count-regression',
            collection   : sample.collection,
            previousCount: sample.previousCount,
            currentCount : sample.currentCount,
            lost         : sample.previousCount - sample.currentCount
        })),
        observedAt,
        source : 'data-integrity-monotonicity-monitor',
        details: {
            reasonCode          : 'data-integrity-vector-count-regression',
            regressedCollections: regressed.map(sample => sample.collection)
        }
    });
}
