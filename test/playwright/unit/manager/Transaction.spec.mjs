import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerTransactionTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * A Group is the identity of one multi-window topology instance; `appName` only routes. These arms drive
 * the manager the way the worker does — `onWindowConnect` with the carrier's identity inside `windowData`,
 * `onWindowDisconnect` with the generation that left — and read the outcomes back.
 *
 * The falsifier is two Workstation roots under one worker: A and its popup share a Group, B shares only
 * the app name, reloading A's root moves one generation and touches neither B nor a second Group, and a
 * late disconnect for the superseded generation cannot unbind its successor.
 */
test.describe.serial('Neo.manager.Transaction — Groups and token-matched window bindings', () => {
    let Transaction;

    // The worker admits a window when its config registers, carrying the identity the main thread read.
    const connect = (windowId, topologyIdentity) => Transaction.admit({topologyIdentity, windowId});

    // The manager is a worker-wide singleton, and a Playwright worker runs many spec files: a Group a
    // sibling spec released and left to its lease would count here. Every arm starts from nothing.
    const reset = () => {
        [...Transaction.items].forEach(group => Transaction.retireGroup(group.id));
        Transaction.reconnectLeaseMs = 20000
    };

    test.beforeAll(async () => {
        Transaction = (await import('../../../../src/manager/Transaction.mjs')).default
    });

    test.beforeEach(reset);
    test.afterEach(reset);

    test('a root without identity mints a Group; a second root of the same app mints another', () => {
        const a = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              b = Transaction.bind({windowId: 'b1', workspaceKey: 'main'});

        expect(a.outcome).toBe('minted');
        expect(b.outcome).toBe('minted');
        expect(a.groupId).not.toBe(b.groupId);
        expect(Transaction.items).toHaveLength(2);
        expect(Transaction.getBinding(a.groupId, 'main')).toEqual({generation: 1, windowId: 'a1', workspaceKey: 'main'});
        expect(Transaction.findByWindow('b1')).toEqual({generation: 1, groupId: b.groupId, workspaceKey: 'main'})
    });

    test('the two-Workstation falsifier: a reload moves one generation, and a late disconnect cannot unbind the successor', () => {
        const a = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              b = Transaction.bind({windowId: 'b1', workspaceKey: 'main'});

        // The opener reserves the popup slot and writes the reservation into the child's carrier.
        const reservation = Transaction.reserve({groupId: a.groupId, workspaceKey: 'popup:documents'});

        expect(reservation).toEqual({generationToken: expect.any(String), groupId: a.groupId, workspaceKey: 'popup:documents'});

        connect('a2', reservation);

        expect(Transaction.findByWindow('a2')).toEqual({generation: 1, groupId: a.groupId, workspaceKey: 'popup:documents'});

        // Reload A's root: the old generation leaves, the new one presents the carried identity.
        Transaction.onWindowDisconnect({windowId: 'a1'});

        expect(Transaction.getBinding(a.groupId, 'main').windowId, 'the slot is held, not freed').toBeNull();

        const reloaded = Transaction.bind({groupId: a.groupId, workspaceKey: 'main', generationToken: a.generationToken, windowId: 'a3'});

        expect(reloaded.outcome).toBe('rebound');
        expect(reloaded.groupId, 'no Group was created').toBe(a.groupId);
        expect(reloaded.generation).toBe(2);
        expect(Transaction.items, 'A and B, nothing else').toHaveLength(2);

        // B and A's popup are untouched.
        expect(Transaction.getBinding(b.groupId, 'main')).toEqual({generation: 1, windowId: 'b1', workspaceKey: 'main'});
        expect(Transaction.findByWindow('a2').groupId).toBe(a.groupId);

        // The superseded generation reports its disconnect late.
        expect(Transaction.release('a1'), 'no binding carries a1 any more').toBe(false);
        expect(Transaction.getBinding(a.groupId, 'main')).toEqual({generation: 2, windowId: 'a3', workspaceKey: 'main'})
    });

    test('a copied identity presented while its binder is live forks a new Group', () => {
        const a         = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              duplicate = Transaction.bind({groupId: a.groupId, workspaceKey: 'main', generationToken: a.generationToken, windowId: 'a1-copy'});

        expect(duplicate.outcome).toBe('forked');
        expect(duplicate.groupId).not.toBe(a.groupId);
        expect(duplicate.generationToken, 'the fork carries its own lineage').not.toBe(a.generationToken);
        expect(Transaction.getBinding(a.groupId, 'main').windowId, 'the live binder was not superseded').toBe('a1');
        expect(Transaction.findByWindow('a1-copy').groupId).toBe(duplicate.groupId)
    });

    test('a released slot rebinds only for its lineage token; a stranger forks', () => {
        const a = Transaction.bind({windowId: 'a1', workspaceKey: 'main'});

        Transaction.release('a1');

        const stranger = Transaction.bind({groupId: a.groupId, workspaceKey: 'main', generationToken: 'not-the-lineage', windowId: 's1'});

        expect(stranger.outcome).toBe('forked');
        expect(stranger.groupId).not.toBe(a.groupId);
        expect(Transaction.getBinding(a.groupId, 'main').windowId, 'the held slot stays held for its lineage').toBeNull();

        const heir = Transaction.bind({groupId: a.groupId, workspaceKey: 'main', generationToken: a.generationToken, windowId: 'a2'});

        expect(heir.outcome).toBe('rebound');
        expect(heir.generation).toBe(2)
    });

    test('the reconnect lease is bounded: past it the slot is free and a fresh binder is bound, not rebound', async () => {
        Transaction.reconnectLeaseMs = 20;

        const a       = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              expired = [];

        Transaction.on('leaseExpired', data => expired.push(data));
        Transaction.release('a1');

        await new Promise(resolve => setTimeout(resolve, 60));

        expect(expired).toEqual([expect.objectContaining({groupId: a.groupId, workspaceKey: 'main'})]);
        expect(Transaction.getBinding(a.groupId, 'main'), 'the slot is free').toBeNull();

        // Its last slot gone, the Group held nothing else: it is retired rather than left behind.
        expect(Transaction.get(a.groupId), 'an empty Group does not linger').toBeNull();

        const late = Transaction.bind({groupId: a.groupId, workspaceKey: 'main', generationToken: a.generationToken, windowId: 'a2'});

        expect(late.outcome, 'the carried id comes back cold, not into a lingering record').toBe('cold');
        expect(late.groupId).toBe(a.groupId)
    });

    test('a lease running out on one slot keeps a Group that still binds another', async () => {
        Transaction.reconnectLeaseMs = 20;

        const a = Transaction.bind({windowId: 'a1', workspaceKey: 'main'});

        connect('a2', Transaction.reserve({groupId: a.groupId, workspaceKey: 'popup:documents'}));
        Transaction.release('a2');

        await new Promise(resolve => setTimeout(resolve, 60));

        expect(Transaction.getBinding(a.groupId, 'popup:documents'), 'the popup slot is free').toBeNull();
        expect(Transaction.getBinding(a.groupId, 'main'), 'the root still binds').toEqual({generation: 1, windowId: 'a1', workspaceKey: 'main'})
    });

    test('participants are the Group\'s and outlive its bindings: opaque, replaced by key, kept through release and lease expiry, gone only with the Group', async () => {
        Transaction.reconnectLeaseMs = 20;

        const a     = Transaction.bind({windowId: 'a1', workspaceKey: 'main'}),
              owner = {getDocument: () => 'doc'};

        expect(Transaction.registerParticipant({groupId: 'unknown', workspaceKey: 'main', participant: owner}), 'an unknown Group refuses').toBe(false);
        expect(Transaction.registerParticipant({groupId: a.groupId, workspaceKey: '', participant: owner}), 'a key is required').toBe(false);
        expect(Transaction.registerParticipant({groupId: a.groupId, workspaceKey: 'main', participant: null}), 'a participant is required').toBe(false);
        expect(Transaction.registerParticipant({groupId: a.groupId, workspaceKey: 'main', participant: owner})).toBe(true);
        expect(Transaction.registerParticipant({groupId: a.groupId, workspaceKey: 'vessel', participant: {}})).toBe(true);
        expect(Transaction.participantKeys(a.groupId)).toEqual(['main', 'vessel']);
        expect(Transaction.getParticipant(a.groupId, 'main'), 'held opaque, returned as registered').toBe(owner);

        const replacement = {getDocument: () => 'doc2'};

        expect(Transaction.registerParticipant({groupId: a.groupId, workspaceKey: 'main', participant: replacement}), 'the same key replaces').toBe(true);
        expect(Transaction.getParticipant(a.groupId, 'main')).toBe(replacement);
        expect(Transaction.participantKeys(a.groupId), 'a replacement keeps its key\'s place').toEqual(['main', 'vessel']);

        // The window dies and its lease runs out: the slot is free; the Group and its participants stay.
        Transaction.release('a1');

        await new Promise(resolve => setTimeout(resolve, 60));

        expect(Transaction.getBinding(a.groupId, 'main'), 'the slot is free').toBeNull();
        expect(Transaction.get(a.groupId), 'a Group holding participants is not empty and is not retired').toBeTruthy();
        expect(Transaction.participantKeys(a.groupId)).toEqual(['main', 'vessel']);

        expect(Transaction.unregisterParticipant({groupId: a.groupId, workspaceKey: 'vessel'})).toBe(true);
        expect(Transaction.unregisterParticipant({groupId: a.groupId, workspaceKey: 'vessel'}), 'retirement is exact-once').toBe(false);
        expect(Transaction.retireGroup(a.groupId)).toBe(true);
        expect(Transaction.getParticipant(a.groupId, 'main'), 'gone with the Group').toBeNull()
    });

    test('a Group this worker never saw is created cold under the carried id, so persisted state can find it later', () => {
        const cold = Transaction.bind({groupId: 'group-from-a-previous-worker', workspaceKey: 'main', generationToken: 'lineage', windowId: 'w1'});

        expect(cold.outcome).toBe('cold');
        expect(cold.groupId).toBe('group-from-a-previous-worker');
        expect(cold.generationToken, 'the carried lineage is kept').toBe('lineage');
        expect(Transaction.getBinding('group-from-a-previous-worker', 'main').windowId).toBe('w1')
    });

    test('a reserved slot cannot be reserved again while live, and an empty carrier admits a fresh root', () => {
        const a = Transaction.bind({windowId: 'a1', workspaceKey: 'main'});

        expect(Transaction.reserve({groupId: a.groupId, workspaceKey: 'main'}), 'a live slot').toBeNull();
        expect(Transaction.reserve({groupId: 'unknown', workspaceKey: 'popup:x'}), 'an unknown Group').toBeNull();

        const before = Transaction.items.length;

        expect(connect('fresh-root', {}).outcome, 'no carrier yet: a Group is minted').toBe('minted');
        expect(Transaction.items).toHaveLength(before + 1)
    });

    test('a manager loading after apps registered admits every live window with the identity its config carried', () => {
        // The module loads on demand — with the first multi-window participant — so the windows whose
        // apps registered before that moment must not stay unbound. A second instance of the class
        // stands in for that later load; the singleton the worker uses is untouched.
        const
            writes          = [],
            previousApps    = Neo.apps,
            previousConfigs = Neo.windowConfigs,
            carried         = {generationToken: 'lineage-7', groupId: 'group-carried', workspaceKey: 'popup:notes'};

        let late;

        Neo.ns('Neo.Main', true).setTopologyIdentity = data => writes.push(data);
        Neo.apps          = {'late-popup': {}, 'late-root': {}};
        Neo.windowConfigs = {'late-popup': {topologyIdentity: carried}};

        try {
            late = Neo.create(Transaction.constructor, {});

            expect(late.findByWindow('late-root')).toEqual({generation: 1, groupId: expect.any(String), workspaceKey: 'main'});
            expect(late.findByWindow('late-popup'), 'a carried identity binds cold under its own Group').toEqual({generation: 1, groupId: 'group-carried', workspaceKey: 'popup:notes'});
            expect(late.items).toHaveLength(2);
            expect(writes.map(write => write.windowId), 'only the minted root learns something new').toEqual(['late-root'])
        } finally {
            late?.destroy();
            Neo.apps          = previousApps;
            Neo.windowConfigs = previousConfigs;
            delete Neo.Main.setTopologyIdentity
        }
    });

    test('the carrier learns what the worker decided: minted and forked identities are written back, a rebind is not', () => {
        const writes = [];

        Neo.ns('Neo.Main', true).setTopologyIdentity = data => writes.push(data);

        try {
            connect('r1', {});

            expect(writes).toHaveLength(1);

            const identity = writes[0];

            expect(identity).toEqual({generationToken: expect.any(String), groupId: expect.any(String), windowId: 'r1', workspaceKey: 'main'});

            // A warm reload presents the carried identity and rebinds — the carrier already holds it.
            Transaction.onWindowDisconnect({windowId: 'r1'});
            connect('r2', {generationToken: identity.generationToken, groupId: identity.groupId, workspaceKey: 'main'});

            expect(writes, 'a rebind carries nothing new').toHaveLength(1);

            // A copied identity while r2 is live forks, and the fork's window learns its new Group.
            connect('r3', {generationToken: identity.generationToken, groupId: identity.groupId, workspaceKey: 'main'});

            expect(writes).toHaveLength(2);
            expect(writes[1].windowId).toBe('r3');
            expect(writes[1].groupId).not.toBe(identity.groupId)
        } finally {
            delete Neo.Main.setTopologyIdentity
        }
    })
});
