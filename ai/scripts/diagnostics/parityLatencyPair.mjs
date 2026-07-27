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
 * The **boot** comparable event, as decided by the parity steward: a cold runtime launch through to
 * separate MC and KB authenticated readiness.
 *
 * Exported as a **named constant that callers still pass explicitly** rather than as a default. The
 * distinction is the point: a default would silently re-open the hole `comparableEvent` exists to close,
 * whereas a named constant makes the equivalence both stated at the call site and single-sourced. Having
 * the authority decide the definition is the opposite of inventing one — but it does not make the
 * definition safe to leave implicit.
 * @type {String}
 */
export const PARITY_BOOT_EVENT = 'cold runtime launch until fresh clients initialize and an authenticated ' +
    'healthcheck returns identity proof from memory-core and knowledge-base separately (seat-ready = ' +
    'max of the two)';

/**
 * The **hot-call** comparable event, as decided by the parity steward: already-established sessions, one
 * untimed warm-up, then the same non-mutating authenticated healthcheck timed ≥3 times per service, with
 * **no process or stack start inside the measured window**.
 *
 * This exists as a second constant because a single shared event collapsed the two dimensions: reusing one
 * generic event for both legs made the hot-call leg measure process start, which is the boot definition and
 * explicitly not the selected hot-call one. Two dimensions require two events, or the pair compares a
 * thing to itself.
 * @type {String}
 */
export const PARITY_HOT_CALL_EVENT = 'on already-established sessions after one untimed warm-up, a ' +
    'non-mutating authenticated healthcheck timed per service with no process or stack start in the window';

/**
 * The cache state under which a comparable pair must be taken, as decided by the parity steward:
 * images and build artifacts warm, runtimes cold, data preserved, no rebuild and no page-cache flush.
 *
 * This exists because cold-with-build, cold-without-build, and fully warm are three different parity
 * numbers separated by an order of magnitude. A measured `261033ms` taken across a three-image rebuild is
 * a deployment receipt, not a boot-latency leg, and nothing in the figure itself says which it is.
 * @type {String}
 */
export const PARITY_CACHE_CONVENTION = 'images/artifacts warm; runtimes cold; data preserved; ' +
    'no rebuild and no page-cache flush';

/**
 * The accepted comparable events. Membership is **checked**, not merely documented.
 *
 * An earlier shape required `comparableEvent` to be a non-empty string that differed between the two legs.
 * That only forced a caller to type something: `'process start'` and `'process start '` are two distinct
 * non-empty strings, so a build-dominated regime the ruling explicitly excludes sailed through. Enumerating
 * the accepted values makes the selected measurement contract executable.
 * @type {String[]}
 */
export const ACCEPTED_COMPARABLE_EVENTS = Object.freeze([PARITY_BOOT_EVENT, PARITY_HOT_CALL_EVENT]);

/**
 * Which event each dimension must carry, so a cold launch cannot be labelled `hotCall`.
 * @type {Object}
 */
export const DIMENSION_EVENTS = Object.freeze({
    boot   : PARITY_BOOT_EVENT,
    hotCall: PARITY_HOT_CALL_EVENT
});

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
 * @summary Derives one seat-ready sample from separate per-service observations.
 *
 * The steward's boot definition times memory-core and knowledge-base **separately**, and the seat is ready
 * when the later of the two is ready — so seat-ready is `max`, not a mean and not whichever was measured.
 * Averaging would report a seat as ready while a service it depends on is still starting; taking one
 * service's figure would silently drop the other's contribution.
 *
 * Both observations are required. A missing one is not a zero: it is an unmeasured service, and defaulting
 * it to zero would make the faster service alone define readiness.
 * @param {Object} spec
 * @param {Number} spec.memoryCoreMs Authenticated-readiness time for memory-core.
 * @param {Number} spec.knowledgeBaseMs Authenticated-readiness time for knowledge-base.
 * @returns {Object} `{ok, reason?, seatReadyMs?, slowerService?}`
 */
