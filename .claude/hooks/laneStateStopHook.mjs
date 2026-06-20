#!/usr/bin/env node
/**
 * @module .claude/hooks/laneStateStopHook
 * @summary Claude Code `Stop` hook for idle-out enforcement — DRY-RUN (log-only) by default.
 *
 * Fires at every agent turn-end (the `Stop` event). Reads the turn transcript, extracts the agent's
 * declared lane-state terminal, validates it, and — in ENFORCING mode — blocks the stop + injects a
 * "pick a lane" directive when the terminal is an invalid idle-out. In DRY-RUN mode (default) it only
 * LOGS what it WOULD block, so the swarm can audit for false-positives (e.g. a legitimate
 * all-lanes-handed-off / async-blocked terminal — the handoff-terminal AC) BEFORE enforcement is on.
 *
 * Mechanism (docs-grounded; the Option-A convergence):
 *  - `stop_hook_active` loop-guard: if Claude is already in a forced continuation, allow the stop
 *    (Claude Code also force-overrides after 8 consecutive blocks).
 *  - `transcript_path`: the turn transcript, parsed for the structured lane-state descriptor.
 *  - Block path (ENFORCING): write `{"decision":"block","reason":"…"}` to stdout — Claude keeps
 *    working and uses the `reason` as its next instruction.
 *
 * SAFETY — this hook MUST NEVER block a turn-end on its OWN failure (a malformed payload, an
 * unreadable transcript, a parser throw). Every internal error path allows the stop + audits, so a
 * hook bug can never trap every agent in the harness.
 *
 * ACTIVATION = operator-authority: this script is INERT until wired into the harness settings
 * (`.claude/settings.*` — gitignored per-clone). Wire it in DRY-RUN first, audit the WOULD-BLOCK
 * log for handoff false-positives, then set `NEO_LANE_STATE_ENFORCE=1` to enforce. A buggy blocking
 * hook would trap every agent's turn-end, so the dry-run → audit → enforce ramp is the safe rollout.
 *
 * SEAM (pending the lane-state-terminal module — the validator + the emission-convention parser):
 * `parseLaneState` + `validateLaneStateTerminal` are stubbed here (the stub always ALLOWS, so a
 * dry-run with stubs is a pure no-op that exercises the I/O + logging path). They drop in unchanged
 * once that module lands. The pure `decideHookAction` decision is exported + unit-tested independently.
 *
 * @see https://code.claude.com/docs/en/hooks — Stop hook contract (stdin payload, decision:block)
 */
import fs              from 'node:fs';
import path            from 'node:path';
import os              from 'node:os';
import {pathToFileURL} from 'node:url';

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

// ---- SEAM (stubbed pending the lane-state-terminal module: parser + validator) -------------------
/**
 * @summary STUB — extract the structured lane-state descriptor from the turn transcript. Replaced by
 * the emission-convention-aware parser. Until then returns null → the validator stub ALLOWS, so the
 * dry-run is a pure no-op (never a false WOULD-BLOCK on stubbed logic).
 * @param {String} _transcript
 * @returns {Object|null}
 * @protected
 */
function parseLaneState(_transcript) {
    return null; // STUB — the emission-convention parser drops in here
}

/**
 * @summary STUB — validate a lane-state terminal descriptor. Replaced by the real
 * `validateLaneStateTerminal` validator. The stub treats every terminal as valid (never blocks) so
 * the scaffold is a safe no-op until the real validator (which MUST admit the all-lanes-handed-off
 * terminal) lands.
 * @param {Object|null} _descriptor
 * @returns {{valid: Boolean, reason: String}}
 * @protected
 */
function validateLaneStateTerminal(_descriptor) {
    return {valid: true, reason: 'stub: lane-state validator not yet wired'};
}
// ---- end SEAM ------------------------------------------------------------------------------------

/**
 * @summary Pure decision — maps a terminal `verdict` + whether we're `enforcing` to the Stop-hook
 * action. Exported + unit-tested independently of the I/O + the (stubbed) validator: this is the
 * heart of the idle-out mechanism — an invalid terminal blocks (enforcing) or would-block (dry-run);
 * a valid terminal always allows (so a legitimate handoff is never trapped, even when enforcing).
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
 * @summary Hook entry. Resolves the Stop-hook payload → loop-guard → transcript → verdict →
 * decideHookAction, then blocks+injects (enforcing) or audit-logs the would-be decision. Always
 * exits 0 on any internal failure (the hook must never trap a turn-end on its own bug).
 * @protected
 */
async function main() {
    let input;
    try {
        input = JSON.parse(await readStdin());
    } catch (e) {
        // Malformed hook payload → NEVER block; allow + audit.
        auditLog(`PARSE-ERROR: could not parse Stop-hook input (${e.message}); allowing stop.`);
        process.exit(0);
    }

    // Loop-safety: if Claude is already in a forced continuation from a prior block, allow the stop.
    if (input.stop_hook_active) {
        process.exit(0);
    }

    let descriptor = null;
    try {
        const transcript = input.transcript_path ? fs.readFileSync(input.transcript_path, 'utf8') : '';
        descriptor = parseLaneState(transcript);
    } catch (e) {
        // Could not read/parse the transcript → never block on our OWN failure; allow + audit.
        auditLog(`READ-ERROR: ${e.message}; allowing stop.`);
        process.exit(0);
    }

    const verdict          = validateLaneStateTerminal(descriptor),
          session          = input.session_id || '?',
          {action, reason} = decideHookAction(verdict, ENFORCING);

    if (action === 'block') {
        auditLog(`BLOCK (session=${session}): ${reason}`);
        // Block the stop + inject the directive — Claude uses `reason` as its next instruction.
        process.stdout.write(JSON.stringify({decision: 'block', reason}));
        process.exit(0);
    }

    auditLog(`${action === 'would-block' ? 'WOULD-BLOCK' : 'WOULD-ALLOW'} (session=${session}): ${reason}`);
    process.exit(0);
}

// Process-entry only: run main() when invoked as the hook (never on import, so unit tests can import
// `decideHookAction` without triggering the stdin read).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
