import {setup} from '../../../../../setup.mjs';

const appName = 'MemoryCoreAuthTest';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

test.describe('Neo.ai.mcp.server.shared.services.StdioIdentityResolver', () => {
    let StdioIdentityResolver;
    let originalResolveFromGhCli;
    let originalEnvIdentity;

    test.beforeAll(async () => {
        StdioIdentityResolver    = (await import('../../../../../../../ai/mcp/server/shared/services/StdioIdentityResolver.mjs')).default;
        originalResolveFromGhCli = StdioIdentityResolver.resolveFromGhCli.bind(StdioIdentityResolver);
    });

    test.beforeEach(() => {
        // Snapshot env state so each test starts from a known baseline. Symmetric restore in
        // afterEach prevents cross-test leakage under Playwright's fullyParallel mode.
        originalEnvIdentity = process.env.NEO_AGENT_IDENTITY;
        delete process.env.NEO_AGENT_IDENTITY;
    });

    test.afterEach(() => {
        if (originalEnvIdentity !== undefined) {
            process.env.NEO_AGENT_IDENTITY = originalEnvIdentity;
        } else {
            delete process.env.NEO_AGENT_IDENTITY;
        }

        StdioIdentityResolver.resolveFromGhCli = originalResolveFromGhCli;
    });

    test('resolves NEO_AGENT_IDENTITY when set, tags source as env-var', async () => {
        process.env.NEO_AGENT_IDENTITY = 'neo-opus-4-7';

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBe('neo-opus-4-7');
        expect(identity.username).toBe('neo-opus-4-7');
        expect(identity.source).toBe('env-var');
    });

    test('strips leading @ from NEO_AGENT_IDENTITY for GitHub API parity', async () => {
        process.env.NEO_AGENT_IDENTITY = '@neo-gemini-3-1-pro';

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBe('neo-gemini-3-1-pro');
        expect(identity.source).toBe('env-var');
    });

    test('trims whitespace from NEO_AGENT_IDENTITY', async () => {
        process.env.NEO_AGENT_IDENTITY = '  tobiu  ';

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBe('tobiu');
        expect(identity.source).toBe('env-var');
    });

    test('falls back to gh-cli when env-var is absent', async () => {
        StdioIdentityResolver.resolveFromGhCli = () => ({
            login: 'human-dev',
            name : 'Human Developer'
        });

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBe('human-dev');
        expect(identity.username).toBe('Human Developer');
        expect(identity.source).toBe('gh-cli');
    });

    test('uses login as username when gh returns no name field', async () => {
        StdioIdentityResolver.resolveFromGhCli = () => ({
            login: 'anon-dev',
            name : null
        });

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.username).toBe('anon-dev');
    });

    test('returns unresolved when both env-var and gh-cli fail', async () => {
        StdioIdentityResolver.resolveFromGhCli = () => null;

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBeNull();
        expect(identity.username).toBeNull();
        expect(identity.source).toBe('unresolved');
    });

    test('env-var takes precedence over gh-cli', async () => {
        process.env.NEO_AGENT_IDENTITY = 'explicit-agent';
        StdioIdentityResolver.resolveFromGhCli = () => {
            throw new Error('gh-cli must not be invoked when env-var is set');
        };

        const identity = await StdioIdentityResolver.resolve();

        expect(identity.githubLogin).toBe('explicit-agent');
        expect(identity.source).toBe('env-var');
    });
});

