import {test, expect} from '@playwright/test';
import {
    buildTenantRepoSyncTrigger,
    classifyEmbeddingRecoveryState,
    computeDeterministicJitter,
    detectStarvedTenantSync,
    getDueTask,
    hasPendingEmbeddingRecoveryBypass,
    isBackoffMarginCollapsed,
    isRepoDue,
    isStarvedOrderInverted
} from '../../../../../../../ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs';

test.describe('tenantRepoSync trigger (#11790)', () => {
    test('returns null when disabled', () => {
        expect(buildTenantRepoSyncTrigger({enabled: false, now: 1000, lastRunAt: 0, intervalMs: 60000})).toBeNull();
    });

    test('returns null when intervalMs <= 0', () => {
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 1000, lastRunAt: 0, intervalMs: 0})).toBeNull();
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 1000, lastRunAt: 0, intervalMs: -100})).toBeNull();
    });

    test('returns null when interval not yet elapsed', () => {
        expect(buildTenantRepoSyncTrigger({enabled: true, now: 5000, lastRunAt: 4000, intervalMs: 60000})).toBeNull();
    });

    test('returns trigger when enabled + interval elapsed', () => {
        const trigger = buildTenantRepoSyncTrigger({enabled: true, now: 70000, lastRunAt: 0, intervalMs: 60000});
        expect(trigger).toEqual({
            taskName: 'tenant-repo-sync',
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:60000'
        });
    });

    test('getDueTask derives lastRunAt from state', () => {
        const state   = {['tenant-repo-sync']: {lastRunAt: 5000}};
        const trigger = getDueTask({state, now: 70000, intervalMs: 60000, enabled: true});
        expect(trigger).not.toBeNull();
        expect(trigger.taskName).toBe('tenant-repo-sync');
    });

    test('getDueTask handles missing task state (bootstrap, lastRunAt=0)', () => {
        const trigger = getDueTask({state: {}, now: 70000, intervalMs: 60000, enabled: true});
        expect(trigger).not.toBeNull();
    });
});

test.describe('computeDeterministicJitter (#11942 AC1)', () => {
    test('returns 0 for invalid inputs', () => {
        expect(computeDeterministicJitter({tenantId: 't1', repoSlug: 'org/repo', baseCadenceMs: 0})).toBe(0);
        expect(computeDeterministicJitter({tenantId: 't1', repoSlug: 'org/repo', baseCadenceMs: -1})).toBe(0);
        expect(computeDeterministicJitter({tenantId: 't1', repoSlug: 'org/repo', baseCadenceMs: NaN})).toBe(0);
        expect(computeDeterministicJitter({tenantId: 't1', repoSlug: 'org/repo', baseCadenceMs: 1000, jitterRatio: 0})).toBe(0);
        expect(computeDeterministicJitter({tenantId: 't1', repoSlug: 'org/repo', baseCadenceMs: 1000, jitterRatio: -0.1})).toBe(0);
    });

    test('deterministic — same (tenantId, repoSlug) → same jitter', () => {
        const j1 = computeDeterministicJitter({tenantId: 'tenant-a', repoSlug: 'neomjs/create-app', baseCadenceMs: 60000});
        const j2 = computeDeterministicJitter({tenantId: 'tenant-a', repoSlug: 'neomjs/create-app', baseCadenceMs: 60000});
        expect(j1).toBe(j2);
    });

    test('bounded — default jitterRatio=0 (no jitter); explicit ratio → bounded by ratio*baseCadenceMs', () => {
        // Default jitterRatio (when caller omits) is 0 → no jitter. Pure function stays
        // config-free; the production caller (TenantRepoSyncService) supplies the actual
        // ratio from AiConfig — that wiring is covered by service-level integration tests.
        for (const slug of ['neomjs/a', 'neomjs/b', 'neomjs/c', 'neomjs/d', 'neomjs/e']) {
            const noJitter = computeDeterministicJitter({tenantId: 'tenant-a', repoSlug: slug, baseCadenceMs: 60000});
            expect(noJitter).toBe(0);
        }

        // With explicit jitterRatio (test uses literal 0.20 — pure-function contract is
        // ratio-in / jitter-out; whether AiConfig's canonical value is 0.20 is asserted
        // separately in service-level integration tests).
        for (const slug of ['neomjs/a', 'neomjs/b', 'neomjs/c', 'neomjs/d', 'neomjs/e']) {
            const jitter = computeDeterministicJitter({
                tenantId     : 'tenant-a',
                repoSlug     : slug,
                baseCadenceMs: 60000,
                jitterRatio  : 0.20
            });
            expect(jitter).toBeGreaterThanOrEqual(0);
            expect(jitter).toBeLessThan(60000 * 0.20);
        }
    });

    test('distinct repos produce distinct jitter (anti-thundering-herd)', () => {
        // Explicit non-zero jitterRatio required for distinct jitters (default 0 → all zeros).
        const jitters = ['neomjs/a', 'neomjs/b', 'neomjs/c', 'neomjs/d'].map(slug =>
            computeDeterministicJitter({tenantId: 'tenant-a', repoSlug: slug, baseCadenceMs: 60000, jitterRatio: 0.20})
        );
        // At least 3 distinct values across 4 repos — proves the hash isn't degenerate.
        // (Probabilistic guarantee, but with FNV-1a + 4 inputs the collision risk is negligible.)
        const unique = new Set(jitters);
        expect(unique.size).toBeGreaterThanOrEqual(3);
    });

    test('jitterRatio cap scales the jitter window', () => {
        const jitter10pct = computeDeterministicJitter({
            tenantId: 'tenant-a', repoSlug: 'neomjs/create-app', baseCadenceMs: 60000, jitterRatio: 0.10
        });
        const jitter20pct = computeDeterministicJitter({
            tenantId: 'tenant-a', repoSlug: 'neomjs/create-app', baseCadenceMs: 60000, jitterRatio: 0.20
        });
        // 10% cap should produce smaller (or equal) jitter than 20% cap for the same seed.
        expect(jitter10pct).toBeLessThanOrEqual(jitter20pct);
        expect(jitter10pct).toBeLessThan(60000 * 0.10);
        expect(jitter20pct).toBeLessThan(60000 * 0.20);
    });
});

