import {createRecoveryDiagnosisEvent, createRecoveryTargetIdentity} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

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
 * The upstream cause for "no chat model was resolvable", which the taxonomy treats as a provider-side
 * residency fact rather than as contention against the service that reported it.
 * @type {String}
 */
export const NO_MODEL_CAUSE = 'no-model';

/**
 * Passes a window must span before a diagnosis is emitted at all.
 * @type {Number}
 */
export const DEFAULT_MIN_SUSTAINED_PASSES = 3;

/**
 * Floor for any caller-supplied threshold. **Sustained means repeated**, so one observation can never
 * satisfy it however low the threshold is set — a clamp to `1` still emitted on a single pass and
 * reported `sustainedPasses: 1`, which is the very shape the ticket forbids.
 * @type {Number}
 */
export const MIN_SUSTAINED_FLOOR = 2;

/**
 * @summary Sums a pass's typed failure causes, ignoring any cause this module does not know.
 * @param {Object} pass One `backfillMiniSummaries` result.
 * @returns {Object} `{inner, outer, noModel, other, total}` cause counts.
 */
function tallyCauses(pass) {
    const causes = pass?.failureCauses;

    if (!causes || typeof causes !== 'object') {
        return {inner: 0, outer: 0, noModel: 0, other: 0, total: 0};
    }

    let inner = 0, outer = 0, noModel = 0, other = 0;

    for (const [cause, rawCount] of Object.entries(causes)) {
        const count = Number.isFinite(rawCount) ? rawCount : 0;

        if (cause === TIMEOUT_CAUSES.inner)       inner   += count;
        else if (cause === TIMEOUT_CAUSES.outer)  outer   += count;
        else if (cause === NO_MODEL_CAUSE)        noModel += count;
        else                                      other   += count;
    }

    return {inner, outer, noModel, other, total: inner + outer + noModel + other};
}

/**
 * @summary Decides whether one pass is starved: it processed rows and completed none of them, and the
 * failures were generation failures rather than rows that were never summarizable.
 *
 * `missingContent` rows are deliberately NOT starvation: a sweep that correctly archives un-summarizable
 * rows and hits one unrelated provider error is a working sweep with a bad row in it, and the predecessor
 * emitted on exactly that shape because it required only *at least one* failure.
 *
 * `exhausted` rows ARE starvation. The upstream contract archives a row only after it has spent its
 * generation-attempt budget, and records the typed cause BEFORE incrementing `exhausted` — so an
 * exhausted row is a generation failure that ran out of retries, not a row that was never summarizable.
 * Excluding it inverted the guard: a genuinely starved window whose rows had exhausted their budget
 * returned `null`, which is the false NEGATIVE of the defect this producer exists to catch.
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
          skipped = Number.isFinite(pass?.missingContent) ? pass.missingContent : 0;

    // Every processed row must be accounted for by a generation failure. If rows were skipped for
    // non-generation reasons, the loop is not starved — it is draining rows it cannot summarize.
    return total > 0 && skipped === 0 && total >= processed;
}

/**
 * @summary Whether one cause group holds a STRICT MAJORITY of the window's counted causes.
 *
 * A singular recovery class is a claim about the whole window, so it may only be made by a group that
 * outnumbers everything else combined. The predecessor of this helper let *any* non-zero timeout win:
 * @neo-gpt-emmy ran the classifier with `timeout-inner: 1` and `provider-error: 9` per pass and it emitted
 * `contention` on window totals of `3:27` — a class contradicting 90% of its own evidence. The reading was
 * not false (there really was a timeout); it was one level too coarse to be a window verdict, which is the
 * same granularity failure that closed the predecessor PR.
 *
 * Strict rather than `>=` on purpose: an even split IS mixed evidence, and mixed evidence must stay
 * `ambiguous` rather than resolve to whichever branch happens to be tested first.
 *
 * @param {Number} group Summed counts for one cause group.
 * @param {Number} total Summed counts across every group.
 * @returns {Boolean}
 */
function holdsMajority(group, total) {
    return group > 0 && group * 2 > total;
}

