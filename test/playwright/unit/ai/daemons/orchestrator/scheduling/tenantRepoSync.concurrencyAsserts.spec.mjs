import {test, expect} from '@playwright/test';
import {
    assertConcurrencyGateTimeoutMs,
    assertConcurrencyLimit
} from '../../../../../../../ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs';

// Pure-function bounds for the two concurrency asserts — the consumption-boundary
// replacement for the retired `beforeSetConcurrencyLimit` / `beforeSetConcurrencyGateTimeoutMs`
// class-config hooks, which substituted invalid values; these throw, because a consumption-site
// substitute is a hidden default (the SSOT ADR's antipattern catalog). The WIRING — that `syncTenantRepos` and
// `refreshTenantRepoAccessReadiness` call these before any work — is proven in
// services/TenantRepoSyncService.spec.mjs; these arms pin the bounds themselves, exercisable
// without booting the class system (the same reason assertSliceBudgetMs lives beside them).
test.describe('tenantRepoSync concurrency asserts (#17158)', () => {
    test('assertConcurrencyLimit returns valid positive integers unchanged', () => {
        expect(assertConcurrencyLimit(1)).toBe(1);
        expect(assertConcurrencyLimit(2)).toBe(2);
        expect(assertConcurrencyLimit(10)).toBe(10);
    });

    test('assertConcurrencyLimit throws its typed code for every invalid shape — 0 is not "unlimited"', () => {
        for (const bad of [0, -1, 1.5, NaN, Infinity, '3', null, undefined, {}, []]) {
            let thrown = null;

            try { assertConcurrencyLimit(bad) } catch (error) { thrown = error }

            expect(thrown?.code, `${JSON.stringify(bad)} must be rejected`)
                .toBe('KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_LIMIT');
            expect(thrown?.meta).toMatchObject({phase: 'config-validation'});
        }
    });

    test('assertConcurrencyGateTimeoutMs keeps 0 as the valid FIFO-wait sentinel', () => {
        expect(assertConcurrencyGateTimeoutMs(0)).toBe(0);
        expect(assertConcurrencyGateTimeoutMs(50)).toBe(50);
        expect(assertConcurrencyGateTimeoutMs(60_000)).toBe(60_000);
    });

    test('assertConcurrencyGateTimeoutMs throws its typed code for negatives and non-finite values', () => {
        for (const bad of [-1, -100, NaN, Infinity, -Infinity, '5000', null, undefined]) {
            let thrown = null;

            try { assertConcurrencyGateTimeoutMs(bad) } catch (error) { thrown = error }

            expect(thrown?.code, `${JSON.stringify(bad)} must be rejected`)
                .toBe('KB_TENANT_REPO_SYNC_INVALID_CONCURRENCY_GATE_TIMEOUT');
            expect(thrown?.meta).toMatchObject({phase: 'config-validation'});
        }
    });
});