test.describe('isRepoDue (#11942 AC1)', () => {
    const repo = {tenantId: 'tenant-a', repoSlug: 'neomjs/create-app'};

    test('bootstrap (no persisted state) — due at now=0 with non-trivial cadence', () => {
        // lastRunAttemptAt defaults to 0; now=0 means (now - 0) = 0 >= effectiveCadence iff cadence=0.
        // With cadence>0 + jitter>=0, NOT due at the exact bootstrap moment.
        const result = isRepoDue({repo, persistedRepoState: undefined, now: 0, globalCadenceMs: 60000});
        expect(result.due).toBe(false);
        expect(result.lastRunAttemptAt).toBe(0);
    });

    test('bootstrap — due once now exceeds effectiveCadence', () => {
        const baseCadence = 60000;
        const jitter      = computeDeterministicJitter({tenantId: 'tenant-a', repoSlug: 'neomjs/create-app', baseCadenceMs: baseCadence});
        const due         = isRepoDue({repo, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0}, now: baseCadence + jitter + 1, globalCadenceMs: baseCadence});
        expect(due.due).toBe(true);
        expect(due.backoffMultiplier).toBe(1);
    });

    test('not yet due — interval not elapsed', () => {
        const result = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 100000, consecutiveFailures: 0},
            now               : 100000 + 30000, // half the cadence
            globalCadenceMs   : 60000
        });
        expect(result.due).toBe(false);
    });

    test('per-repo cadence override takes precedence over global', () => {
        const result = isRepoDue({
            repo              : {...repo, cadenceMs: 10000}, // 10s per-repo override
            persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0},
            now               : 12000, // > 10s + small jitter
            globalCadenceMs   : 60000   // global ignored
        });
        // baseCadence = 10000 (override), jitter <= 2000, effective <= 12000 → likely due at now=12000
        expect(result.effectiveCadenceMs).toBeLessThan(12001);
    });

    test('backoff multiplier doubles effective cadence per consecutive failure', () => {
        const baseCadence = 60000;
        const baseline    = isRepoDue({repo, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0}, now: 0, globalCadenceMs: baseCadence});
        const oneFailure  = isRepoDue({repo, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 1}, now: 0, globalCadenceMs: baseCadence});
        const twoFailures = isRepoDue({repo, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 2}, now: 0, globalCadenceMs: baseCadence});

        expect(baseline.backoffMultiplier).toBe(1);
        expect(oneFailure.backoffMultiplier).toBe(2);
        expect(twoFailures.backoffMultiplier).toBe(4);

        // Effective cadence doubles per failure
        expect(oneFailure.effectiveCadenceMs).toBe(baseline.effectiveCadenceMs * 2);
        expect(twoFailures.effectiveCadenceMs).toBe(baseline.effectiveCadenceMs * 4);
    });

    test('backoff resets on consecutiveFailures: 0 — explicit success reset', () => {
        const baseCadence = 60000;
        const afterReset  = isRepoDue({repo, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0}, now: 0, globalCadenceMs: baseCadence});
        expect(afterReset.backoffMultiplier).toBe(1);
    });

    test('deterministic — same inputs produce identical due-state envelope', () => {
        const state = {lastRunAttemptAt: 100000, consecutiveFailures: 0};
        const a     = isRepoDue({repo, persistedRepoState: state, now: 200000, globalCadenceMs: 60000});
        const b     = isRepoDue({repo, persistedRepoState: state, now: 200000, globalCadenceMs: 60000});
        expect(a).toEqual(b);
    });
});