export function deriveSeatReadyMs({memoryCoreMs, knowledgeBaseMs} = {}) {
    for (const [label, value] of [['memoryCoreMs', memoryCoreMs], ['knowledgeBaseMs', knowledgeBaseMs]]) {
        if (!isPositiveFinite(value)) {
            return {
                ok    : false,
                reason: `${label} must be a positive finite number, received ${JSON.stringify(value)}. Both ` +
                        'services are required: a missing observation is an unmeasured service, not a zero, ' +
                        'and treating it as zero would let the faster service alone define seat-readiness.'
            };
        }
    }

    return {
        ok           : true,
        seatReadyMs  : Math.max(memoryCoreMs, knowledgeBaseMs),
        slowerService: memoryCoreMs >= knowledgeBaseMs ? 'memory-core' : 'knowledge-base'
    };
}

/**
 * @summary Compares a parity leg against the stdio baseline for one dimension (boot or hot-call).
 * @param {Object} spec
 * @param {Number[]} spec.stdioSamples  Baseline timings — what the seat has today.
 * @param {Number[]} spec.paritySamples Parity-topology timings.
 * @param {String}   [spec.dimension]   `'boot'` or `'hotCall'`, for labels.
 * @param {String}   spec.comparableEvent The event BOTH legs measured. REQUIRED, and it must be one of the
 *                                        **accepted** constants — see {@link ACCEPTED_COMPARABLE_EVENTS}.
 * @returns {Object} `{ok, reason?, dimension, stdio, parity, overheadRatio, overheadMs, trustworthy}`
 */
