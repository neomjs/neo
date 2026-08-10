import {test, expect} from '@playwright/test';
import {
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_LEASE_LOST,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
    KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN,
    KB_TENANT_REPO_SYNC_STARVED,
    TENANT_REPO_SYNC_ERROR_CODES,
    TenantRepoSyncError,
    isTenantRepoSyncErrorCode
} from '../../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncErrors.mjs';

test.describe('TenantRepoSyncErrors taxonomy (#11942 AC3+AC4)', () => {
    test('all exported codes carry the canonical KB_TENANT_REPO_SYNC_ prefix', () => {
        const codes = [
            KB_TENANT_REPO_SYNC_SYNC_FAILED,
            KB_TENANT_REPO_SYNC_LEASE_HELD,
            KB_TENANT_REPO_SYNC_LEASE_LOST,
            KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
            KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND,
            KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
            KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
            KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION
        ];

        codes.forEach(code => {
            expect(code).toMatch(/^KB_TENANT_REPO_SYNC_/);
        });
    });

    test('TENANT_REPO_SYNC_ERROR_CODES array contains exactly the exported codes', () => {
        expect(Array.isArray(TENANT_REPO_SYNC_ERROR_CODES)).toBe(true);
        expect(TENANT_REPO_SYNC_ERROR_CODES.length).toBe(10);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_SYNC_FAILED);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_LEASE_HELD);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_LEASE_LOST);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION);
        // The effect-bearing sibling. Bumping the count alone would let a new code pass the guard
        // without ever being named — the count is a tripwire, membership is the actual assertion.
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN);
        expect(TENANT_REPO_SYNC_ERROR_CODES).toContain(KB_TENANT_REPO_SYNC_STARVED);
    });

    test('TENANT_REPO_SYNC_ERROR_CODES is truly immutable — external mutation rejected', () => {
        // Object.freeze(new Set(...)) freezes the Set wrapper's properties but NOT
        // Set membership — .add() still mutates the underlying collection. Object.freeze
        // on an array, by contrast, rejects .push / indexed assignment / length mutation
        // in strict mode. ES modules are strict by default, so these throw.
        expect(Object.isFrozen(TENANT_REPO_SYNC_ERROR_CODES)).toBe(true);
        expect(() => TENANT_REPO_SYNC_ERROR_CODES.push('KB_TENANT_REPO_SYNC_MUTATED')).toThrow(TypeError);
        expect(() => { TENANT_REPO_SYNC_ERROR_CODES[TENANT_REPO_SYNC_ERROR_CODES.length] = 'KB_TENANT_REPO_SYNC_MUTATED'; }).toThrow(TypeError);
        expect(() => { TENANT_REPO_SYNC_ERROR_CODES.length = 0; }).toThrow(TypeError);
        expect(TENANT_REPO_SYNC_ERROR_CODES.length).toBe(10);
        expect(TENANT_REPO_SYNC_ERROR_CODES).not.toContain('KB_TENANT_REPO_SYNC_MUTATED');
        expect(isTenantRepoSyncErrorCode('KB_TENANT_REPO_SYNC_MUTATED')).toBe(false);
    });

    test('isTenantRepoSyncErrorCode discriminates membership correctly', () => {
        expect(isTenantRepoSyncErrorCode(KB_TENANT_REPO_SYNC_SYNC_FAILED)).toBe(true);
        expect(isTenantRepoSyncErrorCode('KB_GITMIRROR_FETCH_FAILED')).toBe(false);
        expect(isTenantRepoSyncErrorCode('KB_TENANT_REPO_SYNC_UNKNOWN_FUTURE_CODE')).toBe(false);
        expect(isTenantRepoSyncErrorCode(null)).toBe(false);
        expect(isTenantRepoSyncErrorCode(undefined)).toBe(false);
        expect(isTenantRepoSyncErrorCode(123)).toBe(false);
    });

    test('TenantRepoSyncError carries code + meta and inherits from Error', () => {
        const err = new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_SYNC_FAILED,
            'fetch failed',
            {tenantId: 't1', repoSlug: 'org/repo', phase: 'fetch'}
        );

        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('TenantRepoSyncError');
        expect(err.code).toBe(KB_TENANT_REPO_SYNC_SYNC_FAILED);
        expect(err.message).toBe('fetch failed');
        expect(err.meta).toEqual({tenantId: 't1', repoSlug: 'org/repo', phase: 'fetch'});
    });

    test('TenantRepoSyncError meta defaults to empty object when omitted', () => {
        const err = new TenantRepoSyncError(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED, 'write failed');
        expect(err.meta).toEqual({});
    });

    test('TenantRepoSyncError preserves stack trace for debugging', () => {
        const err = new TenantRepoSyncError(KB_TENANT_REPO_SYNC_SYNC_FAILED, 'test');
        expect(err.stack).toBeTruthy();
        expect(err.stack).toContain('TenantRepoSyncError');
    });
});
