#!/usr/bin/env node
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';

/**
 * @summary Kimi Code `SessionStart` hook: refreshes the seat's wake envelope with the exact
 * session authority the Neo wake daemon's `kimi-server` adapter delivers into.
 *
 * The Kimi hook contract passes `{hook_event_name, session_id, cwd}` on stdin for every event
 * (official hook reference). This writer maps that payload onto the wake-envelope contract:
 * `~/.kimi-code/wake-envelope.json` (mode 0600) carrying `{sessionId, cwd, updatedAt}`. The
 * wake daemon re-reads the envelope on every delivery, so session rotation (startup/resume)
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

let input = '';

process.stdin.on('data', chunk => { input += chunk });

process.stdin.on('end', () => {
    try {
        const payload                      = JSON.parse(input),
              {session_id: sessionId, cwd} = payload || {};

        if (typeof sessionId === 'string' && sessionId.length > 0 && typeof cwd === 'string' && cwd.length > 0) {
            fs.writeFileSync(
                ENVELOPE_PATH,
                JSON.stringify({sessionId, cwd, updatedAt: new Date().toISOString()}, null, 2),
                {mode: 0o600}
            );
        }
    } catch {
        // Fail-open: a malformed payload or write failure must never disturb the session.
    }

    process.exit(0);
});
