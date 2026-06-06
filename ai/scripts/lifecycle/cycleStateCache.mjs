/**
 * @summary Hot-file cache for the shared cycle-state verdict — the producer↔consumer bridge of the
 * idle-out fix. The daemon (async) computes the verdict and writes it here; the liveness Stop hook (sync)
 * reads it WITHOUT a network round-trip — the hook blocks the turn-end, so it cannot afford to live-query
 * GitHub. A plain JSON file under the wake-daemon runtime dir (sibling to `inflightLock.mjs`).
 *
 * **Fail-soft + staleness-bounded:** a write failure never breaks the daemon; a read returns `null` on
 * missing / malformed / stale state, so the hook fail-opens (never enforces on a stale or absent verdict).
 *
 * @see ai/scripts/lifecycle/cycleState.mjs   — computes the verdict this caches
 * @see ai/scripts/lifecycle/inflightLock.mjs — sibling .neo-ai-data/wake-daemon/ runtime-file convention
 */

import fs                 from 'fs';
import path               from 'path';
import {fileURLToPath}    from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default staleness bound. A cached verdict older than this is treated as absent — the daemon recomputes
 * each heartbeat cycle, so a stale file means the daemon stopped; the hook must not enforce on it.
 * @type {Number}
 */
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 min

/**
 * Resolves the per-identity cache file path under the wake-daemon runtime dir (sibling to inflightLock).
 * @param {String} identity
 * @returns {String}
 */
export function cacheFilePath(identity) {
    const clean = String(identity || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.resolve(__dirname, `../../../.neo-ai-data/wake-daemon/cycle-state-${clean}.json`)
}

/**
 * Writes the computed cycle-state verdict to the cache (daemon / producer side). Fail-soft — any error
 * (dir missing, disk) is swallowed and reported via the boolean; a cache-write must never break the daemon.
 * @param {String} identity
 * @param {Object} verdict The `computeCycleState()` output.
 * @param {Object} [opts]
 * @param {Number} [opts.now=Date.now()]  Injectable timestamp (testability).
 * @param {String} [opts.filePath]        Override the cache path (testability); defaults to {@link cacheFilePath}.
 * @returns {Boolean} true on success.
 */
export function writeCycleState(identity, verdict, {now = Date.now(), filePath} = {}) {
    try {
        const file = filePath || cacheFilePath(identity);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, JSON.stringify({verdict, computedAt: now}), 'utf8');
        return true
    } catch {
        return false
    }
}

/**
 * Reads the cached cycle-state verdict (hook / consumer side). Fail-soft + staleness-bounded: returns
 * `null` when the file is missing, malformed, or older than `maxAgeMs` — so a stale or absent verdict
 * never drives enforcement (the hook fail-opens).
 * @param {String} identity
 * @param {Object} [opts]
 * @param {Number} [opts.maxAgeMs=DEFAULT_MAX_AGE_MS]
 * @param {Number} [opts.now=Date.now()]
 * @param {String} [opts.filePath]
 * @returns {{verdict:Object, computedAt:Number, ageMs:Number}|null}
 */
export function readCycleState(identity, {maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now(), filePath} = {}) {
    try {
        const {verdict, computedAt} = JSON.parse(fs.readFileSync(filePath || cacheFilePath(identity), 'utf8'));
        if (typeof computedAt !== 'number' || !verdict) return null;
        const ageMs = now - computedAt;
        if (ageMs > maxAgeMs) return null; // stale → ignore (daemon stopped); hook fail-opens
        return {verdict, computedAt, ageMs}
    } catch {
        return null
    }
}
