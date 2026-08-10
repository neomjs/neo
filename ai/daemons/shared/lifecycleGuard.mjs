import crypto from 'crypto';
import path   from 'path';

/**
 * @module ai/daemons/shared/lifecycleGuard
 * @summary Serializes read-verify-mutate lease transitions through one identity-carrying
 * directory mutex — the mechanism behind every "re-inspect INSIDE the guard" contract.
 *
 * Extracted from `ai/daemons/orchestrator/services/heavyMaintenanceLeasePrimitives.mjs` so the
 * authority file-lease (`../fileLease.mjs`) and the heavy-maintenance lease share ONE lifecycle
 * protocol rather than maintaining two of different strengths.
 *
 * Entry is atomic-with-identity: the entrant stages a directory containing its unique
 * `owner-<token>` file and `rename()`s it onto the canonical guard name. POSIX rename refuses a
 * non-empty target, so a LIVE guard can never be replaced; exactly one entrant wins a vacant
 * name. Recovery, release, and renewal all mutate the canonical lease name based on a fresh
 * read taken INSIDE the guard — never on a pre-guard observation.
 *
 * Plain acquisition deliberately stays OUTSIDE the guard: an exclusive `wx` create is already
 * atomic, and a guarded recoverer's unlink→create window admitting an outside `wx` winner is
 * safe — the recoverer's own exclusive create then fails `EEXIST` and defers.
 *
 * Abandoned-guard recovery is identity-safe: staleness is judged on the mtime of the owner
 * token the CURRENT guard carries, and the steal consumes exactly the OBSERVED artifacts —
 * `unlink` of the specific observed owner filename (`ENOENT` ⇒ the observed guard is already
 * gone or replaced ⇒ abort) followed by `rmdir`, which the filesystem itself fails with
 * `ENOTEMPTY` when any OTHER entrant's token is present. Removing a replacement guard by
 * pathname is therefore structurally impossible: no step of the steal can consume artifacts it
 * did not observe.
 *
 * Residual bound (stated precisely): a holder stalled past `guardStaleAfterMs` (default 10s vs
 * µs-scale guarded sections) can be evicted by a legitimate steal. Every lease mutation inside
 * the critical section re-verifies live ownership via {@link verifyLifecycleGuardOwnership}
 * immediately before acting, so a resumed evicted holder DEFERS instead of mutating — the
 * remaining exposure is the single stat→syscall gap of that probe, reachable only by a holder
 * that both stalled past the threshold and resumed inside that gap. Live transitions cannot be
 * evicted or replaced.
 *
 * Guard aging deliberately uses the physical clock (not the injectable `now` lease seam): lease
 * TTL math is logical time for deterministic tests, guard aging is crash detection — tests
 * steer it via `fs.utimes` on the owner file (or the empty legacy dir) + the
 * `guardStaleAfterMs` option instead.
 */

export const LIFECYCLE_GUARD_SUFFIX = '.lifecycle-guard';

const
    DEFAULT_GUARD_STALE_AFTER_MS = 10000,
    GUARD_MAX_ATTEMPTS           = 100,
    GUARD_OWNER_FILE_PREFIX      = 'owner-',
    GUARD_RETRY_DELAY_MS         = 10;

/**
 * The canonical guard directory path for a lease file.
 * @param {String} leasePath Canonical lease file path.
 * @returns {String}
 */
export function lifecycleGuardPath(leasePath) {
    return `${leasePath}${LIFECYCLE_GUARD_SUFFIX}`;
}

/**
 * @summary Enters the lifecycle guard for a lease path (async), retrying bounded contention and
 * stealing only fully-stale observed guards artifact-by-artifact.
 * @param {Object} options
 * @param {String} options.leasePath Canonical lease file path.
 * @param {Object} options.fsModule File-system implementation seam.
 * @param {Number} [options.guardStaleAfterMs=10000] Age after which an abandoned guard is reclaimable.
 * @returns {Promise<Object|null>} `{ownerFilePath}` when entered; `null` when attempts were exhausted (contention).
 */
