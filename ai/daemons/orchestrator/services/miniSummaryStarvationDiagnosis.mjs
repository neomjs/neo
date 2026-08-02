import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * @module ai/daemons/orchestrator/services/miniSummaryStarvationDiagnosis
 * @summary Pure detect-producer for miniSummary generation-timeout starvation — the DETECT half the
 * homeostatic window controller consumes. Turns a window of backfill pass results into a `contention`
 * `recovery-diagnosis` when the loop is processing rows and completing none, and names WHICH timeout
 * boundary the failures are landing on so a controller can tell an inner-leaf problem from an outer-leaf
 * one.
 *
 * Detect-only by construction: it consumes pass RESULTS and emits a diagnosis — it widens no window,
 * writes no config, and calls no actuator (those are the recovery actuator's `reconfigure`). Mirrors the
 * coverage-drift and vector-count producers' pure shape: the samples are injected, so it is testable in
 * isolation and carries no scheduling.
 *
 * ## Why `contention`, never `crash`
 *
 * A **model-dependent canary must classify as contention/degraded first, never "restart now"** — the
 * standing example is an embedding canary that false-fails while the service is functionally fine.
 * Summary generation depends on the chat model, so starvation here is a saturation signal, not a
 * liveness one: the Memory Core answers A2A and persists memory throughout. Emitting `crash` would
 * invite a restart that fixes nothing and costs an outage.
 *
 * ## Why a window, and why the branch split is load-bearing
 *
 * A single starved pass is advisory — a momentary provider spike is not saturation (§2.4). Starvation
 * must hold across `minSustainedPasses` before this emits anything.
 *
 * The branch split matters because the miniSummary path has **two nested timeouts**:
 * `generateMiniSummaryTimeoutMs` fires *inside* `buildMiniSummary`, whose try/catch swallows it into a
 * falsy return (`failedInner`); `miniSummaryTimeoutMs` wraps the call from *outside*, so its rejection
 * escapes to the sweep's catch (`failedOuter`). **Which branch a failure lands on is a function of the
 * window a controller moves, not a property of the code** — so a diagnosis built on totals alone goes
 * blind at exactly the boundary an adaptive controller is actuating toward. `dominantBranch` is the
 * output that keeps it honest: an outer-dominant diagnosis means widening the inner leaf alone cannot
 * help, because the outer bound is the one binding.
 *
 * ## Authority boundary
 *
 * This emits a diagnosis, never an action. The multi-fact requirement gates *authoritative actions*,
 * not records — so a consumer that wants to act on this must combine it with a resource or lifecycle
 * fact of its own. `confidence: 1` describes the observation (starvation is measured, not inferred),
 * not a licence to actuate on it alone.
 */

/**
 * Minimum consecutive starved passes before starvation is reported. One pass is advisory (§2.4).
 * @type {Number}
 */
export const DEFAULT_MIN_SUSTAINED_PASSES = 3;

/**
 * @summary Reports whether a single backfill pass result shows the starved shape.
 *
 * Starved means: rows were processed, none completed, and at least one failed on a generation branch.
 * The last clause is what separates starvation from an idle or content-missing pass — a sweep that
 * processed rows and skipped them all as un-summarizable is not a timeout problem.
 *
 * @param {Object} pass A `backfillMiniSummaries` result.
 * @returns {Boolean}
 */
function isStarvedPass(pass) {
    const processed   = pass?.processed   ?? 0,
          updated     = pass?.updated     ?? 0,
          failedInner = pass?.failedInner ?? 0,
          failedOuter = pass?.failedOuter ?? 0;

    return processed > 0 && updated === 0 && (failedInner + failedOuter) > 0;
}

/**
 * @summary Builds a `contention` `recovery-diagnosis` from a window of miniSummary backfill passes.
 *
 * Pure — no I/O. Returns `null` unless EVERY pass in the window is starved and the window is at least
 * `minSustainedPasses` long, so a single bad pass or a partially-recovering loop never produces a
 * diagnosis. The caller (the diagnostics daemon) supplies the recent pass results and the Memory Core
 * service id.
 *
 * @param {Object} options
 * @param {Object[]} options.passes Recent `backfillMiniSummaries` results, oldest first.
 * @param {Number} options.observedAt Epoch milliseconds when the window was observed.
 * @param {String} options.serviceId The Memory Core compose-service identifier.
 * @param {Number} [options.minSustainedPasses=DEFAULT_MIN_SUSTAINED_PASSES] Consecutive starved passes required.
 * @returns {Object|null} A `contention` `recovery-diagnosis` when starvation is sustained, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildMiniSummaryStarvationDiagnosis({
    passes,
    observedAt,
    serviceId,
    minSustainedPasses = DEFAULT_MIN_SUSTAINED_PASSES
} = {}) {
    if (typeof serviceId !== 'string' || serviceId.length === 0) {
        throw new TypeError('buildMiniSummaryStarvationDiagnosis: serviceId is required');
    }
    if (!Number.isFinite(observedAt)) {
        throw new TypeError('buildMiniSummaryStarvationDiagnosis: observedAt must be a finite number');
    }

    const window = Array.isArray(passes) ? passes : [];

    // Not enough evidence, or the loop is completing work → no diagnosis (never a false positive).
    if (window.length < minSustainedPasses || !window.every(isStarvedPass)) {
        return null;
    }

    const innerTotal = window.reduce((sum, pass) => sum + (pass?.failedInner ?? 0), 0),
          outerTotal = window.reduce((sum, pass) => sum + (pass?.failedOuter ?? 0), 0),
          // Ties resolve to `outer` deliberately: the outer bound is the one a controller cannot widen
          // past without also moving it, so an ambiguous window must not read as "widen the inner leaf".
          dominantBranch = outerTotal >= innerTotal ? 'outer' : 'inner';

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `contention:${serviceId}:minisummary-starvation:${observedAt}`,
        recoveryClass : 'contention',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : window.map(pass => ({
            type       : 'minisummary-generation-starvation',
            processed  : pass?.processed   ?? 0,
            updated    : pass?.updated     ?? 0,
            failedInner: pass?.failedInner ?? 0,
            failedOuter: pass?.failedOuter ?? 0
        })),
        observedAt,
        source : 'minisummary-starvation-monitor',
        details: {
            reasonCode      : 'minisummary-generation-timeout-starvation',
            sustainedPasses : window.length,
            failedInnerTotal: innerTotal,
            failedOuterTotal: outerTotal,
            dominantBranch
        }
    });
}
