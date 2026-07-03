import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/dataIntegrityCoverageDiagnosis
 * @summary Pure detect-producer for the data-integrity coverage-drift signal (the first leaf of the
 * data-integrity detect-signal) — the DETECT half of the v13.1 corruption-recovery gate. Turns a Chroma
 * vector-coverage audit (`auditChromaVectorCoverage`) into a `recovery-diagnosis` when a Memory Core
 * collection is "up but data-gutted" (metadata rows present, vectors missing — the corruption-incident
 * shape), so the immune system can heal autonomously rather than report a gutted store as healthy.
 *
 * Detect-only by construction: it consumes a coverage RESULT and emits a diagnosis — it performs no
 * repair / re-embed / restore / Chroma mutation (those are the recovery actuator + defrag). It emits
 * `recoveryClass: 'data-integrity'` + raw `evidenceFacts` (the autonomous classifier's input), targeting the Memory Core
 * `compose-service` (per-collection drift carried in `evidenceFacts`/`details` — no per-collection
 * target kind, for blast-control). Mirrors the supervised-task producer-core pattern: pure, with the
 * audit result injected so it is testable in isolation.
 */

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from a Chroma vector-coverage audit result.
 *
 * Pure — no I/O. Returns a diagnosis when ANY collection's coverage `ok === false` (drift); returns
 * `null` when every collection is clean (never a false positive). The caller (the diagnostics daemon)
 * supplies the `auditChromaVectorCoverage()` result + the Memory Core service id.
 *
 * @param {Object} options
 * @param {Object} options.coverageResult The `auditChromaVectorCoverage()` result — `{collections:[{name, ok, ...}]}`.
 * @param {Number} options.observedAt Epoch milliseconds when the audit was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity`, raw evidence) when drift is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildDataIntegrityCoverageDiagnosis({coverageResult, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildDataIntegrityCoverageDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildDataIntegrityCoverageDiagnosis: observedAt must be a finite number');
    }

    const collections = Array.isArray(coverageResult?.collections) ? coverageResult.collections : [],
          drifted     = collections.filter(collection => collection?.ok === false);

    // Clean coverage → no diagnosis (never a false positive).
    if (drifted.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:coverage-drift:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : drifted.map(collection => ({
            type                  : 'vector-coverage-drift',
            collection            : collection.name,
            missingFromVectorCount: collection.missingFromVectorCount,
            extraInVectorCount    : collection.extraInVectorCount
        })),
        observedAt,
        source : 'data-integrity-coverage-monitor',
        details: {
            reasonCode        : 'data-integrity-coverage-drift',
            driftedCollections: drifted.map(collection => collection.name)
        }
    });
}
