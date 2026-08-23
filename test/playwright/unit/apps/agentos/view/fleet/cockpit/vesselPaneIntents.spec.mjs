import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'VesselPaneIntentsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';
import Component    from '../../../../../../../../src/component/Base.mjs';
import FleetCockpit from '../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs';

/**
 * @summary The vessel-safety contract for every tear-out-capable intent pane (the memories
 * precedent generalized): string listeners carry the EXPLICIT controller scope — a
 * vessel-mounted pane has no controller above it, so an unscoped string resolves dead in the
 * vessel (a TypeError per fire; the null lookup is NOT sticky — `getController`'s fast path is
 * truthy-only, so it re-walks once docked) — and every owner push routes through a phase-blind
 * accessor resolved at WRITE time, so a pane torn out, returning-parked, or rebuilt mid-flight
 * still receives the truth.
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

    test('vessel-fired intents reach the scoped controller through the REAL fire path — and die without the scope', () => {
        // every configured intent name per pane, from the resolver's own listener configs
        const paneIntents = {
            'operator-mailbox': ['compose', 'inboxPageRequest'],
            'catch-up'        : ['historyRequest', 'markCaughtUpRequest', 'liveSurfaceRequest'],
            'memories'        : ['memoriesRequest', 'sessionDetailRequest', 'sessionDetailClosed'],
            'wakeRoutes'      : ['wakeRoutesRequest']
        };

        for (const [ref, events] of Object.entries(paneIntents)) {
            const
                received   = [],
                // the scope-liveness check inside Observable#fire drops handlers whose resolved
                // scope has no id, so the recorder must look alive
                controller = {id: 'the-owning-controller'};

            const config = proto.resolveDockComponentRef.call(
                ownerStub(controller, {
                    memoriesTarget           : null,
                    memoriesSnapshot         : null,
                    memoriesDrillSession     : null,
                    memoriesDrillSnapshot    : null,
                    buildMemoriesWindowToggle: () => ({})
                }),
                ref, {title: ref}, ref
            );

            // the recorder learns each handler NAME from the resolver's own config — the witness
            // can never drift from the listener strings it exists to prove
            for (const event of events) {
                const name = config.listeners[event];

                expect(typeof name, `${ref}.${event} is a configured string handler`).toBe('string');
                controller[name] = data => received.push({event, data})
            }

            // the vessel condition: a real component with NO parent — no controller chain exists
            // above it, exactly like a pane mounted inside a tear-out vessel window
            const vesseled = Neo.create(Component, {
                appName  : 'VesselPaneIntentsTest',
                listeners: config.listeners
            });

            for (const event of events) {
                vesseled.fire(event, {probe: event})
            }

            expect(received.map(r => r.event), `${ref}: every configured intent reaches the scoped controller`)
                .toEqual(events);
            received.forEach(r => {
                expect(r.data.probe).toBe(r.event);
                expect(r.data.source, 'the payload rides the real Observable#fire path').toBe(vesseled.id)
            });

            // the red-proof: the SAME config minus the explicit scope — the fire resolves through
            // the vesseled component's (empty) controller chain and dies as a TypeError per fire,
            // the close-target's exact defect made observable
            const {scope, ...unscoped} = config.listeners;
            const bare                 = Neo.create(Component, {
                appName  : 'VesselPaneIntentsTest',
                listeners: unscoped
            });

            expect(() => bare.fire(events[0], {probe: 'dead'}),
                `${ref}: the unscoped vessel fire dies instead of reaching the controller`)
                .toThrow(TypeError);
            expect(received.length, 'the controller never hears the unscoped fire').toBe(events.length);

            vesseled.destroy();
            bare.destroy()
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
