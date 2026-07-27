import {test, expect} from '@playwright/test';

import {
    assertCleanCloneUrl,
    deriveRepoSlugFromCloneUrl,
    deriveTenantRepoMirrorPath,
    hasCloneUrlUserInfo,
    isTenantRepoAccessReadinessOutcome,
    normalizeRepoSlug,
    normalizeTenantRepoCredentialRef,
    normalizeTenantRepoConfig,
    normalizeTenantRepoEntry,
    redactTenantRepoSecrets,
    TenantRepoAccessCode,
    TenantRepoAccessStatus
} from '../../../../../../ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs';

/**
 * @summary Contract tests for tenant repo-access config normalization.
 *
 * The helper is pure by design: it validates tenant-side repo identities without touching Git,
 * env vars, credential helpers, or the Knowledge Base graph. The Git mirror worker
 * owns credential injection; this layer owns the no-secret persistence boundary.
 *
 * @see https://github.com/neomjs/neo/issues/11787
 * @see ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs
 */

test.describe('TenantRepoAccessContract (#11787)', () => {
    test('derives a deterministic repoSlug from a clean URL cloneUrl', () => {
        expect(deriveRepoSlugFromCloneUrl('https://github.com/neomjs/neo.git')).toBe('github.com/neomjs/neo');
        expect(deriveRepoSlugFromCloneUrl('ssh://github.com/neomjs/neo.git')).toBe('github.com/neomjs/neo');
        expect(deriveRepoSlugFromCloneUrl('ssh://git@github.com/neomjs/neo.git')).toBe('github.com/neomjs/neo');
        expect(deriveRepoSlugFromCloneUrl('github.com:neomjs/neo.git')).toBe('github.com/neomjs/neo');
        expect(deriveRepoSlugFromCloneUrl('git@github.com:neomjs/neo.git')).toBe('github.com/neomjs/neo');
    });

    test('normalizes tenant repo entries while preserving supported credentialRef values as references only', () => {
        expect(normalizeTenantRepoEntry({
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN'
        })).toEqual({
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN',
            repoSlug     : 'github.com/neomjs/neo'
        });

        expect(() => normalizeTenantRepoConfig({
            tenantRepos: [{
                cloneUrl     : 'https://github.com/neomjs/neo.git',
                credentialRef: 'helper:github-app-installation',
                repoSlug     : 'github.com/neomjs/custom'
            }]
        })).toThrow(/unsupported scheme/u);
    });

    test('shares one explicit credentialRef grammar with GitMirror', () => {
        expect(normalizeTenantRepoCredentialRef('none')).toEqual({type: 'none'});
        expect(normalizeTenantRepoCredentialRef('env:GITHUB_TOKEN')).toEqual({
            type: 'env',
            name: 'GITHUB_TOKEN'
        });
        expect(normalizeTenantRepoCredentialRef('GITHUB_TOKEN')).toEqual({
            type: 'env',
            name: 'GITHUB_TOKEN'
        });
        expect(normalizeTenantRepoCredentialRef('file:/run/secrets/git-token')).toEqual({
            type    : 'file',
            filePath: '/run/secrets/git-token'
        });
        expect(normalizeTenantRepoCredentialRef('ssh:/run/secrets/git-key')).toEqual({
            type   : 'ssh',
            keyPath: '/run/secrets/git-key'
        });
        expect(normalizeTenantRepoCredentialRef({
            type    : 'file',
            filePath: '/run/secrets/git-token',
            username: 'deploy-token',
            ignored : 'not-crossing-the-boundary'
        })).toEqual({
            type    : 'file',
            filePath: '/run/secrets/git-token',
            username: 'deploy-token'
        });
    });

    test('rejects unsupported or incomplete credentialRef shapes at config resolution', () => {
        expect(() => normalizeTenantRepoCredentialRef('helper:github-app-installation'))
            .toThrow(/unsupported scheme/u);
        expect(() => normalizeTenantRepoCredentialRef('env:'))
            .toThrow(/valid environment-variable name/u);
        expect(() => normalizeTenantRepoCredentialRef('file:'))
            .toThrow(/requires filePath/u);
        expect(() => normalizeTenantRepoCredentialRef({type: 'ssh', keyPath: ''}))
            .toThrow(/requires keyPath/u);
        expect(() => normalizeTenantRepoCredentialRef({type: 'ssh', keyPath: '/key', username: 'git'}))
            .toThrow(/env\/file credentialRef username/u);
        expect(() => normalizeTenantRepoCredentialRef({type: 'vault', name: 'tenant-token'}))
            .toThrow(/unsupported type/u);
    });

    test('allowlists public access-readiness codes by status', () => {
        expect(isTenantRepoAccessReadinessOutcome(
            TenantRepoAccessStatus.READY,
            TenantRepoAccessCode.READY
        )).toBe(true);
        expect(isTenantRepoAccessReadinessOutcome(
            TenantRepoAccessStatus.UNKNOWN,
            TenantRepoAccessCode.EVIDENCE_EXPIRED
        )).toBe(true);
        expect(isTenantRepoAccessReadinessOutcome(
            TenantRepoAccessStatus.DEGRADED,
            TenantRepoAccessCode.READY
        )).toBe(false);
        expect(isTenantRepoAccessReadinessOutcome(
            TenantRepoAccessStatus.DEGRADED,
            'KB_TENANT_REPO_ACCESS_TOKEN_SECRET'
        )).toBe(false);
    });

    test('preserves optional branchRef when valid (#12040)', () => {
        expect(normalizeTenantRepoEntry({
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN',
            branchRef    : 'dev'
        })).toMatchObject({
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN',
            repoSlug     : 'github.com/neomjs/neo',
            branchRef    : 'dev'
        });
    });

    test('rejects invalid branchRef shapes (#12040)', () => {
        const base = {
            cloneUrl     : 'https://github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN'
        };

        expect(() => normalizeTenantRepoEntry({...base, branchRef: ''}))
            .toThrow(/branchRef must be a non-empty string/u);
        expect(() => normalizeTenantRepoEntry({...base, branchRef: '   '}))
            .toThrow(/branchRef must be a non-empty string/u);
        expect(() => normalizeTenantRepoEntry({...base, branchRef: 123}))
            .toThrow(/branchRef must be a non-empty string/u);
        expect(() => normalizeTenantRepoEntry({...base, branchRef: null}))
            .toThrow(/branchRef must be a non-empty string/u);
    });

    test('rejects cloneUrl userinfo before config persistence', () => {
        expect(hasCloneUrlUserInfo('https://token:secret@github.com/neomjs/neo.git')).toBe(true);
        expect(hasCloneUrlUserInfo('git@github.com:neomjs/neo.git')).toBe(true);
        expect(hasCloneUrlUserInfo('https://github.com/neomjs/neo.git')).toBe(false);

        expect(() => normalizeTenantRepoEntry({
            cloneUrl     : 'https://token:secret@github.com/neomjs/neo.git',
            credentialRef: 'env:GITHUB_TOKEN'
        })).toThrow(/must not embed userinfo/u);
        expect(assertCleanCloneUrl('ssh://git@github.com/neomjs/neo.git'))
            .toBe('ssh://git@github.com/neomjs/neo.git');
        expect(assertCleanCloneUrl('git@github.com:neomjs/neo.git'))
            .toBe('git@github.com:neomjs/neo.git');

        expect(() => assertCleanCloneUrl('https://github.com/neomjs/neo.git?token=secret'))
            .toThrow(/query strings or fragments/u);
    });

    test('rejects repoSlug values that look like URLs, credentials, or traversal', () => {
        expect(() => normalizeRepoSlug('https://github.com/neomjs/neo')).toThrow(/clean repository identity/u);
        expect(() => normalizeRepoSlug('token@github.com/neomjs/neo')).toThrow(/clean repository identity/u);
        expect(() => normalizeRepoSlug('github.com:token/neomjs/neo')).toThrow(/clean repository identity/u);
        expect(() => normalizeRepoSlug('github.com/neomjs/../neo')).toThrow(/clean repository identity/u);
    });

    test('redacts URL userinfo and explicit secret hints from nested log payloads', () => {
        const redacted = redactTenantRepoSecrets({
            command          : 'git clone https://token:secret@github.com/neomjs/neo.git',
            capturedGitStderr: ['fatal: auth failed for token secret-value'],
            health           : {lastError: 'secret-value leaked from helper'}
        }, {
            secretHints: ['secret-value']
        });

        expect(redacted).toEqual({
            command          : 'git clone https://[REDACTED]@github.com/neomjs/neo.git',
            capturedGitStderr: ['fatal: auth failed for token [REDACTED]'],
            health           : {lastError: '[REDACTED] leaked from helper'}
        });
    });

    test('derives mirror paths from tenantId and repoSlug without credential material', () => {
        const mirrorPath = deriveTenantRepoMirrorPath({
            mirrorRoot: '/var/lib/neo-kb',
            tenantId  : 'tenant-a',
            repoSlug  : 'github.com/neomjs/neo.git'
        });

        expect(mirrorPath).toBe('/var/lib/neo-kb/tenant-repos/tenant-a/github.com/neomjs/neo');
        expect(mirrorPath).not.toContain('@');
        expect(mirrorPath).not.toContain(':');

        expect(() => deriveTenantRepoMirrorPath({
            mirrorRoot: '/var/lib/neo-kb',
            tenantId  : 'tenant-a',
            repoSlug  : 'token@github.com/neomjs/neo'
        })).toThrow(/clean repository identity/u);
    });
});
