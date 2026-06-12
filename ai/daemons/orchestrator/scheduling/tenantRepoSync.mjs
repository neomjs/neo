/**
 * Builds the trigger for the cloud-deployable tenant-repo-sync lane.
 * Mirror of `buildPrimaryRepoSyncTrigger` in `./primaryDevSync.mjs` — pure function;
 * no class, no Neo machinery, no side effects.
 *
 * Drives the periodic refresh cycle for server-side tenant-repo ingestion: per the
 * `tenant-repo-sync` lane, `Orchestrator` invokes the trigger output → looks up
 * `TenantRepoSyncService.runTask` (registered via `taskDefinitions.mjs` `serviceTask: true`).
 *
 * @param {Object} options
 * @param {Boolean} options.enabled Whether the lane is enabled (typically `NEO_AI_DEPLOYMENT_MODE === 'cloud'`).
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last task start timestamp.
 * @param {Number} options.intervalMs Poll interval; `0` disables.
 * @returns {Object|null}
 */
export function buildTenantRepoSyncTrigger({enabled, now, lastRunAt, intervalMs}) {
    if (!enabled || intervalMs <= 0 || now - lastRunAt < intervalMs) {
        return null;
    }

    return {
        taskName: 'tenant-repo-sync',
        source  : 'periodic-sweep',
        reason  : `periodic-sweep:${intervalMs}`
    };
}

/**
 * Resolves the next tenant-repo-sync trigger from orchestrator state.
 *
 * @param {Object} options
 * @param {Object} options.state Current orchestrator task state.
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.intervalMs Poll interval.
 * @param {Boolean} options.enabled Whether the lane is enabled.
 * @returns {Object|null}
 */
export function getDueTask({state, now, intervalMs, enabled}) {
    return buildTenantRepoSyncTrigger({
        enabled,
        now,
        intervalMs,
        lastRunAt: state['tenant-repo-sync']?.lastRunAt || 0
    });
}

/**
 * @summary Deterministic per-repo jitter offset in milliseconds.
 *
 * Prevents "thundering-herd" on first-bootstrap multi-tenant deployments where
 * all configured `tenantRepos[]` entries would otherwise become due simultaneously
 * (lastRunAttemptAt: 0 for all → all fire on cycle 1). Per-repo deterministic
 * jitter spreads them across `[0, jitterRatio * baseCadenceMs)` based on a stable
 * hash of `tenantId + repoSlug`, so operators see reproducible offsets across
 * daemon restarts and HA failovers.
 *
 * Uses a simple multiplicative-prime hash (no crypto needed — output range is
 * bounded by `jitterRatio * baseCadenceMs` which is operator-tunable; collision
 * resistance isn't a security property). FNV-1a-style for stability across
 * Node versions.
 *
 * @param {Object} options
 * @param {String} options.tenantId
 * @param {String} options.repoSlug
 * @param {Number} options.baseCadenceMs Pre-jitter cadence; jitter offset capped at `jitterRatio * baseCadenceMs`.
 * @param {Number} [options.jitterRatio=0] Per-repo jitter cap as fraction of `baseCadenceMs`. Caller (typically `TenantRepoSyncService`) passes the value from `aiConfig.orchestrator.tenantRepoSync.jitterRatio`. Default `0` (no jitter) keeps pure-function behavior config-free; production callers always pass the configured value.
 * @returns {Number} Non-negative jitter offset in milliseconds, `< jitterRatio * baseCadenceMs`.
 */
export function computeDeterministicJitter({tenantId, repoSlug, baseCadenceMs, jitterRatio = 0}) {
    if (!Number.isFinite(baseCadenceMs) || baseCadenceMs <= 0) return 0;
    if (!Number.isFinite(jitterRatio) || jitterRatio <= 0) return 0;

    const seed = `${tenantId}/${repoSlug}`;
    let hash   = 0x811c9dc5; // FNV-1a 32-bit offset basis
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0; // FNV-1a prime, force u32
    }

    const maxJitter = baseCadenceMs * jitterRatio;
    return Math.floor((hash / 0xFFFFFFFF) * maxJitter);
}

/**
 * @summary Decides whether a per-repo sync attempt is currently due.
 *
 * Per-repo due-check applies to each `tenantRepos[]` entry independently. The
 * effective cadence for a repo is:
 *
 * ```
 *   effectiveCadence = (configuredCadence + deterministicJitter) * 2^consecutiveFailures
 * ```
 *
 * - `configuredCadence`: per-repo override (`repo.cadenceMs`) or global default (`globalCadenceMs`).
 * - `deterministicJitter`: stable hash-based offset (see `computeDeterministicJitter`).
 * - Backoff multiplier: `2^consecutiveFailures` (1× on fresh state, 2× after 1 fail, 4× after 2, ...).
 *   Reset to 0 on successful sync (no multiplier).
 *
 * @param {Object} options
 * @param {Object} options.repo Repo config from `tenantRepos[]` (must have `tenantId` + `repoSlug`; optional `cadenceMs` override).
 * @param {Object} [options.persistedRepoState] Per-repo persisted state: `{lastIngestedRev, lastRunAttemptAt, consecutiveFailures}`. Defaults treated as bootstrap (lastRunAttemptAt=0, consecutiveFailures=0).
 * @param {Number} options.now Current timestamp in ms.
 * @param {Number} options.globalCadenceMs Global cadence fallback when repo has no override.
 * @param {Number} [options.jitterRatio=0] Caller (typically `TenantRepoSyncService`) passes the value from `aiConfig.orchestrator.tenantRepoSync.jitterRatio`. Default `0` (no jitter) keeps the pure function config-free.
 * @returns {{due: Boolean, effectiveCadenceMs: Number, jitterMs: Number, backoffMultiplier: Number, lastRunAttemptAt: Number}}
 */
export function isRepoDue({repo, persistedRepoState, now, globalCadenceMs, jitterRatio = 0}) {
    const baseCadenceMs       = Number.isFinite(repo?.cadenceMs) && repo.cadenceMs > 0 ? repo.cadenceMs : globalCadenceMs;
    const consecutiveFailures = persistedRepoState?.consecutiveFailures ?? 0;
    const lastRunAttemptAt    = persistedRepoState?.lastRunAttemptAt ?? 0;
    const jitterMs            = computeDeterministicJitter({
        tenantId: repo.tenantId,
        repoSlug: repo.repoSlug,
        baseCadenceMs,
        jitterRatio
    });
    const backoffMultiplier   = Math.pow(2, Math.max(0, consecutiveFailures));
    const effectiveCadenceMs  = (baseCadenceMs + jitterMs) * backoffMultiplier;
    const due                 = (now - lastRunAttemptAt) >= effectiveCadenceMs;

    return {due, effectiveCadenceMs, jitterMs, backoffMultiplier, lastRunAttemptAt};
}