export function compareLatencyLeg({stdioSamples, paritySamples, dimension = 'latency', comparableEvent} = {}) {
    const stdio  = summarizeSamples(stdioSamples, `${dimension} stdioSamples`),
          parity = summarizeSamples(paritySamples, `${dimension} paritySamples`);

    if (!stdio.ok)  return {ok: false, reason: stdio.reason};
    if (!parity.ok) return {ok: false, reason: parity.reason};

    // THE EQUIVALENCE MUST BE AN ACCEPTED VALUE, not caller prose. Requiring a non-empty string only forced
    // a caller to TYPE something: `'process start'` and `'process start '` are two distinct non-empty
    // strings, so they satisfied a "must differ" check while naming an event the ruling explicitly excludes.
    // Making the argument harder to supply did not make the fact harder to fake. So the accepted values are
    // enumerated here and membership is checked — the selected measurement contract is executable rather
    // than advisory.
    if (!ACCEPTED_COMPARABLE_EVENTS.includes(comparableEvent)) {
        return {
            ok    : false,
            reason: `${dimension}: comparableEvent must be one of the accepted measurement events, received ` +
                    `${JSON.stringify(comparableEvent)}. Caller prose is not accepted: the two topologies ` +
                    'share no native "boot" (parity times a plane to healthy, stdio spawns per client), so an ' +
                    'unratified event name makes the ratio a comparison between two different things — which ' +
                    'is worse than no ratio. Use PARITY_BOOT_EVENT or PARITY_HOT_CALL_EVENT.'
        };
    }

    // The dimension and the event must AGREE. Both being accepted values is not enough: timing a cold launch
    // and labelling it `hotCall` reports boot latency under a hot-call heading, which is the collapse this
    // pair exists to expose.
    const expectedEvent = DIMENSION_EVENTS[dimension];

    if (expectedEvent && comparableEvent !== expectedEvent) {
        return {
            ok    : false,
            reason: `${dimension}: comparableEvent is the ${comparableEvent === PARITY_BOOT_EVENT ? 'BOOT' : 'HOT-CALL'} ` +
                    `event, but this leg is the "${dimension}" dimension. The hot-call event must exclude ` +
                    'process/stack start; pairing a dimension with the other dimension\'s event mislabels ' +
                    'what was measured.'
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
        // Spread is REPORTED, not scored. An earlier shape minted `trustworthy: spreadRatio <= 2`, which
        // was an unratified policy of exactly the kind this module refuses elsewhere: a 2x cutoff nobody
        // selected, hardened into a boolean that downstream readers would treat as a verdict. Having
        // declined to invent the acceptability bound and then inventing a trustworthiness bound is the same
        // defect one level down. A caller who has a ratified ceiling passes it (see `spreadCeiling`).
        worstSpreadRatio: Math.max(stdio.spreadRatio, parity.spreadRatio)
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
 * @param {Object} spec.conditions         What the samples were taken under. REQUIRED:
 *                                         `{cacheConvention, imageDigest, configHead, hostLoad?}`. A
 *                                         latency pair that cannot be reproduced is a number, not a
 *                                         measurement, and cache state alone does not pin a run — the
 *                                         image and the config head move independently of it.
 * @returns {Object} `{ok, reason?, pair, conditions?, verdict?, exceeded?, worstSpreadRatio?}`
 */
export function evaluateLatencyPair({boot, hotCall, acceptableOverhead, conditions} = {}) {
    // The boot leg is DERIVED from per-service observations rather than accepting pre-reduced samples.
    // `deriveSeatReadyMs` previously existed with no caller, which made per-service separation a
    // feature-shaped orphan: the ruling said measure MC and KB separately and take max-of-both, while the
    // only path into the comparator accepted a single opaque array. Routing the boot leg through the
    // reduction is what makes the ruling binding instead of illustrative.
    const reducedBoot = reduceBootObservations(boot);

    if (reducedBoot.reason) return {ok: false, reason: reducedBoot.reason};

    const bootLeg = compareLatencyLeg({dimension: 'boot', ...reducedBoot.leg}),
          callLeg = compareLatencyLeg({dimension: 'hotCall', ...hotCall});

    if (!bootLeg.ok) return {ok: false, reason: bootLeg.reason};
    if (!callLeg.ok) return {ok: false, reason: callLeg.reason};

    const pair = {boot: bootLeg, hotCall: callLeg};

    // THE TWO DIMENSIONS MUST MEASURE DIFFERENT EVENTS. Reusing one event for both collapsed the pair into
    // a comparison of a thing to itself: the hot-call leg ended up timing process start, which is the boot
    // definition. `compareLatencyLeg` cannot catch this — each leg is individually well-formed — so it has
    // to be checked where both are visible.
    if (bootLeg.comparableEvent === callLeg.comparableEvent) {
        return {
            ok    : false,
            pair,
            reason: 'boot and hotCall declare the SAME comparableEvent, so the pair does not measure two ' +
                    'dimensions. Hot-call must exclude process/stack start (see PARITY_HOT_CALL_EVENT); ' +
                    'timing a fresh launch under a hot-call label reports boot latency twice.'
        };
    }

    const conditionsFault = validateConditions(conditions);

    if (conditionsFault) return {ok: false, pair, reason: conditionsFault};

    if (!isPositiveFinite(acceptableOverhead)) {
        return {
            ok: false,
            // The pair still ships: it is the acceptance criterion, and it is now on the record even
            // though nobody has yet decided what "acceptable" means. Its conditions ship with it, so the
            // recorded pair stays interpretable rather than becoming a bare ratio.
            pair,
            conditions,
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
        conditions,
        verdict: exceeded.length === 0 ? 'within-budget' : 'exceeds-budget',
        exceeded,
        // Reported, not scored — see `compareLatencyLeg`. A reader with a ratified dispersion ceiling can
        // compare against it; this module does not mint one.
        worstSpreadRatio: Math.max(bootLeg.worstSpreadRatio, callLeg.worstSpreadRatio)
    };
}

/**
 * @summary Reduces a boot spec's per-service observations to seat-ready samples via max-of-both.
 *
 * Each parity boot sample must arrive as `{memoryCoreMs, knowledgeBaseMs}` so the seat-ready figure is
 * *derived* rather than asserted. The stdio baseline stays a plain array: a stdio server is spawned per
 * client and has no two-service readiness moment to reduce, which is the asymmetry the comparable-event
 * definition exists to make explicit.
 * @param {Object} boot `{stdioSamples, parityObservations, comparableEvent}`
 * @returns {Object} `{reason}` or `{leg}`
 */
function reduceBootObservations(boot) {
    if (!boot || typeof boot !== 'object') return {reason: 'boot must be an object'};

    const {parityObservations, comparableEvent, stdioSamples} = boot;

    if (!Array.isArray(parityObservations)) {
        return {
            reason: 'boot.parityObservations must be an array of {memoryCoreMs, knowledgeBaseMs} — one entry ' +
                    'per boot. Pre-reduced parity samples are not accepted: the ruling measures memory-core ' +
                    'and knowledge-base separately and takes max-of-both, and a single opaque number cannot ' +
                    'show which service gated readiness.'
        };
    }

    const paritySamples = [];

    for (let index = 0; index < parityObservations.length; index++) {
        const derived = deriveSeatReadyMs(parityObservations[index]);

        if (!derived.ok) return {reason: `boot.parityObservations[${index}]: ${derived.reason}`};

        paritySamples.push(derived.seatReadyMs);
    }

    return {leg: {stdioSamples, paritySamples, comparableEvent}};
}

/**
 * @summary Validates the reproducibility conditions, returning a refusal reason or `null`.
 *
 * Cache convention alone does not pin a run. The image digest and the config head move independently of
 * cache state, so a pair recorded with only a cache note cannot be re-taken — which is how a figure like a
 * build-dominated `261033ms` survives as an apparently comparable number. `hostLoad` is optional and
 * passed through when present: it is worth recording and rarely available with any precision.
 * @param {Object} conditions
 * @returns {String|null}
 */
function validateConditions(conditions) {
    if (!conditions || typeof conditions !== 'object') {
        return 'conditions is required: {cacheConvention, imageDigest, configHead, hostLoad}. A latency pair ' +
               'that cannot be reproduced is a number rather than a measurement.';
    }

    // THE CACHE REGIME IS AN ACCEPTED VALUE, not free text. Requiring a non-empty string let
    // `'cold-with-three-image-build'` through — the regime the ruling explicitly EXCLUDES, and precisely the
    // one that produced the 261033ms figure this module exists to stop being mistaken for a boot leg. A
    // caller describing a disallowed regime accurately is not the same as a caller measuring an allowed one.
    if (conditions.cacheConvention !== PARITY_CACHE_CONVENTION) {
        return `conditions.cacheConvention must be exactly PARITY_CACHE_CONVENTION, received ` +
               `${JSON.stringify(conditions.cacheConvention)}. Free text is not accepted: a build-inclusive ` +
               'regime is a deployment receipt rather than a latency leg, and describing it accurately does ' +
               'not make it comparable.';
    }

    for (const key of ['imageDigest', 'configHead', 'hostLoad']) {
        if (typeof conditions[key] !== 'string' || conditions[key].trim() === '') {
            return `conditions.${key} must be a non-empty string. The image and config head move ` +
                   'independently of cache state, and host load moves independently of both — the ruling ' +
                   'requires all of them recorded, because a pair that cannot be re-taken under the same ' +
                   'conditions cannot be compared to a later one.';
        }
    }

    // A digest that does not look like one is a placeholder. This will not catch a determined fabrication,
    // and is not meant to: it catches `'caller-text'`, which is what actually gets passed when someone is
    // filling in a required field rather than recording an observation.
    if (!/^sha256:[0-9a-f]{16,}$/i.test(conditions.imageDigest)) {
        return `conditions.imageDigest must be a sha256 digest (e.g. "sha256:e3b0c442…"), received ` +
               `${JSON.stringify(conditions.imageDigest)} — a placeholder in a reproducibility field is ` +
               'worse than an empty one, because it reads as recorded.';
    }

    return null;
}