test.describe('isRepoDue backoff cap (#16224 AC1)', () => {
    const repo = {tenantId: 'tenant-a', repoSlug: 'neomjs/create-app'};

    test('an unbounded streak is clamped to the cap — the retry is guaranteed inside the cap window', () => {
        const baseCadence = 60000, cap = 120000;
        // 8 failures → uncapped effective cadence of 2^8 × 60s = 256min. With the cap, the
        // repo becomes due at lastRunAttemptAt + 120s instead — the incident's 25h+ starvation
        // shape cannot form, no matter how long the streak grows.
        const result = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 1000000, consecutiveFailures: 8},
            now               : 1000000 + cap + 1,
            globalCadenceMs   : baseCadence,
            backoffCapMs      : cap
        });

        expect(result.backoffMultiplier).toBe(256); // the streak is still reported honestly
        expect(result.backoffCapped).toBe(true);
        expect(result.effectiveCadenceMs).toBe(cap);
        expect(result.due).toBe(true); // past the cap → retry guaranteed
    });

    test('suppression cannot exceed the cap even across restarts — the bound is a pure function of the persisted streak', () => {
        // "Across restarts" needs no daemon reboot to prove: the only state the backoff reads is
        // the persisted streak, so a restart-sized streak (2^20 × 60s ≈ 2 years uncapped) must
        // still clamp to the cap. A daemon that restarts daily can never inherit a suppression
        // longer than the cap.
        const result = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 1000000, consecutiveFailures: 20},
            now               : 1000000 + 120001,
            globalCadenceMs   : 60000,
            backoffCapMs      : 120000
        });

        expect(result.backoffCapped).toBe(true);
        expect(result.effectiveCadenceMs).toBe(120000);
        expect(result.due).toBe(true);
    });

    test('the cap does not bind below the streak that exceeds it — ordinary backoff is unchanged', () => {
        const baseCadence = 60000, cap = 120000;
        const oneFailure  = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 1},
            now               : 0,
            globalCadenceMs   : baseCadence,
            backoffCapMs      : cap
        });
        // 2 × 60s = 120s; with jitter ≥ 0 the uncapped value can exceed the cap by a hair — the
        // clamp then just shaves the jitter tail, which is still honest backoff. Use failure 0
        // for the strict-unchanged assertion and assert the streak-1 shape separately.
        const zeroFailures = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0},
            now               : 0,
            globalCadenceMs   : baseCadence,
            backoffCapMs      : cap
        });
        const zeroUncapped = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0},
            now               : 0,
            globalCadenceMs   : baseCadence
        });

        expect(zeroFailures.backoffCapped).toBe(false);
        expect(zeroFailures.effectiveCadenceMs).toBe(zeroUncapped.effectiveCadenceMs);
        expect(oneFailure.backoffCapped).toBe(zeroFailures.jitterMs > 0);
    });

    test('default backoffCapMs=0 keeps the legacy unbounded behavior (pure-function back-compat)', () => {
        const result = isRepoDue({
            repo,
            persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 8},
            now               : 0,
            globalCadenceMs   : 60000
        });

        expect(result.backoffCapped).toBe(false);
        expect(result.effectiveCadenceMs).toBe((60000 + result.jitterMs) * 256);
    });
});

