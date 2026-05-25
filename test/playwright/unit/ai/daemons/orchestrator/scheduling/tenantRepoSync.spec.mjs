import {test, expect} from '@playwright/test';
import {
    buildTenantRepoSyncTrigger,
    computeDeterministicJitter,
    getDueTask,
    isRepoDue
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
        const state = {['tenant-repo-sync']: {lastRunAt: 5000}};
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
                tenantId      : 'tenant-a',
                repoSlug      : slug,
                baseCadenceMs : 60000,
                jitterRatio   : 0.20
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
