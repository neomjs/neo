import {
    KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    TenantRepoSyncError
} from '../services/TenantRepoSyncErrors.mjs';

/**
 * @summary Refuses an operator selector naming any repo the config does not hold.
 *
 * ANY unknown slug refuses, never only an all-unknown set. The distinction is the whole reason this
 * exists: keyed on "nothing matched", `--repo-slug good --repo-slug typo` processes `good`, drops
 * `typo` without a word, and exits `0` — the operator is told the run completed while the repo they
 * most likely cared about was never touched. A partial no-op hides better than a total one because
 * something did happen, and `0` is the code a runbook or wrapper branches on.
 *
 * Named and shared rather than inlined at each entry path, because two sites asking this question
 * had already answered it differently — the sweep on "nothing matched", the backoff clear on "any
 * unknown". Two call sites with one question is where the question earns a name; a third entry path
 * would otherwise inherit whichever copy it was written beside.
 *
 * Returns the failure DETAILS rather than throwing or returning a boolean: both callers surface the
 * same envelope to the CLI, whose `resolveExitCode` branches on `reasonCode` for exit `3`. A boolean
 * would make each caller rebuild the payload, which is how the two drifted in the first place.
 *
 * Pure, and here rather than beside its callers for the reason the module's other validators are —
 * the callers import Neo, and a validator that cannot be exercised without booting the class system
 * is a validator whose own contract goes untested.
 *
 * @param {Object} options
 * @param {String[]|null} [options.onlyRepoSlugs] Operator-supplied selector; empty/absent selects everything and cannot refuse.
 * @param {String[]} [options.knownSlugs=[]] Configured `repoSlug` values.
 * @returns {Object|null} Failure details when any requested slug is unknown, else `null`.
 */
export function resolveUnknownRepoSelectorFailure({onlyRepoSlugs, knownSlugs = []}) {
    if (!(onlyRepoSlugs?.length > 0)) {
        return null
    }

    const unknownSlugs = onlyRepoSlugs.filter(slug => !knownSlugs.includes(slug));

    if (unknownSlugs.length === 0) {
        return null
    }

    return {
        reason         : 'repo-not-configured',
        reasonCode     : KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
        requestedSlugs : onlyRepoSlugs,
        unknownSlugs,
        configuredSlugs: knownSlugs
    }
}

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
 * @summary Builds one repo's slice-budget yield predicate.
 *
 * Scoped PER REPO, not per sweep: the control envelope that carries `signal` and
 * `onProviderTimeout` is built once and shared by every repo in the sweep, but a budget shared that
 * way would be consumed by the first admitted repo and every later one would be born already
 * expired — a fairness fix that starves the tail it exists to serve. Each repo therefore gets its
 * own predicate anchored at the moment IT was admitted.
 *
 * `startedMs` is the admission instant, not the moment the repo joined the FIFO. A repo that waited
 * legitimately for a slot must not have that wait charged against the work it is finally allowed to
 * do; anchoring at queue-join would hand the most-starved repo the smallest slice.
 *
 * The predicate only votes. `embedChunks` checks it between batches and never before the first, so
 * the actual occupancy is this budget plus one batch envelope, and a repo admitted with an already
 * exhausted budget still lands one batch. That is the forward-progress guarantee, not a rounding
 * error — see the `sliceBudgetMs` leaf for why it bounds occupancy only from above.
 * @param {Object} options
 * @param {Number} options.startedMs Epoch ms at which this repo was admitted to its slot.
 * @param {Number} options.sliceBudgetMs Validated budget from {@link assertSliceBudgetMs}.
 * @param {Function} [options.now=Date.now] Clock seam.
 * @returns {Function} `() => Boolean` — true once the slice has outlived its budget.
 */
export function createSliceBudgetPredicate({startedMs, sliceBudgetMs, now = Date.now}) {
    return () => now() - startedMs >= sliceBudgetMs
}

/**
 * @summary Combines independent yield votes into one predicate: yield when ANY voter says yield.
 *
 * Neither of a tenant sweep's two bounds subsumes the other: the slice budget is fairness between
 * repos, a lease hold bound is fairness between tasks, and a sweep honouring every per-repo budget
 * still holds the shared slot for roughly `repoCount × sliceBudgetMs` — the budget rotates within the
 * sweep rather than ending it. Hence OR rather than replacement.
 *
 * Non-function voters are skipped, so a caller with no lease passes `null` and gets the slice budget
 * alone. A throwing voter propagates: silently reading it as "do not yield" starves waiters.
 *
 * @param {...(Function|null|undefined)} voters Yield predicates; non-functions are skipped.
 * @returns {Function} `() => Boolean` — true as soon as one voter votes to yield.
 */
