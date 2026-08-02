import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

/**
 * The two causes that name a timeout, and the only ones a binding-timeout verdict may be derived from.
 *
 * The predecessor derived that verdict from `failedInner` / `failedOuter` — control-flow branch counters.
 * A branch says WHICH path ran and never WHY: a summarizer returning `null` instantly, with no timeout
 * anywhere, increments `failedInner` exactly as a real inner timeout does. That is why the predecessor
 * was closed unmerged rather than reworded; no phrasing repairs an input contract that lacks the fact.
 * @type {Object}
 */
export const TIMEOUT_CAUSES = Object.freeze({inner: 'timeout-inner', outer: 'timeout-outer'});

/**
 * Passes a window must span before a diagnosis is emitted at all.
 * @type {Number}
 */
export const DEFAULT_MIN_SUSTAINED_PASSES = 3;

/**
 * @summary Sums a pass's typed failure causes, ignoring any cause this module does not know.
 * @param {Object} pass One `backfillMiniSummaries` result.
 * @returns {Object} `{inner, outer, other, total}` cause counts.
 */
function tallyCauses(pass) {
    const causes = pass?.failureCauses;

    if (!causes || typeof causes !== 'object') {
        return {inner: 0, outer: 0, other: 0, total: 0};
    }

    let inner = 0, outer = 0, other = 0;

    for (const [cause, rawCount] of Object.entries(causes)) {
        const count = Number.isFinite(rawCount) ? rawCount : 0;

        if (cause === TIMEOUT_CAUSES.inner)      inner += count;
        else if (cause === TIMEOUT_CAUSES.outer) outer += count;
        else                                     other += count;
    }

    return {inner, outer, other, total: inner + outer + other};
}

/**
 * @summary Decides whether one pass is starved: it processed rows and completed none of them, and the
 * failures were generation failures rather than rows that were never summarizable.
 *
 * `missingContent` and `exhausted` rows are deliberately NOT starvation. A sweep that correctly archives
 * three un-summarizable rows and hits one unrelated provider error is a working sweep with a bad row in
 * it; the predecessor emitted on exactly that shape because it required only *at least one* failure. The
 * guard is that every failure in the pass must be a generation failure, not merely that one is.
 *
 * @param {Object} pass One `backfillMiniSummaries` result.
 * @returns {Boolean}
 */
function isStarvedPass(pass) {
    const processed = Number.isFinite(pass?.processed) ? pass.processed : 0,
          updated   = Number.isFinite(pass?.updated)   ? pass.updated   : 0;

    // A pass that completed any work is not starved, however badly the rest of it went.
    if (processed === 0 || updated > 0) {
        return false;
    }

    const {total} = tallyCauses(pass),
          skipped = (Number.isFinite(pass?.missingContent) ? pass.missingContent : 0) +
                    (Number.isFinite(pass?.exhausted)      ? pass.exhausted      : 0);

    // Every processed row must be accounted for by a generation failure. If rows were skipped for
    // non-generation reasons, the loop is not starved — it is draining rows it cannot summarize.
    return total > 0 && skipped === 0 && total >= processed;
}

/**
 * @summary Names which timeout window is binding, from causes alone, or `null` when none is.
 *
 * Returns `'mixed'` for a genuine tie rather than picking one. The predecessor resolved ties to `'outer'`
 * because its verdict was an *inference* from branch topology, so the pessimistic pick was the safe
 * default. With typed causes both timeouts are measured facts, so a tie means the window hit both bounds
 * — and choosing one would assert something the evidence does not contain, which is the predecessor's
 * defect wearing a better name. A consumer that cannot act on `'mixed'` should widen nothing.
 *
 * `null` when neither timeout cause appears: a window starved by `no-model` or `provider-error` is really
 * starved, and has no window to widen. Naming one would send a controller to adjust a bound that was
 * never involved.
 *
 * @param {Object} totals Summed `{inner, outer}` counts across the window.
 * @returns {String|null} `'inner'` | `'outer'` | `'mixed'` | `null`
 */