test.describe('embedding recovery bypass (#16692)', () => {
    const
        episodeId    = 'a'.repeat(32),
        generationId = 'b'.repeat(32),
        repo         = {tenantId: 'tenant-a', repoSlug: 'neomjs/create-app'},
        recovery     = {
            episodeId,
            causeCode               : 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
            detectedAt              : 100,
            generationId,
            observedAt              : 200,
            bypassConsumedAt        : null,
            lastConsumedGenerationId: null,
            lastConsumedAt          : null
        },
        suppressedState = {
            lastRunAttemptAt   : 1_000,
            consecutiveFailures: 8
        };

    test('one durable unconsumed generation bypasses cadence without rewriting backoff truth', () => {
        const baseline = isRepoDue({
            repo,
            persistedRepoState: suppressedState,
            now               : 1_001,
            globalCadenceMs   : 60_000,
            backoffCapMs      : 120_000
        });
        const recovered = isRepoDue({
            repo,
            persistedRepoState: {...suppressedState, embeddingRecovery: recovery},
            now               : 1_001,
            globalCadenceMs   : 60_000,
            backoffCapMs      : 120_000
        });

        expect(baseline.due).toBe(false);
        expect(recovered).toMatchObject({
            due               : true,
            dueReason         : 'embedding-recovery',
            recoveryBypass    : true,
            backoffMultiplier : baseline.backoffMultiplier,
            effectiveCadenceMs: baseline.effectiveCadenceMs
        });
    });

    test('a consumed generation is history, never another due-bypass', () => {
        const consumed = {
            ...suppressedState,
            embeddingRecovery: {...recovery, bypassConsumedAt: 300}
        };
        const due = isRepoDue({
            repo,
            persistedRepoState: consumed,
            now               : 1_001,
            globalCadenceMs   : 60_000,
            backoffCapMs      : 120_000
        });

        expect(hasPendingEmbeddingRecoveryBypass(consumed)).toBe(false);
        expect(due).toMatchObject({due: false, dueReason: 'not-due', recoveryBypass: false});
    });

    test('classifies the four failing-repo recovery states from scheduler and probe evidence', () => {
        const withRecovery  = {...suppressedState, embeddingRecovery: recovery};
        const awaitingProbe = {
            ...suppressedState,
            embeddingRecovery: {...recovery, generationId: null, observedAt: null}
        };

        expect(classifyEmbeddingRecoveryState({persistedRepoState: suppressedState}))
            .toBe('ordinary-repo-backoff');
        expect(classifyEmbeddingRecoveryState({persistedRepoState: withRecovery}))
            .toBe('recovery-observed/retry-pending');
        expect(classifyEmbeddingRecoveryState({
            persistedRepoState: awaitingProbe,
            probeSnapshot     : {nextAttemptAt: 2_000},
            observedAt        : 1_500
        })).toBe('recovery-probe-backoff');
        expect(classifyEmbeddingRecoveryState({
            persistedRepoState: awaitingProbe,
            probeSnapshot     : {nextAttemptAt: 1_000},
            observedAt        : 1_500
        })).toBe('still-failing');
    });
});

