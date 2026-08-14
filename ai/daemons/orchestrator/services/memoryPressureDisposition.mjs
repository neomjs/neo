import {CONTAINER_HEALTH_FACT_TYPES} from './containerHealthFactTypes.mjs';

/**
 * @module ai/daemons/orchestrator/services/memoryPressureDisposition
 * @summary Converts a sustained memory-saturation fact into a service-status disposition.
 *
 * ## The gap this closes
 *
 * A container pinned AT its cgroup memory limit enters page-fault thrash: the kernel evicts the
 * mmap'd model and KV-cache pages and the engine burns its whole CPU quota re-faulting them from
 * disk instead of computing. Observed live: 48.0G of a 48.0G cap, host swap 0.4% → 52.8%, a task in
 * flight ~26 minutes whose clean cost is ~2 — while Docker health, the liveness probe, the recovery
 * probe and the deployment-state snapshot all read healthy.
 *
 * Every one of those surfaces asks *is it alive*. None asks *is it at its ceiling*.
 *
 * **The signal was never missing.** The diagnosis service already crosses its threshold, sustains it
 * across a measured window, resolves heap-vs-container scope, and emits an authoritative
 * `memorySaturation` fact. What it could not do was reach a verdict: the service record derived
 * `status` from `errors.length` alone, and a container at its ceiling produces no error — it is
 * alive, it answers probes, it is simply not doing useful work. So the fact was computed, published
 * into the snapshot, and read by nothing.
 *
 * This module is the missing fold: fact → disposition → status.
 *
 * ## Why a sustained ratio is allowed to speak alone
 *
 * The diagnosis service's recovery path requires `minAuthoritativeFacts` (2) corroborating facts
 * before it will license an action, and it already carves out one exception — a store at its ceiling
 * saturates memory while its CPU sits idle, so it produces exactly one authoritative fact forever and
 * the floor suppressed it entirely. That carve's reasoning is recorded there and transfers intact:
 * **a sustained-window ratio against a hard limit is not a noisy signal, and the window is already
 * the corroboration the second fact was standing in for.** Requiring a second asks for a coincidence
 * rather than evidence.
 *
 * The carve does NOT transfer wholesale, and the difference matters: it is scoped to store-backed
 * services and answers with `raiseCeiling`, because a store's footprint tracks rows already persisted
 * so there is no arrival rate to reduce. A provider lane is `transient` and does have an arrival rate,
 * so the coherent remedies differ. **This module therefore reports a disposition and never an
 * action** — it degrades the surface and names what it saw; choosing the heal stays with the recovery
 * path that owns it.
 *
 * ## `unknown` is a verdict, not a default
 *
 * Absent stats, an unreadable sample set, an unavailable heap observation, or a non-authoritative fact
 * all resolve to `unknown`, which **never degrades**. A cgroup total that aggregates PID 1 plus forks
 * is reported by the diagnosis service with its authority withdrawn precisely because the number
 * cannot speak for the service; a disposition that degraded on it would launder a withdrawn authority
 * back into a verdict. Absence of observation is not observation of absence — the same posture the
 * sibling watchdogs hold.
 *
 * **This paragraph shipped once while the code beneath it did the opposite**, and the paragraph is why
 * that survived review: the first implementation returned `below` whenever no saturation fact was
 * present, which is precisely the absent-stats and unreadable-sample cases the sentence above promises
 * resolve to `unknown`. A reader who checked the prose found the discipline stated correctly and had
 * no reason to check the branch. So the rule is now carried by the SHAPE of the derivation rather than
 * by a claim about it: `below` requires positive evidence that memory was measured across its own
 * spanned window, and every path lacking that evidence names why it could not answer.
 *
 * The direction of that error is the one that matters. A false `at-cap` degrades a healthy lane and is
 * seen immediately; a false `below` is an all-clear nobody observed, which is the exact failure this
 * module exists to close — one level in.
 */

/**
 * The reasons a ceiling question cannot be answered. Published on the disposition so `unknown` is
 * actionable: "no stats yet" and "this container's total may describe forks" are different operator
 * problems, and collapsing them into a bare `unknown` makes the next diagnosis start from scratch.
 * @type {Object}
 */
export const MEMORY_PRESSURE_UNKNOWN_REASONS = Object.freeze({
    authorityWithdrawn        : 'authority-withdrawn',
    classificationUnavailable : 'classification-unavailable',
    diagnosisUnavailable      : 'diagnosis-unavailable',
    heapObservationUnavailable: 'heap-observation-unavailable',
    windowNotSpanned          : 'window-not-spanned'
});

