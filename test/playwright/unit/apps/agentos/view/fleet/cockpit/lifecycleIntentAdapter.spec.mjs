import {setup} from '../../../../../../setup.mjs';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

import {
    createControlReason,
    handleFleetLifecycleIntent,
    sanitizeControlReason,
    writeLifecycleControlState
} from '../../../../../../../../apps/agentos/util/fleetLifecycleIntentAdapter.mjs';

// a record double: bulk `set()` like a Neo.data record (the C2 write seam), fields readable as
// plain properties — mirrors AgentOS.model.FleetAgent's pendingAction/controlReason contract.
const createRecord = (data = {}) => ({
    pendingAction: null,
    controlReason: null,
    ...data,
    writes: [],

    set(values) {
        this.writes.push({...values});
        Object.assign(this, values)
    }
});

test.describe('fleetLifecycleIntentAdapter — lifecycleIntent → registry bridge → record state (#14889)', () => {
    test('maps start/stop/restart intents to existing bridge verbs with agentId-only payloads', async () => {
        const
            record = createRecord({controlReason: {action: 'stop', kind: 'rejected', reason: 'old failure'}}),
            calls  = [],
            bridge = {
                startAgent  : async id => { calls.push(['startAgent', id]); return {state: 'running'} },
                stopAgent   : async id => { calls.push(['stopAgent', id]); return {state: 'stopped'} },
                restartAgent: async id => { calls.push(['restartAgent', id]); return {state: 'running'} }
            };

        await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, record, {bridge});
        await handleFleetLifecycleIntent({action: 'stop', agentId: 'vega'}, record, {bridge});
        await handleFleetLifecycleIntent({action: 'restart', agentId: 'vega'}, record, {bridge});

        expect(calls).toEqual([
            ['startAgent', 'vega'],
            ['stopAgent', 'vega'],
            ['restartAgent', 'vega']
        ]);
        // Secret boundary: bridge verbs receive the operation-specific id only, never an object carrying PATs.
        expect(calls.every(([, payload]) => typeof payload === 'string')).toBe(true);
        expect(record.pendingAction).toBeNull();
        expect(record.controlReason).toBeNull()
    });

    test('sets pendingAction and clears stale controlReason when an accepted intent enters pending', async () => {
        const
            record       = createRecord({controlReason: {action: 'start', kind: 'rejected', reason: 'old'}}),
            bridge       = {startAgent: () => Promise.resolve({state: 'running'})},
            settleResult = await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, record, {bridge});

        expect(record.writes[0]).toEqual({controlReason: null, pendingAction: 'start'});
        expect(record.writes.at(-1)).toEqual({controlReason: null, pendingAction: null});
        expect(settleResult).toMatchObject({accepted: true, action: 'start', method: 'startAgent', ok: true, status: 'settled'})
    });

    test('bridge rejection clears pendingAction and writes a sanitized rejected reason', async () => {
        const
            record = createRecord(),
            bridge = {restartAgent: async () => { throw new Error('PAT: github_pat_secretvalue') }},
            result = await handleFleetLifecycleIntent({action: 'restart', agentId: 'vega'}, record, {bridge});

        expect(record.pendingAction).toBeNull();
        expect(record.controlReason).toEqual({
            action: 'restart',
            kind  : 'rejected',
            reason: '[redacted]'
        });
        expect(result).toMatchObject({accepted: true, ok: false, status: 'rejected'})
    });

    test('missing bridge fails closed as unauthorized without accepting a pending action', async () => {
        const
            record = createRecord(),
            result = await handleFleetLifecycleIntent({action: 'stop', agentId: 'vega'}, record, {bridge: null});

        expect(record.writes).toEqual([{
            pendingAction: null,
            controlReason: {action: 'stop', kind: 'unauthorized', reason: 'Fleet Registry bridge unavailable'}
        }]);
        expect(result).toMatchObject({accepted: false, ok: false, status: 'unauthorized'})
    });

    test('unsupported action rejects before calling the bridge', async () => {
        const
            record = createRecord(),
            bridge = {startAgent: async () => { throw new Error('must not call') }},
            result = await handleFleetLifecycleIntent({action: 'remove', agentId: 'vega'}, record, {bridge});

        expect(record.pendingAction).toBeNull();
        expect(record.controlReason).toEqual({
            action: 'remove',
            kind  : 'rejected',
            reason: "Unsupported lifecycle action 'remove'"
        });
        expect(result).toMatchObject({accepted: false, method: null, ok: false, status: 'rejected'})
    });

    test('timeout clears pendingAction and writes a timeout reason', async () => {
        const
            record       = createRecord(),
            bridge       = {startAgent: () => new Promise(() => {})},
            setTimeoutFn = fn => {
                fn();
                return 'timeout-id'
            },
            clearCalls   = [],
            result       = await handleFleetLifecycleIntent({action: 'start', agentId: 'vega'}, record, {
                bridge,
                clearTimeoutFn: id => clearCalls.push(id),
                setTimeoutFn,
                timeoutMs     : 1
            });

        expect(clearCalls).toEqual(['timeout-id']);
        expect(record.pendingAction).toBeNull();
        expect(record.controlReason).toEqual({
            action: 'start',
            kind  : 'timeout',
            reason: 'start timed out after 1ms'
        });
        expect(result).toMatchObject({accepted: true, ok: false, status: 'timeout'})
    });

    test('the record writer supports record-style set() and the plain field-bag fallback (dock snapshot)', () => {
        const record = createRecord();

        writeLifecycleControlState(record, {
            controlReason: createControlReason('start', 'rejected', 'no slot'),
            pendingAction: null
        });

        expect(record.controlReason).toEqual({action: 'start', kind: 'rejected', reason: 'no slot'});

        // a plain field bag (the dock-blueprint snapshot shape) is mutated in place
        const bag = {pendingAction: 'stop', controlReason: null};
        writeLifecycleControlState(bag, {pendingAction: null});
        expect(bag.pendingAction).toBeNull()
    });

    test('reason sanitization redacts token-shaped strings', () => {
        expect(sanitizeControlReason('token: ghp_abc123 should not render')).toBe('[redacted] should not render');
        expect(sanitizeControlReason('plain lifecycle failure')).toBe('plain lifecycle failure')
    });
});
