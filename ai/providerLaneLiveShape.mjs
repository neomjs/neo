import {isEmbeddingContextBelowSafeBand} from './embeddingSafeBand.mjs';

/**
 * @module ai/providerLaneLiveShape
 * @summary Turns one live embedding-lane `/slots` reading into a bounded, comparable shape receipt.
 *
 * A deployment that vendors its own Compose substitutes the canonical `${…:?}` placeholders with
 * literals, so the fail-closed guard that protects the canonical overlay never runs. The engine then
 * accepts whatever shape it is given and reports healthy: liveness answers *"can the provider
 * respond?"*, never *"is the provider shaped the way this deployment intends?"*. This module supplies
 * the second answer as data — parse the reading, classify it, and let the caller project it.
 *
 * **Pure by construction.** No Neo import, no `AiConfig` read, no environment access, no I/O. Callers
 * read the resolved leaves at their own entrypoint and inject them — the same contract
 * `ai/embeddingSafeBand.mjs` states for itself. Sharing a pure function is ordinary reuse; a helper
 * that resolved its own values would be a second authority able to disagree with the config.
 *
 * **Never throws on a bad reading.** The election runner's `observeLaneContext` raises
 * `EMBEDDING_CONTEXT_UNAVAILABLE`, which suits a benchmark that should abort. At orchestrator boot an
 * exception degrades container liveness and becomes a restart lever, so an unreadable lane is
 * reported as an explicit unobservable verdict and the caller records "not known" rather than
 * inferring a value.
 */

/**
 * @summary Why a `/slots` reading could not be turned into a lane shape.
 *
 * Each value is a stable, greppable reason code rather than prose: they reach an operator through the
 * deployment-state snapshot, where a renamed string silently breaks whatever was matching on it.
 * @type {Object}
 */
export const PROVIDER_LANE_SHAPE_UNOBSERVABLE = Object.freeze({
    notAnArray     : 'slots-payload-not-an-array',
    empty          : 'slots-payload-empty',
    invalidContext : 'slot-context-not-a-positive-integer',
    nonUniformSlots: 'slot-context-not-uniform'
});

/**
 * @summary Why a classified lane shape is degraded.
 * @type {Object}
 */
export const PROVIDER_LANE_SHAPE_MISMATCH = Object.freeze({
    belowSafeBand    : 'lane-context-below-safe-band',
    contextMismatch  : 'lane-context-differs-from-declared',
    slotCountMismatch: 'lane-slot-count-differs-from-declared'
});

/**
 * @summary How the declared arm resolved for this observation.
 *
 * `not-declared` is a first-class outcome, not a failure. A deployment may declare its lane shape to
 * the engine alone and never to the orchestrator; comparing such a plane against a leaf's DEFAULT
 * would degrade a correctly-sized deployment on its first boot carrying this check — the default
 * `parallel` of 1 matches essentially no real multi-slot lane. The declared arm therefore fires only
 * on an explicit declaration, and the floor arm — which needs no declaration — always runs.
 * @type {Object}
 */
export const PROVIDER_LANE_DECLARATION = Object.freeze({
    declared   : 'declared',
    notDeclared: 'not-declared'
});

/**
 * @summary Parses a llama.cpp `/slots` payload into the live lane shape.
 *
 * Strictness is the point: a partially-readable payload is treated as unreadable, because a shape
 * inferred from some of the slots is exactly the silent wrong answer this check exists to replace.
 * Uniformity is required because a single per-slot context is the only figure the safe-band floor can
 * be compared against — mixed contexts mean the lane has no one shape to verify.
 *
 * @param {Object[]} payload Decoded `/slots` response body.
 * @returns {Object} `{observable: true, parallelism, contextTokensPerSlot}` when the reading is
 *     complete and uniform, otherwise `{observable: false, reason}` carrying a
 *     {@link PROVIDER_LANE_SHAPE_UNOBSERVABLE} code.
 */
export function parseEmbeddingLaneSlots(payload) {
    if (!Array.isArray(payload)) {
        return {observable: false, reason: PROVIDER_LANE_SHAPE_UNOBSERVABLE.notAnArray}
    }

    if (payload.length === 0) {
        return {observable: false, reason: PROVIDER_LANE_SHAPE_UNOBSERVABLE.empty}
    }

    const contexts = payload.map(slot => slot?.n_ctx);

    if (contexts.some(value => !Number.isSafeInteger(value) || value <= 0)) {
        return {observable: false, reason: PROVIDER_LANE_SHAPE_UNOBSERVABLE.invalidContext}
    }

    if (new Set(contexts).size !== 1) {
        return {observable: false, reason: PROVIDER_LANE_SHAPE_UNOBSERVABLE.nonUniformSlots}
    }

    return {
        observable          : true,
        parallelism         : payload.length,
        contextTokensPerSlot: contexts[0]
    }
}

