/**
 * @summary Cross-adapter harness-process lifecycle primitive (PID tracking + termination).
 *
 * Owns the per-identity state-file format and termination logic so that all
 * `resumeHarness.mjs` adapter branches (claude-cli, antigravity-cli, future
 * codex-cli) consume a single primitive rather than duplicating cleanup logic.
 *
 * Restart recovery spawns a fresh process for the recovering identity. Without
 * cleanup of the prior harness instance, repeated sunsets can accumulate stale
 * processes and orphan windows. This module pairs with the in-flight lock:
 * the lock prevents overlapping starts, while this primitive cleans up the
 * previous process before the next adapter dispatch.
 *
 * @see ai/scripts/lifecycle/inflightLock.mjs (sibling per-identity primitive)
 * @see ai/scripts/lifecycle/resumeHarness.mjs (consumer)
 */
import fs   from 'fs/promises';
import path from 'path';

function sanitize(identity) {
    return identity.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * @summary Build the absolute state-file path for an identity.
 * Exposed for spec cleanup; runtime consumers should use record/terminate APIs.
 * @param {String} identity Agent identity.
 * @param {Object} options
 * @param {String} options.stateDir Resolved harness-state member.
 * @returns {String} Absolute state-file path.
 */
export function getStateFilePath(identity, {stateDir}={}) {
    if (!stateDir) {
        throw new Error('harnessLifecycle: harness-state directory must be injected by the composing entrypoint')
    }

    return path.join(stateDir, `${sanitize(identity)}.json`)
}

/**
 * @summary Persist the spawned harness PID for the identity.
 *
 * Called by `resumeHarness.mjs` immediately after `child_process.spawn` returns
 * a process handle. The recorded PID is what the NEXT `resumeHarness` invocation
 * will SIGTERM during cleanup.
 *
 * @param {string} identity        Agent identity (e.g. '@neo-opus-ada').
 * @param {number} pid             Spawned process PID.
 * @param {number} [spawnedAt]     Spawn timestamp (defaults to Date.now()).
 * @param {Object} options
 * @param {String} options.stateDir Resolved harness-state member.
 * @returns {Promise<void>}
 */
export async function recordHarnessProcess(identity, pid, spawnedAt = Date.now(), {stateDir}={}) {
    const filePath = getStateFilePath(identity, {stateDir});

    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ pid, spawnedAt }), 'utf-8');
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
 * @param {Object} [options]
 * @param {Number} [options.graceMs=2000] SIGTERM grace period before SIGKILL probe.
 * @param {String} options.stateDir Resolved harness-state member.
 * @returns {Promise<{terminated: boolean, pid: number|undefined, reason: string|undefined, escalated: string|undefined}>}
 */
export async function terminatePreviousHarness(identity, {graceMs = 2000, stateDir} = {}) {
    const file = getStateFilePath(identity, {stateDir});
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
