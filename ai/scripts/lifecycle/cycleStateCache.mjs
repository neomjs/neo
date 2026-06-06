/**
 * @summary Hot-file cache for the shared cycle-state verdict — the producer↔consumer bridge of the
 * idle-out fix. The daemon (async) computes the verdict and writes it here; the liveness Stop hook (sync)
 * reads it WITHOUT a network round-trip — the hook blocks the turn-end, so it cannot afford to live-query
 * GitHub. A plain JSON file under the wake-daemon runtime dir (sibling to `inflightLock.mjs`).
 *
 * **Pure helper — owns no defaults, reads no config:** the cache directory + staleness bound are resolved
 * `AiConfig` leaves (`wakeDaemon.dataDir` + `wakeDaemon.cycleStateCacheMaxAgeMs`), INJECTED by the
 * entrypoints that already import `AiConfig` (the bridge daemon + `idleOutNudge`). Keeping this module
 * config-free means a non-entrypoint consumer (the sync Stop hook) never pays framework bootstrap weight
 * to read a path, and the config SSOT stays the single owner of the path + TTL.
 *
 * **Fail-soft + staleness-bounded:** a write failure never breaks the daemon; a read returns `null` on
 * missing / malformed / stale state — AND on an absent `maxAgeMs` (fail-open with no injected bound) — so
 * the hook never enforces on a stale, absent, or un-bounded verdict.
 *
 * @see ai/scripts/lifecycle/cycleState.mjs   — computes the verdict this caches
 * @see ai/scripts/lifecycle/inflightLock.mjs — sibling .neo-ai-data/wake-daemon/ runtime-file convention
 */

import fs   from 'fs';
import path from 'path';

/**
 * Resolves the per-identity cache file path under the (injected) wake-daemon runtime dir.
 * @param {String} dataDir The resolved `AiConfig.wakeDaemon.dataDir` leaf (injected by the entrypoint).
 * @param {String} identity
 * @returns {String}
 */
export function cacheFilePath(dataDir, identity) {
    const clean = String(identity || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(dataDir, `cycle-state-${clean}.json`)
}

/**
 * Writes the computed cycle-state verdict to the cache (daemon / producer side). Fail-soft — any error
 * (dir missing, disk) is swallowed and reported via the boolean; a cache-write must never break the daemon.
 * @param {String} dataDir The resolved wake-daemon dir (`AiConfig.wakeDaemon.dataDir`); injected by the caller.
 * @param {String} identity
 * @param {Object} verdict The `computeCycleState()` output.
 * @param {Object} [opts]
 * @param {Number} [opts.now=Date.now()]  Injectable timestamp (testability).
 * @param {String} [opts.filePath]        Override the resolved path (testability); defaults to {@link cacheFilePath}.
 * @returns {Boolean} true on success.
 */
export function writeCycleState(dataDir, identity, verdict, {now = Date.now(), filePath} = {}) {
    try {
        const file = filePath || cacheFilePath(dataDir, identity);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, JSON.stringify({verdict, computedAt: now}), 'utf8');
        return true
    } catch {
        return false
    }
}

/**
 * Reads the cached cycle-state verdict (hook / consumer side). Fail-soft + staleness-bounded: returns
 * `null` when the file is missing, malformed, older than `maxAgeMs`, OR when no numeric `maxAgeMs` was
 * injected — so a stale, absent, or un-bounded verdict never drives enforcement (the hook fail-opens).
 * @param {String} dataDir The resolved wake-daemon dir (`AiConfig.wakeDaemon.dataDir`); injected by the caller.
 * @param {String} identity
 * @param {Object} [opts]
 * @param {Number} [opts.maxAgeMs] Resolved `AiConfig.wakeDaemon.cycleStateCacheMaxAgeMs`; required to read (no default here).
 * @param {Number} [opts.now=Date.now()]
 * @param {String} [opts.filePath]
 * @returns {{verdict:Object, computedAt:Number, ageMs:Number}|null}
 */
export function readCycleState(dataDir, identity, {maxAgeMs, now = Date.now(), filePath} = {}) {
    try {
        const {verdict, computedAt} = JSON.parse(fs.readFileSync(filePath || cacheFilePath(dataDir, identity), 'utf8'));
        if (typeof computedAt !== 'number' || !verdict) return null;
        const ageMs = now - computedAt;
        // No injected bound OR stale → fail-open. This helper owns no default staleness policy — the
        // config leaf does; a missing bound means the entrypoint didn't resolve it, so we must not enforce.
        if (typeof maxAgeMs !== 'number' || ageMs > maxAgeMs) return null;
        return {verdict, computedAt, ageMs}
    } catch {
        return null
    }
}
