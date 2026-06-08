import {setup} from '../../../../setup.mjs';

const appName = 'GithubWorkflowHealthServiceTest';

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

test.describe.serial('Neo.ai.services.github-workflow.HealthService - runtimeFreshness (#12765)', () => {
    let HealthService;

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/github-workflow/HealthService.mjs')).default;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearCache();
    });

    test('classifies matching boot/current identity as current', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                openApiDigest: 'sha256:same'
            },
            current: {
                gitHead      : 'abc123',
                openApiDigest: 'sha256:same'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {
                gitHead      : false,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details).toContain('Runtime source identity matches the current checkout.');
    });

    test('classifies stale git and OpenAPI identity with restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:old'
            },
            current: {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:new'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                gitHead      : true,
                openApiDigest: true
            },
            hint: 'Restart or reconnect the MCP client/server to refresh cached tool definitions.'
        });
        expect(result.details[0]).toContain('Restart or reconnect the MCP client/server');
    });

    test('classifies missing identity as unknown without throwing', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {},
            current: {},
            errors : ['current gitHead unavailable: fixture']
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                gitHead      : null,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details).toContain('current gitHead unavailable: fixture');
    });
});
