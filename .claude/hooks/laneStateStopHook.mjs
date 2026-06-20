#!/usr/bin/env node
/**
 * @module .claude/hooks/laneStateStopHook
 * @summary Claude Code `Stop` hook — REFUSES every turn-end except a live operator dialogue.
 * DRY-RUN (log-only) by default; ENFORCE via `NEO_LANE_STATE_ENFORCE=1`.
 *
 * Fires at every agent turn-end (the `Stop` event). The decision rule: there is NO valid voluntary
 * stop except a **live operator dialogue** — a turn that directly replied to a genuine human-operator
 * message, where the human takes the next turn (turn-taking, not idling). A "valid" fenced ```lane-state
 * block is a RECORD (the directive's context + the external substance record), NOT a license to stop:
 * declaring a lane and halting is the announce-without-execute idle-out the hook exists to prevent.
 *
 * Mechanism:
 *  - `operatorInLoop` (the one allow) is determined EXTERNALLY by `isOperatorInLoop`, never
 *    self-declared, so it cannot be gamed: the prompting message must NOT be a `stop_hook_active`
 *    forced continuation, NOT a `[WAKE]` autonomous injection, and must be confirmable (fail-closed).
 *  - Otherwise: ENFORCE → block; DRY-RUN → would-block (log only — the audit path). The lane-state
 *    `verdict` (`parseLaneState` → `validateLaneStateTerminal`) no longer gates the action — it only
 *    supplies the `reason` for the injected directive.
 *  - Block path (ENFORCING): write `{"decision":"block","reason":"…"}` to stdout — Claude keeps
 *    working and uses the injected directive as its next instruction. The only autonomous stop is a
 *    hard external limit: Claude Code's consecutive-block force-override (the bounded ceiling the hook
 *    cannot override), context-sunset, or an operator halt.
 *
 * SAFETY — this hook MUST NEVER block a turn-end on its OWN failure (a malformed hook payload, an
 * unreadable transcript, a validator throw). Those allow the stop + audit. A *malformed lane-state
 * emission* (parseLaneState throws) is NOT our failure — it feeds the directive's `reason`, not the gate.
 *
 * ACTIVATION = operator-authority: this script is INERT until wired into the harness settings
 * (`.claude/settings.*`). Wire it in DRY-RUN first, audit the WOULD-BLOCK log, then set
 * `NEO_LANE_STATE_ENFORCE=1` to enforce. A buggy blocking hook would trap every agent's turn-end, so
 * the dry-run → audit → enforce ramp is the safe rollout.
 *
 * SEAM: `parseLaneState` + `validateLaneStateTerminal` (imported from `ai/scripts/lifecycle/`) supply
 * the `verdict`'s reason; the pure `parseOutcomeToVerdict`, `decideHookAction`, and `isOperatorInLoop`
 * are exported + unit-tested independently.
 *
 * @see https://code.claude.com/docs/en/hooks — Stop hook contract (stdin payload, decision:block)
 */
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import {pathToFileURL} from 'node:url';

import {parseLaneState}            from '../../ai/scripts/lifecycle/parseLaneState.mjs';
import {validateLaneStateTerminal} from '../../ai/scripts/lifecycle/validateLaneStateTerminal.mjs';

// Enforce ONLY when the operator explicitly activates it; default is DRY-RUN (log-only, never blocks).
const ENFORCING = process.env.NEO_LANE_STATE_ENFORCE === '1';

// Append-only audit log — the WOULD-BLOCK / ALLOW record for auditing the dry-run before enforcement.
// NEO_AI_DAEMON_DIR override keeps tests off the real store.
const LOG_DIR  = process.env.NEO_AI_DAEMON_DIR || path.join(os.homedir(), '.neo-ai-data', 'lane-state-hook');
const LOG_FILE = path.join(LOG_DIR, 'lane-state-stop-hook.log');

