import fs   from 'fs/promises';

/**
 * @module ai/services/memory-core/helpers/walAppendLock
 * @summary Per-segment-file exclusive write-lock that serializes concurrent `appendWalMemory` writers
 * ACROSS PROCESSES, so a SHARED WAL directory (multiple harness clones draining through one embedder)
 * preserves the one-writer-per-segment invariant of {@link module:ai/services/memory-core/helpers/memoryWalStore}
 * without interleaving multi-KB records.
 *
 * Mirrors the embed-daemon `ai/daemons/embed/drainLock.mjs` sole-drainer-lock primitives — atomic `wx` lockfile, a holder
 * descriptor, a `process.kill(pid, 0)` liveness probe, stale-reclaim, idempotent release — but with
 * PER-APPEND semantics:
 *  - **retry, not refuse** — a live holder mid-append (milliseconds) is waited out, then re-claimed;
 *  - **stale-reclaim** — a holder with a dead pid OR held past `ttlMs` (a hung/crashed writer; a real
 *    append is ms, never seconds) is reclaimed;
 *  - **never-fail fall-through** — if the lock can't be acquired within `acquireTimeoutMs`, the write
 *    runs UNLOCKED rather than blocking. This is load-bearing: `add_memory` is the never-fail turn-save
 *    (AGENTS.md §critical_gates #5). The lock is best-effort serialization, NEVER a gate on the durable
 *    write. A rare unlocked fall-through risks at most a single interleaved line, which the drainer
 *    already tolerates (corrupt lines are skipped); a blocked turn-save would be the worse failure.
 *
 * Writer-vs-writer only: the drainer keeps reading lock-free (tolerating a trailing partial line, as it
 * already must), so this adds no drainer or file-format change.
 *
 * Pure + fully injectable (fs, clock, liveness probe, sleep, log) — unit-tested against a real temp dir.
 */

/** Lock-file suffix appended to the WAL segment path (`wal-DATE.jsonl` → `wal-DATE.jsonl.lock`). */
export const APPEND_LOCK_SUFFIX = '.lock';

/** A lock held longer than this is treated as a hung/crashed holder and reclaimed. A real append is ms. */
const DEFAULT_TTL_MS = 2000;

/** Bounded acquire wait. On timeout the write falls through UNLOCKED (never-fail). > `DEFAULT_TTL_MS`
 *  so a hung holder is detected + reclaimed within the wait window before the fall-through. */
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5000;

/** Spin interval while a live holder finishes its millisecond append. */
const DEFAULT_RETRY_INTERVAL_MS = 15;

/**
 * @summary Default process-liveness probe. `process.kill(pid, 0)` sends no signal but performs the
 * existence/permission check: `ESRCH` → dead (reclaimable); `EPERM` → alive but unsignalable (a real
 * holder we must NOT displace).
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
 * Reads + parses the lock holder descriptor, or `null` when absent (raced away) or corrupt. A `null`
 * holder is reclaimable — a corrupt lock must never permanently wedge the never-fail write path.
 * @param {String} lockPath
 * @param {Object} fsImpl
 * @returns {Promise<{pid: Number, startedAt: Number}|null>}
 */
async function readHolder(lockPath, fsImpl) {
    try {
        const parsed = JSON.parse(await fsImpl.readFile(lockPath, 'utf8'));
        return (parsed && Number.isInteger(parsed.pid)) ? parsed : null;
    } catch (err) {
        return null;
    }
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @summary Runs `fn` while holding an exclusive lock on `${filePath}${APPEND_LOCK_SUFFIX}`, or — if the
 * lock can't be acquired within `acquireTimeoutMs` — runs it UNLOCKED (never-fail). `fn` ALWAYS runs.
 *
 * @param {String}   filePath The WAL segment path to guard (the lock is `filePath + .lock`).
 * @param {Function} fn       The append to perform; `() => Promise<*>`. Runs locked when acquired, else unlocked.
 * @param {Object}   [options]
 * @param {Number}   [options.pid]              Owning pid (defaults to `process.pid`).
 * @param {Function} [options.now]              Clock `() => epochMs` (defaults to `Date.now`).
 * @param {Number}   [options.ttlMs]            Hung-holder reclaim threshold.
 * @param {Number}   [options.acquireTimeoutMs] Bounded acquire wait before the unlocked fall-through.
 * @param {Number}   [options.retryIntervalMs]  Spin interval while a live holder finishes.
 * @param {Object}   [options.fs]               Filesystem impl (injected for specs). Defaults to `fs/promises`.
 * @param {Function} [options.isAlive]          Liveness probe `(pid) => boolean`.
 * @param {Function} [options.sleep]            `(ms) => Promise` (injected for specs).
 * @param {Function} [options.log]              `(level, message)` sink. Defaults to a no-op.
 * @returns {Promise<{result: *, locked: Boolean}>} `fn`'s result + whether the lock was held during it.
 */
export async function withAppendLock(filePath, fn, {
    pid              = process.pid,
    now              = Date.now,
    ttlMs            = DEFAULT_TTL_MS,
    acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    retryIntervalMs  = DEFAULT_RETRY_INTERVAL_MS,
    fs: fsImpl       = fs,
    isAlive          = defaultIsAlive,
    sleep            = defaultSleep,
    log              = () => {}
} = {}) {
    const lockPath = `${filePath}${APPEND_LOCK_SUFFIX}`;
    const deadline = now() + acquireTimeoutMs;
    let locked = false;

    while (now() < deadline) {
        try {
            await fsImpl.writeFile(lockPath, JSON.stringify({pid, startedAt: now()}), {encoding: 'utf8', flag: 'wx'});
            locked = true;
            break;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                // Unexpected error claiming the lock — never block the never-fail write; fall through unlocked.
                log('warn', `[wal-append-lock] unexpected claim error (${err.code ?? err.name}); writing unlocked`);
                break;
            }

            const holder = await readHolder(lockPath, fsImpl);
            const stale  = !holder || !isAlive(holder.pid) || (now() - holder.startedAt > ttlMs);

            if (stale) {
                try {
                    await fsImpl.unlink(lockPath);
                } catch (unlinkErr) {
                    // ENOENT = raced away (another writer reclaimed); the next wx claim settles it.
                    if (unlinkErr.code !== 'ENOENT') log('warn', `[wal-append-lock] reclaim unlink failed (${unlinkErr.code})`);
                }
                continue; // retry the wx claim immediately
            }

            await sleep(retryIntervalMs); // live holder mid-append (ms) — brief wait, then retry
        }
    }

    try {
        const result = await fn();
        return {result, locked};
    } finally {
        if (locked) {
            try {
                // Release only if the lock still records OUR pid — a reclaimed-as-stale lock now owned by a
                // successor must not be unlinked by our late release.
                const holder = await readHolder(lockPath, fsImpl);
                if (holder && holder.pid === pid) await fsImpl.unlink(lockPath);
            } catch (err) {
                // Best-effort: a leftover lock is reclaimed next time via the TTL / liveness probe — never a
                // correctness hazard, only a one-append reclaim cost.
            }
        }
    }
}
