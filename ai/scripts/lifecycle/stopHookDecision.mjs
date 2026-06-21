/**
 * Shared pure decision primitives for lane-state Stop hooks.
 *
 * Harness adapters own payload extraction and transport behavior; this module owns the no-hold
 * decision semantics so Claude and Codex cannot drift on the valid-terminal / loop-guard gate.
 *
 * @module Neo.ai.scripts.lifecycle.stopHookDecision
 */

/**
 * Compact runtime hint for the fenced JSON block consumed by `parseLaneState`. Prose `lane-state:`
 * lines remain useful for humans, but hooks only parse this machine block.
 * @type {String}
 */
export const LANE_STATE_SCHEMA_HINT = `Machine lane-state block to emit with your response:
\`\`\`lane-state
{"wakeDisposition":"awareness","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}
\`\`\`
Validator gotchas: if an own PR is only awaiting merge/review/CI, use laneContinuation "next-lane"; "active-lane" + awaitingOwnPrOnly:true is invalid. Every namedGates[] entry needs a same-turn checkedAt; mergeClaim must use field "mergedAt".`;

/**
 * @summary Pure mapping of a parse OUTCOME to a terminal verdict — the 3-bucket chain. A malformed
 * emission (parseLaneState threw) and an absent emission (null) are distinct idle-out failures from an
 * invalid descriptor, each with its own reason; a parsed descriptor is delegated to `validate`.
 * @param {{descriptor: (Object|null), parseError: (Error|null)}} outcome
 * @param {Function} validate descriptor → {valid: Boolean, violations: String[]}
 * @returns {{valid: Boolean, reason: String}}
 */
export function parseOutcomeToVerdict({descriptor, parseError}, validate) {
    if (parseError)          return {valid: false, reason: `malformed lane-state emission: ${parseError.message}`};
    if (descriptor === null) return {valid: false, reason: 'no lane-state block emitted at turn-terminal'};

    const result = validate(descriptor);

    return result.valid
        ? {valid: true,  reason: 'valid lane-state terminal'}
        : {valid: false, reason: (result.violations || []).join('; ') || 'invalid lane-state terminal'};
}

/**
 * @summary Detects whether a genuine human OPERATOR prompted this turn — the one signal that makes a
 * voluntary stop legitimate. Determined externally so it cannot be self-declared: a turn is operator
 * driven iff it is not a forced continuation, its prompting message is not an autonomous `[WAKE]`
 * injection, and a prompt is actually confirmable.
 * @param {{stopHookActive: Boolean, promptingText: String}} signals
 * @returns {Boolean}
 */
export function isOperatorInLoop({stopHookActive, promptingText = ''}) {
    if (stopHookActive)        return false;
    if (!promptingText.trim()) return false;
    return !/^\s*\[WAKE\]/.test(promptingText);
}

/**
 * @summary Shared no-hold Stop-hook decision. The one voluntary allow is live operator dialogue;
 * every other turn-end is blocked when the harness has a proven block/inject contract, or would-block
 * when dry-run / fail-open transport semantics apply. The `verdict` reason is evidence, not a gate.
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false]
 * @param {Boolean} [options.blockInjectionSupported=true]
 * @param {String} [options.blockUnsupportedReason='']
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideStopHookAction(verdict, {
    enforcing               = false,
    operatorInLoop          = false,
    blockInjectionSupported = true,
    blockUnsupportedReason  = ''
} = {}) {
    if (operatorInLoop) {
        return {action: 'allow', reason: 'live operator dialogue — yielding for the human turn'};
    }

    if (enforcing && blockInjectionSupported) {
        return {action: 'block', reason: verdict.reason};
    }

    const reason = enforcing && !blockInjectionSupported && blockUnsupportedReason
        ? `${verdict.reason} ${blockUnsupportedReason}`
        : verdict.reason;

    return {action: 'would-block', reason};
}