test.describe('detectStarvedTenantSync (#16224 AC2/AC3)', () => {
    const NOW        = Date.parse('2026-08-01T12:00:00.000Z'),
          H          = 60 * 60 * 1000,
          suppressed = lastSyncAt => ({status: 'backoff-suppressed', lastIngestedRev: null, lastSyncAt, consecutiveFailures: 7});

    test('the starved shape is immediate truth; the event needs the duration floor', () => {
        const detection = detectStarvedTenantSync({
            repoStates    : [suppressed(new Date(NOW - 30 * 60 * 1000).toISOString())],
            attemptedCount: 0,
            now           : NOW,
            starvedAfterMs: 6 * H
        });

        expect(detection.starved).toBe(true);
        expect(detection.emit).toBe(false);           // 30min < 6h floor
        expect(detection.starvedEventAt).toBeNull();  // no marker before any emission
    });

    test('duration-proven starvation emits once; the marker suppresses re-emission until a non-starved sweep clears it', () => {
        const old = new Date(NOW - 25 * H).toISOString();

        // Sweep 1: duration-proven, no marker yet → exactly one emission.
        const s1 = detectStarvedTenantSync({repoStates: [suppressed(old)], attemptedCount: 0, now: NOW, starvedAfterMs: 6 * H, previousCompletion: null});
        expect(s1.starved).toBe(true);
        expect(s1.emit).toBe(true);
        expect(s1.starvedEventAt).toBe(NOW);

        // Sweep 2 (marker present): silent, marker carried forward.
        const s2 = detectStarvedTenantSync({repoStates: [suppressed(old)], attemptedCount: 0, now: NOW + 60000, starvedAfterMs: 6 * H, previousCompletion: {starvedEventAt: s1.starvedEventAt}});
        expect(s2.starved).toBe(true);
        expect(s2.emit).toBe(false);
        expect(s2.starvedEventAt).toBe(NOW);

        // A non-starved sweep clears the marker…
        const recovered = detectStarvedTenantSync({
            repoStates        : [{status: 'completed', lastIngestedRev: 'abcdef12', lastSyncAt: null, consecutiveFailures: 0}],
            attemptedCount    : 1,
            now               : NOW + 120000,
            starvedAfterMs    : 6 * H,
            previousCompletion: {starvedEventAt: s2.starvedEventAt}
        });
        expect(recovered.starved).toBe(false);
        expect(recovered.starvedEventAt).toBeNull();

        // …so a LATER starved episode emits exactly one new record.
        const s4 = detectStarvedTenantSync({repoStates: [suppressed(old)], attemptedCount: 0, now: NOW + 180000, starvedAfterMs: 6 * H, previousCompletion: {starvedEventAt: recovered.starvedEventAt}});
        expect(s4.emit).toBe(true);
    });

    test('healthy backoff is not starvation — a repo that has succeeded before stays quiet', () => {
        const detection = detectStarvedTenantSync({
            repoStates: [
                suppressed(new Date(NOW - 25 * H).toISOString()),
                {status: 'backoff-suppressed', lastIngestedRev: 'abcdef12', lastSyncAt: new Date(NOW - 25 * H).toISOString(), consecutiveFailures: 2}
            ],
            attemptedCount: 0,
            now           : NOW,
            starvedAfterMs: 6 * H
        });

        expect(detection.starved).toBe(false);
        expect(detection.emit).toBe(false);
    });

    test('any attempted work earns the ordinary tally instead of the starved reading', () => {
        const detection = detectStarvedTenantSync({
            repoStates    : [suppressed(new Date(NOW - 25 * H).toISOString())],
            attemptedCount: 1,
            now           : NOW,
            starvedAfterMs: 6 * H
        });

        expect(detection.starved).toBe(false);
    });

    test('a never-attempted repo counts as fresh, not stale (just-configured repos do not alert)', () => {
        // The null `lastSyncAt` maps to `now`, so a lane whose every repo is newly configured
        // holds heldMs = 0 — the starved status is honest about the shape, but no episode
        // record can fire until something is genuinely old.
        const detection = detectStarvedTenantSync({
            repoStates    : [suppressed(null), suppressed(null)],
            attemptedCount: 0,
            now           : NOW,
            starvedAfterMs: 6 * H
        });

        expect(detection.starved).toBe(true);
        expect(detection.emit).toBe(false);
        expect(detection.evidence.heldMs).toBe(0);
    });

    test('starvedAfterMs 0 disables the event but never the status', () => {
        const detection = detectStarvedTenantSync({
            repoStates    : [suppressed(new Date(NOW - 25 * H).toISOString())],
            attemptedCount: 0,
            now           : NOW,
            starvedAfterMs: 0
        });

        expect(detection.starved).toBe(true);
        expect(detection.emit).toBe(false);
    });

    test('an empty sweep (no repos configured) is not starved', () => {
        const detection = detectStarvedTenantSync({repoStates: [], attemptedCount: 0, now: NOW, starvedAfterMs: 6 * H});

        expect(detection.starved).toBe(false);
    });
});