export async function enterLifecycleGuard({leasePath, fsModule, guardStaleAfterMs = DEFAULT_GUARD_STALE_AFTER_MS}) {
    const guardPath = lifecycleGuardPath(leasePath);

    for (let attempt = 0; attempt < GUARD_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, GUARD_RETRY_DELAY_MS));
        }

        const token         = crypto.randomUUID(),
              stagingPath   = `${guardPath}.enter-${token}`,
              ownerFileName = `${GUARD_OWNER_FILE_PREFIX}${token}`;

        try {
            // NOT an atomic file write, despite sharing the `rename` verb with one. This renames a
            // staging DIRECTORY onto the guard path, and the rename FAILING is the mutual exclusion:
            // a loser gets ENOTEMPTY/EEXIST and retries. The shared write-temp-then-rename primitive
            // writes a file and treats a failed rename as an error, so it cannot express this at all.
            await fsModule.mkdir(stagingPath);
            await fsModule.writeFile(path.join(stagingPath, ownerFileName), '', 'utf8');
            await fsModule.rename(stagingPath, guardPath);
            return {ownerFilePath: path.join(guardPath, ownerFileName)};
        } catch (e) {
            await fsModule.remove(stagingPath).catch(() => {});

            if (e.code === 'ENOENT') {
                await fsModule.ensureDir(path.dirname(guardPath));
                continue;
            }
            if (e.code !== 'EEXIST' && e.code !== 'ENOTEMPTY' && e.code !== 'ENOTDIR') {
                throw e;
            }
        }

        // Guard held by someone. Observe its CURRENT identity artifacts; only a
        // fully stale observation may be consumed, and only artifact-by-artifact.
        let observedNames;
        try {
            observedNames = await fsModule.readdir(guardPath);
        } catch (e) {
            if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                continue; // vacated between rename-failure and observation — retry
            }
            throw e;
        }

        let newestMtimeMs = null,
            unobservable  = false;

        if (observedNames.length === 0) {
            // Interrupted-entry / legacy artifact: an empty guard dir. Judge by dir mtime.
            try {
                newestMtimeMs = (await fsModule.stat(guardPath)).mtimeMs;
            } catch (e) {
                if (e.code === 'ENOENT') continue;
                throw e;
            }
        } else {
            for (const name of observedNames) {
                try {
                    const {mtimeMs} = await fsModule.stat(path.join(guardPath, name));
                    newestMtimeMs   = newestMtimeMs === null ? mtimeMs : Math.max(newestMtimeMs, mtimeMs);
                } catch (e) {
                    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                        unobservable = true; // contents changed under observation — not ours to judge
                        break;
                    }
                    throw e;
                }
            }
        }

        if (unobservable || Date.now() - newestMtimeMs < guardStaleAfterMs) {
            continue; // live (or unjudgeable) guard — wait
        }

        // Identity-safe steal: consume exactly what was observed. Any ENOENT means
        // the observed guard no longer exists as observed — abort, never escalate
        // to pathname-based removal.
        let stealAborted = false;
        for (const name of observedNames) {
            try {
                await fsModule.unlink(path.join(guardPath, name));
            } catch (e) {
                if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                    stealAborted = true;
                    break;
                }
                throw e;
            }
        }
        if (stealAborted) continue;

        try {
            await fsModule.rmdir(guardPath);
        } catch (e) {
            // ENOTEMPTY: another entrant claimed the vacancy mid-steal — theirs now.
            if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') {
                throw e;
            }
        }
        // Next attempt's staged rename competes for the vacant name.
    }

    return null;
}

/**
 * @summary Synchronous mirror of {@link enterLifecycleGuard} for orchestrator-poll callers.
 *
 * The retry delay is a bounded synchronous spin: the guard protects microsecond-scale fs
 * transitions, so a contended entry resolves within a few quanta; the spin budget is capped by
 * `GUARD_MAX_ATTEMPTS`.
 *
 * @param {Object} options See {@link enterLifecycleGuard}.
 * @returns {Object|null}
 */
