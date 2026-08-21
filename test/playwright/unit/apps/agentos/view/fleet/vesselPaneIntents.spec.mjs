import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'VesselPaneIntentsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';
import FleetCockpit   from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';

/**
 * @summary The vessel-safety contract for every tear-out-capable intent pane (the memories
 * precedent generalized): string listeners carry the EXPLICIT controller scope — a
 * vessel-mounted pane has no controller above it, so an unscoped string would resolve dead in
 * the vessel and cache that miss — and every owner push routes through a phase-blind accessor
 * resolved at WRITE time, so a pane torn out, returning-parked, or rebuilt mid-flight still
 * receives the truth.
 */
function ownerStub(controller, overrides = {}) {
    return {
        buildCatchUpPartitionOptions : () => [],
        buildOperatorRecipientOptions: () => [],
        catchUpMarkOutcome           : null,
        catchUpSnapshot              : null,
        getController                : () => controller,
        operatorIdentityPosture      : null,
        operatorRecord               : null,
        operatorSnapshot             : null,
        wakeRoutesSnapshot           : null,
        ...overrides
    }
}

test.describe('FleetCockpit — vessel-fired pane intents + phase-blind owner pushes', () => {
    const proto = FleetCockpit.prototype;

    test('every tear-out-capable intent pane binds its string listeners to the owning controller', () => {
        const controller = {id: 'the-owning-controller'};

        for (const ref of ['operator-mailbox', 'catch-up', 'memories', 'wakeRoutes']) {
            const config = proto.resolveDockComponentRef.call(
                ownerStub(controller, {
                    memoriesTarget           : null,
                    memoriesSnapshot         : null,
                    memoriesDrillSession     : null,
                    memoriesDrillSnapshot    : null,
                    buildMemoriesAgentOptions: () => [],
                    buildMemoriesWindowToggle: () => ({})
                }),
                ref, {title: ref}, ref
            );

            expect(config.listeners.scope, `${ref} resolves its intents without a controller chain`)
                .toBe(controller)
        }
    });

    test('the three accessors are phase-blind: handle → returning-parked → reference, in that order', () => {
        const
            handle    = {id: 'vessel-handle'},
            returning = {id: 'returning-parked'},
            docked    = {id: 'docked-reference'};

        for (const [accessor, key] of [
            ['getOperatorMailboxPane', 'operator'],
            ['getCatchUpPane',         'catchUp'],
            ['getWakeRoutesPane',      'wakeRoutes']
        ]) {
            const me = {
                tearOutPaneHandles   : {[key]: handle},
                returningTearOutPanes: {[key]: returning},
                getReference         : () => docked
            };

            expect(proto[accessor].call(me), `${accessor}: the vessel handle wins`).toBe(handle);

            me.tearOutPaneHandles = {};
            expect(proto[accessor].call(me), `${accessor}: the returning-parked tier is reached`).toBe(returning);

            me.returningTearOutPanes = {};
            expect(proto[accessor].call(me), `${accessor}: the docked reference is the fallback`).toBe(docked)
        }
    });

    test('loadCatchUp writes into the WRITE-time pane — a pane rebuilt mid-flight receives the truth', async () => {
        const
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseRead,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            fleetHistory: () => new Promise(resolve => { releaseRead = resolve })
        }}};

        try {
            const me = ownerStub(null, {
                catchUpReadGeneration: 0,
                getCatchUpPane       : () => currentPane
            });

            const read = proto.loadCatchUp.call(me, {partition: 'unified'});

            currentPane = newPane;

            const envelope = {capability: {state: 'wired'}, partition: 'unified', sources: [], window: null};
            releaseRead(envelope);
            await read;

            expect(newPane.snapshot, 'the truth lands in the LIVE pane').toBe(envelope);
            expect(oldPane.snapshot, 'the call-time reference is never written').toBe(undefined);
            expect(me.catchUpSnapshot).toBe(envelope)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });

    test('markCatchUp writes the outcome into the WRITE-time pane', async () => {
        const
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseMark,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            markFleetCaughtUp: () => new Promise(resolve => { releaseMark = resolve })
        }}};

        try {
            const me = ownerStub(null, {getCatchUpPane: () => currentPane});

            const mark = proto.markCatchUp.call(me, {windowEnd: '2026-08-22T00:00:00Z'});

            currentPane = newPane;

            const outcome = {status: 'accepted'};
            releaseMark(outcome);
            await mark;

            expect(newPane.markOutcome).toBe(outcome);
            expect(oldPane.markOutcome).toBe(undefined)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });

    test('loadWakeRoutes writes into the WRITE-time pane through the new accessor', async () => {
        const
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseRead,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            fleetWakeRoutes: () => new Promise(resolve => { releaseRead = resolve })
        }}};

        try {
            const me = ownerStub(null, {
                wakeRoutesReadGeneration: 0,
                getWakeRoutesPane       : () => currentPane
            });

            const read = proto.loadWakeRoutes.call(me, {});

            currentPane = newPane;

            const envelope = {capability: {state: 'wired'}, routes: []};
            releaseRead(envelope);
            await read;

            expect(newPane.snapshot).toBe(envelope);
            expect(oldPane.snapshot).toBe(undefined);
            expect(me.wakeRoutesSnapshot).toBe(envelope)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });

    test('loadOperatorInbox admits on the call-time pane but writes into the WRITE-time pane', async () => {
        const
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseRead,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            fleetMailboxMirror: () => new Promise(resolve => { releaseRead = resolve })
        }}};

        try {
            const me = ownerStub(null, {
                operatorInboxReadGeneration: 0,
                operatorRecord             : {agentIdentityNodeId: '@tobiu'},
                getOperatorMailboxPane     : () => currentPane
            });

            const read = proto.loadOperatorInbox.call(me, {offset: 0});

            currentPane = newPane;

            const snapshot = {capability: {state: 'wired'}, messages: []};
            releaseRead(snapshot);
            await read;

            expect(newPane.snapshot).toBe(snapshot);
            expect(oldPane.snapshot).toBe(undefined);
            expect(me.operatorSnapshot).toBe(snapshot)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });
});