test.describe('isStarvedOrderInverted (#16312)', () => {
    test('the documented defaults are not inverted (6h floor > 2h cap)', () => {
        expect(isStarvedOrderInverted({backoffCapMs: 2 * 60 * 60 * 1000, starvedAfterMs: 6 * 60 * 60 * 1000})).toBe(false);
    });

    test('a floor at or below the cap is inverted — the transient-outage false-positive shape', () => {
        expect(isStarvedOrderInverted({backoffCapMs: 2 * 60 * 60 * 1000, starvedAfterMs: 60 * 60 * 1000})).toBe(true);
        // Equality is inverted too: the floor must EXCEED the cap, or a repo at its very
        // first capped retry already crosses it.
        expect(isStarvedOrderInverted({backoffCapMs: 2 * 60 * 60 * 1000, starvedAfterMs: 2 * 60 * 60 * 1000})).toBe(true);
    });

    test('starvedAfterMs 0 (the documented disable) is never inverted', () => {
        expect(isStarvedOrderInverted({backoffCapMs: 2 * 60 * 60 * 1000, starvedAfterMs: 0})).toBe(false);
    });

    test('unresolvable values cannot be judged and are not inverted', () => {
        expect(isStarvedOrderInverted({backoffCapMs: 0,   starvedAfterMs: 1000})).toBe(false);
        expect(isStarvedOrderInverted({backoffCapMs: NaN, starvedAfterMs: 1000})).toBe(false);
        expect(isStarvedOrderInverted({backoffCapMs: 1000, starvedAfterMs: NaN})).toBe(false);
    });
});