/**
 * @summary Validates a caller-supplied provider target, or `null` when it cannot be trusted.
 *
 * Mirrors `ContainerHealthDiagnosisService.readProviderTargetIdentity`: an unparseable target degrades the
 * diagnosis rather than throwing, because a malformed target is a caller-authority problem and must never
 * suppress a real starvation signal.
 *
 * A target naming the reporting service itself is REFUSED. That is not provider authority — it is the
 * exact false subject this repair exists to remove, re-entering through a parameter. Provider-ness cannot
 * be probed from this input; "not the service that reported the failure" is the one check available, so
 * it is the one that is enforced. Cost: a co-located provider deployment degrades to `ambiguous` and keeps
 * its `noModel` counts, which loses precision and asserts nothing false.
 *
 * @param {Object|null} providerTarget Caller-supplied target identity candidate.
 * @param {String} serviceId The service that REPORTED the starvation.
 * @returns {Object|null} A validated target identity, or `null`.
 */
function readProviderTarget(providerTarget, serviceId) {
    if (!providerTarget || typeof providerTarget !== 'object') return null;

    try {
        const target = createRecoveryTargetIdentity(providerTarget);

        return target.kind === 'compose-service' && target.id === serviceId ? null : target;
    } catch {
        return null;
    }
}

/**
 * @summary Maps the window's dominant cause to a recovery class the existing taxonomy already means.
 *
 * `contention` is NOT the answer for every starved window. It is provable only from a MAJORITY of
 * timeouts: a window that exhausted its generation budget is saturated, and that is what contention
 * means. The other causes name different things the taxonomy already distinguishes:
 *
 * - `no-model` is a MISSING MODEL, not saturation. `ContainerHealthDiagnosisService` already classifies a
 *   missing required model as `provider-role-residency` with a warm-provider action. Flattening it to
 *   contention against the Memory Core would blame the wrong subject for a provider-side fact, purely
 *   because the failing operation happens to use a model.
 * - a generic `provider-error` or `empty-output` proves the loop is starved and proves nothing about WHY.
 *   `ambiguous` is the honest class; it exists for this.
 * - anything mixed is `ambiguous` too. A class is a claim about the window, not about its loudest row.
 *
 * `provider-role-residency` additionally requires a validated provider target. The class names a
 * provider-side subject and `RecoveryActuatorService` derives its action target straight from
 * `targetIdentity.id`, so emitting it against the reporting service would aim a warm-provider capability
 * call at a container that hosts no provider. The upstream `backfillMiniSummaries` result carries an
 * aggregate cause tally and no provider identity, so without caller-supplied authority the honest class
 * is `ambiguous` — with `unresolvedProviderTarget` naming what was missing, so a consumer that DOES hold
 * provider authority can finish the classification instead of re-deriving this rule.
 *
 * The safe no-restart property is preserved throughout — none of these three classes invites a restart —
 * but preserving it is not a licence to discard the cause the upstream layer measured.
 *
 * @param {Object} totals Summed cause counts across the window.
 * @param {Object|null} providerTarget Validated provider target, or `null`.
 * @returns {String} A member of `RECOVERY_CLASSES`.
 */
