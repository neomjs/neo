/**
 * @module ai/scripts/diagnostics/captureParityLatencyPair
 * @summary Orchestrates the boot + hot-call sample capture that `parityLatencyPair` evaluates, and
 * refuses — naming the missing producer — when its prerequisites do not exist.
 *
 * ## Why this is a separate module from the comparator
 *
 * `parityLatencyPair` decides whether a captured pair clears a bound. It deliberately knows nothing about
 * *obtaining* samples, so it stays pure and testable without a container. This module is the other half:
 * the loop that produces the samples, the prerequisite check that stops it producing fake ones, and the
 * handoff. Keeping them apart means a broken probe cannot silently become a passing verdict.
 *
 * ## The refusal is the point, not the fallback
 *
 * The seat-level pair depends on the generated seat-adapter path. Until that producer exists there is no seat to
 * measure, and the parity steward's ruling is explicit that **direct SDK probes are diagnostics only** — a
 * number taken by bypassing the adapter answers a different question than the acceptance criterion asks.
 *
 * So this module does not degrade to "measure something anyway." It refuses, names the producer it is
 * waiting on, and returns nothing a caller could mistake for a measurement. The alternative — probing
 * directly and labelling the result a parity leg — is precisely the mislabelled-measurement failure the
 * comparator's own conditions contract exists to prevent, and it would be worse here because it would look
 * like AC4 had been satisfied.
 *
 * ## Probes are injected
 *
 * `probeSeatReady` and `probeHotCall` arrive as arguments. That is what makes the orchestration — sample
 * counts, per-service reduction, refusal ordering, receipt shape — testable without a stack, and it keeps
 * this module's own logic falsifiable rather than only exercisable in a full deployment.
 */

import {
    MIN_SAMPLES,
    PARITY_BOOT_EVENT,
    PARITY_CACHE_CONVENTION,
    PARITY_HOT_CALL_EVENT,
    evaluateLatencyPair
} from './parityLatencyPair.mjs';

/**
 * The producer this capture depends on. `null` because the generated seat-adapter path does not exist yet.
 *
 * Held as a constant rather than asked of the caller for the same reason `pilotPlaneTerminal` holds its
 * capability constant: a caller-supplied "yes the adapter exists" is a claim, not a fact, and requiring the
 * assertion would make the gate satisfiable by typing.
 * @type {String|null}
 */
export const SEAT_ADAPTER_PRODUCER = null;

/**
 * @summary True for a finite number strictly greater than zero.
 * @param {*} value
 * @returns {Boolean}
 */
function isPositiveFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @summary Checks the capture prerequisites, returning a refusal reason or `null`.
 *
 * Ordered so the **structural** blocker is reported before any caller-input complaint: an operator running
 * this before that producer lands should be told the adapter is missing, not sent hunting for a bad argument.
 * `producer` exists as a **validator-level** seam so the post-gate clauses can be exercised before the
 * producer lands — otherwise they would be unreachable, and their only witness would be a source-text
 * assertion, which is vacuous the moment the code moves. The seam is deliberately NOT on
 * {@link captureParityLatencyPair}: the function that can emit a measurement takes no capability argument,
 * because an injectable capability is a fabricable one.
 * @param {Object} spec
 * @param {Number} spec.sampleCount
 * @param {Object} spec.conditions
 * @param {String|null} [spec.producer] Defaults to the real capability constant.
 * @returns {String|null}
 */
export function checkCapturePrerequisites(spec) {
    // Nullish-coalesced, not a `= {}` default: that fires only for `undefined`, so a null argument would
    // THROW instead of refusing. A throw here is an exit with no named blocker.
    const {sampleCount, conditions, producer = SEAT_ADAPTER_PRODUCER} = spec ?? {};

    // Bug 2, caught by this module's own spec: `producer === ''` let a WHITESPACE-ONLY value through, so
    // `'   '` opened the gate. Trim before deciding — a blank capability is an absent one.
    if (typeof producer !== 'string' || producer.trim() === '') {
        return 'the generated seat-adapter path does not exist yet, so there is no seat-level parity leg to ' +
               'measure. This capture is blocked on that producer, and it will not substitute a direct SDK ' +
               'probe: per the parity steward, a direct probe is a diagnostic and answers a different ' +
               'question than the acceptance criterion asks. Nothing is returned that could be mistaken for ' +
               'a measurement.';
    }

    if (!Number.isInteger(sampleCount) || sampleCount < MIN_SAMPLES) {
        return `sampleCount must be an integer of at least ${MIN_SAMPLES}, received ` +
               `${JSON.stringify(sampleCount)}. One reading of a boot latency is not a measurement.`;
    }

    for (const key of ['cacheConvention', 'imageDigest', 'configHead', 'hostLoad']) {
        if (typeof conditions?.[key] !== 'string' || conditions[key].trim() === '') {
            return `conditions.${key} must be recorded before capture, not after: a pair whose conditions ` +
                   'are reconstructed from memory is not reproducible.';
        }
    }

    if (conditions.cacheConvention !== PARITY_CACHE_CONVENTION) {
        return 'conditions.cacheConvention must be exactly PARITY_CACHE_CONVENTION — the ruled regime is ' +
               'images warm, runtimes cold, data preserved, no rebuild. Capturing under any other regime ' +
               'produces a deployment receipt rather than a latency leg.';
    }

    return null;
}

