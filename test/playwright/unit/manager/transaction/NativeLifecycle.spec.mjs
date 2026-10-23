import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ManagerTransactionNativeLifecycleTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/** @summary Native ownership survives views; asynchronous platform results remain generation-scoped. */
test.describe('Group native lifecycle (#18314)', () => {
    let manager;

    const deferred = () => {
        let resolve;
        const promise = new Promise(done => { resolve = done });
        return {promise, resolve}
    };
    const effects = (overrides={}) => ({
        keyFor: itemId => `resource:${itemId}`,
        open  : async ({itemId}) => ({windowName: `native-${itemId}`}),
        close : async () => true,
        ...overrides
    });
    const owner = windowId => {
        const {groupId} = manager.bind({windowId});
        return manager.getNativeLifecycle(groupId)
    };
    const release = windowId => {
        let data;
        const listener = {release: event => { if (event.windowId === windowId) data = event },
            scope: {id: `native-lifecycle-release-${windowId}`}};
        manager.on(listener);
        try { expect(manager.release(windowId)).toBe(true) } finally { manager.un(listener) }
        return data
    };

    test.beforeAll(async () => { manager = (await import('../../../../../src/manager/Transaction.mjs')).default });
    test.afterEach(async () => {
        [...manager.items].forEach(group => manager.retireGroup(group.id));
        manager.reconnectLeaseMs = 20000;
        await Promise.resolve()
    });

    test('three sources share one Group owner; equal resource keys in another Group are isolated', async () => {
        const a = owner('root-a'), b = owner('root-b'), seen = [];
        for (const source of ['one', 'two', 'three']) a.registerSource(source, effects({bound: data => seen.push(source)}));
        b.registerSource('one', effects({bound: () => seen.push('foreign')}));
        expect(manager.getNativeLifecycle(a.groupId)).toBe(a);
        expect(a).not.toBe(b);
        const first = await a.acquire('one', {itemId: 'shared'}), foreign = await b.acquire('one', {itemId: 'shared'});
        expect(foreign.workspaceKey, 'another Group mints from its own keys').toBe(first.workspaceKey);
        await a.onBind({...first, windowId: 'popup-a', generation: 1});
        expect(seen).toEqual(['one']);
        expect(a.getConnection('one', first.workspaceKey).windowId).toBe('popup-a');
        expect(b.getConnection('one', foreign.workspaceKey)).toBeNull();
        expect(b.getAdmission('one', foreign.workspaceKey).generationToken).toBe(foreign.generationToken)
    });

    test('source retirement during a held open closes the late native result exactly once', async () => {
        const windows = owner('root'), opening = deferred(), closed = [];
        windows.registerSource('view', effects({open: () => opening.promise, close: async vessel => {closed.push(vessel); return true}}));
        const result = windows.acquire('view', {itemId: 'held'});
        await expect.poll(() => windows.getAdmission('view', 'resource:held')).not.toBeNull();
        windows.unregisterSource('view');
        opening.resolve({windowName: 'late-window'});
        expect(await result).toBeNull();
        expect(closed).toHaveLength(1);
        expect(closed[0]).toMatchObject({itemId: 'held', windowName: 'late-window', groupId: windows.groupId});
        expect(windows.getAdmission('view', 'resource:held'), 'settled late cleanup releases the provisional record').toBeNull()
    });

    test('a refused late close stays retryable after the source is replaced', async () => {
        const windows      = owner('root'), opening = deferred(), oldClosed = [], newClosed = [];
        let   acknowledged = false;
        windows.registerSource('view', effects({open: () => opening.promise,
            close: async vessel => {oldClosed.push(vessel.windowName); return acknowledged}}));
        const result = windows.acquire('view', {itemId: 'held'});
        await expect.poll(() => windows.getAdmission('view', 'resource:held')).not.toBeNull();
        windows.unregisterSource('view');
        windows.registerSource('view', effects({close: async vessel => {newClosed.push(vessel.windowName); return true}}));
        opening.resolve({windowName: 'old-generation'});
        expect(await result).toBeNull();
        expect(windows.pendingRetirements('view')).toHaveLength(1);
        acknowledged = true;
        expect(await windows.retryRetirements('view', 'held')).toBe(true);
        expect(oldClosed).toEqual(['old-generation', 'old-generation']);
        expect(newClosed, 'a replacement source never closes its predecessor through the wrong effect').toEqual([])
    });

    test('refused native retirement gates the next acquisition and retains its exact token', async () => {
        const windows    = owner('root');
        let   allowClose = false, opens = 0;
        windows.registerSource('view', effects({open: async () => {opens++; return {windowName: 'resource'}}, close: async () => allowClose}));
        const vessel = await windows.acquire('view', {itemId: 'one'});
        expect(await windows.retire('view', vessel)).toBe(false);
        expect(windows.pendingRetirements('view')).toEqual([vessel]);
        expect(await windows.acquire('view', {itemId: 'one'})).toBeNull();
        expect(opens).toBe(1);
        allowClose = true;
        expect(await windows.retryRetirements('view', 'one')).toBe(true);
        expect(windows.pendingRetirements('view')).toEqual([])
    });

    test('unbind and source destruction preserve committed ownership without a physical close', async () => {
        const windows = owner('root'), closed = [], released = [];
        windows.registerSource('view', effects({close: async vessel => {closed.push(vessel); return true}, released: data => released.push(data)}));
        const vessel = await windows.acquire('view', {itemId: 'one'}), key = vessel.workspaceKey;
        await windows.onBind({...vessel, windowId: 'popup', generation: 1});
        windows.recordOwner('view', key, {...vessel, windowId: 'popup'}, windows.getConnection('view', key));
        await windows.onRelease({groupId: windows.groupId, windowId: 'popup', workspaceKey: key});
        expect(windows.getOwner('view', key)).toMatchObject({windowId: null, generationToken: vessel.generationToken});
        expect(released).toHaveLength(1);
        expect(released[0]).toMatchObject({committed: true, itemId: 'one', workspaceKey: key});
        windows.unregisterSource('view');
        expect(windows.hasResources).toBe(true);
        expect(closed).toEqual([]);
        manager.retireGroup(windows.groupId);
        await Promise.resolve();
        expect(closed).toHaveLength(1)
    });

    test('a canceled admission cannot publish after an awaited platform grant', async () => {
        const windows = owner('root'), grant = deferred(), bound = [];
        windows.registerSource('view', effects({prepare: () => grant.promise, bound: data => bound.push(data)}));
        const vessel  = await windows.acquire('view', {itemId: 'one'});
        const binding = windows.onBind({...vessel, windowId: 'popup', generation: 1});
        windows.clearAdmission('view', vessel.workspaceKey);
        grant.resolve(true);
        await binding;
        expect(bound).toEqual([]);
        expect(windows.getConnection('view', vessel.workspaceKey)).toBeNull()
    });

    for (const duringPrepare of [false, true]) {
        test(`pending retirement fences binding ${duringPrepare ? 'during preparation' : 'before preparation'}`, async () => {
            const windows = owner('root'), closing = deferred(), grant = deferred(), bound = [];
            let acknowledged = false, prepared = 0;

            windows.registerSource('view', effects({
                close: () => acknowledged ? true : closing.promise,
                prepare: () => {
                    prepared++;
                    return duringPrepare ? grant.promise : true
                },
                bound: data => bound.push(data)
            }));
            const vessel = await windows.acquire('view', {itemId: 'one'}),
                  key    = vessel.workspaceKey,
                  data   = {...vessel, windowId: 'closing-popup', generation: 1};
            let binding, retirement;

            if (duringPrepare) {
                binding = windows.onBind(data);
                retirement = windows.retire('view', vessel);
                grant.resolve(true)
            } else {
                retirement = windows.retire('view', vessel);
                binding = windows.onBind(data)
            }

            await binding;
            expect(bound, 'a closing generation must never reach the publication callback').toEqual([]);
            expect(windows.getAdmission('view', key), 'the fenced admission is still on record').not.toBeNull();
            expect(windows.getConnection('view', key)).toBeNull();
            expect(prepared).toBe(duringPrepare ? 1 : 0);
            expect(windows.pendingRetirements('view')).toEqual([vessel]);

            closing.resolve(false);
            expect(await retirement, 'refusal retains exact cleanup authority').toBe(false);
            expect(windows.pendingRetirements('view')).toEqual([vessel]);
            acknowledged = true;
            expect(await windows.retryRetirements('view', 'one')).toBe(true);
            expect(windows.pendingRetirements('view')).toEqual([]);
            expect(windows.getAdmission('view', key)).toBeNull()
        })
    }

    test('pending retirement does not block another resource or source', async () => {
        const windows = owner('root'), closing = deferred(), bound = [];

        for (const sourceId of ['first', 'second']) {
            windows.registerSource(sourceId, effects({
                keyFor: itemId => `${sourceId}:${itemId}`,
                close : () => closing.promise,
                bound : ({itemId}) => bound.push(`${sourceId}:${itemId}`)
            }))
        }
        const vessel = await windows.acquire('first', {itemId: 'one'}),
              retirement = windows.retire('first', vessel);

        for (const [sourceId, itemId] of [['first', 'two'], ['second', 'one']]) {
            const next = await windows.acquire(sourceId, {itemId});
            await windows.onBind({...next, windowId: `${sourceId}-${itemId}`, generation: 1});
            expect(windows.getConnection(sourceId, next.workspaceKey)?.windowId).toBe(`${sourceId}-${itemId}`)
        }
        expect(bound).toEqual(['first:two', 'second:one']);
        closing.resolve(true);
        expect(await retirement).toBe(true)
    });

    test('view teardown may withdraw its source after the Group owner was destroyed', () => {
        const windows = owner('root');
        windows.registerSource('view', effects());
        manager.retireGroup(windows.groupId);
        expect(windows.isDestroyed).toBe(true);
        expect(() => windows.unregisterSource('view'), 'late view cleanup cannot abort component destruction').not.toThrow()
    });

    test('Group retirement starts native close while the source records are still readable', async () => {
        const windows = owner('root'), observed = [];
        windows.registerSource('view', effects({close: vessel => {
            observed.push(windows.getOwner('view', vessel.workspaceKey)?.windowName);
            return true
        }}));
        windows.recordOwner('view', 'resource:one', {windowName: 'owned-window'});
        manager.retireGroup(windows.groupId);
        await Promise.resolve();
        expect(observed).toEqual(['owned-window'])
    });

    test('physical release cancels admission while its platform preparation is still pending', async () => {
        const windows = owner('root'), grant = deferred(), bound = [];
        windows.registerSource('view', effects({prepare: () => grant.promise, bound: data => bound.push(data)}));
        const vessel  = await windows.acquire('view', {itemId: 'one'});
        const binding = windows.onBind({...vessel, windowId: 'gone', generation: 1});
        expect(windows.getAdmission('view', vessel.workspaceKey)).not.toBeNull();
        await windows.onRelease({groupId: windows.groupId, workspaceKey: vessel.workspaceKey, windowId: 'gone'});
        grant.resolve(true);
        await binding;
        expect(windows.getAdmission('view', vessel.workspaceKey)).toBeNull();
        expect(windows.getConnection('view', vessel.workspaceKey)).toBeNull();
        expect(bound).toEqual([])
    });

    test('an awaited release cannot overwrite ownership recorded for a successor window', async () => {
        const windows = owner('root'), unbind = deferred();
        windows.registerSource('view', effects({unbind: () => unbind.promise}));
        windows.recordOwner('view', 'resource:one', {windowId: 'old', generationToken: 'old-token'});
        const release = windows.onRelease({groupId: windows.groupId, windowId: 'old'});
        windows.recordOwner('view', 'resource:one', {windowId: 'new', generationToken: 'new-token'});
        unbind.resolve(false);
        await release;
        expect(windows.getOwner('view', 'resource:one')).toMatchObject({windowId: 'new', generationToken: 'new-token'})
    });

    test('physical death clears an outstanding refused-close record for that generation', async () => {
        const windows = owner('root'), closing = deferred();
        windows.registerSource('view', effects({close: () => closing.promise}));
        const vessel = await windows.acquire('view', {itemId: 'one'});
        await windows.onBind({...vessel, windowId: 'closed', generation: 1});
        const retirement = windows.retire('view', vessel);
        await windows.onRelease({groupId: windows.groupId, windowId: 'closed'});
        closing.resolve(false);
        expect(await retirement, 'observed physical death is stronger than the late refusal').toBe(true);
        expect(windows.pendingRetirements('view')).toEqual([])
    });

    test('only the exact released record remains current; warm rebind and a replacement reservation invalidate it', () => {
        const windows = owner('root'), identity = manager.reserve({groupId: windows.groupId, workspaceKey: 'popup'});
        manager.bind({...identity, windowId: 'old'});
        const data = release('old');
        expect(windows.isCurrentRelease(data)).toBe(true);
        for (const invalid of [{releasedBinding: {...data.releasedBinding}}, {generation: data.generation + 1},
            {generationToken: 'foreign'}, {releasedWindowId: 'foreign'}, {groupId: 'foreign'}]) {
            expect(windows.isCurrentRelease({...data, ...invalid})).toBe(false)
        }
        manager.bind({...identity, windowId: 'new'});
        expect(windows.isCurrentRelease(data)).toBe(false);
        expect(windows.withReleasedBinding(data, () => { throw new Error('stale work ran') })).toBe(false);
        const next = release('new');
        expect(windows.isCurrentRelease(next)).toBe(true);
        manager.reserve({groupId: windows.groupId, workspaceKey: 'popup'});
        expect(windows.isCurrentRelease(next)).toBe(false)
    });

    test('the binding latches observation and insertion as one pending operation', async () => {
        const windows = owner('root'), data = release('root'), observation = deferred(), insertion = deferred();
        let   runs    = 0;
        const work    = () => { runs++; return observation.promise.then(() => insertion.promise) },
              pending = windows.withReleasedBinding(data, work);
        expect(windows.withReleasedBinding(data, work)).toBe(pending);
        await Promise.resolve();
        expect(runs).toBe(1);
        observation.resolve(true);
        await Promise.resolve();
        expect(data.releasedBinding.releaseWork).toBe(pending);
        expect(windows.withReleasedBinding(data, work)).toBe(pending);
        insertion.resolve('committed');
        expect(await pending).toBe('committed');
        expect(data.releasedBinding.releaseWork).toBeNull();
        expect(runs).toBe(1);
        const failed = windows.withReleasedBinding(data, () => Promise.reject(new Error('insertion refused')));
        await expect(failed).rejects.toThrow('insertion refused');
        expect(data.releasedBinding.releaseWork).toBeNull();
        expect(await windows.withReleasedBinding(data, () => 'retry')).toBe('retry')
    });

    test('a completed old release keeps its result and cannot clear a successor operation on the same binding', async () => {
        const windows = owner('old'), binding = manager.get(windows.groupId).bindings.get('main'),
              old     = release('old'), first = deferred(), second = deferred(),
              pending = windows.withReleasedBinding(old, () => first.promise);
        await Promise.resolve();
        manager.bind({groupId: windows.groupId, generationToken: old.generationToken, windowId: 'new'});
        const next = release('new'), successor = windows.withReleasedBinding(next, () => second.promise);
        await Promise.resolve();
        first.resolve('committed-before-rebind');
        expect(await pending).toBe('committed-before-rebind');
        expect(binding.releaseWork).toBe(successor);
        second.resolve('successor');
        expect(await successor).toBe('successor');
        expect(binding.releaseWork).toBeNull()
    });

    test('a late unbind result cannot mark a warm successor as awaiting closure or erase its owner', async () => {
        const windows = owner('root'), unbind = deferred();
        windows.registerSource('view', effects({unbind: () => unbind.promise}));
        const vessel = await windows.acquire('view', {itemId: 'one'}), key = vessel.workspaceKey;
        manager.bind({...vessel, windowId: 'old'});
        await expect.poll(() => windows.getConnection('view', key)).not.toBeNull();
        windows.recordOwner('view', key, {...vessel, windowId: 'old'}, windows.getConnection('view', key));
        const data = release('old');
        manager.bind({...vessel, windowId: 'new'});
        windows.recordOwner('view', key, {...vessel, windowId: 'new'});
        unbind.resolve({retained: true, awaitingClosure: true});
        await Promise.resolve();
        expect(data.releasedBinding.awaitingClosure).toBe(false);
        expect(windows.getOwner('view', key).windowId).toBe('new')
    });

    test('bound expiry observes awaiting closure while never-bound expiry keeps provisional retirement', async () => {
        const windows = owner('root'), expiredBinding = deferred(), expiredAdmission = deferred(), closed = [], bindingsExpired = [];
        windows.registerSource('view', effects({
            unbind        : () => ({retained: true, awaitingClosure: true}),
            bindingExpired: data => {
                bindingsExpired.push(data);
                expiredBinding.resolve(data);
                return {retained: true, awaitingClosure: false}
            },
            close         : vessel => { closed.push(vessel); return true },
            expired       : data => expiredAdmission.resolve(data)
        }));
        const vessel = await windows.acquire('view', {itemId: 'bound'}), key = vessel.workspaceKey;
        manager.bind({...vessel, windowId: 'bound'});
        await expect.poll(() => windows.getConnection('view', key)).not.toBeNull();
        windows.recordOwner('view', key, {...vessel, windowId: 'bound'}, windows.getConnection('view', key));
        manager.reconnectLeaseMs = 0;
        const data = release('bound'), expired = await expiredBinding.promise;
        expect(expired.releasedBinding).toBe(data.releasedBinding);
        expect(expired).toMatchObject({generation: 1, generationToken: vessel.generationToken, releasedWindowId: 'bound'});
        expect(windows.isCurrentRelease(expired), 'its own expiry remains valid after the map entry is removed').toBe(true);
        expect(windows.isLeaseExpired(expired)).toBe(true);
        await expect.poll(() => data.releasedBinding.awaitingClosure).toBe(false);
        expect(closed).toEqual([]);
        await windows.acquire('view', {itemId: 'never'});
        const provisional = await expiredAdmission.promise;
        expect(provisional.data).toMatchObject({generation: 0, releasedWindowId: null});
        expect(provisional).toMatchObject({itemId: 'never', workspaceKey: 'resource:never'});
        expect(bindingsExpired, 'never-bound expiry cannot request the formerly-bound closure effect').toHaveLength(1);
        expect(closed.map(entry => entry.itemId)).toEqual(['never']);
        expect(windows.getOwner('view', key).windowId).toBeNull();
        manager.reserve({groupId: windows.groupId, workspaceKey: vessel.workspaceKey});
        expect(windows.isCurrentRelease(expired), 'a new lineage refuses the formerly expired record').toBe(false);
        expect(windows.isLeaseExpired(expired), 'expiry authority cannot survive a successor lineage').toBe(false)
    });

    test('an item opens a second resource under a key of its own while its first keeps the preferred key (#20006)', async () => {
        const windows = owner('root');
        windows.registerSource('view', effects());
        const first = await windows.acquire('view', {itemId: 'one', gestureToken: 'pop-out'});
        await windows.onBind({...first, windowId: 'popup', generation: 1});
        windows.recordOwner('view', first.workspaceKey, {...first, windowId: 'popup'}, windows.getConnection('view', first.workspaceKey));

        const second = await windows.acquire('view', {itemId: 'one', gestureToken: 'tear-out'});

        expect(first.workspaceKey).toBe('resource:one');
        expect(second.workspaceKey, 'the bound popup keeps the preferred key').toBe('resource:one:2');
        expect(windows.getOwner('view', first.workspaceKey)).toMatchObject({itemId: 'one', windowId: 'popup'});
        expect(windows.keyOf('view', 'one'), 'the item resolves to its newest resource').toBe(second.workspaceKey)
    });

    test('a pending or reconnecting key is never reused; a released key or a bare document nothing records is', async () => {
        const windows = owner('root');
        windows.registerSource('view', effects());

        manager.reserve({groupId: windows.groupId, workspaceKey: 'resource:pending'});
        // A document stays registered after its window closed
        manager.registerParticipant({groupId: windows.groupId, workspaceKey: 'resource:document', participant: {}});

        // Released while its committed owner waits for the window to come back
        const reconnecting = await windows.acquire('view', {itemId: 'reconnecting'});
        manager.bind({...reconnecting, windowId: 'reloading'});
        await expect.poll(() => windows.getConnection('view', reconnecting.workspaceKey)).not.toBeNull();
        windows.recordOwner('view', reconnecting.workspaceKey, {...reconnecting, windowId: 'reloading'},
            windows.getConnection('view', reconnecting.workspaceKey));
        release('reloading');
        await expect.poll(() => windows.getOwner('view', reconnecting.workspaceKey)?.windowId).toBeNull();

        // Released after its resource was retired, so nothing records it
        const retired = manager.reserve({groupId: windows.groupId, workspaceKey: 'resource:retired'});
        manager.bind({...retired, windowId: 'closed'});
        release('closed');

        for (const itemId of ['pending', 'reconnecting']) {
            expect((await windows.acquire('view', {itemId})).workspaceKey).toBe(`resource:${itemId}:2`)
        }
        for (const itemId of ['retired', 'document']) {
            expect((await windows.acquire('view', {itemId})).workspaceKey).toBe(`resource:${itemId}`)
        }
    });

    test('two concurrent admissions for one item keep their own reservations; one gesture opens one resource', async () => {
        const windows = owner('root'), opening = deferred();
        windows.registerSource('view', effects({open: () => opening.promise}));

        const first = windows.acquire('view', {itemId: 'one', gestureToken: 'a'});
        await expect.poll(() => windows.getAdmission('view', 'resource:one')).not.toBeNull();
        const retry  = windows.acquire('view', {itemId: 'one', gestureToken: 'a'}),
              second = windows.acquire('view', {itemId: 'one', gestureToken: 'b'});
        await expect.poll(() => windows.getAdmission('view', 'resource:one:2')).not.toBeNull();
        opening.resolve({windowName: 'native-one'});

        const [a, again, b] = await Promise.all([first, retry, second]),
              bindings      = manager.get(windows.groupId).bindings;

        expect(again, 'the same gesture opens nothing while its first admission is pending').toBeNull();
        expect([a.workspaceKey, b.workspaceKey]).toEqual(['resource:one', 'resource:one:2']);
        expect(bindings.get(a.workspaceKey).generationToken, 'the first reservation is never replaced').toBe(a.generationToken);
        expect(bindings.get(b.workspaceKey).generationToken).toBe(b.generationToken)
    });

    test('a late close of an older resource leaves the newer resource for the same item untouched', async () => {
        const windows = owner('root'), closing = deferred(), grant = deferred(), bound = [];
        windows.registerSource('view', effects({
            close  : () => closing.promise,
            prepare: ({workspaceKey}) => workspaceKey === 'resource:one:2' ? grant.promise : true,
            bound  : ({connection}) => bound.push(connection.workspaceKey)
        }));
        const older = await windows.acquire('view', {itemId: 'one', gestureToken: 'pop-out'});
        await windows.onBind({...older, windowId: 'older', generation: 1});
        windows.recordOwner('view', older.workspaceKey, {...older, windowId: 'older'}, windows.getConnection('view', older.workspaceKey));

        const newer      = await windows.acquire('view', {itemId: 'one', gestureToken: 'tear-out'}),
              binding    = windows.onBind({...newer, windowId: 'newer', generation: 1}),
              retirement = windows.retire('view', windows.getOwner('view', older.workspaceKey));

        closing.resolve(true);
        expect(await retirement).toBe(true);
        grant.resolve(true);
        await binding;

        expect(bound, 'the newer resource still binds').toEqual([older.workspaceKey, newer.workspaceKey]);
        expect(windows.getConnection('view', newer.workspaceKey)).toMatchObject({itemId: 'one', windowId: 'newer'})
    });
});
