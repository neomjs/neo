/**
 * @module ai/scripts/diagnostics/parityLatencyPair
 * @summary Captures and compares the boot + hot-call latency pair for the parity topology against the
 * stdio baseline, so Option A's latency falsifier stops being unfalsifiable by construction.
 *
 * ## What this is for
 *
 * The pilot's Option A asserts that the parity topology is fast enough to be a seat's daily reality.
 * That claim has a falsifier — latency — and without a measured **pair** the falsifier cannot be
 * evaluated at all: a parity number alone says nothing, because the question is always *"compared to
 * what the seat has now."* So the unit of evidence is the pair, never a single figure.
 *
 * ## A single sample is not a measurement
 *
 * Boot and RPC latencies are noisy: container scheduling, page cache, a busy host. One reading of each
 * leg would produce a ratio that looks authoritative and moves ±40% on re-run. So samples are required
 * plural, and the summary reports **median and spread together** — a median with a wide spread is a
 * different fact from a tight one, and collapsing to a single number hides exactly the case where the
 * comparison should not be trusted.
 *
 * ## The acceptability BOUND is not invented here
 *
 * `acceptableOverhead` is a required caller input with no default, for the same reason
 * `walVolumeBaseline`'s replay budget is: whether 2x boot latency is tolerable for a daily driver is an
 * **operational** decision about how a seat is used, not a property this module can derive. Shipping a
 * plausible multiplier would encode one host's afternoon as a calibrated bound.
 *
 * This module's job is therefore to make the falsifier **evaluable**, not to evaluate it: it captures
 * the pair, reports the overhead honestly with its dispersion, and renders a verdict only against a
 * bound the caller supplies.
 *
 * Pure and dependency-free: samples arrive as arguments, so the whole contract is testable without a
 * container, a socket, or a clock.
 */

/**
 * Minimum samples per leg. Three is the smallest count from which a median is meaningful rather than a
 * relabelled single reading — stated as a floor, not as a sufficient sample size.
 * @type {Number}
 */
export const MIN_SAMPLES = 3;

/**
 * @summary True for a finite number strictly greater than zero.
 * @param {*} value
 * @returns {Boolean}
 */
function isPositiveFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @summary Reduces repeated timings to a median plus the spread that says whether to trust it.
 *
 * Median rather than mean: one container-scheduling outlier drags a mean and leaves no trace, whereas
 * it shows up in `spreadRatio` where a reader can see it.
 * @param {Number[]} samples Milliseconds.
 * @param {String} label Surfaced in refusals.
 * @returns {Object} `{ok, reason?, medianMs, minMs, maxMs, spreadRatio, sampleCount}`
 */
export function summarizeSamples(samples, label = 'samples') {
    const refuse = reason => ({ok: false, reason});

    if (!Array.isArray(samples)) return refuse(`${label} must be an array of millisecond timings`);

    if (samples.length < MIN_SAMPLES) {
        return refuse(
            `${label} has ${samples.length} sample(s); at least ${MIN_SAMPLES} are required. A single ` +
            'reading of a boot or RPC latency is not a measurement — it produces a ratio that looks ' +
            'authoritative and moves substantially on re-run.'
        );
    }

    const bad = samples.findIndex(value => !isPositiveFinite(value));

    if (bad !== -1) {
        return refuse(`${label}[${bad}] is not a positive finite number (${JSON.stringify(samples[bad])})`);
    }

    const sorted = [...samples].sort((a, b) => a - b),
          middle = Math.floor(sorted.length / 2),
          median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
          minMs  = sorted[0],
          maxMs  = sorted[sorted.length - 1];

    return {
        ok      : true,
        medianMs: median,
        minMs,
        maxMs,
        // Reported alongside the median so a wide-spread measurement cannot masquerade as a tight one.
        spreadRatio: maxMs / minMs,
        sampleCount: sorted.length
    };
}

/**
 * @summary Compares a parity leg against the stdio baseline for one dimension (boot or hot-call).
 * @param {Object} spec
 * @param {Number[]} spec.stdioSamples  Baseline timings — what the seat has today.
 * @param {Number[]} spec.paritySamples Parity-topology timings.
 * @param {String}   [spec.dimension]   `'boot'` or `'hotCall'`, for labels.
 * @param {String}   spec.comparableEvent The event BOTH legs measured. REQUIRED — the topologies share
 *                                        no native "boot", so an unnamed equivalence yields a ratio
 *                                        between two different events.
 * @returns {Object} `{ok, reason?, dimension, stdio, parity, overheadRatio, overheadMs, trustworthy}`
 */