/**
 * @summary Runs one capture pass and hands the samples to {@link evaluateLatencyPair}.
 *
 * The comparator owns the reductions: boot collapses per-service readings by max-of-both (a seat is ready
 * when the LATER service is), while hot-call keeps them separate (a round trip goes to ONE service, so
 * averaging would hide a single slow one). This driver's job is to hand over four honest per-service slots
 * and to abort rather than contribute a partial set — a leg short of its floor is not a smaller
 * measurement, it is not a measurement.
 * @param {Object} spec
 * @param {Number} spec.sampleCount        Samples per leg, at least `MIN_SAMPLES`.
 * @param {Object} spec.conditions         `{cacheConvention, imageDigest, configHead, hostLoad}`.
 * @param {Number} spec.acceptableOverhead Ratio bound — the caller's operational decision.
 * @param {Function} spec.probeSeatReady   `() => Promise<{stdio, parity}>`, each
 *        `{memoryCoreMs, knowledgeBaseMs}` — one cold boot per topology, per service.
 * @param {Function} spec.probeHotCall     `() => Promise<{stdio, parity}>`, same shape — one warmed
 *        round trip per topology, per service.
 * @returns {Promise<Object>} `{ok, reason?, blocked?, pair?, conditions?, verdict?}`
 */
export async function captureParityLatencyPair(spec) {
    // See `checkCapturePrerequisites`: nullish-coalesced so `captureParityLatencyPair(null)` refuses rather
    // than throwing. No `producer` is forwarded — the measurement path takes no capability argument.
    const {sampleCount, conditions, acceptableOverhead, probeSeatReady, probeHotCall} = spec ?? {},
          blocker                                                                     = checkCapturePrerequisites({sampleCount, conditions});

    // `blocked` is distinct from a plain refusal so a caller can tell "not yet possible" from "you called
    // this wrong" without parsing prose. Only the structural gate sets it.
    if (blocker) {
        return {ok: false, blocked: SEAT_ADAPTER_PRODUCER === null, reason: blocker};
    }

    return assembleLatencyPair({sampleCount, conditions, acceptableOverhead, probeSeatReady, probeHotCall});
}

/**
 * @summary The post-gate capture: runs the sample loop and hands four per-service slots to the comparator.
 *
 * **Exported because the gate would otherwise hide it.** While `SEAT_ADAPTER_PRODUCER` is `null` nothing
 * reaches this code through `captureParityLatencyPair`, and a gate that makes a path unreachable also makes
 * it unverifiable — a defect behind it is invisible to every test. That is not hypothetical here: a rename of
 * the sample arrays left this block referencing four retired variables, the suite stayed green because the
 * gate short-circuited first, and the reviewer found the `ReferenceError` only by forcing the capability on
 * in memory.
 *
 * So the assembly is reachable directly and carries its own positive control, while the **capability gate
 * stays on the terminal** — the same split as `pilotPlaneTerminal`'s exported validators. Calling this
 * bypasses no capability check that guards a measurement's honesty: it performs the capture it is given, and
 * whether a capture may be attempted at all is the terminal's decision.
 * @param {Object} spec See {@link captureParityLatencyPair}.
 * @returns {Promise<Object>}
 */
export async function assembleLatencyPair(spec) {
    const {sampleCount, conditions, acceptableOverhead, probeSeatReady, probeHotCall} = spec ?? {};

    if (typeof probeSeatReady !== 'function' || typeof probeHotCall !== 'function') {
        return {ok: false, reason: 'probeSeatReady and probeHotCall must both be functions'};
    }

    const bootStdio  = [],
          bootParity = [],
          hotStdio   = [],
          hotParity  = [];

    for (let index = 0; index < sampleCount; index++) {
        const boot = await probeSeatReady(),
              hot  = await probeHotCall();

        // Both topologies, both dimensions, per service. A probe returning a flattened number for any of the
        // four slots is refused HERE with its slot named, rather than reaching the comparator as a figure
        // whose subject cannot be established. Attributed per index so a bad reading is locatable.
        for (const [label, reading] of [
            ['boot.stdio', boot?.stdio], ['boot.parity', boot?.parity],
            ['hotCall.stdio', hot?.stdio], ['hotCall.parity', hot?.parity]
        ]) {
            if (!isPositiveFinite(reading?.memoryCoreMs) || !isPositiveFinite(reading?.knowledgeBaseMs)) {
                return {
                    ok    : false,
                    reason: `sample ${index}: ${label} must be {memoryCoreMs, knowledgeBaseMs} with both a ` +
                            'positive finite reading. A missing per-service value is an unmeasured service, ' +
                            'not a zero, and a flattened figure cannot show which service was measured.'
                };
            }
        }

        bootStdio.push(boot.stdio);
        bootParity.push(boot.parity);
        hotStdio.push(hot.stdio);
        hotParity.push(hot.parity);
    }

    return evaluateLatencyPair({
        boot: {
            stdioObservations : bootStdio,
            parityObservations: bootParity,
            comparableEvent   : PARITY_BOOT_EVENT
        },
        hotCall: {
            stdioObservations : hotStdio,
            parityObservations: hotParity,
            comparableEvent   : PARITY_HOT_CALL_EVENT
        },
        acceptableOverhead,
        conditions
    });
}