/**
 * @summary Reads all of stdin (the Stop-hook JSON payload) to a string.
 * @returns {Promise<String>}
 * @protected
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data',  chunk => data += chunk);
        process.stdin.on('end',   ()    => resolve(data));
        process.stdin.on('error', reject);
    });
}

/**
 * @summary Best-effort append to the dry-run audit log. A log failure must NEVER gate the hook
 * (mirrors the wake daemon's never-fail log discipline) — worst case is a lost audit line.
 * @param {String} line
 * @protected
 */
function auditLog(line) {
    try {
        fs.mkdirSync(LOG_DIR, {recursive: true});
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
    } catch (e) {
        // best-effort; a log-write failure must never block a turn-end
    }
}

/**
 * @summary Pure mapping of a parse OUTCOME to a terminal verdict — the 3-bucket chain. A malformed
 * emission (parseLaneState threw) and an absent emission (null) are distinct idle-out failures from an
 * invalid descriptor, each with its own reason; a parsed descriptor is delegated to `validate` (the
 * real validator), whose `{valid, violations}` is mapped to the `{valid, reason}` verdict
 * `decideHookAction` consumes. Exported + unit-tested with injected outcomes (no I/O, no real parser).
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
 * @summary Pure decision — maps a terminal `verdict` + the mode (`enforcing`) + whether a live human
 * operator prompted this turn (`operatorInLoop`) to the Stop-hook action. The heart of the idle-out
 * mechanism; exported + unit-tested.
 *
 * The ONE legitimate voluntary stop is a **live operator dialogue** — this turn directly replied to a
 * genuine human-operator message, so the human takes the next turn (turn-taking, not idling). That is
 * `operatorInLoop`, and it ALWAYS allows. `operatorInLoop` is determined EXTERNALLY (the prompting
 * message type — see the entry `main`), never self-declared, so it cannot be gamed.
 *
 * Every OTHER turn-end is an idle-out. A "valid" lane-state terminal is a declaration, not a license
 * to stop (the announce-without-execute loophole the prior `verdict.valid → allow` branch left open).
 * ENFORCE refuses it (block); DRY-RUN previews it (would-block, the false-positive audit path). The
 * `verdict` no longer gates the action — it only supplies the `reason` for the injected directive and
 * the external substance record. The only autonomous stop is a hard external limit (Claude Code's
 * consecutive-block force-override, context-sunset, or an operator halt).
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Boolean} enforcing
 * @param {Boolean} [operatorInLoop=false] True iff a genuine human-operator message prompted this turn.
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideHookAction(verdict, enforcing, operatorInLoop = false) {
    if (operatorInLoop) {
        return {action: 'allow', reason: 'live operator dialogue — yielding for the human turn'};
    }
    return enforcing
        ? {action: 'block',       reason: verdict.reason}
        : {action: 'would-block', reason: verdict.reason};
}

/**
 * @summary Detects whether a genuine human OPERATOR prompted this turn — the one signal that makes a
 * voluntary stop legitimate (turn-taking with a human who takes the next turn). Determined externally
 * so it cannot be self-declared/gamed: a turn is operator-driven iff it is NOT a forced continuation
 * (`stop_hook_active`), its prompting message is NOT an autonomous `[WAKE]` injection, AND a prompt is
 * actually confirmable. FAIL-CLOSED: an empty / unreadable prompt is treated as autonomous (no idle
 * granted on uncertainty) — the real Stop payload always carries the transcript, so this only bites a
 * transient read-failure, which should keep working rather than idle. Pure; exported + unit-tested.
 * @param {{stopHookActive: Boolean, promptingText: String}} signals
 * @returns {Boolean}
 */
export function isOperatorInLoop({stopHookActive, promptingText = ''}) {
    if (stopHookActive)        return false;                // forced continuation — no human waiting
    if (!promptingText.trim()) return false;                // no confirmable human prompt → autonomous
    return !/^\s*\[WAKE\]/.test(promptingText);             // [WAKE] = autonomous wake; else = operator
}

