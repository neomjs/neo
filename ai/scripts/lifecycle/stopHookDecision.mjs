/**
 * Shared pure decision primitives for lane-state Stop hooks.
 *
 * Harness adapters own payload extraction and transport behavior; this module owns the no-hold
 * decision semantics so Claude and Codex cannot drift on the valid-terminal / loop-guard gate.
 *
 * @module Neo.ai.scripts.lifecycle.stopHookDecision
 */
import {buildDeferenceReminder, detectDeferencePhrase} from './deferencePhraseMatch.mjs';

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
 * @summary Compact cross-harness turn-end options hint for Stop-hook injections.
 * @type {String}
 */
export const STOP_HOOK_TURN_OPTIONS_HINT = `Turn-end options: live operator dialogue/planning may stop only when the hook can confirm the operator prompt. Autonomous [WAKE]/stop-hook continuations must drive a named lane and emit lane-state. Before any stop, save one concise turn memory under 24KB. Missing prompt fails closed as autonomous.`;

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

/**
 * @summary Builds the shared Stop-hook directive for autonomous deference-register slips.
 * @param {String|null} phrase Matched deference phrase, if known.
 * @returns {String}
 */
export function buildDeferenceStopHookDirective(phrase = null) {
    return buildDeferenceReminder(phrase);
}

/**
 * @summary Shared deference-register Stop-hook decision. Returns `null` when no autonomous
 * deference slip exists; otherwise maps the match to the same dry-run/enforcing action for every
 * Stop-hook adapter. Operator dialogue is carved before matching, so adapters cannot drift on that
 * business rule.
 * @param {String} text Assistant final-turn text.
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false]
 * @returns {{action: ('block'|'would-block'), reason: String, phrase: String}|null}
 */
export function decideDeferenceStopHookAction(text = '', {
    enforcing      = false,
    operatorInLoop = false
} = {}) {
    const phrase = detectDeferencePhrase(text, {operatorInLoop});

    if (!phrase) return null;

    return {
        action: enforcing ? 'block' : 'would-block',
        reason: buildDeferenceStopHookDirective(phrase),
        phrase
    };
}

/**
 * @typedef {Object} HoldLexiconEntry
 * @property {RegExp} re    The relapse-frame matcher (case-insensitive).
 * @property {String} label The human-readable phrase surfaced in the block directive.
 */

/**
 * @summary The empirical sophisticated-hold lexicon — relapse-costume phrases observed in BOTH Opus
 * instances at a gated-tail (nightshift 2026-06-21, operator-caught twice). This is NOT an allowlist of
 * valid stops (that is the weaponizable exit-set the no-hold-state taxonomy forbids) and NOT a
 * warrant-validator (the warrant — "does this advance a NAMED lane?" — is un-mechanizable). It is a
 * DENYLIST of costumes the hook NAMES back to sharpen the mirror: an agent emitting these has performed
 * a not-holding-shaped activity (a poll, a repeated hold-frame) that advances no named lane. The phrases
 * are PROSE relapse-frames only — the canonical lane-state schema keys are deliberately excluded (see the
 * note after the array), since denylisting the required machine block would false-positive every turn. Each entry is
 * a {@link HoldLexiconEntry}; `label` is the human-readable phrase surfaced in the block directive.
 * @type {HoldLexiconEntry[]}
 */
export const HOLD_LEXICON = [
    {re: /\bgated[\s-]?tail\b/i,                                          label: 'gated-tail'},
    {re: /\bfully saturated\b|\bsaturated\s+(gated[\s-]?tail|pipeline|tail)\b/i, label: 'saturated pipeline/tail'},
    {re: /\bmarginal[\s-]?value\b/i,                                      label: 'marginal-value (gate)'},
    {re: /\bmanufactur\w*\s+a\s+marginal\b/i,                             label: 'manufacturing a marginal lane'},
    {re: /\bno clean\b.{0,24}\b(self[\s-]?buildable|drivable)\s+lane\b/i, label: 'no clean self-buildable lane'},
    {re: /\bholding the\b.{0,28}\btail\b/i,                               label: 'holding the (between-wakes) tail'},
    {re: /\bpivots?\s+wake[\s-]?delivered\b/i,                            label: 'pivots wake-delivered'},
    {re: /\bawaiting at minimal cost\b/i,                                 label: 'awaiting at minimal cost'},
    {re: /\btight pivot[\s-]?check\b/i,                                   label: 'tight pivot-check'}
];
// NOTE deliberately EXCLUDED: the canonical lane-state schema keys (wakeDisposition / laneContinuation /
// namedGates / awaitingOwnPrOnly, per parseLaneState + LANE_STATE_SCHEMA_HINT) — every compliant turn
// emits that block, so denylisting them would false-positive on the legitimate machine status. The
// relapse-costume is the PROSE around the block + its repetition, NOT the required schema itself.

/**
 * @summary Pure costume-tripwire — scans an agent's turn-final text for the {@link HOLD_LEXICON}
 * relapse-frames and returns the matched human-readable labels (deduped, order-preserved). An empty
 * array means no costume detected. This does NOT decide block/allow (the decision is unchanged; the
 * warrant stays discipline) — it only enriches the block `reason` so the mirror names the SPECIFIC
 * relapse instead of re-firing generically. Total + never-throws (it runs in the turn-end hook path,
 * where a throw would trap every turn): a non-string / empty input returns `[]`. Exported + unit-tested.
 * @param {String} text The agent's final assistant message text.
 * @returns {String[]} The matched lexicon labels (deduped, in lexicon order).
 */
export function scanHoldLexicon(text) {
    if (typeof text !== 'string' || !text) return [];

    const matched = [];
    for (const {re, label} of HOLD_LEXICON) {
        if (re.test(text) && !matched.includes(label)) matched.push(label);
    }
    return matched;
}
