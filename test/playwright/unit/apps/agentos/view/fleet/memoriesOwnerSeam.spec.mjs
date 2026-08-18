import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MemoriesOwnerSeamTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';
import FleetCockpit   from '../../../../../../../apps/agentos/view/fleet/FleetCockpit.mjs';

/**
 * @summary The FleetCockpit owner seam for the memories selection, driven as prototype methods
 * over controlled state (the projection-spec pattern): the requested target is owner-held BEFORE
 * any await, the rematerialized pane receives the PENDING selection ahead of the last accepted
 * snapshot's target, and the accepted response lands in the pane resolved at WRITE time — a pane
 * destroyed and rebuilt mid-flight still receives the truth.
 */
function ownerStub({memoriesTarget = null, memoriesSnapshot = null, pane = null} = {}) {
    return {
        memoriesTarget,
        memoriesSnapshot,
        memoriesReadGeneration   : 0,
        buildMemoriesAgentOptions: () => [],
        // the cockpit surface the seam methods consume: the explicit listener scope
        // resolves through getController, and owner pushes route through the phase-blind
        // accessor instead of a raw reference read
        getController  : () => null,
        getMemoriesPane: () => pane,
        getReference   : () => pane
    }
}

test.describe('FleetCockpit — memories owner seam (pending selection + write-time pane resolve)', () => {
    test('the rebuilt pane receives the PENDING selection ahead of the accepted snapshot target', () => {
        const proto = FleetCockpit.prototype;

        const pendingSwitch = proto.resolveDockComponentRef.call(
            ownerStub({memoriesTarget: '@neo-fable-clio', memoriesSnapshot: {target: '@neo-opus-ada'}}),
            'memories', {title: 'Memories'}, 'memories'
        );
        expect(pendingSwitch.activeAgent).toBe('@neo-fable-clio');
        expect(pendingSwitch.snapshot.target).toBe('@neo-opus-ada');

        const settled = proto.resolveDockComponentRef.call(
            ownerStub({memoriesTarget: null, memoriesSnapshot: {target: '@neo-opus-ada'}}),
            'memories', {title: 'Memories'}, 'memories'
        );
        expect(settled.activeAgent).toBe('@neo-opus-ada');

        const untouched = proto.resolveDockComponentRef.call(
            ownerStub(),
            'memories', {title: 'Memories'}, 'memories'
        );
        expect(untouched.activeAgent).toBe(null)
    });

    test('loadMemories owner-holds the target BEFORE the await and writes into the WRITE-time pane', async () => {
        const
            proto      = FleetCockpit.prototype,
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseRead,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            fleetMemories: () => new Promise(resolve => { releaseRead = resolve })
        }}};

        try {
            const me = {
                memoriesTarget        : null,
                memoriesSnapshot      : null,
                memoriesReadGeneration: 0,
                // the WRITE-time resolve rides the phase-blind accessor
                getMemoriesPane: () => currentPane,
                getReference   : () => currentPane
            };

            const read = proto.loadMemories.call(me, {agentIdentity: '@neo-gpt-bob'});

            // owner-held synchronously, before any settlement — the rematerialization key exists
            // the moment the intent passes through the owner
            expect(me.memoriesTarget).toBe('@neo-gpt-bob');
            expect(me.memoriesSnapshot).toBe(null);

            // the pane is destroyed and rebuilt while the read is in flight
            currentPane = newPane;

            const envelope = {capability: {state: 'wired'}, target: '@neo-gpt-bob', page: {offset: 0, limit: 20}, sessions: [], count: 0, total: 0};
            releaseRead(envelope);
            await read;

            // the truth lands in the LIVE pane, never the destroyed call-time reference
            expect(newPane.snapshot).toBe(envelope);
            expect(oldPane.snapshot).toBe(undefined);
            expect(me.memoriesSnapshot).toBe(envelope)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });

    test('loadSessionMemories owner-holds the drill BEFORE the await, strips display state off the wire, and writes into the WRITE-time pane', async () => {
        const
            proto      = FleetCockpit.prototype,
            oldPane    = {},
            newPane    = {},
            previousNs = globalThis.AgentOS;

        let releaseRead,
            wireParams,
            currentPane = oldPane;

        globalThis.AgentOS = {fleet: {registryBridge: {
            fleetSessionMemories: params => {
                wireParams = params;
                return new Promise(resolve => { releaseRead = resolve })
            }
        }}};

        try {
            const me = {
                memoriesDrillSession       : null,
                memoriesDrillSnapshot      : null,
                memoriesDrillReadGeneration: 0,
                getMemoriesPane            : () => currentPane
            };

            const read = proto.loadSessionMemories.call(me, {sessionId: 'abcd1234-session', title: 'The witnessed day'});

            // owner-held synchronously, before any settlement — the rematerialization key exists
            // the moment the intent passes through the owner; the TITLE is owner/display state
            // only and never rides the wire
            expect(me.memoriesDrillSession).toEqual({sessionId: 'abcd1234-session', title: 'The witnessed day'});
            expect(wireParams).toEqual({sessionId: 'abcd1234-session'});

            // the pane is destroyed and rebuilt while the read is in flight
            currentPane = newPane;

            const envelope = {capability: {state: 'wired'}, sessionId: 'abcd1234-session', page: {offset: 0, limit: 20}, turns: [], count: 0, total: 0};
            releaseRead(envelope);
            await read;

            // the truth lands in the LIVE pane through the phase-blind accessor
            expect(newPane.drillSnapshot).toBe(envelope);
            expect(oldPane.drillSnapshot).toBe(undefined);
            expect(me.memoriesDrillSnapshot).toBe(envelope);

            // the close intent clears BOTH halves of the owner state — a left drill cannot reopen
            proto.clearSessionMemoriesDrill.call(me);
            expect(me.memoriesDrillSession).toBe(null);
            expect(me.memoriesDrillSnapshot).toBe(null)
        } finally {
            globalThis.AgentOS = previousNs
        }
    });
});