export function enterLifecycleGuardSync({leasePath, fsModule, guardStaleAfterMs = DEFAULT_GUARD_STALE_AFTER_MS}) {
    const guardPath = lifecycleGuardPath(leasePath);

    for (let attempt = 0; attempt < GUARD_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            const spinUntil = Date.now() + GUARD_RETRY_DELAY_MS;
            while (Date.now() < spinUntil) {
                // bounded sync spin — see @summary
            }
        }

        const token         = crypto.randomUUID(),
              stagingPath   = `${guardPath}.enter-${token}`,
              ownerFileName = `${GUARD_OWNER_FILE_PREFIX}${token}`;

        try {
            // Sync twin of the directory-rename mutex above — same reason it is not the shared
            // atomic-write primitive: the rename target is a directory and its failure is the lock.
            fsModule.mkdirSync(stagingPath);
            fsModule.writeFileSync(path.join(stagingPath, ownerFileName), '', 'utf8');
            fsModule.renameSync(stagingPath, guardPath);
            return {ownerFilePath: path.join(guardPath, ownerFileName)};
        } catch (e) {
            try {
                fsModule.removeSync(stagingPath);
            } catch (cleanupError) {}

            if (e.code === 'ENOENT') {
                fsModule.ensureDirSync(path.dirname(guardPath));
                continue;
            }
            if (e.code !== 'EEXIST' && e.code !== 'ENOTEMPTY' && e.code !== 'ENOTDIR') {
                throw e;
            }
        }

        let observedNames;
        try {
            observedNames = fsModule.readdirSync(guardPath);
        } catch (e) {
            if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                continue;
            }
            throw e;
        }

        let newestMtimeMs = null,
            unobservable  = false;

        if (observedNames.length === 0) {
            try {
                newestMtimeMs = fsModule.statSync(guardPath).mtimeMs;
            } catch (e) {
                if (e.code === 'ENOENT') continue;
                throw e;
            }
        } else {
            for (const name of observedNames) {
                try {
                    const {mtimeMs} = fsModule.statSync(path.join(guardPath, name));
                    newestMtimeMs   = newestMtimeMs === null ? mtimeMs : Math.max(newestMtimeMs, mtimeMs);
                } catch (e) {
                    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                        unobservable = true;
                        break;
                    }
                    throw e;
                }
            }
        }

        if (unobservable || Date.now() - newestMtimeMs < guardStaleAfterMs) {
            continue;
        }

        let stealAborted = false;
        for (const name of observedNames) {
            try {
                fsModule.unlinkSync(path.join(guardPath, name));
            } catch (e) {
                if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                    stealAborted = true;
                    break;
                }
                throw e;
            }
        }
        if (stealAborted) continue;

        try {
            fsModule.rmdirSync(guardPath);
        } catch (e) {
            if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') {
                throw e;
            }
        }
    }

    return null;
}

/**
 * @summary Proves this entrant still owns the lifecycle guard — called immediately before every
 * lease mutation inside the critical section, so an evicted stalled holder defers instead of
 * mutating a successor's state.
 *
 * @param {Object} options
 * @param {String} options.ownerFilePath Owner-token path returned by {@link enterLifecycleGuard}.
 * @param {Object} options.fsModule File-system implementation seam.
 * @returns {Promise<Boolean>}
 */
export async function verifyLifecycleGuardOwnership({ownerFilePath, fsModule}) {
    try {
        await fsModule.stat(ownerFilePath);
        return true;
    } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
            return false;
        }
        throw e;
    }
}

/**
 * @summary Synchronous mirror of {@link verifyLifecycleGuardOwnership}.
 *
 * @param {Object} options See {@link verifyLifecycleGuardOwnership}.
 * @returns {Boolean}
 */
export function verifyLifecycleGuardOwnershipSync({ownerFilePath, fsModule}) {
    try {
        fsModule.statSync(ownerFilePath);
        return true;
    } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
            return false;
        }
        throw e;
    }
}

/**
 * @summary Releases the guard: removes OUR owner token, then the guard dir. The rmdir fails
 * `ENOTEMPTY` when a new entrant renamed onto the name during our µs exit window — theirs now.
 * @param {Object} options
 * @param {String} options.ownerFilePath Owner-token path returned by {@link enterLifecycleGuard}.
 * @param {Object} options.fsModule File-system implementation seam.
 * @returns {Promise<void>}
 */
export async function exitLifecycleGuard({ownerFilePath, fsModule}) {
    try {
        await fsModule.unlink(ownerFilePath);
    } catch (e) {
        if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
            throw e;
        }
    }

    try {
        await fsModule.rmdir(path.dirname(ownerFilePath));
    } catch (e) {
        // ENOTEMPTY: a new entrant renamed onto the name during our µs exit window — theirs now.
        if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') {
            throw e;
        }
    }
}

/**
 * @summary Synchronous mirror of {@link exitLifecycleGuard}.
 * @param {Object} options See {@link exitLifecycleGuard}.
 * @returns {void}
 */
export function exitLifecycleGuardSync({ownerFilePath, fsModule}) {
    try {
        fsModule.unlinkSync(ownerFilePath);
    } catch (e) {
        if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
            throw e;
        }
    }

    try {
        fsModule.rmdirSync(path.dirname(ownerFilePath));
    } catch (e) {
        if (e.code !== 'ENOENT' && e.code !== 'ENOTEMPTY') {
            throw e;
        }
    }
}
