import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ManagerTransactionNativeLifecycleTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/** @summary Native ownership survives views; asynchronous platform results remain generation-scoped. */
test.describe.serial('Group native lifecycle (#18314)', () => {
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

    test.beforeAll(async () => { manager = (await import('../../../../../src/manager/Transaction.mjs')).default });
    test.afterEach(async () => {
        [...manager.items].forEach(group => manager.retireGroup(group.id));
        await Promise.resolve()
    });

    test('three sources share one Group owner; equal resource keys in another Group are isolated', async () => {
        const a = owner('root-a'), b = owner('root-b'), seen = [];
        for (const source of ['one', 'two', 'three']) a.registerSource(source, effects({bound: data => seen.push(source)}));
        b.registerSource('one', effects({bound: () => seen.push('foreign')}));
        expect(manager.getNativeLifecycle(a.groupId)).toBe(a);
        expect(a).not.toBe(b);
        const first = await a.acquire('one', {itemId: 'shared'}), foreign = await b.acquire('one', {itemId: 'shared'});
        await a.onBind({...first, windowId: 'popup-a', generation: 1});
        expect(seen).toEqual(['one']);
        expect(a.getConnection('one', 'shared').windowId).toBe('popup-a');
        expect(b.getConnection('one', 'shared')).toBeNull();
        expect(b.getAdmission('one', 'shared').generationToken).toBe(foreign.generationToken)
    });

    test('source retirement during a held open closes the late native result exactly once', async () => {
        const windows = owner('root'), opening = deferred(), closed = [];
        windows.registerSource('view', effects({open: () => opening.promise, close: async vessel => {closed.push(vessel); return true}}));
        const result = windows.acquire('view', {itemId: 'held'});
        await expect.poll(() => windows.getAdmission('view', 'held')).not.toBeNull();
        windows.unregisterSource('view');
        opening.resolve({windowName: 'late-window'});
        expect(await result).toBeNull();
        expect(closed).toHaveLength(1);
        expect(closed[0]).toMatchObject({itemId: 'held', windowName: 'late-window', groupId: windows.groupId});
        expect(windows.getAdmission('view', 'held'), 'settled late cleanup releases the provisional record').toBeNull()
    });

    test('a refused late close stays retryable after the source is replaced', async () => {
        const windows      = owner('root'), opening = deferred(), oldClosed = [], newClosed = [];
        let   acknowledged = false;
        windows.registerSource('view', effects({open: () => opening.promise,
            close: async vessel => {oldClosed.push(vessel.windowName); return acknowledged}}));
        const result = windows.acquire('view', {itemId: 'held'});
        await expect.poll(() => windows.getAdmission('view', 'held')).not.toBeNull();
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
        const vessel = await windows.acquire('view', {itemId: 'one'});
        await windows.onBind({...vessel, windowId: 'popup', generation: 1});
        windows.recordOwner('view', 'one', {...vessel, windowId: 'popup'}, windows.getConnection('view', 'one'));
        await windows.onRelease({groupId: windows.groupId, windowId: 'popup', workspaceKey: vessel.workspaceKey});
        expect(windows.getOwner('view', 'one')).toMatchObject({windowId: null, generationToken: vessel.generationToken});
        expect(released).toHaveLength(1);
        expect(released[0].committed).toBe(true);
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
        windows.clearAdmission('view', 'one');
        grant.resolve(true);
        await binding;
        expect(bound).toEqual([]);
        expect(windows.getConnection('view', 'one')).toBeNull()
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
            expect(windows.getConnection('view', 'one')).toBeNull();
            expect(prepared).toBe(duringPrepare ? 1 : 0);
            expect(windows.pendingRetirements('view')).toEqual([vessel]);

            closing.resolve(false);
            expect(await retirement, 'refusal retains exact cleanup authority').toBe(false);
            expect(windows.pendingRetirements('view')).toEqual([vessel]);
            acknowledged = true;
            expect(await windows.retryRetirements('view', 'one')).toBe(true);
            expect(windows.pendingRetirements('view')).toEqual([]);
            expect(windows.getAdmission('view', 'one')).toBeNull()
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
            expect(windows.getConnection(sourceId, itemId)?.windowId).toBe(`${sourceId}-${itemId}`)
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
            observed.push(windows.getOwner('view', vessel.itemId)?.windowName);
            return true
        }}));
        windows.recordOwner('view', 'one', {windowName: 'owned-window'});
        manager.retireGroup(windows.groupId);
        await Promise.resolve();
        expect(observed).toEqual(['owned-window'])
    });

    test('physical release cancels admission while its platform preparation is still pending', async () => {
        const windows = owner('root'), grant = deferred(), bound = [];
        windows.registerSource('view', effects({prepare: () => grant.promise, bound: data => bound.push(data)}));
        const vessel  = await windows.acquire('view', {itemId: 'one'});
        const binding = windows.onBind({...vessel, windowId: 'gone', generation: 1});
        await windows.onRelease({groupId: windows.groupId, workspaceKey: vessel.workspaceKey, windowId: 'gone'});
        grant.resolve(true);
        await binding;
        expect(windows.getAdmission('view', 'one')).toBeNull();
        expect(windows.getConnection('view', 'one')).toBeNull();
        expect(bound).toEqual([])
    });

    test('an awaited release cannot overwrite ownership recorded for a successor window', async () => {
        const windows = owner('root'), unbind = deferred();
        windows.registerSource('view', effects({unbind: () => unbind.promise}));
        windows.recordOwner('view', 'one', {windowId: 'old', generationToken: 'old-token'});
        const release = windows.onRelease({groupId: windows.groupId, windowId: 'old'});
        windows.recordOwner('view', 'one', {windowId: 'new', generationToken: 'new-token'});
        unbind.resolve(false);
        await release;
        expect(windows.getOwner('view', 'one')).toMatchObject({windowId: 'new', generationToken: 'new-token'})
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
});
