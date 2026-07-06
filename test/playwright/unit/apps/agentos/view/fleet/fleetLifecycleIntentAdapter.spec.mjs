import {setup} from '../../../../../setup.mjs';

const appName = 'FleetLifecycleIntentAdapterTest';

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

import {
    createControlReason,
    handleFleetLifecycleIntent,
    sanitizeControlReason,
    writeLifecycleControlState
} from '../../../../../../../apps/agentos/view/fleet/fleetLifecycleIntentAdapter.mjs';

const createProvider = (data = {}) => ({
    data  : {pendingAction: null, controlReason: null, ...data},
    writes: [],

    setData(values) {
        this.writes.push({...values});
        Object.assign(this.data, values)
    }
});

test.describe('fleetLifecycleIntentAdapter — lifecycleIntent → registry bridge → provider state (#14889)', () => {
    test('maps start/stop/restart intents to existing bridge verbs with agentId-only payloads', async () => {
        const
            provider = createProvider({controlReason: {action: 'stop', kind: 'rejected', reason: 'old failure'}}),
            calls    = [],
            bridge   = {
                startAgent  : async id => { calls.push(['startAgent', id]); return {state: 'running'} },
                stopAgent   : async id => { calls.push(['stopAgent', id]); return {state: 'stopped'} },
                restartAgent: async id => { calls.push(['restartAgent', id]); return {state: 'running'} }
            };

        await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, provider, {bridge});
        await handleFleetLifecycleIntent({action: 'stop', agentId: 'vega'}, provider, {bridge});
        await handleFleetLifecycleIntent({action: 'restart', agentId: 'vega'}, provider, {bridge});

        expect(calls).toEqual([
            ['startAgent', 'vega'],
            ['stopAgent', 'vega'],
            ['restartAgent', 'vega']
        ]);
        // Secret boundary: bridge verbs receive the operation-specific id only, never an object carrying PATs.
        expect(calls.every(([, payload]) => typeof payload === 'string')).toBe(true);
        expect(provider.data.pendingAction).toBeNull();
        expect(provider.data.controlReason).toBeNull()
    });

    test('sets pendingAction and clears stale controlReason when an accepted intent enters pending', async () => {
        const
            provider     = createProvider({controlReason: {action: 'start', kind: 'rejected', reason: 'old'}}),
            bridge       = {startAgent: () => Promise.resolve({state: 'running'})},
            settleResult = await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, provider, {bridge});

        expect(provider.writes[0]).toEqual({controlReason: null, pendingAction: 'start'});
        expect(provider.writes.at(-1)).toEqual({controlReason: null, pendingAction: null});
        expect(settleResult).toMatchObject({accepted: true, action: 'start', method: 'startAgent', ok: true, status: 'settled'})
    });

    test('bridge rejection clears pendingAction and writes a sanitized rejected reason', async () => {
        const
            provider = createProvider(),
            bridge   = {restartAgent: async () => { throw new Error('PAT: github_pat_secretvalue') }},
            result   = await handleFleetLifecycleIntent({action: 'restart', agentId: 'vega'}, provider, {bridge});

        expect(provider.data.pendingAction).toBeNull();
        expect(provider.data.controlReason).toEqual({
            action: 'restart',
            kind  : 'rejected',
            reason: '[redacted]'
        });
        expect(result).toMatchObject({accepted: true, ok: false, status: 'rejected'})
    });

    test('missing bridge fails closed as unauthorized without accepting a pending action', async () => {
        const
            provider = createProvider(),
            result   = await handleFleetLifecycleIntent({action: 'stop', agentId: 'vega'}, provider, {bridge: null});

        expect(provider.writes).toEqual([{
            pendingAction: null,
            controlReason: {action: 'stop', kind: 'unauthorized', reason: 'Fleet Registry bridge unavailable'}
        }]);
        expect(result).toMatchObject({accepted: false, ok: false, status: 'unauthorized'})
    });

    test('unsupported action rejects before calling the bridge', async () => {
        const
            provider = createProvider(),
            bridge   = {startAgent: async () => { throw new Error('must not call') }},
            result   = await handleFleetLifecycleIntent({action: 'remove', agentId: 'vega'}, provider, {bridge});

        expect(provider.data.pendingAction).toBeNull();
        expect(provider.data.controlReason).toEqual({
            action: 'remove',
            kind  : 'rejected',
            reason: "Unsupported lifecycle action 'remove'"
        });
        expect(result).toMatchObject({accepted: false, method: null, ok: false, status: 'rejected'})
    });

    test('timeout clears pendingAction and writes a timeout reason', async () => {
        const
            provider     = createProvider(),
            bridge       = {startAgent: () => new Promise(() => {})},
            setTimeoutFn = fn => {
                fn();
                return 'timeout-id'
            },
            clearCalls   = [],
            result       = await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, provider, {
                bridge,
                clearTimeoutFn: id => clearCalls.push(id),
                setTimeoutFn,
                timeoutMs     : 1
            });

        expect(clearCalls).toEqual(['timeout-id']);
        expect(provider.data.pendingAction).toBeNull();
        expect(provider.data.controlReason).toEqual({
            action: 'start',
            kind  : 'timeout',
            reason: 'start timed out after 1ms'
        });
        expect(result).toMatchObject({accepted: true, ok: false, status: 'timeout'})
    });

    test('the provider writer supports StateProvider-style setData and plain data fallbacks', () => {
        const provider = createProvider();

        writeLifecycleControlState(provider, {
            controlReason: createControlReason('start', 'rejected', 'no slot'),
            pendingAction: null
        });

        expect(provider.data.controlReason).toEqual({action: 'start', kind: 'rejected', reason: 'no slot'});

        const fallback = {data: {pendingAction: 'stop'}};
        writeLifecycleControlState(fallback, {pendingAction: null});
        expect(fallback.data.pendingAction).toBeNull()
    });

    test('reason sanitization redacts token-shaped strings', () => {
        expect(sanitizeControlReason('token: ghp_abc123 should not render')).toBe('[redacted] should not render');
        expect(sanitizeControlReason('plain lifecycle failure')).toBe('plain lifecycle failure')
    });
});