export function compareLatencyLeg({stdioSamples, paritySamples, dimension = 'latency', comparableEvent} = {}) {
    const stdio  = summarizeSamples(stdioSamples, `${dimension} stdioSamples`),
          parity = summarizeSamples(paritySamples, `${dimension} paritySamples`);

    if (!stdio.ok)  return {ok: false, reason: stdio.reason};
    if (!parity.ok) return {ok: false, reason: parity.reason};

    // THE EQUIVALENCE MUST BE STATED, and this is not paperwork. The two topologies do not share a
    // "boot": the parity fixture measures wall-clock until a FOUR-SERVICE container plane is healthy
    // (vector store + both MCP servers + a running orchestrator, plus a served-identity assertion),
    // while stdio spawns a server process per client on demand and has no such plane-ready moment.
    // A ratio between two different events is misleading even when both numbers are real — the exact
    // failure this whole comparator exists to prevent one level up. So the caller must name the event
    // both legs measured; there is no default, because inventing an equivalence is worse than lacking
    // one (a stated wrong equivalence can at least be challenged; an implicit one cannot).
    if (typeof comparableEvent !== 'string' || comparableEvent.trim() === '') {
        return {
            ok    : false,
            reason: `${dimension}: comparableEvent must name the event BOTH legs measured (e.g. ` +
                    '"first successful healthcheck response after process/stack start"). The parity and ' +
                    'stdio topologies share no native "boot": parity times a four-service plane to ' +
                    'healthy, stdio spawns per client. An unnamed equivalence makes the ratio a ' +
                    'comparison between two different events, which is worse than no ratio.'
        };
    }

    return {
        ok           : true,
        dimension,
        comparableEvent,
        stdio,
        parity,
        overheadRatio: parity.medianMs / stdio.medianMs,
        overheadMs   : parity.medianMs - stdio.medianMs,
        // A comparison between two noisy legs is not worth a verdict. Surfaced as data rather than
        // silently folded into the ratio, so a caller can see WHY a ratio should not be leaned on.
        trustworthy  : stdio.spreadRatio <= 2 && parity.spreadRatio <= 2
    };
}

/**
 * @summary Captures the full boot + hot-call pair and evaluates it against a caller-supplied bound.
 *
 * Returns the captured pair even when it cannot render a verdict, because **capturing the pair is the
 * deliverable** — the acceptance criterion is that Option A's falsifier becomes evaluable, and an
 * unevaluated pair still achieves that while a missing pair does not.
 * @param {Object} spec
 * @param {Object} spec.boot               `{stdioSamples, paritySamples}`
 * @param {Object} spec.hotCall            `{stdioSamples, paritySamples}`
 * @param {Number} spec.acceptableOverhead Maximum tolerable parity/stdio median ratio. REQUIRED — no
 *                                         default, because tolerability is an operational decision
 *                                         about how the seat is used, not a derivable property.
 * @returns {Object} `{ok, reason?, pair, verdict?, exceeded?, trustworthy?}`
 */
export function evaluateLatencyPair({boot, hotCall, acceptableOverhead} = {}) {
    const bootLeg = compareLatencyLeg({dimension: 'boot', ...boot}),
          callLeg = compareLatencyLeg({dimension: 'hotCall', ...hotCall});

    if (!bootLeg.ok) return {ok: false, reason: bootLeg.reason};
    if (!callLeg.ok) return {ok: false, reason: callLeg.reason};

    const pair = {boot: bootLeg, hotCall: callLeg};

    if (!isPositiveFinite(acceptableOverhead)) {
        return {
            ok    : false,
            // The pair still ships: it is the acceptance criterion, and it is now on the record even
            // though nobody has yet decided what "acceptable" means.
            pair,
            reason: `acceptableOverhead must be a positive finite number, received ${JSON.stringify(acceptableOverhead)}. ` +
                    'It has no default on purpose: whether a given parity/stdio ratio is tolerable is an ' +
                    'operational decision about how the seat is used, not something derivable here. The ' +
                    'captured pair is returned regardless — capturing it is the deliverable; judging it is not.'
        };
    }

    const exceeded = Object.values(pair).filter(leg => leg.overheadRatio > acceptableOverhead).map(leg => leg.dimension);

    return {
        ok     : true,
        pair,
        verdict: exceeded.length === 0 ? 'within-budget' : 'exceeds-budget',
        exceeded,
        // Both legs must be individually trustworthy before the verdict means anything.
        trustworthy: bootLeg.trustworthy && callLeg.trustworthy
    };
}
