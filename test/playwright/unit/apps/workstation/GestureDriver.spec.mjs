import {setup}         from '../../../setup.mjs';
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import Workspace       from '../../../../../apps/workstation/view/Workspace.mjs';
import GestureDriver   from '../../../../../apps/workstation/tour/GestureDriver.mjs';
import InstanceService from '../../../../../src/ai/client/InstanceService.mjs';

setup({appConfig: {name: 'WorkstationGestureDriverTest'}});

/** @summary A controlled async boundary with an explicit release. @returns {Object} */
function deferred() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

const down = {targetId: 'source-tab', windowId: 'source-window', type: 'mousedown',
    options: {buttons: 1, clientX: 50, clientY: 60}},
      up = {...down, type: 'mouseup', options: {...down.options, buttons: 0}};

test('normal construction stays driver-free; explicit calls reach one registered lazy owner', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          service   = Neo.create(InstanceService);
    try {
        expect(workspace.gestureDriver).toBeNull();
        expect(workspace.gestureDriverPromise).toBeNull();
        expect(workspace.executeTearOutStep).toBeUndefined();
        const [first, second] = await Promise.all([workspace.getGestureDriver(), workspace.getGestureDriver()]);
        expect(first).toBe(second);
        expect(first.workspace).toBe(workspace);
        expect(Neo.get(first.id)).toBe(first);
        const receipt = await service.callMethod({id: workspace.id, method: 'gestureDriver.executeTearOutStep', args: [{}]});
        expect(receipt.result.applied).toBe(false);
        expect(receipt.result.errors.length).toBeGreaterThan(0);
        workspace.destroy();
        expect(first.isDestroyed).toBe(true)
    } finally {
        workspace.isDestroyed || workspace.destroy();
        service.destroy()
    }
});

test('root destruction during the lazy import cannot create an orphan driver', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          pending   = workspace.getGestureDriver();
    workspace.destroy();
    await expect(pending).rejects.toBe(Neo.isDestroyed)
});

test('cancellation before dispatch emits no input', async () => {
    const workspace = {isDestroyed: false}, driver = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService, calls = [];
    service.simulateEvent = async () => {calls.push('input'); return true};
    service.dispatch = async () => {calls.push('cleanup'); return true};
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [{...down, delay: 1000}]}));
    pending.catch(() => {});
    driver.destroy();
    await expect(pending).rejects.toBe(Neo.isDestroyed);
    expect(calls).toEqual([]);
    expect(service.isDestroyed).toBe(true);
    expect(workspace.isDestroyed).toBe(false)
});

test('a dispatched down settles before cancellation releases input and retires the service', async () => {
    const driver  = Neo.create(GestureDriver, {workspace: {isDestroyed: false}}),
          service = driver.interactionService, input = deferred(), started = deferred(), calls = [],
          destroy = service.destroy.bind(service);
    service.simulateEvent = () => {calls.push('down'); started.resolve(); return input.promise};
    service.dispatch = async ({type, windowId, id}) => {
        calls.push(type);
        expect(windowId).toBe('source-window');
        expect(id).toBe('document.body');
        return true
    };
    service.destroy = () => {calls.push('destroy'); destroy()};
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [down, up]}));
    pending.catch(() => {});
    await started.promise;
    driver.destroy();
    await new Promise(setImmediate);
    expect(calls).toEqual(['down']);
    expect(Neo.get(service.id)).toBe(service);
    input.resolve(true);
    await expect(pending).rejects.toBe(Neo.isDestroyed);
    expect(calls).toEqual(['down', 'keydown', 'mouseup', 'destroy']);
    expect(service.isDestroyed).toBe(true)
});

test('an Escape failure still attempts and awaits mouseup before retiring input', async () => {
    const driver  = Neo.create(GestureDriver, {workspace: {isDestroyed: false}}),
          service = driver.interactionService, input = deferred(), released = deferred(), cleanup = deferred(), calls = [];
    service.simulateEvent = () => input.promise;
    service.dispatch = async ({type}) => {
        calls.push(type);
        if (type === 'keydown') throw new Error('Escape transport failed');
        cleanup.resolve();
        return released.promise
    };
    const pending = driver.runGesture(run => driver.simulateEvent(run, {events: [down]}));
    pending.catch(() => {});
    driver.destroy();
    input.resolve(true);
    await cleanup.promise;
    expect(Neo.get(service.id)).toBe(service);
    released.resolve(true);
    await expect(pending).rejects.toThrow('Escape transport failed');
    expect(calls).toEqual(['keydown', 'mouseup']);
    expect(service.isDestroyed).toBe(true)
});

