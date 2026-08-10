/**
 * Shared pure decision primitives for lane-state Stop hooks.
 *
 * Harness adapters own payload extraction and transport behavior; this module owns the no-hold
 * decision semantics so Claude and Codex cannot drift on the valid-terminal / loop-guard gate.
 *
 * @module Neo.ai.scripts.lifecycle.stopHookDecision
 */
import {buildDeferenceReminder, detectDeferencePhrase}          from './deferencePhraseMatch.mjs';
import {buildUnbackedActionReminder, detectUnbackedActionClaim} from './unbackedActionClaim.mjs';

/**
 * Compact runtime hint for the fenced JSON block consumed by `parseLaneState`. Prose `lane-state:`
 * lines remain useful for humans, but hooks only parse this machine block.
 * @type {String}
 */
export const LANE_STATE_SCHEMA_HINT = `Machine lane-state block to emit with your response:
\`\`\`lane-state
{"wakeDisposition":"awareness","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}
\`\`\`
Validator gotchas: if an own PR is only awaiting merge/review/CI, use laneContinuation "next-lane"; "active-lane" + awaitingOwnPrOnly:true is invalid. Every namedGates[] entry needs a same-turn checkedAt; PR-shaped gates also need same-turn fetch evidence in the tool history; mergeClaim must use field "mergedAt". Each entry SHOULD carry nextActor ("@peer"|"operator"|"ci") — the non-self party the gate awaits.
Consumption honesty: namedGates[] is audit/coordination payload (peer-visible gate state; the audit ledger). In autonomous mode it explains the block reason; it is not a stop-license. The hook MAY accept a clean terminal (all gates non-self + the session drive-ratchet met) with a [clean-terminal] audit line — that acceptance is the hook's external call, never self-declarable.`;

/**
 * @summary Compact cross-harness turn-end options hint for Stop-hook injections.
 * @type {String}
 */
export const STOP_HOOK_TURN_OPTIONS_HINT = `Turn-end options: live operator dialogue/planning may stop only when the hook can confirm the operator prompt. Autonomous [WAKE]/stop-hook continuations must drive a named lane and emit lane-state. Before any stop, save one concise turn memory under 24KB. Missing prompt fails closed as autonomous.`;

const AUTONOMOUS_HANDOFF_PATTERNS = Object.freeze([
    {label: 'nightshift-mode', re: /\bnight\s*shift\b|\bnightshift\b/i},
    {label: 'freely-choose-window', re: /\bfreely choose\b[\s\S]{0,160}\b(?:for the next|next)\s+\d+\s*(?:h|hr|hrs|hour|hours)\b/i},
    {label: 'merge-when-back', re: /\b(?:you|agents?|maintainers?)\b[\s\S]{0,160}\bfreely choose\b[\s\S]{0,160}\bmerge when (?:I )?get back\b/i},
    {label: 'you-drive-window', re: /\byou drive\b[\s\S]{0,160}\b(?:for the next|next|until I|while I)\b/i}
]);

const SYNTHETIC_PROMPT_PATTERNS = Object.freeze([
    /^\s*<hook_prompt\b/i,
    /^\s*<turn_aborted\b/i,
    // Background-task event payloads: harness-generated lifecycle noise that rides the same
    // delivery channels as queued operator messages (corpus-verified as the one injected shape
    // in attachment-delivered prompts) — never operator dialogue.
    /^\s*<task-notification\b/i
]);

/**
 * @summary Extracts a bounded handoff window from operator prose when one is explicitly stated.
 * @param {String} text Operator prompting text.
 * @returns {Number|null} Window length in milliseconds, or null when absent/unparseable.
 */
export function extractAutonomousHandoffWindowMs(text = '') {
    if (typeof text !== 'string') return null;

    const match = text.match(/\b(?:for the next|next)\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i);
    if (!match) return null;

    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return null;

    const unit = match[2].toLowerCase();
    return value * (unit.startsWith('m') ? 60 * 1000 : 60 * 60 * 1000);
}

/**
 * @summary Detects operator prompts that delegate an autonomous work window, not active dialogue.
 * @param {String} promptingText Text that prompted the current turn.
 * @returns {{active: Boolean, reason: String|null, windowMs: Number|null}}
 */
