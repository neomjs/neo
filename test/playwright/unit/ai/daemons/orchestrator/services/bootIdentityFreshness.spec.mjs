import {test, expect} from '@playwright/test';
import {
    BOOT_FRESHNESS_CLASS,
    SCHEDULER_RESUME_STATE,
    classifyBootFreshness
} from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFreshness.mjs';

const HOUR = 60 * 60 * 1000;

test.describe('ai/daemons/orchestrator/services/bootIdentityFreshness — #14490 (#14477 Leaf 1)', () => {
    const config = {designedCadenceMs: HOUR, marginMs: 30 * 60 * 1000}; // 1h cadence + 30min margin
    const now    = 1_000_000_000_000;

    test.describe('the 2026-07-02 7.2h->9.3h REM-stall alarm pair (worked example)', () => {
        test('designed-deferral when the scheduler deferred behind heavy maintenance', () => {
            // @neo-gpt live probe: REM deferred behind heavy maintenance, scheduler re-armed, MC healthy.
            const result = classifyBootFreshness({
                now,
                lastCycleAt         : now - 9.3 * HOUR,
                bootAt              : now - 40 * HOUR, // booted long BEFORE the last cycle -> not a restart gap
                schedulerResumeState: SCHEDULER_RESUME_STATE.reArmed,
                deferralReason      : 'heavy-maintenance'
            }, config);

            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.designedDeferral);
            expect(result.advisory).toBe(true);
            expect(result.classification).not.toBe('stale'); // OQ4: never certainty-class stale
        });

        test('restart-explains-gap when the same gap follows a fresh boot with an un-re-armed scheduler', () => {
            // Counterfactual: the process booted AFTER the last cycle and the scheduler never re-armed.
            const result = classifyBootFreshness({
                now,
                lastCycleAt         : now - 9.3 * HOUR,
                bootAt              : now - 2 * HOUR, // booted AFTER the last cycle -> restart-lost scheduler
                schedulerResumeState: SCHEDULER_RESUME_STATE.none,
                deferralReason      : null
            }, config);

            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.restartExplains);
            expect(result.advisory).toBe(true);
        });
    });

    test.describe('discriminator branches', () => {
        test('within cadence+margin -> designed-deferral (no restart implied)', () => {
            const result = classifyBootFreshness({
                now,
                lastCycleAt         : now - (HOUR + 10 * 60 * 1000), // 70min < 90min (cadence+margin)
                bootAt              : now - 5 * HOUR,
                schedulerResumeState: SCHEDULER_RESUME_STATE.reArmed
            }, config);

            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.designedDeferral);
        });

        test('boot-after-last-cycle AND re-armed -> not restart-explains (scheduler recovered its timers)', () => {
            const result = classifyBootFreshness({
                now,
                lastCycleAt         : now - 9.3 * HOUR,
                bootAt              : now - 2 * HOUR,
                schedulerResumeState: SCHEDULER_RESUME_STATE.reArmed
            }, config);

            expect(result.classification).not.toBe(BOOT_FRESHNESS_CLASS.restartExplains);
            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.unknown); // gap unexplained by boot-identity
        });

        test('gap beyond cadence+margin but boot PRECEDES the last cycle -> unknown (not restart-explained)', () => {
            const result = classifyBootFreshness({
                now,
                lastCycleAt         : now - 9.3 * HOUR,
                bootAt              : now - 40 * HOUR,
                schedulerResumeState: SCHEDULER_RESUME_STATE.none
            }, config);

            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.unknown);
        });
    });

    test.describe('OQ4 invariant — absent facts never assert a certainty-class stale', () => {
        test('missing now -> unknown (advisory)', () => {
            const result = classifyBootFreshness({lastCycleAt: now - HOUR}, config);
            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.unknown);
            expect(result.advisory).toBe(true);
        });

        test('missing lastCycleAt -> unknown (advisory)', () => {
            const result = classifyBootFreshness({now, bootAt: now - HOUR}, config);
            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.unknown);
        });

        test('missing config cadence -> unknown, never stale', () => {
            const result = classifyBootFreshness({now, lastCycleAt: now - 9.3 * HOUR}, {});
            expect(result.classification).toBe(BOOT_FRESHNESS_CLASS.unknown);
            expect(result.classification).not.toBe('stale');
        });

        test('no fact-class in the codebook is a certainty-class stale', () => {
            for (const cls of Object.values(BOOT_FRESHNESS_CLASS)) {
                expect(cls).not.toBe('stale');
            }
        });
    });
});
