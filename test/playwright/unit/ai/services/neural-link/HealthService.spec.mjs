import {setup} from '../../../../setup.mjs';

const appName = 'NeuralLinkHealthServiceTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Unit coverage for the Neural Link HealthService runtime-freshness diagnostic.
 *
 * The Neural Link bridge runs as a long-lived MCP process that can stay bridge-healthy while its
 * checkout/config/schema has moved underneath it — a stale process keeps forwarding pre-merge frames
 * undetected. This wires the bridge to the shared digest-based RuntimeFreshnessService for parity with
 * the Memory Core, Knowledge Base, and GitHub Workflow servers. These specs verify the wiring via the
 * injected reader seam: matching identity reports `current`, a changed config/OpenAPI digest reports
 * `stale` with Neural-Link restart guidance, gitHead drift is ignored (no rootDir → digest-only,
 * cloud-safe), and an unreadable identity degrades to `unknown` without throwing.
 */
test.describe.serial('Neo.ai.services.neural-link.HealthService runtimeFreshness', () => {
    let HealthService, bootRuntimeIdentity, bootRuntimeFreshnessErrors;

    test.beforeAll(async () => {
        HealthService              = (await import('../../../../../../ai/services/neural-link/HealthService.mjs')).default;
        bootRuntimeIdentity        = HealthService.bootRuntimeIdentity;
        bootRuntimeFreshnessErrors = HealthService.bootRuntimeFreshnessErrors;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader        = null;
        HealthService.runtimeFreshnessCacheDuration = 30 * 1000;
        HealthService.bootRuntimeIdentity           = bootRuntimeIdentity;
        HealthService.bootRuntimeFreshnessErrors    = bootRuntimeFreshnessErrors;
        HealthService.clearCache();
    });

    test('classifies matching boot/current identity as current', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {configDigest: 'sha256:same-config', openApiDigest: 'sha256:same-openapi'},
            current: {configDigest: 'sha256:same-config', openApiDigest: 'sha256:same-openapi'}
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {configDigest: false, openApiDigest: false},
            hint  : null
        });
        expect(result.details).toContain('Runtime source/config identity matches the current checkout.');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('classifies stale config + OpenAPI identity with Neural Link restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {configDigest: 'sha256:old-config', openApiDigest: 'sha256:old-openapi'},
            current: {configDigest: 'sha256:new-config', openApiDigest: 'sha256:new-openapi'}
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {configDigest: true, openApiDigest: true},
            hint  : 'Restart or reconnect the Neural Link MCP server to refresh cached source, config, and tool definitions.'
        });
        expect(result.details[0]).toContain('Neural Link MCP server');
        expect(result.details[0]).toContain('configDigest');
    });

    test('ignores gitHead drift entirely — digest-only, cloud-safe (no rootDir)', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {gitHead: 'old-head', configDigest: 'sha256:same-config', openApiDigest: 'sha256:same-openapi'},
            current: {gitHead: 'new-head', configDigest: 'sha256:same-config', openApiDigest: 'sha256:same-openapi'}
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result.status).toBe('current');
        expect(result.stale).not.toHaveProperty('gitHead');
        expect(result.stale).toEqual({configDigest: false, openApiDigest: false});
    });

    test('classifies missing identity as unknown without throwing', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {},
            current: {},
            errors : ['current config digest unavailable: fixture']
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {configDigest: null, openApiDigest: null},
            hint  : null
        });
        expect(result.details).toContain('current config digest unavailable: fixture');
    });
});
