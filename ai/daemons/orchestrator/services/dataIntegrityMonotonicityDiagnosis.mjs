import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/dataIntegrityMonotonicityDiagnosis
 * @summary Pure detect-producer for the data-integrity vector-count MONOTONICITY signal (the class's second leaf) —
 * the threshold-free complement to the coverage-drift producer ({@link ../services/dataIntegrityCoverageDiagnosis}).
 *
 * Memory Core collections (`neo-agent-memory` / `neo-agent-sessions`) are append-mostly, so a vector-count
 * **decrease** between samples is a near-unambiguous data-loss signal — robust where an absolute coverage
 * threshold would miss or false-alarm (it would have caught the recovery-incident's ~10k-vector drop cleanly). Coverage-drift
 * catches metadata-vs-vector desync within a single snapshot; this catches a clean count regression over time.
 *
 * Detect-only by construction: it compares two injected count maps and emits a diagnosis — no repair / re-embed /
 * restore / Chroma mutation. It emits `recoveryClass: 'data-integrity'` + `details.actionClass: 'escalate'`,
 * targeting the Memory Core `compose-service` (per-collection regression detail in `evidenceFacts`, for blast-control).
 * Mirrors the coverage producer's pure, injected-data shape so it is testable in isolation. The caller (the
 * diagnostics daemon) supplies `currentCounts` from `auditChromaVectorCoverage` and `previousCounts` from the
 * persisted prior sample; that historical-sample persistence + scheduling is the integration follow-up, not this leaf.
 */

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from a current-vs-previous vector-count comparison.
 *
 * Pure — no I/O. Returns a diagnosis when ANY collection's current count is strictly less than its previous
 * count (an append-mostly regression); returns `null` when every collection is flat-or-rising, or has no prior
 * sample (no false escalation on first run). A collection absent from `previousCounts` is skipped.
 *
 * @param {Object} options
 * @param {Object} options.currentCounts  Map of `{[collectionName]: vectorIndexIdCount}` from the latest audit.
 * @param {Object} options.previousCounts Map of `{[collectionName]: vectorIndexIdCount}` from the prior sample.
 * @param {Number} options.observedAt     Epoch milliseconds when the current sample was observed.
 * @param {String} options.serviceId      The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity` / `escalate`) when a regression is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildDataIntegrityMonotonicityDiagnosis({currentCounts, previousCounts, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildDataIntegrityMonotonicityDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildDataIntegrityMonotonicityDiagnosis: observedAt must be a finite number');
    }

    const current     = currentCounts  && typeof currentCounts  === 'object' ? currentCounts  : {},
          previous    = previousCounts && typeof previousCounts === 'object' ? previousCounts : {},
          regressions = [];

    for (const [collection, currentCount] of Object.entries(current)) {
        const previousCount = previous[collection];

        // A collection with no prior sample is skipped (no false escalation on first run). Append-mostly
        // collections only legitimately grow or hold; a strict decrease is the data-loss signal.
        if (Number.isFinite(previousCount) && Number.isFinite(currentCount) && currentCount < previousCount) {
            regressions.push({
                type : 'vector-count-regression',
                collection,
                previousCount,
                currentCount,
                delta: currentCount - previousCount
            });
        }
    }

    // No regression → no diagnosis (never a false escalation).
    if (regressions.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:vector-count-regression:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : regressions,
        observedAt,
        source        : 'data-integrity-monotonicity-monitor',
        details       : {
            actionClass         : 'escalate',
            reasonCode          : 'data-integrity-vector-count-regression',
            regressedCollections: regressions.map(regression => regression.collection)
        }
    });
}