test('executor failure cleanup waits for dispatched input before releasing a destroyed driver', async () => {
    const {default: WindowManager} = await import('../../../../../src/manager/Window.mjs');
    const windowId                 = 'gesture-executor-window', input = deferred(), started = deferred(), calls = [],
          button = {id: 'gesture-executor-tab', windowId,
              getDomRect: async () => [{x: 100, y: 100, width: 40, height: 20}]},
          sortZone = {enableProxyToPopup: true},
          workspace = {refreshPromise: null,
              dockModel  : {nodes: {source: {type: 'tabs', items: ['item']}}},
              getDockHost: () => ({down: () => ({getTabAtIndex: () => button, getTabBar: () => ({sortZone})})})},
          driver = Neo.create(GestureDriver, {workspace}), service = driver.interactionService;

    WindowManager.register({id: windowId, windowId, innerRect: {x: 0, y: 0, width: 1200, height: 800}});
    service.simulateEvent = () => {calls.push('down'); started.resolve(); return input.promise};
    service.dispatch = async ({type, windowId: targetWindowId}) => {
        expect(targetWindowId).toBe(windowId);
        calls.push(type);
        return true
    };
    try {
        const pending = driver.executeCrossZoneShowcaseStep({itemId: 'item', sourceNodeId: 'source', dwells: [
            {targetNodeId: 'a', placementKind: 'before'}, {targetNodeId: 'b', placementKind: 'after'}
        ]});
        await started.promise;
        driver.destroy();
        delete button.windowId;
        await new Promise(setImmediate);
        expect(calls).toEqual(['down']);
        expect(Neo.get(service.id)).toBe(service);
        input.resolve(true);
        const result = await pending;
        expect(result.applied).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(calls).toEqual(['down', 'keydown', 'mouseup']);
        expect(sortZone.enableProxyToPopup).toBe(true);
        expect(service.isDestroyed).toBe(true)
    } finally {
        input.resolve(true);
        driver.isDestroyed || driver.destroy();
        WindowManager.unregister(windowId)
    }
});

test('a successful release creates no cancellation input and leaves borrowed workspace alive', async () => {
    const workspace = {isDestroyed: false}, driver = Neo.create(GestureDriver, {workspace}),
          service   = driver.interactionService, calls = [];
    service.simulateEvent = async ({events}) => {calls.push(events[0].type); return true};
    service.dispatch = async ({type}) => {calls.push(type); return true};
    await expect(driver.runGesture(run => driver.simulateEvent(run, {events: [down, up]}))).resolves.toBe(true);
    expect(calls).toEqual(['mousedown', 'mouseup']);
    expect(Neo.get(service.id)).toBe(service);
    driver.destroy();
    driver.destroy();
    expect(service.isDestroyed).toBe(true);
    expect(workspace.isDestroyed).toBe(false)
});

test.describe('tear-out commit ownership', () => {
    const cases = [
        {name: 'accepts a record placed in the expected vessel', expected: true, mutate() {}},
        {name: 'rejects a source-only detach', expected: false, mutate({source, documents, targetId}) {
            source.items.metrics = {};
            delete documents[targetId]
        }},
        {name: 'rejects an unregistered vessel', expected: false, mutate({documents, targetId}) {
            delete documents[targetId]
        }},
        {name: 'rejects a lost record', expected: false, mutate({target}) {
            delete target.items.metrics;
            target.nodes.target.items = []
        }},
        {name: 'rejects ownership in a different vessel', expected: false, mutate({documents, targetId, target}) {
            documents[Workspace.vesselWorkspaceId('audit')] = target;
            delete documents[targetId]
        }},
        {name: 'rejects duplicated source and vessel catalogs', expected: false, mutate({source}) {
            source.items.metrics = {}
        }},
        {name: 'rejects a source that still places the item', expected: false, mutate({source}) {
            source.nodes.source.items.push('metrics')
        }},
        {name: 'rejects an unplaced vessel record', expected: false, mutate({target}) {
            target.nodes.target.items = []
        }}
    ];

    for (const {name, expected, mutate} of cases) {
        test(name, async () => {
            const {default: NativeGestureDriver} = await import('../../../../../apps/workstation/tour/NativeGestureDriver.mjs');
            const source                         = {items: {audit: {}}, nodes: {source: {type: 'tabs', items: ['audit']}}},
                  target = {items: {metrics: {}}, nodes: {target: {type: 'tabs', items: ['metrics']}}},
                  targetId = Workspace.vesselWorkspaceId('metrics'),
                  documents = {[Workspace.MAIN_WORKSPACE_ID]: source, [targetId]: target},
                  workspace = {constructor: Workspace, dockModel: source, isDestroyed: false,
                      getWorkspaceDocument: key => documents[key] ?? null},
                  driver = Neo.create(NativeGestureDriver, {workspace});

            mutate({source, target, targetId, documents});
            try {
                await expect(driver.waitForTearOutCommit('metrics', {attempts: 0})).resolves.toBe(expected)
            } finally {
                driver.destroy()
            }
        })
    }
});