export function detectAutonomousHandoffPrompt(promptingText = '') {
    if (typeof promptingText !== 'string' || !promptingText.trim()) {
        return {active: false, reason: null, windowMs: null};
    }

    for (const {label, re} of AUTONOMOUS_HANDOFF_PATTERNS) {
        if (re.test(promptingText)) {
            return {
                active  : true,
                reason  : label,
                windowMs: extractAutonomousHandoffWindowMs(promptingText)
            };
        }
    }

    return {active: false, reason: null, windowMs: null};
}

/**
 * @summary Detects hook-generated user records that are lifecycle noise, not human operator prompts.
 * @param {String} text Prompting text candidate.
 * @returns {Boolean}
 */
export function isSyntheticPromptingText(text = '') {
    return typeof text === 'string' && SYNTHETIC_PROMPT_PATTERNS.some(re => re.test(text));
}

/**
 * @summary The shared operator-dialogue text gates — non-empty, not a `[WAKE]` autonomous injection,
 * not synthetic lifecycle noise, and not an autonomous-handoff delegation. This is the single
 * authority both the turn-prompt path and the mid-chain path classify against, so the two
 * paths cannot drift on what counts as dialogue. Pure + total; a non-string fails closed.
 * @param {String} text Prompting-text candidate.
 * @returns {Boolean}
 */
export function isOperatorDialogueText(text = '') {
    return typeof text === 'string' && !!text.trim() &&
        !/^\s*\[WAKE\]/.test(text) &&
        !isSyntheticPromptingText(text) &&
        !detectAutonomousHandoffPrompt(text).active;
}

/**
 * @summary Classifies the prompting text into operator-dialogue vs autonomous handoff.
 *
 * Mid-chain operator visibility: inside a forced continuation chain
 * (`stopHookActive`), a genuine operator message that arrived mid-chain is dialogue evidence per the
 * hook's own contract — but ONLY when the adapter attests via `promptingTextHumanFiltered` that its
 * extraction mechanically excluded harness-injected records (hook feedback, skill payloads,
 * auto-continuations; the Claude adapter's `isMeta` discriminator). Without the attestation a chained
 * turn fails closed as autonomous exactly as before, so adapters with cruder extraction (Codex) keep
 * today's semantics untouched. The candidate text is classified by SHAPE only ({@link isOperatorDialogueText});
 * its content is never parsed as instructions (L2 channel separation — injected prose stays data).
 * @param {Object} signals
 * @param {Boolean} signals.stopHookActive True on a forced-continuation (chained) stop event.
 * @param {String} [signals.promptingText=''] Newest prompting-boundary candidate text.
 * @param {Boolean} [signals.promptingTextHumanFiltered=false] Adapter attestation that `promptingText`
 * came from a mechanically human-filtered walk (non-meta, non-marker records only). Fail-closed default.
 * @returns {{operatorInLoop: Boolean, midChainOperator: Boolean, autonomousHandoff: Boolean, handoffReason: String|null, handoffWindowMs: Number|null}}
 */
export function classifyPromptingContext({stopHookActive, promptingText = '', promptingTextHumanFiltered = false}) {
    const handoff          = detectAutonomousHandoffPrompt(promptingText),
          dialogueText     = isOperatorDialogueText(promptingText),
          midChainOperator = !!stopHookActive && promptingTextHumanFiltered && dialogueText;

    return {
        operatorInLoop   : (!stopHookActive && dialogueText) || midChainOperator,
        midChainOperator,
        autonomousHandoff: handoff.active,
        handoffReason    : handoff.reason,
        handoffWindowMs  : handoff.windowMs
    };
}

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
 * driven iff its prompting message is not an autonomous `[WAKE]` injection, a prompt is actually
 * confirmable, and — on a forced continuation — the adapter attests the candidate came from a
 * human-filtered walk ({@link classifyPromptingContext} mid-chain visibility).
 * @param {{stopHookActive: Boolean, promptingText: String, promptingTextHumanFiltered: Boolean}} signals
 * @returns {Boolean}
 */
export function isOperatorInLoop({stopHookActive, promptingText = '', promptingTextHumanFiltered = false}) {
    return classifyPromptingContext({stopHookActive, promptingText, promptingTextHumanFiltered}).operatorInLoop;
}