/**
 * @summary Classifies an observed lane shape into the receipt the boot check records.
 *
 * Two arms run independently so the receipt names *which* condition fired rather than collapsing both
 * into one boolean:
 *
 * - **the floor arm** compares the observed per-slot context against the resolved safe band. It runs
 *   whenever the shape is observable, needs no declaration, and is the arm that carries the safety
 *   property — a lane below the band cannot hold a single safe-band input.
 * - **the declared arm** compares against what the deployment explicitly declared, and is SKIPPED when
 *   nothing was declared. See {@link PROVIDER_LANE_DECLARATION} for why a default must never stand in
 *   for a declaration here.
 *
 * @param {Object} options
 * @param {Object} options.observed Result of {@link parseEmbeddingLaneSlots}.
 * @param {Number} options.safeProcessingLimitTokens Resolved safe band, injected by the caller.
 * @param {Number|null} [options.declaredParallelSlots=null] Explicitly declared slot count, or `null`.
 * @param {Number|null} [options.declaredContextTokensPerSlot=null] Explicitly declared per-slot
 *     context, or `null`.
 * @returns {Object} A bounded receipt: `{observable, degraded, declaration, reasons[], observed,
 *     declared, safeProcessingLimitTokens}`.
 */
export function classifyProviderLaneLiveShape({
    observed,
    safeProcessingLimitTokens,
    declaredParallelSlots = null,
    declaredContextTokensPerSlot = null
}) {
    const declaredContext = toDeclaredValue(declaredContextTokensPerSlot),
          declaredSlots   = toDeclaredValue(declaredParallelSlots),
          declaration     = declaredContext === null && declaredSlots === null
              ? PROVIDER_LANE_DECLARATION.notDeclared
              : PROVIDER_LANE_DECLARATION.declared;

    if (!observed?.observable) {
        // Unobservable is neither healthy nor degraded: nothing was measured, so any verdict about
        // the lane would be an inference. The reason is carried so the snapshot says WHY it is blank.
        return {
            observable  : false,
            degraded    : false,
            declaration,
            reasons     : [],
            unobservable: observed?.reason ?? PROVIDER_LANE_SHAPE_UNOBSERVABLE.notAnArray,
            observed    : {parallelism: null, contextTokensPerSlot: null},
            declared    : {parallelSlots: declaredSlots, contextTokensPerSlot: declaredContext},
            safeProcessingLimitTokens
        }
    }

    const {parallelism, contextTokensPerSlot} = observed,
          reasons                             = [];

    if (isEmbeddingContextBelowSafeBand(contextTokensPerSlot, safeProcessingLimitTokens)) {
        reasons.push(PROVIDER_LANE_SHAPE_MISMATCH.belowSafeBand)
    }

    if (declaredContext !== null && declaredContext !== contextTokensPerSlot) {
        reasons.push(PROVIDER_LANE_SHAPE_MISMATCH.contextMismatch)
    }

    if (declaredSlots !== null && declaredSlots !== parallelism) {
        reasons.push(PROVIDER_LANE_SHAPE_MISMATCH.slotCountMismatch)
    }

    return {
        observable: true,
        degraded  : reasons.length > 0,
        declaration,
        reasons,
        observed  : {parallelism, contextTokensPerSlot},
        declared  : {parallelSlots: declaredSlots, contextTokensPerSlot: declaredContext},
        safeProcessingLimitTokens
    }
}

/**
 * @summary Normalizes a declaration to a positive integer or `null`.
 *
 * A malformed declaration collapses to `null` — "declared as nonsense" is not a shape to compare
 * against, and degrading a live lane because its DECLARATION was unreadable would report the fault on
 * the wrong side of the comparison.
 *
 * @param {Number|String|null|undefined} value
 * @returns {Number|null}
 * @private
 */
function toDeclaredValue(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    const number = Number(value);

    return Number.isSafeInteger(number) && number > 0 ? number : null
}
