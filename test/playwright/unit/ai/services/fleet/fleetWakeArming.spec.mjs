import {setup} from '../../../../setup.mjs';

const appName = 'FleetWakeArmingTest';

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

import {createFleetWakeFanout}      from '../../../../../../ai/services/fleet/fleetWakeFanout.mjs';
import {normalizeSecureMcpEndpoint} from '../../../../../../ai/services/fleet/mcpWireParsing.mjs';
import {
    armFleetWakePushLane,
    createWakeArmingContext,
    resolveViewerStreamKey
} from '../../../../../../ai/services/fleet/fleetServer.mjs';

const QUIET = {info: () => {}, warn: () => {}, error: () => {}};

function armingFixture({initOk = true, provenIdentity = '@viewer'} = {}) {
    const
        fanout      = createFleetWakeFanout({logger: QUIET, heartbeatMs: 0}),
        clientCalls = [],
        toolCalls   = [];

    const aiConfig = {
        fleet: {
            planeBase         : 'http://ingress:8080',
            planeBearer       : 'operator-supplied',
            planeInternalHosts: ['ingress'],
            wakeSelfBase      : 'http://fleet-server:8083'
        }
    };

    const createPlaneClient = options => {
        clientCalls.push(options);

        return {
            async init({expectedIdentity}) {
                clientCalls.push({initFor: expectedIdentity});
                return initOk
                    ? {ok: true, identity: provenIdentity}
                    : {ok: false, reason: 'subject mismatch'}
            },
            async callTool(name, args) {
                toolCalls.push({name, args});

                if (args.action === 'subscribe')  return {subscriptionId: 'WAKE_SUB:relay'};
                if (args.action === 'rotate-key') return {subscriptionId: 'WAKE_SUB:relay', signingKey: 'b'.repeat(64)};

                throw new Error(`unexpected action ${args.action}`)
            },
            async close() {
                clientCalls.push({closed: true})
            }
        }
    };

    const context = createWakeArmingContext({
        fanout,
        aiConfig,
        logger            : QUIET,
        createPlaneClient,
        resolveViewerClaim: async () => ({agentIdentityNodeId: '@viewer', userId: 'viewer', username: 'Viewer Display'})
    });

    return {fanout, context, aiConfig, clientCalls, toolCalls}
}

test.describe('fleet wake arming - the boot-path falsifier and the caller-owned authority boundary', () => {
    test('armFleetWakePushLane reaches armed through the real context: endpoint allowance threaded, proven identity owns the route', async () => {
        const {fanout, context, clientCalls, toolCalls} = armingFixture();

        const outcome = await armFleetWakePushLane({armingContext: context, logger: QUIET});

        expect(outcome.armed).toBe(true);

        // The plane client was constructed against the derived MC resource with the
        // deployment-declared internal-host allowance threaded through — the exact seam that
        // deterministically failed before this existed.
        const construction = clientCalls[0];

        expect(construction.baseUrl).toBe('http://ingress:8080/mc/mcp');
        expect(construction.allowPlainHttpHosts).toEqual(['ingress']);

        // subscribe → rotate-key, and the in-memory route binds to the MC-PROVEN identity.
        expect(toolCalls.map(call => call.args.action)).toEqual(['subscribe', 'rotate-key']);
        expect(fanout.resolveRoute('WAKE_SUB:relay')).toEqual({
            signingKey   : 'b'.repeat(64),
            agentIdentity: '@viewer'
        })
    });

    test('the declared compose-internal endpoint is admitted by the policy exactly as threaded — and stays refused undeclared', () => {
        expect(normalizeSecureMcpEndpoint('http://ingress:8080/mc/mcp')).toBeNull();
        expect(normalizeSecureMcpEndpoint('http://ingress:8080/mc/mcp', {allowPlainHttpHosts: ['ingress']}))
            .toBe('http://ingress:8080/mc/mcp');
        expect(normalizeSecureMcpEndpoint('http://mc-server:3001/mcp', {allowPlainHttpHosts: ['ingress']})).toBeNull()
    });

    test('a refused plane admission lands as rendered fan-out state, never a throw', async () => {
        const {fanout, context} = armingFixture({initOk: false});

        const outcome = await armFleetWakePushLane({armingContext: context, logger: QUIET});

        expect(outcome.armed).toBe(false);
        expect(fanout.describeState().armed).toBe(false)
    });

    test('ensureArmedFor refuses any viewer that is not the proven caller identity, without touching MC', async () => {
        const {context, toolCalls} = armingFixture();

        await context.establish();
        const before  = toolCalls.length;
        const outcome = await context.ensureArmedFor('provider:github:12345');

        expect(outcome.armed).toBe(false);
        expect(outcome.reason).toContain('caller-owned');
        expect(toolCalls.length).toBe(before)
    });

    test('per-viewer outcomes are cached: a second connect for the armed viewer re-arms nothing', async () => {
        const {context, toolCalls} = armingFixture();

        await armFleetWakePushLane({armingContext: context, logger: QUIET});
        const after = toolCalls.length;

        await context.ensureArmedFor('@viewer');
        expect(toolCalls.length).toBe(after)
    })
});

