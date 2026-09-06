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
});
