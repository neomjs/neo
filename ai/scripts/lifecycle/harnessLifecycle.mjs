/**
 * @summary Cross-adapter harness-process lifecycle primitive (PID tracking + termination).
 *
 * Owns the per-identity state-file format and termination logic for all
 * `resumeHarness.mjs` adapter branches.
 *
 * Harness restart spawns a fresh process for the recovering identity. Reaping
 * the prior recorded process prevents repeated sunsets from accumulating stale
 * processes and orphan windows.
 *
 * `inflightLock.mjs` is the start-of-action single-flight guard; this module
 * is the end-of-action process reap before the next harness process starts.
 *
 * @see learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md
 * @see ai/scripts/lifecycle/inflightLock.mjs (sibling per-identity primitive)
 * @see ai/scripts/lifecycle/resumeHarness.mjs (consumer)
 */
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '../../../.neo-ai-data/harness-state');

function sanitize(identity) {
    return identity.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * @summary Build the absolute state-file path for an identity.
 * Test cleanup uses this path; production consumers should use record/terminate APIs.
 */
export function getStateFilePath(identity) {
    return path.join(STATE_DIR, `${sanitize(identity)}.json`);
}

/**
 * @summary Persist the spawned harness PID for the identity.
 *
 * Called by `resumeHarness.mjs` immediately after `child_process.spawn` returns
 * a process handle. The next `resumeHarness` invocation terminates the recorded
 * PID during cleanup.
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
 * Called by `resumeHarness.mjs` before adapter dispatch so the prior process is
 * reaped before the fresh process spawns. Sends SIGTERM, waits for the grace
 * period, then probes before escalating to SIGKILL.
 *
 * Fail-safe outcomes:
 * - Missing state file: `{terminated: false, reason: 'no-prior-state'}`
 * - ESRCH: `{terminated: false, reason: 'already-dead'}`
 * - Other kill error: `{terminated: false, reason: <error message>}`
 *
 * @param {string} identity        Agent identity.
 * @param {object} [opts]
 * @param {number} [opts.graceMs=2000] SIGTERM grace period before SIGKILL probe.
 * @returns {Promise<{terminated: boolean, pid: number|undefined, reason: string|undefined, escalated: string|undefined}>}
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
            try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
            return { terminated: false, reason: 'already-dead' };
        }
        return { terminated: false, reason: e.message };
    }

    await new Promise(resolve => setTimeout(resolve, graceMs));

    // `process.kill(pid, 0)` throws ESRCH when the process is dead.
    let stillAlive = false;
    try {
        process.kill(prev.pid, 0);
        stillAlive = true;
    } catch (_) {
        // SIGTERM succeeded during the grace period.
    }

    if (stillAlive) {
        try { process.kill(prev.pid, 'SIGKILL'); } catch (_) { /* race-tolerant */ }
        try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
        return { terminated: true, pid: prev.pid, escalated: 'SIGKILL' };
    }

    try { await fs.unlink(file); } catch (_) { /* race-tolerant */ }
    return { terminated: true, pid: prev.pid };
}