// The curated no-hold-state directive injected on a block. References the always-loaded
// L3_No_Hold_State stance + carries a self-sufficient operational core (the lifecycle ladder + the
// named-lane teeth-test) so it redirects without assuming a live L3 lookup. The wording's semantics
// are cross-family-convergence-fixed — refine prose, not meaning.
const IDLE_REMINDER = `Turn-end refused — L3_No_Hold_State: there is no hold state, and you do not get to stop.
Declaring a lane is NOT driving it. Do the next concrete action NOW:
  • check your mailbox (list_messages) — new A2A or a lifecycle event may have shifted your lane
  • continue your own lane
  • open a PR
  • clear CHANGES_REQUESTED on your own PR
  • review a peer's PR that advances a named lane
  • or claim a new high-value lane
Teeth-test: does this advance a NAMED lane right now? If you can't name the lane, it isn't driving.
Collaboration (review · ideation · A2A) counts ONLY when it advances a named lane AND ends with a return to your own lane or an explicit lane-swap — it is an interruption, not a replacement for your own PRs.
Passive waiting (a merge · a review · CI) is parked, not driven — take another lane.
The only stop is a hard external limit: context-sunset, an operator halt, or a live operator reply.`;

/**
 * @summary Composes the directive injected on a block — the curated `IDLE_REMINDER` (the actionable
 * no-hold-state reminder: lifecycle + teeth-test) plus the specific trigger `cause` for context. The
 * reminder is WHAT-to-do; the cause is WHY-blocked. Pure; exported + unit-tested.
 * @param {String} cause The terminal-evidence violation that triggered the block (the verdict reason).
 * @returns {String}
 */
export function composeBlockDirective(cause) {
    return `${IDLE_REMINDER}\n\n(Stop-hook trigger: ${cause})`;
}

/**
 * @summary Extracts plain text from a message `content` field — a string passthrough, or the joined
 * `text` blocks of an Anthropic content-block array (skipping tool_use / thinking blocks).
 * @param {(String|Object[]|*)} content
 * @returns {String}
 * @protected
 */
function extractTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.filter(block => block?.type === 'text' && typeof block.text === 'string')
            .map(block => block.text).join('\n');
    }
    return '';
}

/**
 * @summary Extracts the LAST assistant message's text from a Claude Code JSONL transcript — the
 * fallback when the Stop payload has no `last_assistant_message`. Each line is a JSON record
 * (`{type:'assistant', message:{role, content}}`); raw JSONL is JSON-escaped, so the fence parser
 * MUST run on this EXTRACTED text, never a raw line. Tolerant of malformed lines (skipped); returns
 * the most recent assistant record that carries text (skipping tool_use / thinking-only records).
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastAssistantTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const message = record.message || record;
        if ((message.role || record.type) !== 'assistant') continue;

        const text = extractTextFromContent(message.content);
        if (text) return text;
    }
    return '';
}

/**
 * @summary Extracts the LAST user message's text from a Claude Code JSONL transcript — the message
 * that PROMPTED the current turn. Used to classify the prompt as a genuine operator turn vs an
 * autonomous `[WAKE]` injection. Skips tool_result records (no text blocks); tolerant of malformed
 * lines. Mirrors {@link extractLastAssistantTextFromJsonl}.
 * @param {String} jsonl
 * @returns {String}
 * @protected
 */
export function extractLastUserTextFromJsonl(jsonl = '') {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let record;
        try { record = JSON.parse(line); } catch { continue; }

        const message = record.message || record;
        if ((message.role || record.type) !== 'user') continue;

        const text = extractTextFromContent(message.content);
        if (text) return text;
    }
    return '';
}

/**
 * @summary Resolves the agent's FINAL assistant message text — the surface the lane-state block is
 * emitted into. Prefers the Stop payload's `last_assistant_message` (already-decoded; a string or a
 * message object); falls back to JSONL-parsing `transcript_path` for the last assistant text. Raw
 * JSONL is escaped, so the fence parser only ever runs on this extracted text, never a raw line.
 * @param {Object} input The Stop-hook JSON payload.
 * @returns {String}
 * @protected
 */
