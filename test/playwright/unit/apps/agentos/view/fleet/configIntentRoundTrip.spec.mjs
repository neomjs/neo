import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'ConfigIntentRoundTripTest'
    }
});

import {test, expect}             from '@playwright/test';
import Neo                        from '../../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../../src/core/_export.mjs';
import {runConfigIntentRoundTrip} from '../../../../../../../apps/agentos/view/fleet/configIntentRoundTrip.mjs';

/**
 * @summary The shared configure round-trip's CROSS-OWNER ordering contract: both the
 * Accounts keeper-view and the AgentDetail configuration tab resolve the SAME provider-hosted
 * record, so supersession is arbitrated per shared record inside the runner — never per owner.
 * These witnesses drive two independent owners (own sinks, own calls) against one real store and
 * prove the one ordering authority: a newer intent from either surface wins, an older response
 * from the other can neither regress the record nor claim a terminal state.
 */
test.describe('configIntentRoundTrip — cross-owner supersession authority (#15242)', () => {
    let AgentDefinition, Store;

    test.beforeAll(async () => {
        AgentDefinition = (await import('../../../../../../../apps/agentos/model/AgentDefinition.mjs')).default;
        Store           = (await import('../../../../../../../src/data/Store.mjs')).default
    });

    const makeStore = data => Neo.create(Store, {keyProperty: 'id', model: AgentDefinition, data});

    test('two-owner overlap: a newer Detail intent resolved FIRST cannot be regressed by the older Accounts response', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            deferred         = [],
            bridgeResolver   = () => ({configureAgent: intent => new Promise(resolve => deferred.push({intent, resolve}))}),
            accountsStatuses = [],
            detailStatuses   = [];

        // two OWNERS — separate calls, separate sinks, the same shared record. Under per-owner
        // generation maps each response believed itself latest; the shared authority must not.
        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'claude-code'},
            setSaveStatus: (...args) => accountsStatuses.push(args)
        });

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'native-neo'},
            setSaveStatus: (...args) => detailStatuses.push(args)
        });

        // out-of-order transport: the NEWER intent's response arrives first…
        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        expect(store.get('ada').harnessType).toBe('native-neo');

        // …then the OLDER response answers 'accepted' — and must change nothing
        deferred[0].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'claude-code', mcpServers: null}});
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');

        // the winner reported its truth; the superseded owner's sink got NO terminal claim (a
        // stamped "saved" beside a record now rendering someone else's newer truth would be a lie)
        expect(detailStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(accountsStatuses.map(entry => entry[1])).toEqual(['pending']);

        store.destroy()
    });

    test('a response whose record identity moved mid-flight yields to a newer intent on the NEW instance', async () => {
        const store = makeStore([
            {id: 'ada', githubUsername: 'ada', harnessType: 'codex'}
        ]);

        const
            deferred       = [],
            bridgeResolver = () => ({configureAgent: intent => new Promise(resolve => deferred.push({intent, resolve}))}),
            statuses       = [];

        const older = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'claude-code'},
            setSaveStatus: (...args) => statuses.push(args)
        });

        // a reload replaces membership wholesale while the response is in flight: same id, NEW
        // record instance — the older response's issue-time target no longer exists in the store
        store.clear();
        store.add({id: 'ada', githubUsername: 'ada', harnessType: 'antigravity'});

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'native-neo'},
            setSaveStatus: () => {}
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        deferred[0].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'claude-code', mcpServers: null}});
        await older;

        // the post-reload instance carries the newer truth; the pre-reload response changed nothing
        expect(store.get('ada').harnessType).toBe('native-neo');

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
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'claude-code'},
            setSaveStatus: (...args) => olderStatuses.push(args)
        });

        // the reload replaces instance A with instance B while the older response is in flight —
        // A's generation counter cannot see anything that happens to B
        store.clear();
        store.add({id: 'ada', githubUsername: 'ada', harnessType: 'antigravity'});

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'native-neo'},
            setSaveStatus: (...args) => newerStatuses.push(args)
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        // the older response answers REJECTED — stale on every axis, it may claim NOTHING: not the
        // record, and not a terminal status over the newer owner's accepted truth
        deferred[0].resolve({status: 'rejected', reason: 'stale rejection must not win'});
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(newerStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(olderStatuses.map(entry => entry[1])).toEqual(['pending']);

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
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'claude-code'},
            setSaveStatus: (...args) => olderStatuses.push(args)
        });

        store.clear();
        store.add({id: 'ada', githubUsername: 'ada', harnessType: 'antigravity'});

        const newer = runConfigIntentRoundTrip({
            bridgeResolver,
            getRecord    : id => store.get(id),
            intent       : {id: 'ada', harnessType: 'native-neo'},
            setSaveStatus: (...args) => newerStatuses.push(args)
        });

        deferred[1].resolve({status: 'accepted', agent: {id: 'ada', harnessType: 'native-neo', mcpServers: null}});
        await newer;

        // the older request DIES on the wire — the sanitized catch path must consult the same
        // staleness authority and stay silent, not repaint 'rejected' over the newer 'accepted'
        deferred[0].reject(new Error('transport died'));
        await older;

        expect(store.get('ada').harnessType).toBe('native-neo');
        expect(newerStatuses.map(entry => entry[1])).toEqual(['pending', 'accepted']);
        expect(olderStatuses.map(entry => entry[1])).toEqual(['pending']);

        store.destroy()
    })
});
