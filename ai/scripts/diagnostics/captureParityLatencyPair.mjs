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
    deriveSeatReadyMs,
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
 * Per-service parity boot observations are reduced by `deriveSeatReadyMs` (max-of-both), because the seat is
 * ready when the *later* of memory-core and knowledge-base is ready. A failed probe aborts the pass rather
 * than contributing a partial sample set: a leg short of its floor is not a smaller measurement, it is not
 * a measurement.
 * @param {Object} spec
 * @param {Number} spec.sampleCount        Samples per leg, at least `MIN_SAMPLES`.
 * @param {Object} spec.conditions         `{cacheConvention, imageDigest, configHead, hostLoad}`.
 * @param {Number} spec.acceptableOverhead Ratio bound — the caller's operational decision.
 * @param {Function} spec.probeSeatReady   `() => Promise<{memoryCoreMs, knowledgeBaseMs}>` — one cold boot.
 * @param {Function} spec.probeHotCall     `() => Promise<{stdioMs, parityMs}>` — one warmed round trip.
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

    if (typeof probeSeatReady !== 'function' || typeof probeHotCall !== 'function') {
        return {ok: false, reason: 'probeSeatReady and probeHotCall must both be functions'};
    }

    const parityObservations = [],
          stdioBootSamples   = [],
          stdioHotSamples    = [],
          parityHotSamples   = [];

    for (let index = 0; index < sampleCount; index++) {
        const boot = await probeSeatReady(),
              hot  = await probeHotCall();

        // Reduce per observation rather than at the end, so a malformed reading is attributed to its own
        // index instead of surfacing as an unexplained leg failure later.
        const derived = deriveSeatReadyMs(boot);

        if (!derived.ok) {
            return {ok: false, reason: `boot sample ${index}: ${derived.reason}`};
        }

        if (!isPositiveFinite(boot.stdioMs)) {
            return {
                ok    : false,
                reason: `boot sample ${index}: stdioMs must be a positive finite number, received ` +
                        `${JSON.stringify(boot.stdioMs)} — the baseline leg cannot be inferred from the parity leg`
            };
        }

        if (!isPositiveFinite(hot?.stdioMs) || !isPositiveFinite(hot?.parityMs)) {
            return {ok: false, reason: `hot-call sample ${index}: both stdioMs and parityMs must be positive finite numbers`};
        }

        parityObservations.push(boot);
        stdioBootSamples.push(boot.stdioMs);
        stdioHotSamples.push(hot.stdioMs);
        parityHotSamples.push(hot.parityMs);
    }

    return evaluateLatencyPair({
        boot: {
            stdioSamples   : stdioBootSamples,
            parityObservations,
            comparableEvent: PARITY_BOOT_EVENT
        },
        hotCall: {
            stdioSamples   : stdioHotSamples,
            paritySamples  : parityHotSamples,
            comparableEvent: PARITY_HOT_CALL_EVENT
        },
        acceptableOverhead,
        conditions
    });
}