test.describe('Neo.ai.mcp.server.shared.services.AuthMiddleware', () => {
    let AuthMiddleware;

    test.beforeAll(async () => {
        AuthMiddleware = (await import('../../../../../../../ai/mcp/server/shared/services/AuthMiddleware.mjs')).default;
    });

    test('accepts args without any forbidden identity-override keys', () => {
        const cleanArgs = {
            prompt  : 'what is the weather',
            thought : 'calling API',
            response: 'sunny',
            agent   : 'antigravity',
            model   : 'gemini-3.1-pro'
        };

        expect(() => AuthMiddleware.validateNoIdentitySpoof(cleanArgs)).not.toThrow();
    });

    test('accepts null or undefined args (no tool parameters)', () => {
        expect(() => AuthMiddleware.validateNoIdentitySpoof(null)).not.toThrow();
        expect(() => AuthMiddleware.validateNoIdentitySpoof(undefined)).not.toThrow();
        expect(() => AuthMiddleware.validateNoIdentitySpoof({})).not.toThrow();
    });

    test('rejects args containing userId — server-stamped field', () => {
        expect(() => AuthMiddleware.validateNoIdentitySpoof({
            prompt: 'x',
            userId: '@spoofed-identity'
        })).toThrow(/Identity-override spoof rejected/);
    });

    test('rejects args containing githubLogin — server-stamped field', () => {
        expect(() => AuthMiddleware.validateNoIdentitySpoof({
            prompt     : 'x',
            githubLogin: 'victim-login'
        })).toThrow(/Identity-override spoof rejected/);
    });

    test('rejects args containing `from` — preemptive guard for Mailbox (#10139)', () => {
        expect(() => AuthMiddleware.validateNoIdentitySpoof({
            recipient: '@neo-opus-4-7',
            from     : '@spoofed-sender',
            body     : 'fake message'
        })).toThrow(/Identity-override spoof rejected/);
    });

    test('rejects agentIdentityNodeId — prevents graph-node identity spoofing', () => {
        expect(() => AuthMiddleware.validateNoIdentitySpoof({
            agentIdentityNodeId: '@spoofed-node'
        })).toThrow(/Identity-override spoof rejected/);
    });

    test('permits recipient field — legitimate destination address, not claim-of-authorship', () => {
        // Mailbox will add `recipient` as the addressee. Sender-claim fields (`from`, `sender`,
        // `authorLogin`) are forbidden; destination fields are not.
        expect(() => AuthMiddleware.validateNoIdentitySpoof({
            recipient: '@neo-opus-4-7',
            body     : 'legitimate message'
        })).not.toThrow();
    });

    test('error message points to troubleshooting guide', () => {
        let error = null;

        try {
            AuthMiddleware.validateNoIdentitySpoof({userId: 'x'});
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.message).toContain('MemoryCoreMcpAuth.md');
    });

    test('exposes identity-override key set for testability', () => {
        const keys = AuthMiddleware.getIdentityOverrideKeys();

        expect(keys).toBeInstanceOf(Set);
        expect(keys.has('userId')).toBe(true);
        expect(keys.has('from')).toBe(true);
        expect(keys.has('agentIdentityNodeId')).toBe(true);
        // Returns a copy — mutating it must not affect the canonical set.
        keys.clear();

        const freshKeys = AuthMiddleware.getIdentityOverrideKeys();
        expect(freshKeys.size).toBeGreaterThan(0);
    });
});

test.describe('Neo.ai.mcp.server.shared.services.RequestContextService', () => {
    let RequestContextService;

    test.beforeAll(async () => {
        RequestContextService = (await import('../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
    });

    test('new accessors surface the extended context shape', async () => {
        const context = {
            userId             : 'neo-opus-4-7',
            username           : 'Claude Opus 4.7',
            agentIdentityNodeId: '@neo-opus-4-7',
            source             : 'env-var'
        };

        await RequestContextService.run(context, async () => {
            expect(RequestContextService.getUserId()).toBe('neo-opus-4-7');
            expect(RequestContextService.getUsername()).toBe('Claude Opus 4.7');
            expect(RequestContextService.getAgentIdentityNodeId()).toBe('@neo-opus-4-7');
            expect(RequestContextService.getSource()).toBe('env-var');
        });
    });

    test('accessors return undefined outside any run() scope', () => {
        // Outside a run() wrap, single-tenant fallthrough is the contract.
        expect(RequestContextService.getUserId()).toBeUndefined();
        expect(RequestContextService.getAgentIdentityNodeId()).toBeUndefined();
        expect(RequestContextService.getSource()).toBeUndefined();
    });

    test('null agentIdentityNodeId distinguishes unbound identity from single-tenant', async () => {
        const context = {
            userId             : 'unseeded-agent',
            username           : 'Unseeded Agent',
            agentIdentityNodeId: null,
            source             : 'env-var'
        };

        await RequestContextService.run(context, async () => {
            // Identity resolved, but no matching AgentIdentity graph node.
            expect(RequestContextService.getUserId()).toBe('unseeded-agent');
            expect(RequestContextService.getAgentIdentityNodeId()).toBeNull();
            expect(RequestContextService.getSource()).toBe('env-var');
        });
    });
});
