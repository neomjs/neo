#!/usr/bin/env node
import fs          from 'node:fs';
import os          from 'node:os';
import path        from 'node:path';
import {spawnSync} from 'node:child_process';

/**
 * @summary Kimi Code `SessionStart` hook: refreshes the seat's wake envelope with the exact
 * session authority the Neo wake daemon's `kimi-server` adapter delivers into.
 *
 * The Kimi hook contract passes `{hook_event_name, session_id, cwd}` on stdin for every event
 * (official hook reference). This writer maps that payload onto the wake-envelope contract:
 * `~/.kimi-code/wake-envelope.json` (mode 0600) carrying `{sessionId, cwd, pid, updatedAt}` —
 * `pid` is the hook's parent process (the interactive TUI itself), the owner-process epoch the
 * `kimi-pull-bridge` adapter validates liveness against before queueing a wake for the seat.
 * The wake daemon re-reads the envelope on every delivery, so session rotation (startup/resume)
 * needs no graph write and a wake can never be steered into a heuristic "latest" session —
 * the envelope is the session authority, not the session index.
 *
 * Fail-open by design: hook errors must never disturb the seat's session (Kimi fail-open
 * discipline mirrors the writer's). A malformed payload or unwritable path exits 0 silently.
 *
 * Seat wiring (`~/.kimi-code/config.toml`, seat-local, never committed):
 * ```toml
 * [[hooks]]
 * event   = "SessionStart"
 * command = "node .kimi-code/hooks/wakeEnvelopeHook.mjs"
 * timeout = 5
 * ```
 *
 * Sibling of `.claude/hooks/turnPresenceHook.mjs` and `.codex/hooks/codex-context.mjs` —
 * same adapter contract shape: stdin JSON in, bounded local write, no Neo singleton imports.
 *
 * Home resolution: `KIMI_CODE_HOME` when set (Fleet-launched seats run with an isolated harness
 * home, and the envelope must land beside the seat's own `server/instances` coordinates), else
 * the ambient `~/.kimi-code` (interactive seats).
 */
const KIMI_HOME     = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
const ENVELOPE_PATH = path.join(KIMI_HOME, 'wake-envelope.json');
const CHECKOUT_ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * @summary Reads the seat's agent identity for the envelope's owner-identity leg: first from the
 * process env, then from the checkout's `.env` (the fleet seat config provisions it there).
 * @returns {String|null}
 */
function readAgentIdentity() {
    if (process.env.NEO_AGENT_IDENTITY) return process.env.NEO_AGENT_IDENTITY;

    try {
        const match = fs.readFileSync(path.join(CHECKOUT_ROOT, '.env'), 'utf8').match(/^NEO_AGENT_IDENTITY=(.+)$/m);
        return match ? match[1].trim() : null
    } catch {
        return null
    }
}

/**
 * @summary Reads the parent process's start time via `ps lstart` — the reuse-safe half of the
 * owner-process epoch: a dead pid whose number was reassigned fails the start-time comparison.
 * @param {Number} pid
 * @returns {String|null}
 */
function readProcessStartTime(pid) {
    try {
        const out = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']).stdout?.toString().trim();
        return out || null
    } catch {
        return null
    }
}

let input = '';

process.stdin.on('data', chunk => { input += chunk });

process.stdin.on('end', () => {
    try {
        const payload                      = JSON.parse(input),
              {session_id: sessionId, cwd} = payload || {};

        if (typeof sessionId === 'string' && sessionId.length > 0 && typeof cwd === 'string' && cwd.length > 0) {
            fs.writeFileSync(
                ENVELOPE_PATH,
                JSON.stringify({
                    sessionId,
                    cwd,
                    pid          : process.ppid,
                    pidStartedAt : readProcessStartTime(process.ppid),
                    agentIdentity: readAgentIdentity(),
                    updatedAt    : new Date().toISOString()
                }, null, 2),
                {mode: 0o600}
            );
        }
    } catch {
        // Fail-open: a malformed payload or write failure must never disturb the session.
    }

    process.exit(0);
});
