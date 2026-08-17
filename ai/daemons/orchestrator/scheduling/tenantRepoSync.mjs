import {
    KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET,
    TenantRepoSyncError
} from '../services/TenantRepoSyncErrors.mjs';

/**
 * @summary Rejects a `tenantRepoSync.sliceBudgetMs` that cannot bound anything.
 *
 * Mirrors the gate shape `beforeSetConcurrencyLimit` uses — positive integer, nothing else — but
 * THROWS where that one substitutes. The asymmetry is deliberate and is about what each value can
 * do when wrong: a bad concurrency limit degrades throughput and the sweep still finishes, while a
 * bad slice budget removes the only bound on how long one repo may hold a slot. Substituting a
 * working number there would leave an operator believing they had tuned fairness while the shipped
 * guarantee was something else, and the symptom — a starved tail — is indistinguishable from the
 * defect this budget exists to remove.
 *
 * `0` is rejected like any other invalid value rather than read as a disable. A disable sentinel
 * would mean "unlimited slot hold", spelled as though it were an off switch.
 *
 * Lives here rather than beside its caller because the caller imports Neo: a validator that cannot
 * be exercised without booting the class system is a validator whose own contract goes untested.
 * The service reads the leaf at its use site and passes the resolved value in — never the leaf,
 * never a re-derivation.
 * @param {*} value Resolved `AiConfig.data.orchestrator.tenantRepoSync.sliceBudgetMs`.
 * @returns {Number} The validated budget in ms.
 * @throws {TenantRepoSyncError} `KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET` when not a positive integer.
 */
export function assertSliceBudgetMs(value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET,
            `tenantRepoSync.sliceBudgetMs must be a positive integer in ms; received ${JSON.stringify(value)}. There is no disable value — express effectively-unbounded as a large number.`,
            {phase: 'config-validation', received: value}
        )
    }

    return value
}

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
    let   hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0; // FNV-1a prime, force u32
    }

    const maxJitter = baseCadenceMs * jitterRatio;
    return Math.floor((hash / 0xFFFFFFFF) * maxJitter);
}

/**
 * @summary Returns whether durable recovery evidence grants one immediate sync attempt.
 *
 * This stays inside the existing per-repo due computation: the persisted scheduler remains the sole
 * authority, while the process-local canary can only write a generation receipt for it to consume.
 * A generation with a consumption timestamp is spent and can never bypass cadence again.
 *
 * @param {Object|null} persistedRepoState Normalized durable checkpoint state.
 * @returns {Boolean}
 */
export function hasPendingEmbeddingRecoveryBypass(persistedRepoState) {
    const recovery = persistedRepoState?.embeddingRecovery;

    return Boolean(
        recovery?.episodeId
        && recovery.generationId
        && recovery.observedAt
        && !recovery.bypassConsumedAt
    );
}

/**
 * @summary Classifies the recovery dimension of one backoff-suppressed repository.
 * @param {Object} options
 * @param {Object|null} options.persistedRepoState Normalized durable checkpoint state.
 * @param {Object|null} [options.probeSnapshot] Process-owned canary snapshot.
 * @param {Number} [options.observedAt=Date.now()] Observation epoch.
 * @returns {String|null}
 */