/**
 * @summary Derives the memory-pressure disposition for one service observation.
 *
 * Reads the already-computed fact rather than re-deriving a threshold or a window. Re-deriving either
 * would put a second copy of the saturation contract beside the diagnosis service's, and the two would
 * drift silently — the failure the config SSOT exists to prevent.
 * @param {Object} [options]
 * @param {Object|null} [options.classification] `describeClassification` output for this service. Carries
 *   the span on MEMORY's own clock, which is the only evidence that can prove `below`.
 * @param {Object|null} [options.diagnosis] The container-health diagnosis for this service.
 * @returns {{disposition: String, reason: String|null, receipt: Object|null}} `at-cap` degrades;
 *   `unknown` and `below` never do.
 */
export function deriveMemoryPressure({classification = null, diagnosis} = {}) {
    const
        unknown = reason => ({disposition: 'unknown', reason, receipt: null}),
        facts   = Array.isArray(diagnosis?.facts) ? diagnosis.facts : null;

    // No diagnosis at all is not the same as a diagnosis reporting no pressure. The first means the
    // question was never asked, and answering `below` for it would assert a healthy ceiling nobody
    // measured.
    if (!facts) return unknown(MEMORY_PRESSURE_UNKNOWN_REASONS.diagnosisUnavailable);

    const saturation = facts.find(fact =>
        fact?.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation && fact?.authoritative === true
    );

    if (saturation) {
        const details = saturation.details || {};

        return {
            disposition: 'at-cap',
            reason     : null,
            // The receipt answers the three questions an operator asks on being told a lane is at its
            // ceiling — which service, against what limit, and for how long — and carries the MEASURED
            // window beside the required one, because reporting only the configured value puts an
            // unobserved claim inside the evidence a decision reads.
            receipt: {
                serviceKey: saturation.serviceKey,
                metric    : 'memory',
                // `memoryScope`, which is what the producer actually writes. This read was `scope`
                // for one revision: the miss was invisible because `?? null` turned a broken field
                // contract into a legal-looking value, and the fact's own comment explains that the
                // field exists precisely so a consumer cannot confuse heap with container.
                scope           : details.memoryScope ?? null,
                threshold       : details.threshold ?? null,
                minPercent      : details.minPercent ?? null,
                sampleCount     : details.sampleCount ?? null,
                observedWindowMs: details.observedWindowMs ?? null,
                requiredWindowMs: details.requiredWindowMs ?? null,
                observedAt      : saturation.observedAt ?? null
            }
        }
    }

    // A non-authoritative saturation fact is a reading whose SUBJECT is in doubt — the diagnosis
    // service withdrew its authority because the cgroup total may describe forks rather than the
    // service. Unknown rather than below: the ceiling may well be crossed, and only attribution is
    // unsafe.
    if (facts.some(fact => fact?.type === CONTAINER_HEALTH_FACT_TYPES.memorySaturation)) {
        return unknown(MEMORY_PRESSURE_UNKNOWN_REASONS.authorityWithdrawn);
    }

    // The producer emits this fact INSTEAD of a memory reading, to say it could not see the quantity
    // at all. Treating its presence as "no saturation found" would convert an explicit blindness
    // report into an all-clear.
    if (facts.some(fact => fact?.type === CONTAINER_HEALTH_FACT_TYPES.heapObservationUnavailable)) {
        return unknown(MEMORY_PRESSURE_UNKNOWN_REASONS.heapObservationUnavailable);
    }

    // Everything below establishes that the question was ANSWERABLE. Without it, the absence of a
    // saturation fact is ambiguous between "measured, below the ceiling" and "never measurable" —
    // and only one of those is `below`.
    if (!classification) return unknown(MEMORY_PRESSURE_UNKNOWN_REASONS.classificationUnavailable);

    const {memoryObservedWindowMs, memoryStampCoverage, requiredWindowMs} = classification;

    // Full coverage AND a spanned window, on memory's own clock — the same pair `summarizeSustainedWindow`
    // requires before it will call a window satisfied. Asserting `below` on a weaker basis than the
    // one `at-cap` is held to would make the reassuring answer the cheaper one to reach.
    if (!Number.isFinite(memoryObservedWindowMs) || !Number.isFinite(requiredWindowMs) ||
        memoryStampCoverage !== 1 || memoryObservedWindowMs < requiredWindowMs
    ) {
        return unknown(MEMORY_PRESSURE_UNKNOWN_REASONS.windowNotSpanned);
    }

    return {disposition: 'below', reason: null, receipt: null}
}

