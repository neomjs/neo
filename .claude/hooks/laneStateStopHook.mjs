#!/usr/bin/env node
/**
 * @module .claude/hooks/laneStateStopHook
 * @summary Claude Code `Stop` hook for idle-out enforcement — DRY-RUN (log-only) by default.
 *
 * Fires at every agent turn-end (the `Stop` event). Reads the turn transcript, extracts the agent's
 * declared lane-state terminal from a fenced ```lane-state block, validates it, and — in ENFORCING
 * mode — blocks the stop + injects a "pick a lane" directive when the terminal is an invalid idle-out.
 * In DRY-RUN mode (default) it only LOGS what it WOULD block, so the swarm can audit for false-
 * positives (e.g. a legitimate all-lanes-handed-off terminal — the handoff-terminal AC) before
 * enforcement is on.
 *
 * Mechanism (docs-grounded; the Option-A convergence):
 *  - `stop_hook_active` loop-guard: if Claude is already in a forced continuation, allow the stop
 *    (Claude Code also force-overrides after 8 consecutive blocks).
 *  - `transcript_path` → final text → `parseLaneState` → one of three buckets:
 *      null (no block emitted → ABSENT) · throw (block present but malformed JSON → MALFORMED) ·
 *      descriptor → `validateLaneStateTerminal` → {valid, violations}. All non-valid buckets are
 *      idle-out failures with distinct reasons; a valid terminal allows.
 *  - Block path (ENFORCING): write `{"decision":"block","reason":"…"}` to stdout — Claude keeps
 *    working and uses the `reason` as its next instruction.
 *
 * SAFETY — this hook MUST NEVER block a turn-end on its OWN failure (a malformed hook payload, an
 * unreadable transcript, a validator throw). Those allow the stop + audit. A *malformed lane-state
 * emission* (parseLaneState throws) is NOT our failure — it's the agent emitting garbage, a real
 * block-able bucket. So a hook bug can never trap the swarm, but a broken emission still counts.
 *
 * ACTIVATION = operator-authority: this script is INERT until wired into the harness settings
 * (`.claude/settings.*` — gitignored per-clone). Wire it in DRY-RUN first, audit the WOULD-BLOCK
 * log for handoff false-positives, then set `NEO_LANE_STATE_ENFORCE=1` to enforce. A buggy blocking
 * hook would trap every agent's turn-end, so the dry-run → audit → enforce ramp is the safe rollout.
 *
 * SEAM: `parseLaneState` (transcript → descriptor | null | throws) + `validateLaneStateTerminal`
 * (descriptor → {valid, violations}) are imported from `ai/scripts/lifecycle/` — pure, zero-dependency
 * modules so this hook stays light on every turn-end. The pure `parseOutcomeToVerdict` (3 buckets →
 * verdict) + `decideHookAction` (verdict + enforcing → action) are exported + unit-tested independently.
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

// Append-only dry-run audit log — the substrate for auditing WOULD-BLOCK false-positives (esp. the
// handoff-terminal AC) before enforcement. NEO_AI_DAEMON_DIR override keeps tests off the real store.
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
 * @summary Pure decision — maps a terminal `verdict` + whether we're `enforcing` to the Stop-hook
 * action. Exported + unit-tested: the heart of the idle-out mechanism — a non-valid terminal blocks
 * (enforcing) or would-block (dry-run); a valid terminal always allows (so a legitimate handoff is
 * never trapped, even when enforcing).
 * @param {{valid: Boolean, reason: String}} verdict
 * @param {Boolean} enforcing
 * @returns {{action: ('allow'|'block'|'would-block'), reason: String}}
 */
export function decideHookAction(verdict, enforcing) {
    if (verdict.valid) return {action: 'allow',       reason: verdict.reason};
    if (enforcing)     return {action: 'block',       reason: verdict.reason};
    return             {action: 'would-block', reason: verdict.reason};
}

/**
 * @summary Hook entry. Resolves the Stop-hook payload → loop-guard → transcript → parse outcome →
 * verdict → decideHookAction, then blocks+injects (enforcing) or audit-logs the would-be decision.
 * Always exits 0 on any of OUR OWN failures (bad payload, unreadable transcript, validator throw) — a
 * hook bug must never trap a turn-end. A malformed *emission* still counts (that's the agent's, not ours).
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

    // Loop-safety: if Claude is already in a forced continuation from a prior block, allow the stop.
    if (input.stop_hook_active) {
        process.exit(0);
    }

    let transcript = '';
    try {
        transcript = input.transcript_path ? fs.readFileSync(input.transcript_path, 'utf8') : '';
    } catch (e) {
        // OUR failure (unreadable transcript) → never block; allow + audit.
        auditLog(`READ-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    // parseLaneState throwing is a MALFORMED emission (the agent's garbage), NOT our failure → it
    // feeds the verdict (a real block-able bucket), distinct from an absent emission (null).
    let descriptor = null, parseError = null;
    try {
        descriptor = parseLaneState(transcript);
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
          {action, reason} = decideHookAction(verdict, ENFORCING);

    if (action === 'block') {
        auditLog(`BLOCK (session=${session}): ${reason}`);
        // Block the stop + inject the directive — Claude uses `reason` as its next instruction.
        // Exit only AFTER stdout drains so the decision JSON is never truncated on a pipe.
        process.stdout.write(JSON.stringify({decision: 'block', reason}), () => process.exit(0));
        return;
    }

    auditLog(`${action === 'would-block' ? 'WOULD-BLOCK' : 'WOULD-ALLOW'} (session=${session}): ${reason}`);
    process.exit(0);
}

// Process-entry only: run main() when invoked as the hook (never on import, so unit tests can import
// the pure `parseOutcomeToVerdict` / `decideHookAction` without triggering the stdin read).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
