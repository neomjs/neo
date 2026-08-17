import {test, expect}                             from '@playwright/test';
import {assertSliceBudgetMs, createSliceBudgetPredicate} from '../../../../../../../ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs';
import {KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET} from '../../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncErrors.mjs';

/**
 * The slice budget's value contract.
 *
 * `sliceBudgetMs` is the only thing bounding how long one tenant repo may hold a concurrency slot,
 * so its validator refuses rather than substitutes. A value silently corrected back to something
 * workable would leave an operator believing they had tuned fairness while the shipped guarantee
 * was something else — and the symptom of that, a starved tail, is indistinguishable from the
 * defect the budget exists to remove.
 *
 * `0` is the case worth naming: it is rejected like any other invalid value rather than read as a
 * disable, because a disable sentinel here means "unlimited slot hold" spelled as an off switch.
 */
test.describe('TenantRepoSyncService — sliceBudgetMs value contract (#17132 AC1)', () => {
    test('accepts a positive integer and returns it unchanged', () => {
        expect(assertSliceBudgetMs(300_000)).toBe(300_000);
        expect(assertSliceBudgetMs(1)).toBe(1);
    });

    test('REGRESSION: 0 is invalid, not a disable', () => {
        // The footgun this refuses: `0` reading as "off" while behaving as "no bound at all".
        let thrown;
        try { assertSliceBudgetMs(0) } catch (error) { thrown = error }

        expect(thrown, '0 must throw rather than disable the bound').toBeTruthy();
        expect(thrown.code).toBe(KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET);
        // The message has to tell an operator what to do instead, or the refusal just blocks them.
        expect(thrown.message).toContain('no disable value');
    });

    test('rejects negative, fractional, non-finite and non-numeric values', () => {
        for (const bad of [-1, -300_000, 1.5, 0.1, NaN, Infinity, -Infinity, null, undefined, '300000', {}, []]) {
            let thrown;
            try { assertSliceBudgetMs(bad) } catch (error) { thrown = error }

            expect(thrown, `${JSON.stringify(bad)} must be rejected`).toBeTruthy();
            expect(thrown.code).toBe(KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET);
        }
    });

    test('the rejection carries the received value, so the operator sees what was resolved', () => {
        // A config error that does not echo the offending value sends the operator hunting through
        // env, overlay and template for a number the process already had in hand.
        let thrown;
        try { assertSliceBudgetMs(0) } catch (error) { thrown = error }

        // `TenantRepoSyncError` stores its third constructor argument as `meta`, not `details` —
        // the lane's whole taxonomy reads that way, and per-repo durable state persists only
        // `lastErrorCode`, so anything richer has to be read from the live error rather than
        // recovered later from disk.
        expect(thrown.meta?.received).toBe(0);
        expect(thrown.meta?.phase).toBe('config-validation');
    });

    test('the predicate is anchored per repo, so a later admission gets a full slice', () => {
        // The defect this shape exists to avoid: one budget shared across the sweep is spent by the
        // first admitted repo, and every later one is born already expired — a fairness fix that
        // starves exactly the tail it was written for.
        let   clock = 1_000;
        const now   = () => clock;

        const first = createSliceBudgetPredicate({startedMs: 1_000, sliceBudgetMs: 300_000, now});
        clock = 250_000;
        const second = createSliceBudgetPredicate({startedMs: clock, sliceBudgetMs: 300_000, now});

        expect(first(),  'the head repo has burned 249s of its 300s').toBe(false);
        expect(second(), 'a repo admitted at 250s starts its own 300s, not the remainder').toBe(false);

        clock = 320_000;
        expect(first(),  'the head repo is past its budget').toBe(true);
        expect(second(), 'the later repo still has 230s of its own').toBe(false);
    });

    test('votes to yield only once the slice has outlived the budget, boundary inclusive', () => {
        let   clock       = 0;
        const shouldYield = createSliceBudgetPredicate({startedMs: 0, sliceBudgetMs: 1_000, now: () => clock});

        expect(shouldYield()).toBe(false);
        clock = 999;
        expect(shouldYield(), 'one ms short must not yield').toBe(false);
        clock = 1_000;
        expect(shouldYield(), 'exactly at budget yields — the bound is reached, not exceeded').toBe(true);
    });

    test('an already-exhausted budget still votes true — the FLOOR is the consumer\'s, not the predicate\'s', () => {
        // Worth pinning because it is the easy place to put the forward-progress guarantee and the
        // wrong one. The predicate is honest: the budget is gone, so it says so. `embedChunks` is
        // what refuses to check before the first batch (`cursor > 0`), which is why a repo admitted
        // with nothing left still lands one batch. Moving that floor in here would duplicate a
        // guarantee that already exists and hide which layer owns it.
        const shouldYield = createSliceBudgetPredicate({startedMs: 0, sliceBudgetMs: 300_000, now: () => 900_000});

        expect(shouldYield()).toBe(true);
    });

    test('CONTROL (non-vacuity): a string of digits is NOT coerced', () => {
        // Proves the guard tests the TYPE and not merely the magnitude — `'300000'` is a plausible
        // env-parse leak, satisfies every numeric comparison after coercion, and must still fail.
        let thrown;
        try { assertSliceBudgetMs('300000') } catch (error) { thrown = error }

        expect(thrown, 'a numeric string must not pass as a validated budget').toBeTruthy();
    });
});