test.describe('resolveViewerStreamKey - immutable-fact keying, never display names', () => {
    const proven = '@viewer';

    test('the proven plane identity keys its own streams', () => {
        expect(resolveViewerStreamKey({providerUsername: 'viewer', authProvider: 'github', providerUserId: 7}, proven))
            .toBe('@viewer')
    });

    test('a display name with spaces cannot forge a key: the immutable provider tuple wins', () => {
        expect(resolveViewerStreamKey({username: 'Viewer Display', authProvider: 'github', providerUserId: 7}, proven))
            .toBe('provider:github:7')
    });

    test('two viewers whose display names collide still key apart on the provider tuple', () => {
        const
            a = resolveViewerStreamKey({username: 'Ada Lovelace', authProvider: 'github', providerUserId: 1}, proven),
            b = resolveViewerStreamKey({username: 'Ada Lovelace', authProvider: 'github', providerUserId: 2}, proven);

        expect(a).toBe('provider:github:1');
        expect(b).toBe('provider:github:2');
        expect(a).not.toBe(b)
    });

    test('a colliding login that normalizes to the proven identity maps to it only via the login fact itself', () => {
        expect(resolveViewerStreamKey({providerUsername: 'viewer', authProvider: 'github', providerUserId: 99}, null))
            .toBe('provider:github:99')
    });

    test('no stable subject yields null, which the route refuses', () => {
        expect(resolveViewerStreamKey({username: 'Ghost Display'}, proven)).toBeNull();
        expect(resolveViewerStreamKey(null, proven)).toBeNull()
    })
});

test.describe('two-viewer route isolation at the arming mechanics level', () => {
    test('two authorized viewers arm distinct routes and neither receives the other\'s digest', async () => {
        const fanout = createFleetWakeFanout({logger: QUIET, heartbeatMs: 0});

        const callToolFor = owner => async (name, args) => {
            if (args.action === 'subscribe')  return {subscriptionId: `WAKE_SUB:${owner}`};
            if (args.action === 'rotate-key') return {subscriptionId: `WAKE_SUB:${owner}`, signingKey: 'c'.repeat(64)};
        };

        await fanout.armRelaySubscription({identity: '@ada', wakeSelfBase: 'http://fleet-server:8083', callTool: callToolFor('ada')});
        await fanout.armRelaySubscription({identity: '@grace', wakeSelfBase: 'http://fleet-server:8083', callTool: callToolFor('grace')});

        expect(fanout.resolveRoute('WAKE_SUB:ada').agentIdentity).toBe('@ada');
        expect(fanout.resolveRoute('WAKE_SUB:grace').agentIdentity).toBe('@grace');

        const streams = {
            '@ada'  : {head: null, chunks: [], writeHead(s, h) {this.head = {s, h}}, write(c) {this.chunks.push(c)}, on() {}},
            '@grace': {head: null, chunks: [], writeHead(s, h) {this.head = {s, h}}, write(c) {this.chunks.push(c)}, on() {}}
        };

        fanout.registerStream('@ada', streams['@ada']);
        fanout.registerStream('@grace', streams['@grace']);

        fanout.handleDigest({subscriptionId: 'WAKE_SUB:ada', agentIdentity: '@ada', envelope: {digest: 'for ada'}});

        expect(streams['@ada'].chunks.join('')).toContain('for ada');
        expect(streams['@grace'].chunks.join('')).not.toContain('for ada')
    })
});
