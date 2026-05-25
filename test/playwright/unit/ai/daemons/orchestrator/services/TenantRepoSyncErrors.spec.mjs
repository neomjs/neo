import {test, expect} from '@playwright/test';
import {
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
    KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    TENANT_REPO_SYNC_ERROR_CODES,
    TenantRepoSyncError,
    isTenantRepoSyncErrorCode
} from '../../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncErrors.mjs';

test.describe('TenantRepoSyncErrors taxonomy (#11942 AC3+AC4)', () => {
    test('all exported codes carry the canonical KB_TENANT_REPO_SYNC_ prefix', () => {
        const codes = [
            KB_TENANT_REPO_SYNC_SYNC_FAILED,
            KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED,
            KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND,
            KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
            KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT
        ];

        codes.forEach(code => {
            expect(code).toMatch(/^KB_TENANT_REPO_SYNC_/);
        });
    });

    test('TENANT_REPO_SYNC_ERROR_CODES set contains exactly the exported codes', () => {
        expect(TENANT_REPO_SYNC_ERROR_CODES.size).toBe(5);
        expect(TENANT_REPO_SYNC_ERROR_CODES.has(KB_TENANT_REPO_SYNC_SYNC_FAILED)).toBe(true);
        expect(TENANT_REPO_SYNC_ERROR_CODES.has(KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED)).toBe(true);
        expect(TENANT_REPO_SYNC_ERROR_CODES.has(KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND)).toBe(true);
        expect(TENANT_REPO_SYNC_ERROR_CODES.has(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED)).toBe(true);
        expect(TENANT_REPO_SYNC_ERROR_CODES.has(KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT)).toBe(true);
    });

    test('TENANT_REPO_SYNC_ERROR_CODES is frozen (immutable taxonomy at module load)', () => {
        expect(Object.isFrozen(TENANT_REPO_SYNC_ERROR_CODES)).toBe(true);
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
