/**
 * @module ai/embeddingServiceability
 * @summary Turns a declared lane rate and an enforced deadline into an admission ceiling — the answer
 * to "can this lane actually deliver this work unit?", which is a different question from "does it fit?".
 *
 * The oversized-chunk guardrail admits anything that fits the engine slot. Fit is a property of the
 * slot; deliverability is a property of the lane. On a slow lane the two diverge badly: a chunk well
 * inside a 32,768-token slot can need minutes of service time while the enforced per-request clock is
 * seconds, so it is admitted, ground on, abandoned by its caller, and re-submitted — forever. Nothing
 * in that loop is a failure any single component reports, because every component is behaving.
 *
 * **Pure by construction.** No Neo import, no `AiConfig` read, no environment access, no clock. Callers
 * resolve the leaves at their own entrypoint and inject them, so this module can never become a second
 * authority for a value the config already owns.
 *
 * **A declaration is required; nothing is inferred.** Throughput cannot be derived from declared lane
 * geometry — tokens/second depends on CPU allocation, quantization, batch sizing and the model, so two
 * planes with byte-identical slot shape can differ by an order of magnitude. When no rate is declared
 * this module returns `null`, meaning *no serviceability opinion*, and admission falls back to the fit
 * check alone. That is deliberate: a defaulted rate would fabricate a ceiling on a plane that stated
 * nothing and start refusing legal work, and a false refusal is silent where grind is at least visible.
 */

/**
 * @summary Why a work unit is inadmissible. Stable, greppable codes — they reach an operator through
 * the ingestion summary, where a renamed string breaks whatever was matching on it.
 * @type {Object}
 */
export const EMBEDDING_ADMISSION = Object.freeze({
    admissible    : 'admissible',
    exceedsSlot   : 'exceeds-slot-capacity',
    exceedsService: 'exceeds-lane-serviceability'
});

/**
 * @summary Resolves the largest input this lane can serve inside its enforced deadline.
 *
 * The margin covers what the arithmetic cannot: queueing behind other slots, tokenizer drift between
 * the caller's estimate and the engine's count, and the fact that a request finishing exactly at the
 * deadline still loses. A ceiling set at the raw product is a ceiling that is wrong at the boundary in
 * the direction that costs a whole request.
 *
 * @param {Object} options
 * @param {Number|null} options.declaredTokensPerSecond Operator-declared lane rate, or `null`/absent
 *     when the deployment has not stated one.
 * @param {Number} options.deadlineMs The enforced per-request clock this dispatch runs under.
 * @param {Number} [options.marginFactor=0.8] Fraction of the deadline the work unit may consume.
 * @returns {Number|null} Ceiling in tokens, or `null` when no rate is declared — *no opinion*, never
 *     "unlimited" and never a fabricated default.
 */
export function resolveServiceabilityCeilingTokens({declaredTokensPerSecond, deadlineMs, marginFactor = 0.8}) {
    const rate = Number(declaredTokensPerSecond);

    // Absent, malformed or non-positive all collapse to "not declared". A rate of 0 is not a lane that
    // serves nothing; it is a deployment that mis-stated the value, and refusing every chunk on a typo
    // is exactly the failure the null default exists to prevent.
    if (!Number.isFinite(rate) || rate <= 0) {
        return null
    }

    const deadline = Number(deadlineMs),
          margin   = Number(marginFactor);

    if (!Number.isFinite(deadline) || deadline <= 0 || !Number.isFinite(margin) || margin <= 0 || margin > 1) {
        throw new TypeError(
            `embedding serviceability needs a positive deadline and a margin in (0,1]; got deadlineMs=${deadlineMs}, marginFactor=${marginFactor}`
        )
    }

    return Math.max(1, Math.floor(rate * (deadline / 1000) * margin))
}

/**
 * @summary Classifies one work unit against BOTH ceilings, reporting which one it failed.
 *
 * The two are kept distinct all the way to the caller rather than collapsed into a single "too big".
 * They have opposite remedies: an over-slot chunk is too large for any deployment of this model, while
 * an unserviceable one is legal everywhere and merely undeliverable *here* — the same chunk becomes
 * admissible when the lane gets faster or the deadline grows. Collapsing them would tell an operator to
 * re-chunk their corpus when the actual answer is to fix the lane.
 *
 * @param {Object} options
 * @param {Number} options.tokens Estimated token count of the work unit.
 * @param {Number} options.slotCeilingTokens Fit ceiling — the existing safe-band/slot limit.
 * @param {Number|null} options.serviceabilityCeilingTokens From {@link resolveServiceabilityCeilingTokens};
 *     `null` means no declared rate, so the serviceability arm does not run.
 * @returns {Object} `{admissible, reason, tokens, slotCeilingTokens, serviceabilityCeilingTokens}`.
 */
export function classifyEmbeddingAdmission({tokens, slotCeilingTokens, serviceabilityCeilingTokens}) {
    const size = Number(tokens),
          slot = Number(slotCeilingTokens);

    // Slot first: an over-slot unit is inadmissible on every plane, so reporting the lane-specific
    // reason for it would send an operator to tune a lane that was never the constraint.
    const reason = Number.isFinite(size) && Number.isFinite(slot) && size > slot
        ? EMBEDDING_ADMISSION.exceedsSlot
        : Number.isFinite(serviceabilityCeilingTokens) && size > serviceabilityCeilingTokens
            ? EMBEDDING_ADMISSION.exceedsService
            : EMBEDDING_ADMISSION.admissible;

    return {
        admissible       : reason === EMBEDDING_ADMISSION.admissible,
        reason,
        tokens           : size,
        slotCeilingTokens: slot,
        // Carried even when null, so a reader can tell "the lane declared nothing" from "the lane
        // declared a rate and this unit cleared it". Those are different operational states.
        serviceabilityCeilingTokens: Number.isFinite(serviceabilityCeilingTokens) ? serviceabilityCeilingTokens : null
    }
}