function resolveBindingTimeout({inner, outer}) {
    if (inner === 0 && outer === 0) return null;
    if (inner === outer)            return 'mixed';

    return inner > outer ? 'inner' : 'outer'
}

/**
 * @summary Diagnoses miniSummary generation starvation and names the binding timeout from typed causes.
 *
 * Starvation is a loop that processes rows and completes none of them, for days, while every other
 * signal reads healthy: the Memory Core answers A2A and persists memory throughout, so the service looks
 * fine while burning cores. Nothing previously turned that into something a controller could consume.
 *
 * Classified `contention`, never `crash`. Summary generation depends on the chat model, so a failing
 * canary here means saturation or a degraded provider — not a dead service. `crash` would invite a
 * restart that fixes nothing and costs an outage.
 *
 * `confidence: 1` describes the OBSERVATION, not the authority to act. Starvation is measured rather than
 * inferred, so the confidence is honest — but a consumer must still combine this with a resource or
 * lifecycle fact of its own before taking an authoritative action.
 *
 * @param {Object} [options]
 * @param {Object[]} [options.window] Consecutive `backfillMiniSummaries` results, oldest first.
 * @param {Number} options.observedAt Epoch ms.
 * @param {String} options.serviceId Compose-service identity.
 * @param {Number} [options.minSustainedPasses=DEFAULT_MIN_SUSTAINED_PASSES] Passes required before emitting.
 * @returns {Object|null} A `recovery-diagnosis` event (`contention`) when sustained starvation is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildMiniSummaryStarvationDiagnosis({
    window,
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

    const passes = Array.isArray(window) ? window : [];

    // A threshold below 1 must not license emission from nothing. The predecessor tested
    // `passes.length < minSustainedPasses`, which is `0 < 0 === false` for an empty window, and then
    // `[].every(...)` returned vacuously true — so it emitted a diagnosis from no evidence at all.
    // Requiring at least one pass AND at least the threshold is the fix; neither check alone is enough.
    const required = Math.max(1, Number.isFinite(minSustainedPasses) ? minSustainedPasses : DEFAULT_MIN_SUSTAINED_PASSES);

    if (passes.length < required) {
        return null;
    }

    if (!passes.every(isStarvedPass)) {
        return null;
    }

    const totals = passes.reduce((sum, pass) => {
        const {inner, outer, other} = tallyCauses(pass);

        return {inner: sum.inner + inner, outer: sum.outer + outer, other: sum.other + other}
    }, {inner: 0, outer: 0, other: 0});

    const bindingTimeout = resolveBindingTimeout(totals);

    return createRecoveryDiagnosisEvent({
        diagnosisId   : `contention:${serviceId}:mini-summary-starvation:${observedAt}`,
        recoveryClass : 'contention',
        confidence    : 1,
        targetIdentity: {kind: 'compose-service', id: serviceId},
        evidenceFacts : passes.map((pass, index) => ({
            type         : 'mini-summary-starved-pass',
            passIndex    : index,
            processed    : pass?.processed ?? 0,
            updated      : pass?.updated ?? 0,
            failureCauses: {...(pass?.failureCauses || {})},
            // Branch topology travels as evidence, explicitly NOT as a verdict — a consumer may want the
            // split, but nothing here may be derived from it.
            branchSplit   : {
                failedInner: pass?.failedInner ?? 0,
                failedOuter: pass?.failedOuter ?? 0
            }
        })),
        observedAt,
        source : 'mini-summary-starvation-monitor',
        details: {
            reasonCode     : 'mini-summary-generation-starvation',
            sustainedPasses: passes.length,
            causeTotals    : totals,
            // Absent rather than guessed when no timeout cause is present.
            ...(bindingTimeout ? {bindingTimeout} : {})
        }
    });
}