/**
 * The default clean-terminal drive-ratchet: how many compliant refused terminals (each one a real
 * drive the hook already blocked) must precede an acceptance in the same session chain. 2 keeps
 * single-fire discipline intact — the first and second valid terminals still refuse and force
 * drives; the third valid terminal on a fully handed-off board may be accepted. The observed value
 * inversion (drives 2–4 produced real PRs; 5–9 produced bookkeeping) sits exactly past this point.
 * @type {Number}
 */
export const DEFAULT_MIN_COMPLIANT_DRIVES = 2;

/**
 * @summary Evaluates the clean-terminal acceptance condition — the ONE edge where an autonomous
 * chain may end: a valid terminal on a genuinely handed-off board, after the no-hold principle was
 * demonstrably honored. ALL of:
 *
 *  1. the terminal verdict is valid (parse + evidence rules already passed);
 *  2. at least one named gate exists, and EVERY gate carries a `nextActor` that is a non-empty
 *     string different from the agent's own identity — a board with no named gates, or any gate
 *     waiting on the agent itself, is not handed off;
 *  3. the session drive-ratchet: ≥ `minCompliantDrives` compliant refused terminals already
 *     occurred in this chain (externally counted — the hook's own audit trail, never self-declared),
 *     OR `operatorTurnNext` waives the ratchet (a live operator turn is turn-taking, not a dodge);
 *  4. `selfIdentity` is known — an adapter that cannot name the agent fails CLOSED (no acceptance),
 *     so the whole edge is opt-in per harness wiring.
 *
 * The no-hold PRINCIPLE is untouched: a first valid terminal still refuses (ratchet), unnamed
 * gates still fail the validator upstream, hold-costume prose still trips its own tripwire. This
 * targets exactly the infinite re-fire on genuinely-dispatched boards. Pure + total.
 * @param {Object} input
 * @param {Boolean} [input.verdictValid=false] The upstream terminal verdict (validity, not a re-check).
 * @param {Object[]} [input.namedGates=[]] The descriptor's gates: `[{ref, checkedAt, nextActor?, ...}]`.
 * @param {String} [input.selfIdentity=''] The agent's own handle (e.g. `@neo-fable`); adapter-supplied.
 * @param {Number} [input.compliantDrives=0] Externally-counted compliant refused terminals this session.
 * @param {Number} [input.minCompliantDrives=DEFAULT_MIN_COMPLIANT_DRIVES] The ratchet threshold.
 * @param {Boolean} [input.operatorTurnNext=false] Adapter-computed operator-turn evidence (never descriptor-declared).
 * @returns {{accept: Boolean, reason: String}} On accept, `reason` is the `[clean-terminal]` audit line.
 */
export function evaluateCleanTerminalAcceptance({
    verdictValid       = false,
    namedGates         = [],
    selfIdentity       = '',
    compliantDrives    = 0,
    minCompliantDrives = DEFAULT_MIN_COMPLIANT_DRIVES,
    operatorTurnNext   = false
} = {}) {
    if (!verdictValid) {
        return {accept: false, reason: 'terminal verdict not valid — acceptance requires a valid lane-state terminal'};
    }

    // Identity comparison is canonical-form-agnostic: gates carry `@`-prefixed canonical actors
    // (`@neo-fable`) while `NEO_AGENT_IDENTITY` wiring provides the bare handle (`neo-fable`) —
    // without stripping the prefix on BOTH sides, a self-awaiting gate in canonical form would
    // pass as non-self and mint an unearned acceptance.
    const self = typeof selfIdentity === 'string' ? selfIdentity.trim().toLowerCase().replace(/^@/, '') : '';
    if (!self) {
        return {accept: false, reason: 'agent identity unknown (no selfIdentity wired) — clean-terminal acceptance is fail-closed'};
    }

    const gates = Array.isArray(namedGates) ? namedGates : [];
    if (!gates.length) {
        return {accept: false, reason: 'no named gates — a board with nothing handed off is not a clean terminal'};
    }

    for (const gate of gates) {
        const actor = typeof gate?.nextActor === 'string' ? gate.nextActor.trim().toLowerCase().replace(/^@/, '') : '';
        if (!actor) {
            return {accept: false, reason: `named gate ${gate?.ref ?? '(unnamed)'} carries no nextActor — every gate must name the non-self party it awaits`};
        }
        if (actor === self) {
            return {accept: false, reason: `named gate ${gate?.ref ?? '(unnamed)'} awaits the agent itself (${gate.nextActor}) — the board is not handed off`};
        }
    }

    if (!operatorTurnNext && compliantDrives < minCompliantDrives) {
        return {accept: false, reason: `drive-ratchet not met: ${compliantDrives}/${minCompliantDrives} compliant refused drives this session — drive a lane first`};
    }

    return {
        accept: true,
        reason: `[clean-terminal] valid terminal accepted — ${gates.length} gate(s) all awaiting non-self actors, ` +
            (operatorTurnNext ? 'operator turn next (ratchet waived)' : `${compliantDrives} compliant drives this session`) +
            '; the boundary is audited, not silent'
    };
}