test.describe('isBackoffMarginCollapsed (#17386)', () => {
    const HALF_HOUR = 30 * 60 * 1000,
          TWO_HOURS = 2  * 60 * 60 * 1000;

    test('NEGATIVE CONTROL: the shipped defaults leave a sound margin', () => {
        // Without this arm a predicate hard-coded to `true` satisfies every other criterion here.
        expect(isBackoffMarginCollapsed({backoffCapMs: TWO_HOURS, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);
    });

    test('a cap EQUAL to the jittered base cadence collapses the margin', () => {
        // The observed deployment shape: NEO_..._BACKOFF_CAP_MS overridden to the same 30 minutes
        // that intervals.tenantRepoSyncMs already defaults to. The cap then binds at streak 0.
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(true);
    });

    test('the JITTER TERM is what the bound turns on, and it is the reason "> base cadence" was wrong', () => {
        // A cap 10% above the base cadence reads as compliant against the old prose and still binds at
        // streak 0 for any repo whose deterministic jitter lands above 10%. This pair is the whole
        // correction: same base, same ratio, one cap either side of `base + floor(base * ratio)`.
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR * 1.10, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(true);
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR * 1.25, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);

        // The exact boundary is sound, not collapsed: `isRepoDue` caps on strictly-greater, and the
        // largest jitter any seed can draw is `floor(base * ratio)`.
        const exactBound = HALF_HOUR + Math.floor(HALF_HOUR * 0.20);

        expect(isBackoffMarginCollapsed({backoffCapMs: exactBound,     baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: exactBound - 1, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(true);
    });

    test('the bound agrees with isRepoDue at the worst-case seed, rather than restating it', () => {
        // The predicate is only worth having if it decides the same thing the scheduler does. Drive the
        // real computation at a collapsed config and at a sound one, and read `backoffCapped` at
        // consecutiveFailures 0 — which is the state the guard claims to predict.
        const repo  = {tenantId: 'acme', repoSlug: 'docs'},
              state = {lastRunAttemptAt: 0, consecutiveFailures: 0};

        const collapsed = isRepoDue({
            repo, persistedRepoState: state, now: 1, globalCadenceMs: HALF_HOUR,
            jitterRatio: 0.20, backoffCapMs: HALF_HOUR
        });
        const sound = isRepoDue({
            repo, persistedRepoState: state, now: 1, globalCadenceMs: HALF_HOUR,
            jitterRatio: 0.20, backoffCapMs: TWO_HOURS
        });

        // This repo's deterministic jitter must be non-zero, or the arm proves nothing about jitter.
        expect(computeDeterministicJitter({...repo, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBeGreaterThan(0);

        expect(collapsed.backoffCapped).toBe(true);                              // capped with ZERO failures
        expect(collapsed.effectiveCadenceMs).toBe(HALF_HOUR);
        expect(sound.backoffCapped).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(true);
        expect(isBackoffMarginCollapsed({backoffCapMs: TWO_HOURS, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);
    });

    test('a collapsed margin makes the doubling curve inert: streak 309 costs exactly what streak 0 costs', () => {
        // The claim that motivated the ticket, asserted rather than argued. `backoffMultiplier` is
        // published beside the cadence precisely so this arithmetic is falsifiable — the multiplier is
        // astronomically large and the cadence does not move.
        const repo = {tenantId: 'acme', repoSlug: 'docs'},
              args = {repo, now: 1, globalCadenceMs: HALF_HOUR, jitterRatio: 0.20, backoffCapMs: HALF_HOUR};

        const fresh    = isRepoDue({...args, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0}}),
              hammered = isRepoDue({...args, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 309}});

        expect(hammered.effectiveCadenceMs).toBe(fresh.effectiveCadenceMs);
        expect(hammered.backoffMultiplier).toBeGreaterThan(1e90);                // the display number
        expect(hammered.effectiveCadenceMs).toBe(HALF_HOUR);                     // the actual delay
    });

    test('jitter disabled with a cap EQUAL to the base cadence is SOUND, and must not warn', () => {
        // This arm replaced an acceptance criterion that required the opposite. With jitterRatio 0 the
        // uncapped cadence at streak 0 is exactly the base, and `isRepoDue` caps on strictly-greater,
        // so the cap first binds at streak 1 — which is what "binds only on failure streaks" means. A
        // guard that fired here would warn about a correct configuration.
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: HALF_HOUR, jitterRatio: 0})).toBe(false);

        const repo = {tenantId: 'acme', repoSlug: 'docs'},
              args = {repo, now: 1, globalCadenceMs: HALF_HOUR, jitterRatio: 0, backoffCapMs: HALF_HOUR};

        expect(isRepoDue({...args, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 0}}).backoffCapped).toBe(false);
        expect(isRepoDue({...args, persistedRepoState: {lastRunAttemptAt: 0, consecutiveFailures: 1}}).backoffCapped).toBe(true);
    });

    test('backoffCapMs 0 (the documented no-cap value) is never collapsed', () => {
        // Mirrors isStarvedOrderInverted's treatment of starvedAfterMs 0: a guard that fires on the
        // documented disable warns about a legal config and gets muted.
        expect(isBackoffMarginCollapsed({backoffCapMs: 0, baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);
    });

    test('unresolvable values cannot be judged and are not collapsed', () => {
        expect(isBackoffMarginCollapsed({backoffCapMs: NaN,       baseCadenceMs: HALF_HOUR, jitterRatio: 0.20})).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: NaN,       jitterRatio: 0.20})).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: 0,         jitterRatio: 0.20})).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR, baseCadenceMs: -1,        jitterRatio: 0.20})).toBe(false);

        // A non-finite ratio degrades to no-jitter rather than poisoning the bound with NaN.
        expect(isBackoffMarginCollapsed({backoffCapMs: HALF_HOUR + 1, baseCadenceMs: HALF_HOUR, jitterRatio: NaN})).toBe(false);
    });

    test('a per-repo cadenceMs override collapses the margin for that repo alone', () => {
        // The reason the guard runs per repo rather than once on the global pair: an override LARGER
        // than the global makes the same cap unsound for one repo while the rest stay sound, which a
        // global-only check reports as clean.
        expect(isBackoffMarginCollapsed({backoffCapMs: TWO_HOURS, baseCadenceMs: HALF_HOUR,     jitterRatio: 0.20})).toBe(false);
        expect(isBackoffMarginCollapsed({backoffCapMs: TWO_HOURS, baseCadenceMs: TWO_HOURS,     jitterRatio: 0.20})).toBe(true);
        expect(isBackoffMarginCollapsed({backoffCapMs: TWO_HOURS, baseCadenceMs: TWO_HOURS * 4, jitterRatio: 0.20})).toBe(true);
    });
});