export function composeYieldPredicates(...voters) {
    const active = voters.filter(voter => typeof voter === 'function');

    return () => active.some(voter => voter() === true)
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
 * @summary Resolves one repo's base cadence: its own override where usable, else the global.
 *
 * Extracted because two callers now decide it and both must decide it identically — {@link isRepoDue},
 * which turns it into a due-time, and the sweep-boundary margin check, which turns it into the minimum
 * legal `backoffCapMs`. A guard that resolved the base differently from the scheduler would warn about
 * a configuration the scheduler is happy with, or stay silent on one it is not, and the only symptom
 * would be a log line nobody could reconcile against behaviour.
 *
 * Two further copies of this fallback predate the extraction — `getAccessReadinessMaxAgeMs` here, and
 * the bootstrap seed in `TenantRepoSyncService` — left alone deliberately rather than swept into an
 * unrelated ticket.
 *
 * @param {Object} options
 * @param {Object} options.repo Repo config; `cadenceMs` is an optional operator override.
 * @param {Number} options.globalCadenceMs Fallback from `intervals.tenantRepoSyncMs`.
 * @returns {Number}
 */
export function resolveRepoBaseCadenceMs({repo, globalCadenceMs}) {
    return Number.isFinite(repo?.cadenceMs) && repo.cadenceMs > 0 ? repo.cadenceMs : globalCadenceMs
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
    const baseCadenceMs       = resolveRepoBaseCadenceMs({repo, globalCadenceMs});
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

/**
 * @summary Pure relationship check for the OTHER tenant-repo-sync ordering: the backoff cap must
 * leave room above the JITTERED base cadence, or it binds at `consecutiveFailures: 0` and the whole
 * `2^n` curve becomes inert — a repo failing consecutively is retried exactly as often as a healthy
 * one. `isRepoDue` adds jitter BEFORE comparing against the cap, so the honest bound is
 * `baseCadenceMs + maxJitter`, not `baseCadenceMs`: at `jitterRatio: 0.20` a cap set just above the
 * base cadence still caps most repo seeds at streak zero.
 *
 * Collapsing the margin also silences the only field that reports it. `backoffCapped` exists to
 * separate a *configured* cadence from a streak-driven one pinned at the cap; when every repo is
 * capped from zero it reads `true` unconditionally and separates nothing.
 *
 * **The bound is a SUPREMUM over every possible repo seed, deliberately, not the jitter of the repos
 * actually configured.** `computeDeterministicJitter` is a hash of `tenantId + repoSlug`, so a real
 * repo typically draws well under `maxJitterMs` — a measured fixture drew 24.6% of it — and there is
 * therefore a band of caps where this reports collapsed while every configured repo happens to be
 * fine. That over-warn is the safe direction on a non-throwing WARN, and the alternative is worse: a
 * max-over-configured-repos bound would go quiet the moment the offending repo is removed and come
 * back silently when a new one is added, which is a guard whose verdict depends on roster churn
 * rather than on configuration. The signature takes no `tenantId`/`repoSlug` precisely so a per-seed
 * variant is not expressible here without a caller deciding whose seed to privilege.
 *
 * The cap/jitter arithmetic mirrors `isRepoDue`'s rather than restating it, `Math.floor` included, and
 * the base cadence comes from the shared {@link resolveRepoBaseCadenceMs} both callers use — so the
 * only remaining freedom is the supremum-vs-per-seed choice above, which is stated rather than
 * inherited. Two configurations are sound and must not be reported: `backoffCapMs: 0` is the
 * documented no-cap value, and with jitter disabled a cap equal to the base cadence first binds at
 * streak one, because the cap comparison is strictly-greater.
 *
 * Deliberately independent of `isRepoDue`, exactly as {@link isStarvedOrderInverted} is: the
 * relationship binds how the values are CONFIGURED, not how the computation uses them.
 *
 * @param {Object} options
 * @param {Number} options.backoffCapMs Failure-backoff ceiling (`tenantRepoSync.backoffCapMs`).
 * @param {Number} options.baseCadenceMs The repo's effective base cadence — `tenantRepos[].cadenceMs` where set, else `intervals.tenantRepoSyncMs`.
 * @param {Number} [options.jitterRatio=0] Deterministic jitter ceiling as a fraction of the base cadence (`tenantRepoSync.jitterRatio`).
 * @returns {Boolean}
 */
export function isBackoffMarginCollapsed({backoffCapMs, baseCadenceMs, jitterRatio = 0}) {
    if (!Number.isFinite(backoffCapMs) || backoffCapMs <= 0) return false;

    const minimumCapMs = resolveMinimumBackoffCapMs({baseCadenceMs, jitterRatio});

    return minimumCapMs !== null && backoffCapMs < minimumCapMs
}

/**
 * @summary The smallest `backoffCapMs` that binds only on failure streaks, for one base cadence.
 *
 * The number an operator actually needs, and the reason it is exported rather than inlined into
 * {@link isBackoffMarginCollapsed}: the guard's entire user-visible surface is a log line, so the
 * message must be able to print the same value the predicate compares against. Computing it twice —
 * once to decide, once to report — is how a remedy comes to disagree with the check that demanded it,
 * and a stated remedy one unit stronger than the predicate is a real, if quiet, defect.
 *
 * `null` for an unresolvable base cadence: a cadence that cannot be read has no minimum, and `0`
 * would read as "any cap will do".
 *
 * @param {Object} options
 * @param {Number} options.baseCadenceMs Effective base cadence from {@link resolveRepoBaseCadenceMs}.
 * @param {Number} [options.jitterRatio=0] From `tenantRepoSync.jitterRatio`.
 * @returns {Number|null} Inclusive minimum in ms — a cap EQUAL to this is sound.
 */
export function resolveMinimumBackoffCapMs({baseCadenceMs, jitterRatio = 0}) {
    if (!Number.isFinite(baseCadenceMs) || baseCadenceMs <= 0) return null;

    const ratio = Number.isFinite(jitterRatio) && jitterRatio > 0 ? jitterRatio : 0;

    return baseCadenceMs + Math.floor(baseCadenceMs * ratio)
}