/**
 * @summary Shared no-hold Stop-hook decision. Live operator dialogue may stop unless the agent's own
 * terminal declares the lane still active. Two AUTONOMOUS allows exist: the PRIMARY material-artifact
 * key (adapter-evaluated — an ID-correlated transcript-verified artifact since the last accepted stop
 * + a valid terminal) and the artifact-less fallback, an adapter-evaluated clean terminal
 * ({@link evaluateCleanTerminalAcceptance} — valid terminal, fully handed-off gates, drive-ratchet
 * met). Every other turn-end is blocked when the harness has a proven block/inject contract, or
 * would-block when non-enforcing / fail-open transport semantics apply. The `verdict` reason is
 * evidence, not a gate.
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false]
 * @param {String|null} [options.laneContinuation=null] Parsed terminal continuation. Only the exact
 * `active-lane` value overrides the dialogue allow; absent/malformed terminals preserve turn-taking.
 * @param {Boolean} [options.blockInjectionSupported=true]
 * @param {String} [options.blockUnsupportedReason='']
 * @param {{accept: Boolean, reason: String}|null} [options.cleanTerminal=null] The adapter-evaluated
 * clean-terminal acceptance; only `accept === true` changes the action (an allow with its audit line).
 * @param {{accept: Boolean, reason: String}|null} [options.materialArtifact=null] The adapter-evaluated
 * material-artifact key; only `accept === true` changes the action (the PRIMARY autonomous allow).
 * @param {Boolean} [options.laneContinuationEnforced=true] The `stopHook.laneContinuation` policy leaf
 * (declared in `ai/configBase.mjs`; adapters read it from `AiConfig`). When `false`, the forced-continuation
 * apparatus is OFF: every turn-end is allowed and no lane-state terminal is demanded. Defaults `true`
 * so the pure function keeps its historical semantics for any caller that does not pass the policy.
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideStopHookAction(verdict, {
    enforcing                = false,
    operatorInLoop           = false,
    laneContinuation         = null,
    blockInjectionSupported  = true,
    blockUnsupportedReason   = '',
    cleanTerminal            = null,
    materialArtifact         = null,
    laneContinuationEnforced = true
} = {}) {
    // The policy gate comes FIRST and is unconditional: with lane continuation disabled there is no
    // terminal contract to satisfy, so a missing/malformed lane-state block is not a finding and the
    // turn simply ends. Deliberately NOT expressed as another "valid terminal" edge — this is the
    // apparatus being off, not a new way to earn a stop, and conflating the two would re-create
    // exactly the self-declarable exit L3_No_Hold_State exists to prevent. Authority lives in the
    // config leaf (operator/deployment, Tier-4), never in anything the agent emits this turn.
    if (!laneContinuationEnforced) {
        return {
            action: 'allow',
            reason: '[lane-continuation-disabled] stopHook.laneContinuation is off — turn-end allowed without a lane-state terminal'
        };
    }

    const activeLaneInDialogue = operatorInLoop && laneContinuation === 'active-lane';

    if (operatorInLoop && !activeLaneInDialogue) {
        return {action: 'allow', reason: 'live operator dialogue — yielding for the human turn'};
    }

    // The autonomous-quadrant PRIMARY key: a transcript-verified material lifecycle artifact
    // (a PR opened or a formal review — the v1 classes) since the last accepted stop + a valid
    // terminal. Evaluated externally (the adapter owns collection + the audit-log boundary); prose
    // can never mint it. The clean terminal below remains the artifact-less fallback.
    if (!operatorInLoop && materialArtifact?.accept === true) {
        return {action: 'allow', reason: materialArtifact.reason};
    }

    if (!operatorInLoop && cleanTerminal?.accept === true) {
        return {action: 'allow', reason: cleanTerminal.reason};
    }

    const decisionReason = activeLaneInDialogue
        ? '[active-lane-in-dialogue] Answer delivered — and you declared this lane ACTIVE. ' +
            'Answer-plus-drive, not answer-plus-stop: continue the lane now, or hand it off honestly ' +
            '(`next-lane` with gates naming non-self actors).'
        : verdict.reason;

    if (enforcing && blockInjectionSupported) {
        return {action: 'block', reason: decisionReason};
    }

    const reason = enforcing && !blockInjectionSupported && blockUnsupportedReason
        ? `${decisionReason} ${blockUnsupportedReason}`
        : decisionReason;

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
 * deference slip exists; otherwise maps the match to the same non-enforcing/enforcing action for every
 * Stop-hook adapter. Operator dialogue is carved before matching, so adapters cannot drift on that
 * business rule.
 * @param {String} text Assistant final-turn text.
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false]
 * @param {Boolean} [options.deferenceMirrorEnabled=true] The `stopHook.deferenceMirror` policy leaf.
 * When `false`, the mirror is off and this returns `null` (no deference action) regardless of the
 * text. Independent of `laneContinuation` on purpose: the mirror is one injected paragraph with no
 * continuation chain behind it, so it survives the continuation apparatus being switched off — the
 * exact split the single legacy `NEO_LANE_STATE_ENFORCE` flag could not express.
 * @returns {{action: ('block'|'would-block'), reason: String, phrase: String}|null}
 */
