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
 *    append is ms, never seconds) is reclaimed, fenced by a re-read byte-match so a racing reclaimer
 *    can never path-unlink a successor's fresh lock;
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
 * Reads the lock file's RAW bytes, or `null` when absent (raced away). The raw string is used both to
 * judge staleness (via {@link parseHolder}) AND as the exact compare-token that fences reclaim against
 * a racing successor (see {@link reclaimStaleLock}).
 * @param {String} lockPath
 * @param {Object} fsImpl
 * @returns {Promise<String|null>}
 */
async function readLockRaw(lockPath, fsImpl) {
    try {
        return await fsImpl.readFile(lockPath, 'utf8');
    } catch (err) {
        return null;
    }
}

/**
 * Parses a holder descriptor from raw lock bytes, or `null` when absent or corrupt. A `null` holder is
 * reclaimable — a corrupt lock must never permanently wedge the never-fail write path.
 * @param {String|null} raw
 * @returns {{pid: Number, startedAt: Number}|null}
 */
function parseHolder(raw) {
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        return (parsed && Number.isInteger(parsed.pid)) ? parsed : null;
    } catch (err) {
        return null;
    }
}

/** Reads + parses the holder descriptor in one step (used by the idempotent release path). */
async function readHolder(lockPath, fsImpl) {
    return parseHolder(await readLockRaw(lockPath, fsImpl));
}

/**
 * @summary Reclaims a stale lock WITHOUT clobbering a successor. A bare path-unlink is content-blind:
 * in the window between our staleness read and the unlink, another writer can reclaim + re-lock, and an
 * unconditional unlink would delete its fresh, valid lock — leaving BOTH writers "holding" (exactly the
 * interleave the lock exists to prevent). So we re-read immediately before removing and unlink ONLY
 * while the byte-identical stale content is still present; a successor's fresh lock (or an already-gone
 * lock) makes us back off and re-evaluate on the next claim attempt.
 *
 * This narrows the clobber window to a single syscall; the irreducible residual is bounded by never-fail
 * (a rare interleaved line is tolerated by the lock-free drainer). Fully closing it would require
 * encoding holder identity in the lock-file NAME, breaking the fixed `.lock` path the drainer relies on
 * to skip lock files — disproportionate for a best-effort lock.
 * @param {String}      lockPath
 * @param {String|null} observedRaw The raw bytes we judged stale.
 * @param {Object}      fsImpl
 * @param {Function}    log
 * @returns {Promise<Boolean>} whether we removed the stale lock.
 */
async function reclaimStaleLock(lockPath, observedRaw, fsImpl, log) {
    const current = await readLockRaw(lockPath, fsImpl);
    // Gone already (a peer reclaimed it) or replaced by a successor's fresh lock → never clobber it.
    if (current === null || current !== observedRaw) return false;
    try {
        await fsImpl.unlink(lockPath);
        return true;
    } catch (err) {
        // ENOENT = raced away between our re-read and the unlink; the next wx claim settles it.
        if (err.code !== 'ENOENT') log('warn', `[wal-append-lock] reclaim unlink failed (${err.code})`);
        return false;
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

            // Read the holder's RAW bytes once — both to judge staleness AND as the compare-token that
            // fences reclaim against a racing successor (see reclaimStaleLock).
            const raw    = await readLockRaw(lockPath, fsImpl);
            const holder = parseHolder(raw);
            const stale  = !holder || !isAlive(holder.pid) || (now() - holder.startedAt > ttlMs);

            if (stale && await reclaimStaleLock(lockPath, raw, fsImpl, log)) {
                continue; // we removed the exact stale lock — retry the wx claim immediately
            }

            // A live holder mid-append (ms), or a successor we must NOT clobber — brief wait, re-evaluate.
            await sleep(retryIntervalMs);
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
