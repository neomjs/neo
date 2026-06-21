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

import {test, expect}                                  from '@playwright/test';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'fs';
import {tmpdir}                                        from 'os';
import path                                            from 'path';
import {fileURLToPath}                                 from 'url';
import Neo                                             from '../../../../../../../../src/Neo.mjs';
import * as core                                       from '../../../../../../../../src/core/_export.mjs';
import RuntimeFreshnessService                         from '../../../../../../../../ai/mcp/server/shared/services/RuntimeFreshnessService.mjs';

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
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys         : ['gitHead', 'openApiDigest'],
            statusFields      : ['openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'source/schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
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
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead      : 'same-head',
                configDigest : 'sha256:old-config',
                openApiDigest: 'sha256:same-openapi'
            },
            current         : {
                gitHead      : 'same-head',
                configDigest : 'sha256:new-config',
                openApiDigest: 'sha256:same-openapi'
            },
            fieldKeys         : ['gitHead', 'configDigest', 'openApiDigest'],
            statusFields      : ['configDigest', 'openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'source/config identity',
            assertionFacts    : 'provider/config facts',
            restartScope      : 'cached provider/config state',
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
            startedAt: '2026-06-08T00:00:00.000Z',
            boot     : {
                gitHead: 'same-head'
            },
            current         : {
                gitHead: 'same-head'
            },
            errors            : ['current OpenAPI digest unavailable: fixture'],
            fieldKeys         : ['gitHead', 'openApiDigest'],
            statusFields      : ['openApiDigest'],
            serviceName       : 'Test MCP server',
            identityLabel     : 'source/schema identity',
            assertionFacts    : 'tool-schema/source facts',
            restartScope      : 'cached tool definitions',
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

/**
 * @summary Behavioral-source freshness — the manifest digest closes the source blind spot.
 *
 * Config/OpenAPI file digests cannot see a pure `.mjs` source change, so a long-lived process can run
 * pre-merge code while reporting `status:'current'`. The manifest digest hashes the source tree's
 * path+content so any add/remove/edit flips it and marks the process stale.
 */
test.describe('Neo.ai.mcp.server.shared.services.RuntimeFreshnessService source manifest digest (#13289)', () => {
    test('createManifestDigest flips on any content/add change and is otherwise stable', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'neo-srcdigest-'));

        mkdirSync(path.join(dir, 'nested'), {recursive: true});
        writeFileSync(path.join(dir, 'a.mjs'), 'export const a = 1;');
        writeFileSync(path.join(dir, 'nested', 'b.mjs'), 'export const b = 2;');

        const d1 = RuntimeFreshnessService.createManifestDigest([dir]);

        // Same content → same digest (checkout-stable).
        expect(RuntimeFreshnessService.createManifestDigest([dir])).toBe(d1);

        // A content change flips it (the pre-merge-source class, e.g. a fixed embed path).
        writeFileSync(path.join(dir, 'nested', 'b.mjs'), 'export const b = 3;');
        const d2 = RuntimeFreshnessService.createManifestDigest([dir]);
        expect(d2).not.toBe(d1);

        // Adding a source file also flips it.
        writeFileSync(path.join(dir, 'c.mjs'), 'export const c = 4;');
        expect(RuntimeFreshnessService.createManifestDigest([dir])).not.toBe(d2);

        rmSync(dir, {recursive: true, force: true});
    });

    test('createManifestDigest excludes .spec.mjs and treats a missing dir as an empty, non-throwing contribution', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'neo-srcdigest-'));

        writeFileSync(path.join(dir, 'a.mjs'), 'export const a = 1;');
        const base = RuntimeFreshnessService.createManifestDigest([dir]);

        // Spec files are not behavioral source — adding one must not change the digest.
        writeFileSync(path.join(dir, 'a.spec.mjs'), 'test fixture');
        expect(RuntimeFreshnessService.createManifestDigest([dir])).toBe(base);

        // A missing dir contributes nothing and never throws.
        const missing = path.join(dir, 'does-not-exist');
        expect(() => RuntimeFreshnessService.createManifestDigest([missing])).not.toThrow();
        expect(RuntimeFreshnessService.createManifestDigest([missing])).toBe(RuntimeFreshnessService.createManifestDigest([]));

        rmSync(dir, {recursive: true, force: true});
    });

    test('a sourceDigest descriptor drives stale status when source changes after boot', async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'neo-srcdigest-'));

        writeFileSync(path.join(dir, 'embedPath.mjs'), 'export const embed = "v1";');

        const tracker = RuntimeFreshnessService.createTracker({
            files: [{
                key       : 'sourceDigest',
                dirs      : [dir],
                errorLabel: 'source digest'
            }],
            serviceName       : 'Test MCP server',
            identityLabel     : 'source identity',
            assertionFacts    : 'source-code facts',
            restartScope      : 'cached source',
            statusFields      : ['sourceDigest'],
            unavailableSummary: 'source digest'
        });

        // Boot captured v1; current still v1 → current.
        const fresh = await tracker.resolve({now: 1000});
        expect(fresh.status).toBe('current');

        // A behavioral-source edit lands after boot → the next resolve (past the cache TTL) is stale.
        writeFileSync(path.join(dir, 'embedPath.mjs'), 'export const embed = "v2-fixed";');
        const stale = await tracker.resolve({now: 1000 + 60_000});
        expect(stale).toMatchObject({status: 'stale', stale: {sourceDigest: true}});

        rmSync(dir, {recursive: true, force: true});
    });
});