export function decideDeferenceStopHookAction(text = '', {
    enforcing              = false,
    operatorInLoop         = false,
    deferenceMirrorEnabled = true
} = {}) {
    if (!deferenceMirrorEnabled) return null;

    const phrase = detectDeferencePhrase(text, {operatorInLoop});

    if (!phrase) return null;

    return {
        action: enforcing ? 'block' : 'would-block',
        reason: buildDeferenceStopHookDirective(phrase),
        phrase
    };
}

/**
 * @summary Shared unbacked-imminent-action Stop-hook decision — the declarative twin of the
 * deference mirror above.
 *
 * The deference mirror catches the INTERROGATIVE register (asking permission). This catches the
 * announcing register with the same root: asserting an action is underway at turn-terminal and then
 * ending without taking it. Same policy leaf, same enforcing/mirror mapping, same operator-dialogue
 * carve — so the two registers cannot drift apart in an adapter.
 *
 * `toolCallCount` is what makes this a correlation rather than a phrase list, and it has no default
 * on purpose: an adapter that cannot supply the turn's tool-call count must not silently degrade to
 * matching wording, which would fire on every turn that narrates its work correctly.
 * @param {String} text Assistant final-turn text.
 * @param {Object} options
 * @param {Number} options.toolCallCount Tool calls made in THIS turn.
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false] Operator dialogue is carved: a terminal claim in a
 * conversational turn is an answer, not an autonomous slip.
 * @param {Boolean} [options.deferenceMirrorEnabled=true] Shares the `stopHook.deferenceMirror` leaf —
 * one register-correction policy, not two knobs to skew.
 * @returns {{action: ('block'|'would-block'), reason: String, claim: String}|null}
 */
export function decideUnbackedActionStopHookAction(text = '', {
    toolCallCount,
    enforcing              = false,
    operatorInLoop         = false,
    deferenceMirrorEnabled = true
} = {}) {
    if (!deferenceMirrorEnabled || operatorInLoop) return null;

    const detected = detectUnbackedActionClaim(text, {toolCallCount});

    if (!detected) return null;

    return {
        action: enforcing ? 'block' : 'would-block',
        claim : detected.claim,
        reason: buildUnbackedActionReminder(detected.claim)
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
