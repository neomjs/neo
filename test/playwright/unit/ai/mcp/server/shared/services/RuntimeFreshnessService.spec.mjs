import {setup} from '../../../../../../setup.mjs';

const appName = 'RuntimeFreshnessServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}          from '@playwright/test';
import path                    from 'path';
import {fileURLToPath}         from 'url';
import Neo                     from '../../../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../../../src/core/_export.mjs';
import RuntimeFreshnessService from '../../../../../../../../ai/mcp/server/shared/services/RuntimeFreshnessService.mjs';

const
    testDir  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot = path.resolve(testDir, '../../../../../../../../');

/**
 * @summary Unit coverage for the shared MCP runtime freshness substrate.
 *
 * The shared service owns the policy that service-owned digests drive stale status while
 * repo-wide `gitHead` drift stays contextual. This prevents three MCP health services from
 * re-deriving divergent restart warnings.
 */
test.describe('Neo.ai.mcp.server.shared.services.RuntimeFreshnessService (#12776)', () => {
    test('keeps gitHead drift contextual when status-driving fields match', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt       : '2026-06-08T00:00:00.000Z',
            boot            : {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys       : ['gitHead', 'openApiDigest'],
            statusFields    : ['openApiDigest'],
            serviceName     : 'Test MCP server',
            identityLabel   : 'source/schema identity',
            assertionFacts  : 'tool-schema/source facts',
            restartScope    : 'cached tool definitions',
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status   : 'current',
            startedAt: '2026-06-08T00:00:00.000Z',
            stale    : {
                gitHead      : true,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details[0]).toBe('Runtime source/schema identity matches the current checkout.');
        expect(result.details[1]).toContain('Contextual runtime identity differs (gitHead)');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('marks stale when a status-driving digest differs', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt       : '2026-06-08T00:00:00.000Z',
            boot            : {
                gitHead      : 'same-head',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'same-head',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys       : ['gitHead', 'configDigest', 'openApiDigest'],
            statusFields    : ['configDigest', 'openApiDigest'],
            serviceName     : 'Test MCP server',
            identityLabel   : 'source/config identity',
            assertionFacts  : 'provider/config facts',
            restartScope    : 'cached provider/config state',
            unavailableSummary: 'git metadata, config digest, and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                gitHead      : false,
                configDigest : true,
                openApiDigest: false
            },
            hint: 'Restart or reconnect the Test MCP server to refresh cached provider/config state.'
        });
        expect(result.details[0]).toContain('configDigest');
    });

    test('reports unknown when only contextual gitHead can be compared', () => {
        const result = RuntimeFreshnessService.classifyRuntimeFreshness({
            startedAt       : '2026-06-08T00:00:00.000Z',
            boot            : {
                gitHead: 'same-head'
            },
            current         : {
                gitHead: 'same-head'
            },
            errors          : ['current OpenAPI digest unavailable: fixture'],
            fieldKeys       : ['gitHead', 'openApiDigest'],
            statusFields    : ['openApiDigest'],
            serviceName     : 'Test MCP server',
            identityLabel   : 'source/schema identity',
            assertionFacts  : 'tool-schema/source facts',
            restartScope    : 'cached tool definitions',
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                gitHead      : false,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details[0]).toContain('could not be compared');
        expect(result.details).toContain('current OpenAPI digest unavailable: fixture');
    });

    test('caches current identity reads per tracker until the short TTL expires', async () => {
        const tracker = RuntimeFreshnessService.createTracker({
            rootDir: repoRoot,
            files  : [{
                key       : 'openApiDigest',
                path      : path.resolve(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'),
                errorLabel: 'OpenAPI digest'
            }],
            serviceName       : 'Test MCP server',
            identityLabel     : 'source/schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
            statusFields      : ['openApiDigest'],
            unavailableSummary: 'git metadata and OpenAPI digest'
        });

        let readCount = 0,
            openApiDigest = 'sha256:same-openapi';

        const reader = async () => {
            readCount++;

            return {
                boot: {
                    gitHead      : 'same-head',
                    openApiDigest: 'sha256:same-openapi'
                },
                current: {
                    gitHead      : 'same-head',
                    openApiDigest
                }
            };
        };

        const first = await tracker.resolve({reader, cacheDuration: 1000, now: 1000});

        expect(first.status).toBe('current');
        expect(readCount).toBe(1);

        openApiDigest = 'sha256:new-openapi';

        const cached = await tracker.resolve({reader, cacheDuration: 1000, now: 1500});

        expect(cached.status).toBe('current');
        expect(readCount).toBe(1);

        const refreshed = await tracker.resolve({reader, cacheDuration: 1000, now: 2501});

        expect(refreshed).toMatchObject({
            status: 'stale',
            stale : {
                openApiDigest: true
            }
        });
        expect(readCount).toBe(2);
    });

    test('a tracker created without rootDir never reads git and omits gitHead entirely', async () => {
        const tracker = RuntimeFreshnessService.createTracker({
            files: [{
                key       : 'openApiDigest',
                path      : path.resolve(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'),
                errorLabel: 'OpenAPI digest'
            }],
            serviceName       : 'Cloud MCP server',
            identityLabel     : 'source/schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
            statusFields      : ['openApiDigest'],
            unavailableSummary: 'config digest and OpenAPI digest'
        });

        // Real read (no reader seam): a rootDir-less consumer must never spawn `git`, so no
        // `gitHead` field and no `gitHead unavailable` error can appear. This is the portability
        // guarantee for cloud-deployed Memory Core / Knowledge Base on a non-git checkout.
        const {current, errors} = await tracker.readCurrentIdentity();

        expect(current).not.toHaveProperty('gitHead');
        expect(current).toHaveProperty('openApiDigest');
        expect(errors.some(error => error.includes('gitHead'))).toBe(false);

        const result = await tracker.resolve({now: 1000});

        expect(result.status).toBe('current');
        expect(result.stale).not.toHaveProperty('gitHead');
    });
});