export function extractFinalAssistantText(input = {}) {
    const last = input.last_assistant_message;
    if (typeof last === 'string' && last.trim()) return last;
    if (last && typeof last === 'object') {
        const text = extractTextFromContent(last.content ?? last.message?.content);
        if (text) return text;
    }
    if (!input.transcript_path) return '';
    return extractLastAssistantTextFromJsonl(fs.readFileSync(input.transcript_path, 'utf8'));
}

/**
 * @summary Hook entry. Resolves the Stop-hook payload → final message + prompting message →
 * operator-in-loop check → verdict → decideHookAction, then blocks+injects (enforcing) or audit-logs
 * the decision. Always exits 0 on any of OUR OWN failures (bad payload, unreadable transcript,
 * validator throw) — a hook bug must never trap a turn-end.
 * @protected
 */
async function main() {
    let input;
    try {
        input = JSON.parse(await readStdin());
    } catch (e) {
        auditLog(`PARSE-ERROR: could not parse Stop-hook input (${e.message}); allowing stop.`);
        process.exit(0);
    }

    // Resolve the agent's FINAL message text (last_assistant_message, or JSONL-extracted from the
    // transcript) — NOT the raw transcript: raw Claude JSONL is JSON-escaped, so the fence parser
    // only matches extracted text (the runtime input boundary a cross-family review caught).
    let finalText = '';
    try {
        finalText = extractFinalAssistantText(input);
    } catch (e) {
        // OUR failure (unreadable / unparseable transcript) → never block; allow + audit.
        auditLog(`READ-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    // The ONE legitimate voluntary stop is a live operator dialogue — determined EXTERNALLY (the
    // prompting message type), never self-declared. A `stop_hook_active` forced continuation OR a
    // `[WAKE]` autonomous prompt is not a human turn → no voluntary stop. A transcript read-failure
    // here is OUR failure → fall back to the stop_hook_active signal alone (never trap on a read error).
    let promptingText = '';
    try {
        if (input.transcript_path) {
            promptingText = extractLastUserTextFromJsonl(fs.readFileSync(input.transcript_path, 'utf8'));
        }
    } catch (e) {
        // best-effort; isOperatorInLoop falls back to stop_hook_active when promptingText is empty
    }
    const operatorInLoop = isOperatorInLoop({stopHookActive: !!input.stop_hook_active, promptingText});

    // parseLaneState throwing is a MALFORMED emission (the agent's garbage), NOT our failure → it
    // feeds the verdict (a real block-able bucket), distinct from an absent emission (null).
    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(finalText);
    } catch (e) {
        parseError = e;
    }

    let verdict;
    try {
        verdict = parseOutcomeToVerdict({descriptor, parseError}, validateLaneStateTerminal);
    } catch (e) {
        // A validator/mapping bug is OUR failure → never block; allow + audit.
        auditLog(`VALIDATOR-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    const session          = input.session_id || '?',
          {action, reason} = decideHookAction(verdict, ENFORCING, operatorInLoop);

    if (action === 'block') {
        auditLog(`BLOCK (session=${session}): ${reason}`);
        // Block the stop + inject the curated no-hold-state directive — Claude uses the injected
        // `reason` as its next instruction; the audit log keeps the terse trigger cause.
        // Exit only AFTER stdout drains so the decision JSON is never truncated on a pipe.
        const directive = composeBlockDirective(reason);
        process.stdout.write(JSON.stringify({decision: 'block', reason: directive}), () => process.exit(0));
        return;
    }

    auditLog(`${action === 'would-block' ? 'WOULD-BLOCK' : 'ALLOW'} (session=${session}): ${reason}`);
    process.exit(0);
}

// Process-entry only: run main() when invoked as the hook (never on import, so unit tests can import
// the pure `parseOutcomeToVerdict` / `decideHookAction` without triggering the stdin read).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
