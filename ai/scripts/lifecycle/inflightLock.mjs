import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeGateState } from './wakeSafetyGate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BOOT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_ABANDONED_ACTIONS = 3;

/**
 * Returns the path to the lock file.
 */
export function getLockPath(mode, identity) {
    const cleanIdentity = identity.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.resolve(__dirname, `../../../.neo-ai-data/wake-daemon/inflight-${mode}-${cleanIdentity}.txt`);
}

/**
 * Check if the lock is active, abandoned, or cleared.
 * If cleared by fresh memory, deletes the lock file.
 * If abandoned >= N times, auto-trips the wake safety gate.
 *
 * @param {string} identity The agent identity
 * @param {string} mode 'sunset_restart' or 'idle_out_nudge'
 * @param {number} latestMemoryTimestampMs The timestamp of the latest AGENT_MEMORY for this identity
 * @returns {Promise<{inFlight: boolean, abandoned: boolean}>}
 */
export async function checkInflightLock(identity, mode, latestMemoryTimestampMs) {
    const lockPath = getLockPath(mode, identity);

    try {
        const content = await fs.readFile(lockPath, 'utf8');
        const lockData = JSON.parse(content);

        if (latestMemoryTimestampMs > lockData.timestamp) {
            // Memory is newer than lock! The agent successfully booted/responded.
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
                return { inFlight: false, abandoned: true }; // Let action proceed (it will be blocked by safety gate anyway)
            }

            // Rewrite lock to reset timestamp and increment abandoned count?
            // "allow next interval to retry" -> so we return inFlight: false, abandoned: true
            // Then the caller can try again, which will call `writeInflightLock` with the new count.
            return { inFlight: false, abandoned: true, abandonedCount: newAbandonedCount };
        }

        return { inFlight: true, abandoned: false };
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { inFlight: false, abandoned: false };
        }
        // If unparseable, assume no lock to recover safely
        return { inFlight: false, abandoned: false };
    }
}

/**
 * Write the inflight lock before invoking an action.
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
 * Explicitly clear a lock if needed outside of the implicit check.
 */
export async function clearInflightLock(identity, mode) {
    const lockPath = getLockPath(mode, identity);
    try {
        await fs.unlink(lockPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