function resolveRecoveryClass({inner, outer, noModel, other}, providerTarget) {
    const total = inner + outer + noModel + other;

    if (holdsMajority(inner + outer, total))             return 'contention';
    if (holdsMajority(noModel, total) && providerTarget) return 'provider-role-residency';

    return 'ambiguous'
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
 * Consulted ONLY for a `contention` window. A binding timeout is a verdict, and a minority of timeouts
 * cannot support one: three inner timeouts among thirty provider errors would have reported
 * `bindingTimeout: 'inner'` — "the inner window is too small" — off 10% of the evidence. The counts
 * themselves still travel in `causeTotals`, so gating the verdict discards nothing measured.
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
 * Never `crash`, whichever class is emitted. Summary generation depends on the chat model, so a failing
 * canary here means saturation or a degraded provider — not a dead service. `crash` would invite a
 * restart that fixes nothing and costs an outage.
 *
 * The class is derived from a MAJORITY of the window's typed causes, never from the mere presence of one:
 * `contention` for timeout-dominant windows, `provider-role-residency` for `no-model`-dominant windows
 * that also carry a validated provider target, and `ambiguous` for everything else — including mixed
 * evidence, which is the common real shape. `causeTotals` always carries the full tally, so a class that
 * declines to be precise never costs a consumer the measurement.
 *
 * `confidence: 1` describes the OBSERVATION, not the authority to act. Starvation is measured rather than
 * inferred, so the confidence is honest — but a consumer must still combine this with a resource or
 * lifecycle fact of its own before taking an authoritative action.
 *
 * @param {Object} [options]
 * @param {Object[]} [options.window] Consecutive `backfillMiniSummaries` results, oldest first.
 * @param {Number} options.observedAt Epoch ms.
 * @param {String} options.serviceId Compose-service identity that REPORTED the starvation.
 * @param {Number} [options.minSustainedPasses=DEFAULT_MIN_SUSTAINED_PASSES] Passes required before emitting.
 * @param {Object} [options.providerTarget] Target identity of the service HOSTING the chat provider, when
 *     the caller holds that authority — the only way a `no-model`-dominant window can be classified
 *     `provider-role-residency`, because the upstream cause tally does not name a provider. Unparseable,
 *     absent, or self-referential targets degrade the class to `ambiguous`; they never throw.
 * @returns {Object|null} A `recovery-diagnosis` event (`contention` | `provider-role-residency` |
 *     `ambiguous`) when sustained starvation is present, else `null`.
 * @throws {TypeError} when `serviceId` is missing/empty or `observedAt` is not a finite number.
 */
export function buildMiniSummaryStarvationDiagnosis({
    window,
    observedAt,
    serviceId,
    minSustainedPasses = DEFAULT_MIN_SUSTAINED_PASSES,
    providerTarget
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
    const required = Math.max(MIN_SUSTAINED_FLOOR, Number.isFinite(minSustainedPasses) ? minSustainedPasses : DEFAULT_MIN_SUSTAINED_PASSES);

    if (passes.length < required) {
        return null;
    }

    if (!passes.every(isStarvedPass)) {
        return null;
    }

    const totals = passes.reduce((sum, pass) => {
        const {inner, outer, noModel, other} = tallyCauses(pass);

        return {
            inner  : sum.inner   + inner,
            outer  : sum.outer   + outer,
            noModel: sum.noModel + noModel,
            other  : sum.other   + other
        }
    }, {inner: 0, outer: 0, noModel: 0, other: 0});

    const total           = totals.inner + totals.outer + totals.noModel + totals.other,
          validatedTarget = readProviderTarget(providerTarget, serviceId),
          recoveryClass   = resolveRecoveryClass(totals, validatedTarget),
          // A verdict only where the evidence supports one: see `resolveBindingTimeout`.
          bindingTimeout  = recoveryClass === 'contention' ? resolveBindingTimeout(totals) : null,
          // The window reads as a missing-model story but no provider could be named. Stated rather than
          // silently folded into `ambiguous`, so a consumer holding provider authority can finish the
          // classification — naming a limitation and quietly dropping it is how a gap becomes a waiver.
          unresolvedProviderTarget = recoveryClass === 'ambiguous' && holdsMajority(totals.noModel, total);

    return createRecoveryDiagnosisEvent({
        diagnosisId: `${recoveryClass}:${serviceId}:mini-summary-starvation:${observedAt}`,
        recoveryClass,
        confidence : 1,
        // `RecoveryActuatorService` derives its action target from `targetIdentity.id`, so a provider-side
        // class MUST carry the provider — targeting the reporting service would warm a provider on a
        // container that hosts none.
        targetIdentity: recoveryClass === 'provider-role-residency' ? validatedTarget : {kind: 'compose-service', id: serviceId},
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
            // Absent rather than guessed when no timeout cause holds the window.
            ...(bindingTimeout ? {bindingTimeout} : {}),
            ...(unresolvedProviderTarget ? {unresolvedProviderTarget: true} : {})
        }
    });
}
