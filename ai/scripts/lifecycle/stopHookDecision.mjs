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

const AUTONOMOUS_HANDOFF_PATTERNS = Object.freeze([
    {label: 'nightshift-mode', re: /\bnight\s*shift\b|\bnightshift\b/i},
    {label: 'freely-choose-window', re: /\bfreely choose\b[\s\S]{0,160}\b(?:for the next|next)\s+\d+\s*(?:h|hr|hrs|hour|hours)\b/i},
    {label: 'merge-when-back', re: /\b(?:you|agents?|maintainers?)\b[\s\S]{0,160}\bfreely choose\b[\s\S]{0,160}\bmerge when (?:I )?get back\b/i},
    {label: 'you-drive-window', re: /\byou drive\b[\s\S]{0,160}\b(?:for the next|next|until I|while I)\b/i}
]);

const SYNTHETIC_PROMPT_PATTERNS = Object.freeze([
    /^\s*<hook_prompt\b/i,
    /^\s*<turn_aborted\b/i
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
 * @summary Classifies the prompting text into operator-dialogue vs autonomous handoff.
 * @param {{stopHookActive: Boolean, promptingText: String}} signals
 * @returns {{operatorInLoop: Boolean, autonomousHandoff: Boolean, handoffReason: String|null, handoffWindowMs: Number|null}}
 */
export function classifyPromptingContext({stopHookActive, promptingText = ''}) {
    const handoff   = detectAutonomousHandoffPrompt(promptingText),
          synthetic = isSyntheticPromptingText(promptingText);

    return {
        operatorInLoop   : !stopHookActive && !!promptingText.trim() && !/^\s*\[WAKE\]/.test(promptingText) && !synthetic && !handoff.active,
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
 * driven iff it is not a forced continuation, its prompting message is not an autonomous `[WAKE]`
 * injection, and a prompt is actually confirmable.
 * @param {{stopHookActive: Boolean, promptingText: String}} signals
 * @returns {Boolean}
 */
export function isOperatorInLoop({stopHookActive, promptingText = ''}) {
    return classifyPromptingContext({stopHookActive, promptingText}).operatorInLoop;
}

/**
 * @typedef {Object} ForwardArtifactRule
 * @property {String} cls               The forward-artifact class this rule emits.
 * @property {String[]} [names]         Exact tool names that emit the class.
 * @property {RegExp} [bashRe]          For `Bash` tool events: a command-text matcher emitting the class.
 */

/**
 * @summary The forward-artifact class rules for the declining-yield re-fire admission — the
 * contract's artifact classes, keyed off tool-event names (harness-agnostic input shape). Classes:
 * PR/commit/test changes · GitHub issue/discussion/PR comments · A2A messages that route ownership or
 * contract state · ticket/PR creation · issue-graph mutations (labels/assignees/relationships — the
 * verified-handoff class's mechanical face). MANDATORY-GATE EXCLUSION (load-bearing, per the ticket's
 * cost-control ACs): the per-turn `add_memory` save and the lane-state block appear in every compliant
 * cycle by construction, so they are deliberately ABSENT here and can never discriminate a productive
 * cycle from an empty one. Read-only tools (list/get/mark_read/search) and harness-internal task
 * bookkeeping are likewise non-artifacts.
 * @type {ForwardArtifactRule[]}
 */
export const FORWARD_ARTIFACT_RULES = Object.freeze([
    {cls: 'ticket-or-pr-created', names: ['mcp__neo-mjs-github-workflow__create_issue', 'create_issue']},
    {cls: 'ticket-or-pr-created', bashRe: /\bgh\s+pr\s+create\b/},
    {cls: 'gh-comment',           names: ['mcp__neo-mjs-github-workflow__manage_issue_comment', 'manage_issue_comment', 'mcp__neo-mjs-github-workflow__manage_pr_review', 'manage_pr_review', 'mcp__neo-mjs-github-workflow__create_discussion', 'create_discussion', 'mcp__neo-mjs-github-workflow__manage_discussion_comment', 'manage_discussion_comment']},
    {cls: 'a2a-message',          names: ['mcp__neo-mjs-memory-core__add_message', 'add_message']},
    {cls: 'code-change',          bashRe: /\bgit\s+(commit|push)\b/},
    {cls: 'code-change',          names: ['Edit', 'Write', 'NotebookEdit', 'replace', 'write_file']},
    {cls: 'issue-graph-mutation', names: ['mcp__neo-mjs-github-workflow__manage_issue_assignees', 'manage_issue_assignees', 'mcp__neo-mjs-github-workflow__update_issue_relationship', 'update_issue_relationship', 'mcp__neo-mjs-github-workflow__manage_issue_labels', 'manage_issue_labels']}
]);

/**
 * @summary Classifies a turn's tool events into forward-artifact classes for the declining-yield
 * admission. Pure + total (never throws): malformed input yields an empty classification, which the
 * caller treats as fail-closed. Input shape is harness-agnostic: `{name, command?}` per event — Claude
 * adapters lift `command` from a `Bash` tool_use input; other harnesses map their equivalents.
 * @param {Array<{name: String, command: String}>} toolEvents The current turn's tool-use events.
 * @returns {String[]} Sorted, deduped forward-artifact classes observed this turn.
 */
export function classifyForwardArtifacts(toolEvents) {
    if (!Array.isArray(toolEvents)) return [];

    const classes = new Set();

    for (const event of toolEvents) {
        if (!event || typeof event !== 'object' || typeof event.name !== 'string') continue;

        for (const rule of FORWARD_ARTIFACT_RULES) {
            if (rule.names?.includes(event.name)) {
                classes.add(rule.cls);
            } else if (rule.bashRe && event.name === 'Bash' && typeof event.command === 'string' && rule.bashRe.test(event.command)) {
                classes.add(rule.cls);
            }
        }
    }

    return [...classes].sort();
}

/**
 * @summary The declining-yield re-fire admission — decides whether a hook-forced continuation chain has
 * stopped yielding NEW forward-artifact classes and the valid terminal may therefore be admitted.
 * Novelty-keyed per the ticket's cost-control ACs: an admission requires the last `n` consecutive
 * forced continuations (the current turn included) to have introduced NO artifact class that was not
 * already seen earlier in the chain — mere artifact PRESENCE does not defeat admission (repeating the
 * same classes is padding, not yield), and artifact ABSENCE alone does not admit before `n` is reached
 * (fail-closed early). Pure + total: malformed input returns a non-admitting verdict with a
 * fail-closed reason. This narrows DETECTION, not policy — L3 stands: admission additionally requires
 * a VALID lane-state terminal at the call site ({@link decideStopHookAction}), so a bare stop is never
 * admitted.
 * @param {String[][]} chainClasses Class-sets of the PRIOR consecutive forced continuations (oldest → newest).
 * @param {String[]} currentClasses The current turn's classes ({@link classifyForwardArtifacts}).
 * @param {Object} [options]
 * @param {Number} [options.n=2] Consecutive no-novelty continuations required to admit.
 * @returns {{admit: Boolean, reason: String, summary: {currentClasses: String[], newClasses: String[], consecutiveNoNovelty: Number}}}
 */
export function decideRefireAdmission(chainClasses, currentClasses, {n = 2} = {}) {
    const failClosed = reason => ({admit: false, reason, summary: {currentClasses: [], newClasses: [], consecutiveNoNovelty: 0}});

    if (!Array.isArray(chainClasses) || !Array.isArray(currentClasses) || !Number.isInteger(n) || n < 1) {
        return failClosed('refire-visibility-unavailable — fail closed (malformed admission input)');
    }

    const chain   = chainClasses.filter(Array.isArray).map(entry => entry.filter(cls => typeof cls === 'string')),
          entries = [...chain, currentClasses.filter(cls => typeof cls === 'string')];

    // Per-entry novelty against the union of everything BEFORE that entry.
    const seen = new Set(), noveltyFlags = [];
    for (const entry of entries) {
        let novel = false;
        for (const cls of entry) {
            if (!seen.has(cls)) { novel = true; seen.add(cls); }
        }
        noveltyFlags.push(novel);
    }

    let consecutiveNoNovelty = 0;
    for (let i = noveltyFlags.length - 1; i >= 0 && !noveltyFlags[i]; i--) consecutiveNoNovelty++;

    const current    = entries[entries.length - 1],
          newClasses = noveltyFlags[noveltyFlags.length - 1] ? current.filter(cls => {
              const prior = new Set(chain.flat());
              return !prior.has(cls);
          }) : [],
          summary    = {currentClasses: current, newClasses, consecutiveNoNovelty};

    if (entries.length < n) {
        return {admit: false, reason: `declining-yield window not reached (${entries.length}/${n} continuations) — fail closed`, summary};
    }

    if (consecutiveNoNovelty >= n) {
        return {
            admit : true,
            reason: `declining-yield admission: ${consecutiveNoNovelty} consecutive continuations without a new forward-artifact class (current: [${current.join(', ') || 'none'}])`,
            summary
        };
    }

    return {
        admit : false,
        reason: `chain still yielding: new classes [${newClasses.join(', ')}] this continuation`,
        summary
    };
}

/**
 * @summary Shared no-hold Stop-hook decision. The one voluntary allow is live operator dialogue;
 * every other turn-end is blocked when the harness has a proven block/inject contract, or would-block
 * when dry-run / fail-open transport semantics apply. The `verdict` reason is evidence, not a gate.
 *
 * Re-fire bounding: a `refire` admission ({@link decideRefireAdmission}) additionally allows a
 * turn-end when — and only when — the terminal is VALID (an invalid or absent lane-state emission is
 * never admitted) and the forced-continuation chain has stopped yielding new forward-artifact classes.
 * Absent `refire` (no transcript/tool-call visibility) preserves today's behavior — fail closed. This
 * bounds the RE-FIRE, not the policy: L3's no-hold stance is unchanged for every yielding chain.
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Object} [options]
 * @param {Boolean} [options.enforcing=false]
 * @param {Boolean} [options.operatorInLoop=false]
 * @param {Boolean} [options.blockInjectionSupported=true]
 * @param {String} [options.blockUnsupportedReason='']
 * @param {{admit: Boolean, reason: String}|null} [options.refire=null] Declining-yield admission verdict.
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideStopHookAction(verdict, {
    enforcing               = false,
    operatorInLoop          = false,
    blockInjectionSupported = true,
    blockUnsupportedReason  = '',
    refire                  = null
} = {}) {
    if (operatorInLoop) {
        return {action: 'allow', reason: 'live operator dialogue — yielding for the human turn'};
    }

    if (verdict?.valid && refire?.admit) {
        return {action: 'allow', reason: refire.reason};
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
