/**
 * @summary Cross-adapter harness-process lifecycle primitive (PID tracking + termination).
 *
 * Owns the per-identity state-file format and termination logic so that all
 * `resumeHarness.mjs` adapter branches (claude-cli, antigravity-cli, future
 * codex-cli) consume a single primitive rather than duplicating cleanup logic.
 *
 * Substrate-truth: harness restart spawns a fresh process for the recovering
 * identity. Without cleanup of the prior harness instance, repeated sunsets
 * accumulate stale processes and orphan windows. The OLD osascript Cmd+N
 * adapter (#10611 PR-B legacy fallback) didn't have this surface because
 * Cmd+N spawned a new chat WITHIN the same app instance; the new CLI-based
 * adapters create distinct processes and DO need explicit cleanup.
 *
 * Per `learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md`, the
 * acute containment for runaway-spawn was the in-flight lock primitive
 * (`inflightLock.mjs`, #10683) — single-flight per identity at the START
 * of an action. This module is the dual: cleanup at the END of the
 * previous action's process when starting the next one.
 *
 * @see ai/scripts/inflightLock.mjs (sibling per-identity primitive)
 * @see ai/scripts/resumeHarness.mjs (consumer)
 * @see #10696 — in-PR cleanup per @neo-gemini-3-1-pro review point 2
 */
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '../../.neo-ai-data/harness-state');

function sanitize(identity) {
    return identity.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * @summary Build the absolute state-file path for an identity.
 * Exposed for spec reach-in cleanup; consumers should use record/terminate APIs.
 */
export function getStateFilePath(identity) {
    return path.join(STATE_DIR, `${sanitize(identity)}.json`);
}

/**
 * @summary Persist the spawned harness PID for the identity.
 *
 * Called by `resumeHarness.mjs` immediately after `child_process.spawn` returns
 * a process handle. The recorded PID is what the NEXT `resumeHarness` invocation
 * will SIGTERM during cleanup.
 *
 * @param {string} identity        Agent identity (e.g. '@neo-opus-4-7').
 * @param {number} pid             Spawned process PID.
 * @param {number} [spawnedAt]     Spawn timestamp (defaults to Date.now()).
 * @returns {Promise<void>}
 */
export async function recordHarnessProcess(identity, pid, spawnedAt = Date.now()) {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(getStateFilePath(identity), JSON.stringify({ pid, spawnedAt }), 'utf-8');
}

/**
 * @summary Terminate the previously-spawned harness process for the identity.
 *
 * Called by `resumeHarness.mjs` BEFORE the adapter dispatch so the prior
 * process is reaped before the fresh process spawns. SIGTERM with grace
 * period, then SIGKILL probe.
 *
 * Fail-safe behaviors:
 * - No prior state file → `{terminated: false, reason: 'no-prior-state'}` (first-run case)
 * - Process already dead (ESRCH) → `{terminated: false, reason: 'already-dead'}`
 * - Other kill error → `{terminated: false, reason: <error message>}`
 *
 * @param {string} identity        Agent identity.
 * @param {object} [opts]
 * @param {number} [opts.graceMs=2000] SIGTERM grace period before SIGKILL probe.
 * @returns {Promise<{terminated: boolean, pid?: number, reason?: string, escalated?: string}>}
 */
export async function terminatePreviousHarness(identity, { graceMs = 2000 } = {}) {
    const file = getStateFilePath(identity);
    let prev;
    try {
        prev = JSON.parse(await fs.readFile(file, 'utf-8'));
    } catch (e) {
        return { terminated: false, reason: 'no-prior-state' };
    }

    try {
        process.kill(prev.pid, 'SIGTERM');
    } catch (e) {
        if (e.code === 'ESRCH') {
            // Process already gone — clear stale state-file entry and return.
            try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
            return { terminated: false, reason: 'already-dead' };
        }
        return { terminated: false, reason: e.message };
    }

    await new Promise(resolve => setTimeout(resolve, graceMs));

    // Probe: process.kill(pid, 0) throws ESRCH if dead; otherwise process is still alive.
    let stillAlive = false;
    try {
        process.kill(prev.pid, 0);
        stillAlive = true;
    } catch (_) {
        // ESRCH expected if SIGTERM caused exit during grace period.
    }

    if (stillAlive) {
        try { process.kill(prev.pid, 'SIGKILL'); } catch (_) { /* race-tolerant */ }
        try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
        return { terminated: true, pid: prev.pid, escalated: 'SIGKILL' };
    }

    try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
    return { terminated: true, pid: prev.pid };
}
