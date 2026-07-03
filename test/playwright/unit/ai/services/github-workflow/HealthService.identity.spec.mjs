import {setup} from '../../../../setup.mjs';

const appName = 'GithubWorkflowHealthServiceIdentityTest';

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

// Exercises HealthService.checkAgentIdentity() in isolation — the GH_TOKEN identity-drift detection
// that degrades the healthcheck BEFORE any write. The authed login is injected via agentLoginReader
// so no live `gh` is needed; the comparison delegates to the pure ai/graph/assertExpectedIdentity core.
test.describe.serial('Neo.ai.services.github-workflow.HealthService - agent identity drift', () => {
    let HealthService;
    const originalIdentity = process.env.NEO_AGENT_IDENTITY;

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/github-workflow/HealthService.mjs')).default;
    });

    test.afterEach(() => {
        HealthService.agentLoginReader         = null;
        HealthService.memoryCoreIdentityReader = null;

        if (originalIdentity === undefined) {
            delete process.env.NEO_AGENT_IDENTITY;
        } else {
            process.env.NEO_AGENT_IDENTITY = originalIdentity;
        }
    });

    test('flags drift: the authed login is not the expected agent', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.agentLoginReader = async () => 'neo-opus-ada';

        const result = await HealthService.checkAgentIdentity();

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('authed as neo-opus-ada');
        expect(result.reason).toContain('expected neo-gpt');
    });

    test('passes when the authed login matches the expected agent', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.agentLoginReader = async () => 'neo-gpt';

        expect(await HealthService.checkAgentIdentity()).toEqual({ok: true, reason: null, code: 'OK'});
    });

    test('is a no-op when no expected identity is configured', async () => {
        delete process.env.NEO_AGENT_IDENTITY;
        HealthService.agentLoginReader = async () => 'whoever';

        expect(await HealthService.checkAgentIdentity()).toEqual({ok: true, reason: null});
    });

    test('fails closed when the authed login cannot be resolved', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.agentLoginReader = async () => { throw new Error('gh exploded'); };

        const result = await HealthService.checkAgentIdentity();

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('could not resolve the authed GitHub login');
    });

    test('flags Memory-Core drift even when the GitHub login matches', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.agentLoginReader         = async () => 'neo-gpt';
        HealthService.memoryCoreIdentityReader = async () => '@neo-opus-ada';

        const result = await HealthService.checkAgentIdentity();

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('Memory-Core identity');
    });

    test('passes when both the GitHub login and the Memory-Core identity match', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.agentLoginReader         = async () => 'neo-gpt';
        HealthService.memoryCoreIdentityReader = async () => '@neo-gpt';

        expect(await HealthService.checkAgentIdentity()).toEqual({ok: true, reason: null, code: 'OK'});
    });

    test('skips the Memory-Core leg when its reader yields null — the GitHub-login leg still asserts', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gpt';
        HealthService.memoryCoreIdentityReader = async () => null;

        HealthService.agentLoginReader = async () => 'neo-gpt';
        expect(await HealthService.checkAgentIdentity()).toEqual({ok: true, reason: null, code: 'OK'});

        // A null Memory-Core read must not mask a GitHub-login drift.
        HealthService.agentLoginReader = async () => 'neo-opus-ada';
        const drift = await HealthService.checkAgentIdentity();

        expect(drift.ok).toBe(false);
        expect(drift.reason).toContain('authed as neo-opus-ada');
    });
});
