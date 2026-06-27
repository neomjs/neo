import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/sqliteIntegrityDiagnosis
 * @summary Pure detect-producer for the data-integrity SQLite-integrity signal — a leaf of the
 * data-integrity detect-signal. It turns a Chroma SQLite `quick_check` /
 * `integrity_check` audit (`checkChromaIntegrity` → `result.sqlite.checks`) into a `recovery-diagnosis`
 * when the unified store's SQLite integrity is broken — the *"malformed inverted index for FTS5"* shape
 * that recurred all through the corruption-incident forensics but was only ever a manual CLI line, never
 * a detect signal — so the immune system heals autonomously rather than leaving a structurally-corrupt store undetected.
 *
 * Detect-only by construction: it consumes a check RESULT and emits a diagnosis — it performs no
 * repair / FTS5 rebuild / mutation (those are the autonomous quarantine actuator — a separate layer). It emits `recoveryClass: 'data-integrity'`
 * + raw `evidenceFacts` (the autonomous classifier's input), targeting the Memory Core `compose-service` (per-pragma failure
 * carried in `evidenceFacts`, with a bounded detail snippet — no unbounded SQLite output). Mirrors the
 * coverage-drift detect-producer: pure, with the audit result injected so it is testable in isolation.
 */

const MAX_DETAIL_LENGTH = 280;

/**
 * @summary Builds a data-integrity `recovery-diagnosis` from a Chroma SQLite integrity audit result.
 *
 * Pure — no I/O. Returns a diagnosis when ANY SQLite check is `ok === false` (a failed `quick_check` /
 * `integrity_check` — e.g. a malformed FTS5 index); returns `null` when every check passes (never a
 * false positive). The caller (the diagnostics daemon) supplies the `checkChromaIntegrity()`
 * `result.sqlite` object + the Memory Core service id.
 *
 * @param {Object} options
 * @param {Object} options.sqliteResult The `checkChromaIntegrity()` `result.sqlite` — `{checks:[{pragma, ok, output, error}]}`.
 * @param {Number} options.observedAt Epoch milliseconds when the audit was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @returns {Object|null} A `recovery-diagnosis` event (`data-integrity`, raw evidence) when a check failed, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildSqliteIntegrityDiagnosis({sqliteResult, observedAt, serviceId} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildSqliteIntegrityDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildSqliteIntegrityDiagnosis: observedAt must be a finite number');
    }

    const checks = Array.isArray(sqliteResult?.checks) ? sqliteResult.checks : [],
          failed = checks.filter(check => check?.ok === false);

    // Clean integrity → no diagnosis (never a false positive).
    if (failed.length === 0) {
        return null;
    }

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `data-integrity:${serviceId}:sqlite-integrity:${observedAt}`,
        recoveryClass : 'data-integrity',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : failed.map(check => ({
            type  : 'sqlite-integrity-failure',
            pragma: check.pragma,
            detail: String(check.error || check.output || '').slice(0, MAX_DETAIL_LENGTH)
        })),
        observedAt,
        source : 'data-integrity-sqlite-integrity-monitor',
        details: {
            reasonCode   : 'data-integrity-sqlite-integrity-failure',
            failedPragmas: failed.map(check => check.pragma)
        }
    });
}