export function classifyEmbeddingRecoveryState({persistedRepoState, probeSnapshot = null, observedAt = Date.now()} = {}) {
    const failures = persistedRepoState?.consecutiveFailures ?? 0,
          recovery = persistedRepoState?.embeddingRecovery;

    // Recovery is inspected BEFORE the failure count, and the order is load-bearing. A repo can own
    // a real episode at a zero streak: a deferred embedding outcome arms recovery without
    // incrementing failures, because the run neither succeeded nor failed. Reading the streak first
    // returned `null` for exactly that repo — the one waiting on the dependency the canary
    // measures — so its canary/backoff/retry-pending state was invisible on every surface that
    // consumes this classification. The failure count only decides the ORDINARY-backoff case,
    // which is the one question it can actually answer.
    if (recovery) {
        if (hasPendingEmbeddingRecoveryBypass(persistedRepoState)) return 'recovery-observed/retry-pending';

        if (
            Number.isFinite(probeSnapshot?.nextAttemptAt)
            && probeSnapshot.nextAttemptAt > observedAt
        ) {
            return 'recovery-probe-backoff';
        }

        return 'still-failing';
    }

    if (failures <= 0) return null;
    return 'ordinary-repo-backoff';
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
 * - Backoff cap: `backoffCapMs` bounds the effective cadence, so a failing repo is GUARANTEED a
 *   retry within the cap window regardless of streak length (an unbounded multiplier
 *   suppresses a never-succeeded repo for days while every sweep reads green; the streak state
 *   persists across restarts, so only a cap inside this pure computation can bound it).
 *
 * @param {Object} options
 * @param {Object} options.repo Repo config from `tenantRepos[]` (must have `tenantId` + `repoSlug`; optional `cadenceMs` override).
 * @param {Object} [options.persistedRepoState] Per-repo persisted state: `{lastIngestedRev, lastRunAttemptAt, consecutiveFailures}`. Defaults treated as bootstrap (lastRunAttemptAt=0, consecutiveFailures=0).
 * @param {Number} options.now Current timestamp in ms.
 * @param {Number} options.globalCadenceMs Global cadence fallback when repo has no override.
 * @param {Number} [options.jitterRatio=0] Caller (typically `TenantRepoSyncService`) passes the value from `aiConfig.orchestrator.tenantRepoSync.jitterRatio`. Default `0` (no jitter) keeps the pure function config-free.
 * @param {Number} [options.backoffCapMs=0] Caller passes the value from `aiConfig.orchestrator.tenantRepoSync.backoffCapMs`. Default `0` (no cap) keeps pure-function behavior config-free. Must exceed the repo's base cadence to bind only on failure streaks.
 * @returns {{due: Boolean, dueReason: String, recoveryBypass: Boolean, effectiveCadenceMs: Number,
 *     jitterMs: Number, backoffMultiplier: Number, backoffCapped: Boolean, lastRunAttemptAt: Number}}
 */
export function isRepoDue({repo, persistedRepoState, now, globalCadenceMs, jitterRatio = 0, backoffCapMs = 0}) {
    const baseCadenceMs       = Number.isFinite(repo?.cadenceMs) && repo.cadenceMs > 0 ? repo.cadenceMs : globalCadenceMs;
    const consecutiveFailures = persistedRepoState?.consecutiveFailures ?? 0;
    const lastRunAttemptAt    = persistedRepoState?.lastRunAttemptAt ?? 0;
    const jitterMs            = computeDeterministicJitter({
        tenantId: repo.tenantId,
        repoSlug: repo.repoSlug,
        baseCadenceMs,
        jitterRatio
    });
    const backoffMultiplier  = Math.pow(2, Math.max(0, consecutiveFailures));
    const uncappedCadenceMs  = (baseCadenceMs + jitterMs) * backoffMultiplier;
    const backoffCapped      = Number.isFinite(backoffCapMs) && backoffCapMs > 0 && uncappedCadenceMs > backoffCapMs;
    const effectiveCadenceMs = backoffCapped ? backoffCapMs : uncappedCadenceMs;
    const recoveryBypass     = hasPendingEmbeddingRecoveryBypass(persistedRepoState),
          cadenceDue     = (now - lastRunAttemptAt) >= effectiveCadenceMs,
          due            = recoveryBypass || cadenceDue,
          dueReason      = recoveryBypass ? 'embedding-recovery' : (cadenceDue ? 'cadence' : 'not-due');

    return {
        due,
        dueReason,
        recoveryBypass,
        effectiveCadenceMs,
        jitterMs,
        backoffMultiplier,
        backoffCapped,
        lastRunAttemptAt
    };
}

/**
 * @summary Pure detector for the starved-lane shape: every configured repo is
 * backoff-suppressed AND has never ingested (`lastIngestedRev` null), so the knowledge base
 * this lane feeds cannot receive content while the sweep machinery itself reports healthy.
 *
 * Two deliberately separate readings:
 *
 * - **`starved` (the sweep status)** — the current shape, reported immediately. No duration
 *   requirement: a sweep that attempted nothing because every repo is suppressed-without-
 *   lifetime-success is not `completed`, and calling it one is what hid the incident class.
 * - **`emit` (the self-heal ledger event — a record-with-diagnosis, never an action)** — the
 *   same shape proven over time: the oldest suppression is at least `starvedAfterMs` old. With the
 *   backoff cap in place, a continuously-failing repo is re-attempted inside the cap window
 *   (its `lastSyncAt` stays fresh), so a stale suppression means something beyond ordinary
 *   failure — a wedged lane, a disabled sweep, or a pre-cap persisted streak.
 *
 * Exactly-once per starved episode: the caller persists `starvedEventAt` into the lane's
 * completion metadata; the marker flows forward while the shape holds, clears on any
 * non-starved sweep, and suppresses re-emission. A repo with no `lastSyncAt` (never
 * attempted, e.g. just configured) counts as fresh, not stale.
 *
 * @param {Object} options
 * @param {Object[]} options.repoStates Per-repo sweep records (`{status, lastIngestedRev, lastSyncAt, consecutiveFailures}`).
 * @param {Number} options.attemptedCount Repos the sweep actually ran (completed + failed). Any attempt means the sweep earned its ordinary tally instead of the starved reading.
 * @param {Number} options.now Current timestamp in ms.
 * @param {Number} options.starvedAfterMs Duration threshold for the ledger event; should exceed the backoff cap so ordinary capped retries stay quiet. `0` disables the event (never the status).
 * @param {Object} [options.previousCompletion] The lane's previous completion record (carries `starvedEventAt` forward).
 * @returns {{starved: Boolean, emit: Boolean, starvedEventAt: Number|null, evidence: Object}}
 */
export function detectStarvedTenantSync({repoStates = [], attemptedCount = 0, now, starvedAfterMs = 0, previousCompletion = null}) {
    const suppressedNeverSucceeded = repoStates.filter(r => r.status === 'backoff-suppressed' && !r.lastIngestedRev);
    const starved                  = repoStates.length > 0 && attemptedCount === 0 && suppressedNeverSucceeded.length === repoStates.length;

    if (!starved) {
        return {starved: false, emit: false, starvedEventAt: null, evidence: {suppressedCount: suppressedNeverSucceeded.length}};
    }

    const oldestSuppressedAtMs = Math.min(...suppressedNeverSucceeded.map(r => {
        const parsed = r.lastSyncAt ? Date.parse(r.lastSyncAt) : NaN;
        return Number.isFinite(parsed) ? parsed : now;
    }));
    const heldMs          = now - oldestSuppressedAtMs;
    const durationProven  = Number.isFinite(starvedAfterMs) && starvedAfterMs > 0 && heldMs >= starvedAfterMs;
    const alreadyReported = previousCompletion?.starvedEventAt != null;
    const emit            = durationProven && !alreadyReported;

    return {
        starved       : true,
        emit,
        starvedEventAt: emit ? now : (previousCompletion?.starvedEventAt ?? null),
        evidence      : {
            suppressedCount   : suppressedNeverSucceeded.length,
            oldestSuppressedAt: new Date(oldestSuppressedAtMs).toISOString(),
            heldMs,
            starvedAfterMs
        }
    };
}

/**
 * @summary Pure relationship check for the two tenant-repo-sync tuning leaves: the starved
 * duration floor must EXCEED the backoff cap, or a lane in ordinary capped backoff crosses
 * the floor and emits heal records for what is merely a transient outage — the false-positive
 * shape the floor exists to prevent. `starvedAfterMs: 0` is the documented disable and is
 * never inverted; a non-positive or unresolvable value cannot be judged and is not inverted.
 *
 * Deliberately independent of both predicates (`isRepoDue`, `detectStarvedTenantSync`): the
 * relationship binds how the values are CONFIGURED, not how either computation uses them,
 * so it belongs where the leaves resolve, never inside a pure computation.
 *
 * @param {Object} options
 * @param {Number} options.backoffCapMs Failure-backoff ceiling (`tenantRepoSync.backoffCapMs`).
 * @param {Number} options.starvedAfterMs Starved-lane duration floor (`tenantRepoSync.starvedAfterMs`).
 * @returns {Boolean}
 */
export function isStarvedOrderInverted({backoffCapMs, starvedAfterMs}) {
    return Number.isFinite(starvedAfterMs) && starvedAfterMs > 0
        && Number.isFinite(backoffCapMs) && backoffCapMs > 0
        && starvedAfterMs <= backoffCapMs
}
