/**
 * @module ai/daemons/wake/outboxLock
 * @summary Strict cross-process mutex for the wake-outbox append/compact contract.
 *
 * The Memory-WAL append lock is correct for its original boundary — a turn-save must never
 * block, so it reclaims by TTL and eventually writes unlocked. Those semantics are a lost-append
 * generator for a queue: a consumer compacting beyond the TTL gets reclaimed mid-compact, and an
 * acquisition timeout writes without the lock. This lock has **no TTL and no unlocked
 * fall-through**: a live holder is NEVER reclaimed, acquisition retries until `acquireTimeoutMs`
 * and then throws. A holder is reclaimed only when its pid is dead (liveness probe), fenced by a
 * byte-match re-read so a racing successor's fresh lock file is never clobbered.
 *
 * Failure posture by side: the wake daemon's adapter lets the throw surface as a failed attempt
 * (its bounded retry re-queues); the seat consumer catches and skips the pass (its next poll
 * retries). Neither side ever writes without the lock.
 *
 * Pure + fully injectable (fs, clock, liveness probe, sleep) — unit-tested against a real temp dir.
 */

import fs from 'node:fs/promises';

/** Lock-file suffix appended to the outbox path (`wake-outbox.jsonl` → `wake-outbox.jsonl.lock`). */
export const OUTBOX_LOCK_SUFFIX = '.lock';

const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_INTERVAL_MS  = 25;

/**
 * @summary Default process-liveness probe. `process.kill(pid, 0)`: `ESRCH` → dead; `EPERM` → alive.
 * @param {Number} pid
 * @returns {Boolean}
 */
function defaultIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM';
    }
}

/**
 * @summary Runs `fn` while holding the strict outbox lock at `${filePath}${OUTBOX_LOCK_SUFFIX}`,
 * or throws when the lock cannot be acquired within `acquireTimeoutMs` — never runs unlocked.
 * @param {String}   filePath The outbox path to guard.
 * @param {Function} fn       The critical section; `() => Promise<*>`.
 * @param {Object}   [options]
 * @param {Number}   [options.pid]              Owning pid (defaults to `process.pid`).
 * @param {Number}   [options.acquireTimeoutMs] Bounded acquire wait before throwing.
 * @param {Number}   [options.retryIntervalMs]  Spin interval while a live holder finishes.
 * @param {Object}   [options.fs]               Filesystem impl (injected for specs).
 * @param {Function} [options.isAlive]          Liveness probe `(pid) => boolean`.
 * @param {Function} [options.sleep]            `(ms) => Promise` (injected for specs).
 * @param {Function} [options.now]              Clock `() => epochMs` (injected for specs).
 * @returns {Promise<*>} `fn`'s result.
 */
export async function withOutboxLock(filePath, fn, {
    pid              = process.pid,
    acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    retryIntervalMs  = DEFAULT_RETRY_INTERVAL_MS,
    fs: fsImpl       = fs,
    isAlive          = defaultIsAlive,
    sleep            = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now              = Date.now
} = {}) {
    const lockPath = `${filePath}${OUTBOX_LOCK_SUFFIX}`,
          deadline = now() + acquireTimeoutMs;

    let locked = false;

    while (!locked) {
        if (now() >= deadline) {
            throw new Error(`outboxLock: could not acquire '${lockPath}' within ${acquireTimeoutMs}ms — refusing to write unlocked`);
        }

        try {
            await fsImpl.writeFile(lockPath, JSON.stringify({pid, startedAt: now()}), {encoding: 'utf8', flag: 'wx'});
            locked = true;
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;

            // Existing holder: reclaim ONLY when its pid is dead — a live consumer compacts for as
            // long as it needs and is never reclaimed. The byte-match re-read fences the reclaim
            // against a successor that already replaced the stale descriptor. A CORRUPT descriptor
            // is deliberately NOT reclaimed here: unparseable content could be a torn write by a
            // live holder, so acquisition times out and the leftover is recovered by hand or by
            // the holder's own release — never auto-deleted.
            const raw = await fsImpl.readFile(lockPath, 'utf8').catch(() => null);

            let holder = null;

            try { holder = JSON.parse(raw) } catch { /* corrupt → fail closed via timeout */ }

            if (holder && Number.isInteger(holder.pid) && !isAlive(holder.pid)) {
                const current = await fsImpl.readFile(lockPath, 'utf8').catch(() => null);

                if (current === raw) {
                    await fsImpl.unlink(lockPath).catch(unlinkErr => {
                        if (unlinkErr.code !== 'ENOENT') throw unlinkErr;
                    });
                }
            } else {
                await sleep(retryIntervalMs);
            }
        }
    }

    try {
        return await fn();
    } finally {
        // Release only while the descriptor still names OUR pid — a reclaimed-as-dead descriptor
        // owned by a successor must not be unlinked by our late release.
        const raw = await fsImpl.readFile(lockPath, 'utf8').catch(() => null);

        try {
            if (JSON.parse(raw)?.pid === pid) await fsImpl.unlink(lockPath);
        } catch { /* best-effort; a dead-pid leftover is reclaimed by the next acquirer */ }
    }
}
