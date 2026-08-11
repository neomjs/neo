/**
 * @plane in-plane
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeGateState } from './wakeSafetyGate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BOOT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_ABANDONED_ACTIONS = 3;

/**
 * @summary Build the absolute in-flight lock-file path for one identity/mode pair.
 * @param {string} mode Recovery action mode.
 * @param {string} identity Agent identity.
 * @returns {string} Absolute lock-file path.
 */
export function getLockPath(mode, identity) {
    const cleanIdentity = identity.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.resolve(__dirname, `../../../.neo-ai-data/wake-daemon/inflight-${mode}-${cleanIdentity}.txt`);
}

/**
 * @summary Resolve whether a recovery action is already in flight, abandoned, or cleared.
 *
 * Fresh AGENT_MEMORY newer than the lock timestamp proves the target agent
 * responded after dispatch, so the lock is cleared. Locks older than
 * BOOT_TIMEOUT_MS are treated as abandoned; repeated abandonment trips the wake
 * safety gate after MAX_ABANDONED_ACTIONS.
 *
 * @param {string} identity Agent identity.
 * @param {string} mode Recovery mode, usually `sunset_restart` or `idle_out_nudge`.
 * @param {number} latestMemoryTimestampMs Timestamp of the latest AGENT_MEMORY for this identity.
 * @returns {Promise<{inFlight: boolean, abandoned: boolean, abandonedCount: number}>} `abandonedCount` only present when abandoned.
 */
export async function checkInflightLock(identity, mode, latestMemoryTimestampMs) {
    const lockPath = getLockPath(mode, identity);

    try {
        const content = await fs.readFile(lockPath, 'utf8');
        const lockData = JSON.parse(content);

        if (latestMemoryTimestampMs > lockData.timestamp) {
            // Fresh memory proves the target agent responded after this lock was written.
            await fs.unlink(lockPath);
            return { inFlight: false, abandoned: false };
        }

        const ageMs = Date.now() - lockData.timestamp;
        if (ageMs > BOOT_TIMEOUT_MS) {
            // Abandoned action
            const newAbandonedCount = (lockData.abandonedCount || 0) + 1;

            if (newAbandonedCount >= MAX_ABANDONED_ACTIONS) {
                // Trip the safety gate after repeated abandoned wake actions.
                await writeGateState({
                    state: 'tripped',
                    reason: `${newAbandonedCount} consecutive abandoned actions for ${mode} on ${identity}`,
                    trippedBy: 'inflight-lock-monitor'
                });
                // Let callers continue; the safety gate blocks the next recovery action.
                return { inFlight: false, abandoned: true };
            }

            // Allow the caller to retry; the next write carries the incremented
            // abandoned count into the replacement lock.
            return { inFlight: false, abandoned: true, abandonedCount: newAbandonedCount };
        }

        return { inFlight: true, abandoned: false };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { inFlight: false, abandoned: false };
        }
        // Non-parseable lock files should not pin recovery forever.
        return { inFlight: false, abandoned: false };
    }
}

/**
 * @summary Write an in-flight lock before invoking a recovery action.
 * @param {string} identity Agent identity.
 * @param {string} mode Recovery action mode.
 * @param {number} [abandonedCount=0] Prior abandoned-action count to carry forward.
 * @returns {Promise<void>}
 */
export async function writeInflightLock(identity, mode, abandonedCount = 0) {
    const lockPath = getLockPath(mode, identity);
    const lockData = {
        timestamp: Date.now(),
        lockId: Math.random().toString(36).slice(2),
        abandonedCount
    };
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2));
}

/**
 * @summary Clear an in-flight lock outside the implicit freshness check.
 * @param {string} identity Agent identity.
 * @param {string} mode Recovery action mode.
 * @returns {Promise<void>}
 */
export async function clearInflightLock(identity, mode) {
    const lockPath = getLockPath(mode, identity);
    try {
        await fs.unlink(lockPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
