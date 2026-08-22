import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'ConfigIntentRoundTripTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';
import {getDefinitionsWriteGeneration, runConfigIntentRoundTrip} from '../../../../../../../../apps/agentos/util/configIntentRoundTrip.mjs';

/**
 * @summary The shared configure round-trip's CROSS-OWNER contracts: both the Accounts keeper-view
 * and the AgentDetail configuration tab resolve the SAME provider-hosted store, so the runner owns
 * the shared-state authorities — per-record intent ordering, losing-surface supersede honesty, and
 * the per-store accepted-write generation. These witnesses drive two independent owners (own
 * identity tokens, own sinks) against one real store and prove: a newer intent from either surface
 * wins; an older response from the other owner can neither regress the record nor claim a terminal
 * state; the losing surface is TOLD (non-latching `superseded`) and can correct; and every
 * accepted write advances the store's write generation for boot-list recency checks.
 */
test.describe('configIntentRoundTrip — cross-owner supersession authority (#15242)', () => {
    let AgentDefinition, Store;

    test.beforeAll(async () => {
        AgentDefinition = (await import('../../../../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        Store           = (await import('../../../../../../../../src/data/Store.mjs')).default
    });

    const makeStore = data => Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data});

    test('two-owner overlap: a newer Detail intent resolved FIRST cannot be regressed by the older Accounts response — and the losing surface recovers', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            accountsOwner    = {},
            detailOwner      = {},
            deferred         = [],
            bridgeResolver   = () => ({configureAgent: intent => new Promise(resolve => deferred.push({intent, resolve}))}),
            accountsStatuses = [],
            detailStatuses   = [];

        // two OWNERS — separate identity tokens, separate sinks, the same shared record. Under
        // per-owner generation maps each response believed itself latest; the shared authority must not.
        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'claude-code'},
            owner        : accountsOwner,
            setSaveStatus: (...args) => accountsStatuses.push(args),
            store
        });

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'native-neo'},
            owner        : detailOwner,
            setSaveStatus: (...args) => detailStatuses.push(args),
            store
        });

        // out-of-order transport: the NEWER intent's response arrives first…
        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        expect(store.get('ada').harnessType).toBe('native-neo');

        // …then the OLDER response answers 'accepted' — and must change nothing durable
        deferred[0].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'claude-code', mcpServers: null}});
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');

        // the winner reported its truth; the superseded owner's sink got the HONEST non-terminal
        // 'superseded' — told what happened, never latched, never a fake 'saved'
        expect(detailStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(accountsStatuses.map(entry => entry[1])).toEqual(['pending', 'superseded']);

        // RE-ENTRY: the losing surface is not dead — its next intent runs a full round-trip
        const retry = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'antigravity'},
            owner        : accountsOwner,
            setSaveStatus: (...args) => accountsStatuses.push(args),
            store
        });

        deferred[2].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'antigravity', mcpServers: null}});
        await retry;

        expect(store.get('ada').harnessType).toBe('antigravity');
        expect(accountsStatuses.map(entry => entry[1])).toEqual(['pending', 'superseded', 'pending', 'accepted']);

        store.destroy()
    });

    test('same-owner supersession stays SILENT: the newer request owns that sink\'s next paint', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            owner          = {},
            deferred       = [],
            bridgeResolver = () => ({configureAgent: intent => new Promise(resolve => deferred.push({intent, resolve}))}),
            statuses       = [];

        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'claude-code'},
            owner,
            setSaveStatus: (...args) => statuses.push(args),
            store
        });

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'native-neo'},
            owner,
            setSaveStatus: (...args) => statuses.push(args),
            store
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        // the older response resolving now belongs to the SAME sink the newer request just
        // painted 'accepted' — a 'superseded' stamp here would mislabel a save that succeeded
        deferred[0].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'claude-code', mcpServers: null}});
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(statuses.map(entry => entry[1])).toEqual(['pending', 'pending', 'accepted']);

        store.destroy()
    });

    test('identity-move: a stale REJECTION cannot claim terminal status over the newer owner (@neo-gpt\'s cycle-2 falsifier)', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            deferred       = [],
            bridgeResolver = () => ({configureAgent: intent => new Promise((resolve, reject) => deferred.push({intent, resolve, reject}))}),
            olderStatuses  = [],
            newerStatuses  = [];

        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'claude-code'},
            owner        : {},
            setSaveStatus: (...args) => olderStatuses.push(args),
            store
        });

        // the reload replaces instance A with instance B while the older response is in flight —
        // A's generation counter cannot see anything that happens to B
        store.clear();
        store.add({id: 'ada', githubUsername: 'ada', harnessType: 'antigravity'});

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'native-neo'},
            owner        : {},
            setSaveStatus: (...args) => newerStatuses.push(args),
            store
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        // the older response answers REJECTED — stale on every axis, it may claim NO terminal
        // state: the record stays, and its sink gets the honest non-latching 'superseded'
        deferred[0].resolve({status: 'rejected', reason: 'stale rejection must not win'});
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(newerStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(olderStatuses.map(entry => entry[1])).toEqual(['pending', 'superseded']);

        store.destroy()
    });

    test('identity-move: a stale transport THROW cannot claim terminal status over the newer owner', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            deferred       = [],
            bridgeResolver = () => ({configureAgent: intent => new Promise((resolve, reject) => deferred.push({intent, resolve, reject}))}),
            olderStatuses  = [],
            newerStatuses  = [];

        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'claude-code'},
            owner        : {},
            setSaveStatus: (...args) => olderStatuses.push(args),
            store
        });

        store.clear();
        store.add({id: 'ada', githubUsername: 'ada', harnessType: 'antigravity'});

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            intent       : {id: 'ada', harnessType: 'native-neo'},
            owner        : {},
            setSaveStatus: (...args) => newerStatuses.push(args),
            store
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        // the older request DIES on the wire — the sanitized catch path must consult the same
        // staleness authority: no 'rejected' repaint over the newer 'accepted', an honest
        // 'superseded' on its own sink instead
        deferred[0].reject(new Error('transport died'));
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(newerStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(olderStatuses.map(entry => entry[1])).toEqual(['pending', 'superseded']);

        store.destroy()
    });

    test('every accepted write advances the store\'s shared write generation; nothing else does', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const before = getDefinitionsWriteGeneration(store);

        // a rejected outcome writes nothing — the generation must not move
        await runConfigIntentRoundTrip({
            bridgeResolver: () => ({configureAgent: async () => ({status: 'rejected', reason: 'no'})}),
            intent        : {id: 'ada', harnessType: 'claude-code'},
            owner         : {},
            setSaveStatus : () => {},
            store
        });

        expect(getDefinitionsWriteGeneration(store)).toBe(before);

        // an accepted readback is newer canonical truth — any in-flight boot list is now stale
        await runConfigIntentRoundTrip({
            bridgeResolver: () => ({configureAgent: async () => ({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}})}),
            intent        : {id: 'ada', harnessType: 'native-neo'},
            owner         : {},
            setSaveStatus : () => {},
            store
        });

        expect(getDefinitionsWriteGeneration(store)).toBe(before + 1);

        store.destroy()
    })

    test('remote target intent crosses the wire exactly while event envelopes and credential-shaped noise are stripped', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex', mcpTarget: null}
        ]);
        let received;

        await runConfigIntentRoundTrip({
            bridgeResolver: () => ({configureAgent: async intent => {
                received = intent;

                return {
                    status: 'accepted',
                    agent : {
                        id         : 'ada',
                        harnessType: 'codex',
                        mcpServers : null,
                        mcpTarget  : {kind: 'tenant', tenantId: 'tenant-a'}
                    }
                }
            }}),
            intent: {
                id        : 'ada',
                mcpTarget : {kind: 'tenant', tenantId: 'tenant-a'},
                source    : 'component-event-envelope',
                credential: 'must-not-cross',
                headers   : {Authorization: 'Bearer secret'}
            },
            owner        : {},
            setSaveStatus: () => {},
            store
        });

        expect(received).toEqual({
            id       : 'ada',
            mcpTarget: {kind: 'tenant', tenantId: 'tenant-a'}
        });
        expect(JSON.stringify(received)).not.toMatch(/must-not-cross|Authorization|Bearer secret/);
        expect(store.get('ada').mcpTarget).toEqual({kind: 'tenant', tenantId: 'tenant-a'});

        store.destroy()
    })
});
