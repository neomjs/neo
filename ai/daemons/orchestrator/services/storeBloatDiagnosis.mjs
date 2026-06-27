import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/storeBloatDiagnosis
 * @summary Pure detect-producer for the data-integrity store-size bloat signal — a leaf of the
 * data-integrity detect-signal class (sibling of the coverage-drift + SQLite-integrity producers). The
 * unified Chroma store can grow unbounded (un-pruned WAL, orphaned segments, churn); a store far over its
 * size budget, or growing too fast between samples, is a data-integrity signal. It turns an injected
 * `(storeSizeBytes, previousSizeBytes)` measurement + configured thresholds into a `recovery-diagnosis`
 * so the immune system heals autonomously rather than letting the store bloat silently.
 *
 * Detect-only by construction: it consumes a size measurement and emits a diagnosis — it performs no
 * prune / vacuum / mutation (remediation is the autonomous defrag actuator — a separate layer). It emits `recoveryClass: 'data-integrity'` +
 * raw `evidenceFacts` (the autonomous classifier's input), targeting the Memory Core `compose-service`. The size measurement and
 * the threshold config-leaves (read at the daemon use-site) are injected, so the producer is pure and
 * testable in isolation. A sub-signal whose threshold is non-finite is skipped (graceful).
 */

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from a store-size measurement + thresholds.
 *
 * Pure — no I/O. Returns a diagnosis when the store is over its ABSOLUTE budget OR has GROWN faster than
 * the growth-ratio budget since the previous sample; returns `null` when within budget (never a false
 * positive). A non-finite `storeSizeBytes` (no measurement) returns `null`; a missing / zero
 * `previousSizeBytes` simply disables the growth sub-signal (absolute-only).
 *
 * @param {Object} options
 * @param {Number} options.storeSizeBytes Current store size in bytes.
 * @param {Number} [options.previousSizeBytes] The prior sample's store size (enables the growth sub-signal).
 * @param {Object} options.thresholds `{absoluteBytes, growthRatio}` — config leaves read at the daemon use-site.
 * @param {Number} options.observedAt Epoch milliseconds when the measurement was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity`, raw evidence) when bloated, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildStoreBloatDiagnosis({storeSizeBytes, previousSizeBytes, thresholds, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildStoreBloatDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildStoreBloatDiagnosis: observedAt must be a finite number');
    }

    // No measurement → nothing to assess (not a loss).
    if (!Number.isFinite(storeSizeBytes)) {
        return null;
    }

    const absoluteBytes = thresholds?.absoluteBytes,
          growthRatio   = thresholds?.growthRatio,
          signals       = [];

    if (Number.isFinite(absoluteBytes) && storeSizeBytes > absoluteBytes) {
        signals.push({type: 'store-bloat', signal: 'absolute', storeSizeBytes, thresholdBytes: absoluteBytes});
    }

    if (Number.isFinite(growthRatio) && Number.isFinite(previousSizeBytes) && previousSizeBytes > 0) {
        const ratio = (storeSizeBytes - previousSizeBytes) / previousSizeBytes;

        if (ratio > growthRatio) {
            signals.push({
                type          : 'store-bloat',
                signal        : 'growth',
                storeSizeBytes,
                previousSizeBytes,
                observedGrowth: ratio,
                thresholdRatio: growthRatio
            });
        }
    }

    // Within budget on every configured sub-signal → no diagnosis.
    if (signals.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:store-bloat:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : signals,
        observedAt,
        source        : 'data-integrity-store-bloat-monitor',
        details       : {
            reasonCode      : 'data-integrity-store-bloat',
            triggeredSignals: signals.map(signal => signal.signal)
        }
    });
}