/**
 * @summary Reports whether a configured memory window can ever be spanned by the configured retention.
 *
 * The sustained-window rule needs `observedWindowMs >= windowMs`, and the observed span is bounded by
 * the sample buffer: `(statsSampleWindow - 1)` intervals of `writeIntervalMs`. A window wider than that
 * product is unsatisfiable on every scheduling path, so the detector never fires — silently, because a
 * fact that is never emitted looks exactly like a service that is never saturated.
 *
 * This shipped: a 120000ms window against 2 samples 30000ms apart, which is a permanent 30000ms span.
 * CI was green, the unit matrix passed, and the feature was dead. The pair is validated rather than
 * either number alone, because both are individually reasonable and only their product is wrong.
 * @param {Object} options
 * @param {Number} options.windowMs Configured memory sustained-window floor.
 * @param {Number} options.statsSampleWindow Retained stats samples per service.
 * @param {Number} options.writeIntervalMs Bridge observation cadence.
 * @returns {{reachable: Boolean, maxSpannableMs: Number, windowMs: Number}}
 */
export function describeMemoryWindowReachability({windowMs, statsSampleWindow, writeIntervalMs}) {
    const finite = [windowMs, statsSampleWindow, writeIntervalMs].every(Number.isFinite);

    // `windowMs <= 0` is rejected rather than trivially satisfied. A zero window asserts NO sustained
    // requirement at all: every complete sample set clears it, so a single spike becomes `at-cap` and
    // the corroboration that licenses one memory fact to degrade a service alone silently disappears.
    // A disabled detector and a detector with no floor are different failures, and only one of them
    // is loud — so the quiet one has to be refused here.
    //
    // Retention must also be a whole number of samples: a fractional `statsSampleWindow` produces a
    // spannable span nothing can actually observe, which is the same unspannable-geometry class this
    // function exists to catch, arriving through a different door.
    if (!finite || !Number.isInteger(statsSampleWindow) || statsSampleWindow < 1 ||
        writeIntervalMs <= 0 || windowMs <= 0
    ) {
        return {reachable: false, maxSpannableMs: 0, windowMs};
    }

    // Two retained samples make ONE interval of span, not two — the same off-by-one that makes a
    // 2-sample buffer look like it covers a full cadence when it covers a single gap.
    const maxSpannableMs = (statsSampleWindow - 1) * writeIntervalMs;

    return {reachable: windowMs <= maxSpannableMs, maxSpannableMs, windowMs}
}

/**
 * @summary Reports whether the saturation thresholds sit inside the domain a percentage can occupy.
 *
 * Both leaves are declared `number`, which accepts values that are not wrong-ish but INVALID, and
 * each fails in a direction the other does not:
 *
 * - `0` makes every complete sample set saturated, because a ratio is always `>= 0`. The detector
 *   fires constantly and degrades a healthy plane.
 * - anything `> 100` can never be reached by a percentage of a limit, so the detector is disabled —
 *   and disabled looks exactly like a plane that is never saturated. That is the failure this whole
 *   surface exists to close, reintroduced through a config value.
 *
 * The second is the dangerous one and the reason this is a startup refusal rather than a clamp:
 * clamping `101` to `100` would silently substitute a threshold nobody chose, and the operator would
 * never learn their configuration was impossible.
 * @param {Object} options
 * @param {Number} options.percent Transient-service saturation threshold.
 * @param {Number} options.storePercent Store-service saturation threshold.
 * @returns {{valid: Boolean, invalid: String[]}} Names of the leaves outside `0 < n <= 100`.
 */
export function describeSaturationThresholdDomain({percent, storePercent}) {
    const
        inDomain = value => Number.isFinite(value) && value > 0 && value <= 100,
        invalid  = [];

    if (!inDomain(percent))      invalid.push('percent');
    if (!inDomain(storePercent)) invalid.push('storePercent');

    return {valid: invalid.length === 0, invalid}
}

/**
 * @summary Folds a memory-pressure disposition into a service status.
 *
 * Kept separate from the derivation so the fold is assertable on its own: the rule that `unknown`
 * never degrades is the one most likely to be broken by a later edit, and it is invisible if the only
 * way to test it is through a full diagnosis fixture.
 * @param {Object} options
 * @param {String} options.status The status derived from errors alone.
 * @param {String} options.disposition The memory-pressure disposition.
 * @returns {String} `degraded` when errors already said so, or when memory is sustained at-cap.
 */
export function foldMemoryPressureIntoStatus({status, disposition}) {
    if (status === 'degraded')     return status;
    if (disposition === 'at-cap')  return 'degraded';

    return status
}
