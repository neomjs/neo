import {setup} from '../../../setup.mjs';
const appName = 'SortZoneTerminalRenderingTest';
setup({appConfig: {name: appName}, neoConfig: {allowVdomUpdatesInTests: true, useDomApiRenderer: true, useVdomWorker: false}});
const testApp = Neo.appsByName[appName][0];

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Container          from '../../../../../src/container/Base.mjs';
import Component          from '../../../../../src/component/Base.mjs';
import DragProxyContainer from '../../../../../src/draggable/DragProxyContainer.mjs';
import Rectangle          from '../../../../../src/util/Rectangle.mjs';
import DashboardSortZone  from '../../../../../src/draggable/dashboard/SortZone.mjs';
import Helper             from '../../../../../src/vdom/Helper.mjs';
import VDomUpdate         from '../../../../../src/manager/VDomUpdate.mjs';
import SortZone           from '../../../../../src/draggable/container/SortZone.mjs';

const savedDocument  = globalThis.document, savedWindow = globalThis.window,
      savedDomAccess = Neo.main.DomAccess, savedDragDrop = Neo.main.addon.DragDrop;
globalThis.document = Object.assign(new EventTarget(), {body: {}, documentElement: {}});
globalThis.window = new EventTarget();
delete Neo.main.DomAccess;
delete Neo.main.addon.DragDrop;
const {default: MainDragDrop} = await import('../../../../../src/main/addon/DragDrop.mjs');
Neo.main.DomAccess = savedDomAccess;
Neo.main.addon.DragDrop = savedDragDrop;
if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;

let originalBatch, originalApply, originalAddon, descriptors, originalConfig, app, appDescriptors;
let owner, zone, writes, batches, pending, recording, heldReturn, detached, rootHost;

/**
 * @summary Actual live-proxy lifecycle and renderer, with controlled Main acknowledgement.
 * Node composes at the Main boundary explicitly: these tests do not certify App-worker metadata
 * transport. Native painted-frame and both-worker-mode coverage live in the E2E suite.
 */
async function createScene({single=false, excluded=true, wrapped=false}={}) {
    owner = Neo.create(Container, {
        appName, id: 'terminal-owner', layout: {ntype: 'hbox'}, dragResortable: true,
        style            : {height: '100px', width: single ? '100px' : '300px', minWidth: single ? '100px' : '300px', position: 'relative'},
        getVdomUpdateMeta: () => ({retainedMetadata: 'owner-value'}),
        items            : (single ? ['C'] : ['A', 'B', 'C']).map((key, index) => ({module: Component, id: `terminal-${key}`,
            cls: excluded && !single && index === 0 ? [] : ['sortable'], wrapperStyle: {visibility: null}})),
        sortZoneConfig: {module: SortZone,
            dragHandleSelector: '.sortable', getPinnedItems: items => items,
            dragProxyConfig   : {module: DragProxyContainer}, timeout: () => Promise.resolve()}
    });
    if (wrapped) {
        rootHost = Neo.create(Container, {appName, id: 'terminal-ancestor', items: [owner]});
        await rootHost.initVnode(true)
    } else await owner.initVnode(true);
    await expect.poll(() => owner.sortZone).toBeTruthy();
    zone = owner.sortZone;
    const dragged = owner.items.at(-1), index = owner.items.length - 1;
    await zone.startDrag({clientX: index * 100 + 50, clientY: 50, targetPath: [], path: [
        {id: dragged.id, cls: ['sortable'], rect: new Rectangle(index * 100, 0, 100, 100)},
        {id: owner.id, cls: [], rect: new Rectangle(0, 0, owner.items.length * 100, 100)}
    ]});
    await Promise.all([owner.promiseUpdate(), ...owner.items.map(item => item.promiseUpdate()), zone.dragPlaceholder.promiseUpdate()]);
    return {dragged, proxy: zone.dragProxy, placeholder: zone.dragPlaceholder, originalItems: [...owner.items]}
}

async function createRemoteScene() {
    // Exercise the real dashboard terminal with its owner-held placeholder. These controls isolate
    // cleanup ownership; the local cases above exercise the actual renderer and batch delivery.
    Neo.config.allowVdomUpdatesInTests = false;
    owner = Neo.create(Container, {
        appName, id: 'terminal-owner', layout: {ntype: 'hbox'}, dragResortable: true,
        getVdomUpdateMeta: () => ({retainedMetadata: 'owner-value'}),
        items            : ['A', 'B'].map(key => ({module: Component, id: `terminal-${key}`, cls: ['sortable']})),
        sortZoneConfig   : {module: DashboardSortZone}
    });
    await expect.poll(() => owner.sortZone).toBeTruthy();
    zone = owner.sortZone;
    detached = Neo.create(Component, {appName, id: 'terminal-remote', text: 'remote live item'});
    zone.dragProxy = Neo.create(DragProxyContainer, {appName, mounted: true, items: [detached]});
    zone.dragPlaceholder = Neo.create(Component, {appName, id: 'terminal-remote-placeholder'});
    owner.add(zone.dragPlaceholder);
    zone.isRemoteDragging = true;
    await zone.setupDragState(zone.dragPlaceholder);
    return {dragged: detached, proxy: zone.dragProxy, placeholder: zone.dragPlaceholder}
}

/** Restore inherited members as inherited, not as new own-property shadows. */
function restoreProperty(target, key, descriptor) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key]
}

/** @summary Rejects the first terminal batch at the App-to-Main boundary before it can write to Main. */
function rejectNextTerminalApply(error, onReject) {
    const apply = Neo.applyDeltas;

    Neo.applyDeltas = async (windowId, deltas, meta) => {
        if (Object.values(meta ?? {}).some(value => value?.sortZoneTerminal?.length)) {
            Neo.applyDeltas = apply;
            onReject?.();
            throw error
        }

        return apply(windowId, deltas, meta)
    }
}

test.beforeEach(() => {
    app = testApp;
    appDescriptors = Object.getOwnPropertyDescriptors(app);
    originalBatch = Helper.updateBatch;
    originalApply = Neo.applyDeltas;
    originalAddon = Neo.main.addon.DragDrop;
    descriptors = {
        batch     : Object.getOwnPropertyDescriptor(Helper, 'updateBatch'),
        apps      : Object.getOwnPropertyDescriptor(Neo, 'apps'),
        appsByName: Object.getOwnPropertyDescriptor(Neo, 'appsByName'),
        rect      : Object.getOwnPropertyDescriptor(Container.prototype, 'getDomRect'),
        children  : Object.getOwnPropertyDescriptor(Neo.main.DomAccess, 'getChildNodeIds'),
        focus     : Object.getOwnPropertyDescriptor(Neo.main.DomAccess, 'focus')
    };
    originalConfig = Object.fromEntries(['useVdomWorker', 'allowVdomUpdatesInTests', 'useDomApiRenderer', 'windowId']
        .map(key => [key, Object.getOwnPropertyDescriptor(Neo.config, key)]));
    // The suite can be re-entered from Playwright's module cache after another file replaced the app map.
    Neo.apps = {...Neo.apps, 1: app};
    Neo.appsByName = {...Neo.appsByName, [appName]: [app]};
    Neo.config.windowId = 1;
    Neo.config.useDomApiRenderer = true;
    writes = []; batches = []; pending = []; recording = false; heldReturn = false;
    Neo.config.useVdomWorker = false;
    Neo.config.allowVdomUpdatesInTests = true;
    Neo.main.addon.DragDrop = {registerZone: async () => {}, unregisterZone: async () => {},
        setDragProxyElement: async () => {}, setConfigs: async () => ({boundaryContainerRect: new Rectangle(0, 0, 300, 100)})};
    Container.prototype.getDomRect = ids => Promise.resolve(ids.map(id => id === owner.id
        ? new Rectangle(0, 0, owner.items.length * 100, 100)
        : new Rectangle(owner.items.findIndex(item => item.id === id) * 100, 0, 100, 100)));
    Neo.applyDeltas = async (windowId, deltas) => {
        if (!recording) return;
        deltas = Array.isArray(deltas) ? deltas : [deltas];
        writes.push({windowId, deltas: structuredClone(deltas),
            ownerOrder: (owner.items || []).map(item => item.id),
            pinned    : (owner.items || []).filter(item => item.wrapperStyle?.position === 'absolute').map(item => item.id)});
        if (heldReturn && deltas.some(delta => delta.action === 'moveNode' && delta.id === 'terminal-C' && delta.parentId === owner.id)) {
            const flight = Promise.withResolvers(); pending.push(flight); await flight.promise
        }
    };
    Helper.updateBatch = async function(data) {
        const response = originalBatch.call(this, data);
        MainDragDrop.prototype.onDeltaUpdate(response);
        if (recording) batches.push({rootIds: Object.keys(data.updates), absorbedMetaKeys: Object.keys(data.meta || {}),
            meta: structuredClone(response.meta || {}), deltas: structuredClone(response.deltas)});
        // The remote Helper reply arrives only after Main. The local mode instead exercises VdomLifecycle's actual applyDeltas branch.
        if (Neo.config.useVdomWorker && response.deltas.length) await Neo.applyDeltas(owner.windowId, response.deltas);
        return response
    }
});

test.afterEach(() => {
    pending.forEach(flight => flight.resolve());
    recording = false;
    Neo.config.useVdomWorker = false;
    const proxy = zone?.dragProxy, placeholder = zone?.dragPlaceholder;
    try {
        for (const item of [rootHost, owner, detached, proxy, placeholder, zone]) {
            item && !item.isDestroyed && item.destroy()
        }
    } finally {
        owner = zone = detached = rootHost = null;
        restoreProperty(Helper, 'updateBatch', descriptors.batch);
        Neo.applyDeltas = originalApply;
        restoreProperty(Container.prototype, 'getDomRect', descriptors.rect);
        Neo.main.addon.DragDrop = originalAddon;
        restoreProperty(Neo.main.DomAccess, 'getChildNodeIds', descriptors.children);
        restoreProperty(Neo.main.DomAccess, 'focus', descriptors.focus);
        for (const [key, descriptor] of Object.entries(originalConfig)) restoreProperty(Neo.config, key, descriptor);
        Reflect.ownKeys(app).forEach(key => {if (!Object.hasOwn(appDescriptors, key)) delete app[key]});
        Object.defineProperties(app, appDescriptors);
        restoreProperty(Neo, 'apps', descriptors.apps);
        restoreProperty(Neo, 'appsByName', descriptors.appsByName)
    }
});

for (const remoteHelper of [false, true]) for (const terminal of ['drop', 'Escape', 'same-slot']) {
    test(`${remoteHelper ? 'VDom-worker reply' : 'local Helper'}: ${terminal} has one completed terminal Main operation`, async ({}, testInfo) => {
        const {dragged, proxy, placeholder, originalItems} = await createScene(), proxyId = proxy.id, placeholderId = placeholder.id,
              originalMeta                                 = owner.getVdomUpdateMeta, moves = [], originalMove = owner.moveTo.bind(owner);
        owner.moveTo = (from, to) => {moves.push({from, to}); return originalMove(from, to)};
        if (terminal !== 'same-slot') {
            await zone.onDragMove({clientX: 140, clientY: 50});
            await Promise.all([owner.promiseUpdate(), ...owner.items.map(item => item.promiseUpdate()), placeholder.promiseUpdate()])
        }
        Neo.config.useVdomWorker = remoteHelper;
        recording = heldReturn = true;
        let   finished = false;
        const ending   = (terminal === 'Escape' ? zone.onDragCancel({key: 'Escape'}) : zone.onDragEnd({})).then(() => {finished = true});
        try {
            await expect.poll(() => pending.length).toBe(1);
            expect(finished, 'the end waits for actual Main completion').toBe(false);
            expect(zone.dragEndActive, 'terminal-dependent projection cannot drain before the Main acknowledgement').toBe(true);
            expect(zone.dragProxy).toBe(proxy);
            expect(proxy.isDestroyed).not.toBe(true);
            heldReturn = false;
            pending[0].resolve();
            await ending;
            await owner.promiseUpdate();

            const operation = writes.find(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id));
            await testInfo.attach('terminal-operations', {body: JSON.stringify({remoteHelper, terminal, writes, batches, moves}), contentType: 'application/json'});
            expect(operation.deltas.some(delta => delta.id === 'terminal-B' && delta.style?.position === null),
                'the returning original cannot be published before the ordinary unpin').toBe(true);
            expect(operation.deltas).toContainEqual({action: 'removeNode', id: placeholderId});
            expect(operation.deltas).toContainEqual({action: 'removeNode', id: proxyId});
            expect(writes.flatMap(write => write.deltas).filter(delta => delta.action === 'removeNode' && delta.id === proxyId)).toHaveLength(1);
            expect(moves).toEqual(terminal === 'drop' ? [{from: 2, to: 1}] : []);
            expect(owner.items).toEqual(terminal === 'drop' ? [originalItems[0], originalItems[2], originalItems[1]] : originalItems);
            expect(owner.getVdomUpdateMeta).toBe(originalMeta);
            expect(owner.getVdomUpdateMeta()).toEqual({retainedMetadata: 'owner-value'});
            expect(batches.filter(batch => Object.values(batch.meta).some(meta => meta.sortZoneTerminal?.length))).toHaveLength(1);
            expect(zone.dragPlaceholder).toBeNull(); expect(zone.dragProxy).toBeNull(); expect(zone.itemRects).toBeNull();
            expect(zone.dragEndActive).toBe(false);
            expect(placeholder.isDestroyed && proxy.isDestroyed).toBe(true)
        } finally {
            heldReturn = false; pending.forEach(flight => flight.resolve()); await ending
        }
    })
}

for (const remoteHelper of [false, true]) test(`${remoteHelper ? 'VDom-worker reply' : 'local Helper'}: a zero-ordinary-delta same-slot end still reaches Main`, async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene({single: true}), proxyId = proxy.id, placeholderId = placeholder.id;
    Neo.config.useVdomWorker = remoteHelper;
    recording = true;
    await zone.onDragEnd({});
    await owner.promiseUpdate();
    const terminal = writes.find(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id));
    await testInfo.attach('zero-ordinary-terminal', {body: JSON.stringify({remoteHelper, writes, batches}), contentType: 'application/json'});
    expect(terminal.deltas).toEqual([
        {action: 'moveNode', id: dragged.id, index: 0, parentId: owner.id},
        {action: 'removeNode', id: placeholderId}, {action: 'removeNode', id: proxyId}
    ]);
    expect(zone.dragProxy).toBeNull()
});

for (const remoteHelper of [false, true]) {
    test(`${remoteHelper ? 'VDom-worker reply' : 'local Helper'}: removal wins without restoring the original`, async ({}, testInfo) => {
        const {dragged, proxy, placeholder} = await createScene(), placeholderId = placeholder.id;
        detached = owner.remove(dragged, false);
        await owner.promiseUpdate();
        Neo.config.useVdomWorker = remoteHelper;
        recording = true;
        await zone.onDragCancel({key: 'Escape'});
        await owner.promiseUpdate();
        await testInfo.attach('removed-owner-control', {body: JSON.stringify({remoteHelper, writes, batches}), contentType: 'application/json'});
        expect(writes.flatMap(write => write.deltas).some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id)).toBe(false);
        expect(writes.flatMap(write => write.deltas).filter(delta => delta.action === 'removeNode' && delta.id === placeholderId)).toHaveLength(1);
        expect(owner.items.map(item => item.id)).toEqual(['terminal-A', 'terminal-B']);
        expect(zone.dragProxy).toBeNull();
        expect(proxy.isDestroyed).toBe(true);
        expect(batches.some(batch => Object.values(batch.meta).some(meta => meta.sortZoneTerminal))).toBe(false)
    });

    for (const leave of [false, true]) test(`${remoteHelper ? 'VDom-worker reply' : 'local Helper'}: remote placeholder ${leave ? 'leave' : 'end'} keeps its old semantics`, async ({}, testInfo) => {
        const {dragged, proxy, placeholder} = await createRemoteScene(), placeholderId = placeholder.id;
        expect(zone.dragComponent).toBe(placeholder);
        Neo.config.useVdomWorker = remoteHelper;
        recording = true;
        if (leave) await DashboardSortZone.prototype.onRemoteDragLeave.call(zone, {});
        else await zone.onDragEnd({});
        await owner.promiseUpdate();
        const moves = writes.flatMap(write => write.deltas).filter(delta => delta.action === 'moveNode' && delta.id === placeholderId);
        await testInfo.attach('remote-control', {body: JSON.stringify({remoteHelper, leave, writes, batches}), contentType: 'application/json'});
        expect(moves).toEqual(leave ? [] : [{action: 'moveNode', id: placeholderId, index: 2, parentId: owner.id}]);
        expect(writes.flatMap(write => write.deltas).filter(delta => delta.action === 'removeNode' && delta.id === placeholderId)).toHaveLength(1);
        expect(writes.flatMap(write => write.deltas).some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id)).toBe(false);
        expect(zone.dragProxy).toBeNull(); expect(zone.dragPlaceholder).toBeNull();
        expect(batches.some(batch => Object.values(batch.meta).some(meta => meta.sortZoneTerminal))).toBe(false)
    });
}

test('the focus re-show and terminal latch still wait after the atomic Main operation', async () => {
    const {dragged, proxy} = await createScene(), focus = Promise.withResolvers(), calls = [],
          originalFocus    = Neo.main.DomAccess.focus, originalUpdate = dragged.promiseUpdate;
    let requested = false;
    zone.dragFocusOwner = dragged;
    dragged.promiseUpdate = () => {requested = true; return focus.promise};
    Neo.main.DomAccess.focus = data => calls.push(data);
    recording = heldReturn = true;
    const ending = zone.onDragEnd({});
    try {
        await expect.poll(() => pending.length).toBe(1);
        expect(requested).toBe(false);
        expect(calls).toEqual([]);
        expect(zone.dragEndActive).toBe(true);
        heldReturn = false; pending[0].resolve();
        await expect.poll(() => requested).toBe(true);
        expect(calls).toEqual([]);
        expect(zone.dragEndActive).toBe(true);
        focus.resolve(); await ending;
        expect(calls).toHaveLength(1);
        expect(calls[0].id).toBe(dragged.id);
        expect(zone.dragEndActive).toBe(false);
        expect(proxy.isDestroyed).toBe(true)
    } finally {
        heldReturn = false; pending.forEach(flight => flight.resolve()); focus.resolve();
        await ending; dragged.promiseUpdate = originalUpdate; Neo.main.DomAccess.focus = originalFocus
    }
});

test('a covering ancestor carries the owner prelude through actual payload absorption', async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene({wrapped: true}), proxyId = proxy.id, placeholderId = placeholder.id;
    recording = true;
    rootHost.updateDepth = -1;
    rootHost.denseUpdate = true;
    rootHost.addCls('terminal-ancestor-update');
    await zone.onDragEnd({});
    await rootHost.promiseUpdate();
    await testInfo.attach('absorbed-terminal', {body: JSON.stringify({writes, batches}), contentType: 'application/json'});
    const carrier = batches.find(batch => batch.meta[owner.id]?.sortZoneTerminal?.length);
    expect(carrier).toBeTruthy();
    expect(carrier.rootIds).not.toContain(owner.id);
    expect(carrier.absorbedMetaKeys).toContain(owner.id);
    expect(carrier.meta[owner.id].retainedMetadata).toBe('owner-value');
    const operation = writes.find(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id));
    expect(operation.deltas).toContainEqual({action: 'removeNode', id: placeholderId});
    expect(operation.deltas).toContainEqual({action: 'removeNode', id: proxyId});
    expect(operation.deltas.some(delta => delta.id === 'terminal-B' && delta.style?.position === null)).toBe(true)
});

test('prior owner and child silent scopes survive terminal staging', async () => {
    const {proxy} = await createScene(), child = owner.items[1], originalMeta = owner.getVdomUpdateMeta;
    owner.silentVdomUpdate = true;
    child.silentVdomUpdate = true; child.silentVdomUpdate = true;
    recording = true;
    let   settled = false;
    const ending  = zone.onDragEnd({}).then(() => {settled = true});
    try {
        await expect.poll(() => owner.getVdomUpdateMeta !== originalMeta).toBe(true);
        expect(owner.silentVdomUpdate).toBe(1);
        expect(child.silentVdomUpdate).toBe(2);
        expect(settled).toBe(false);
        expect(writes).toEqual([]);
        expect(zone.dragProxy).toBe(proxy);
        owner.silentVdomUpdate = false;
        await owner.promiseUpdate();
        await ending;
        expect(owner.silentVdomUpdate).toBe(0);
        expect(child.silentVdomUpdate).toBe(2)
    } finally {
        while (owner.silentVdomUpdate) owner.silentVdomUpdate = false;
        while (child.silentVdomUpdate) child.silentVdomUpdate = false;
        await owner.promiseUpdate(); await ending
    }
});

for (const heldScope of ['owner', 'child']) test(`an older ${heldScope} flight cannot publish an unpin ahead of the prelude`, async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), delegate = Helper.updateBatch,
          gate                          = Promise.withResolvers(), subject = heldScope === 'owner' ? owner : owner.items[1];
    let held = false, ending;
    Helper.updateBatch = async function(data) {
        const result = await delegate.call(this, data);
        if (!held && Object.hasOwn(data.updates, subject.id)) {
            held = true;
            await gate.promise
        }
        return result
    };
    recording = true;
    subject.addCls('older-terminal-flight');
    try {
        await expect.poll(() => held).toBe(true);
        ending = zone.onDragEnd({});
        await expect.poll(() => zone.dragEndActive).toBe(true);
        expect(writes.some(write => write.deltas.some(delta => delta.style?.position === null)), 'no unpin escaped while the prior flight held the owner').toBe(false);
        expect(proxy.isDestroyed).not.toBe(true);
        gate.resolve();
        await ending;
        await owner.promiseUpdate();
        const restores = writes.filter(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id));
        await testInfo.attach('older-flight-terminal', {body: JSON.stringify({heldScope, writes, batches}), contentType: 'application/json'});
        expect(restores).toHaveLength(1);
        expect(restores[0].deltas.some(delta => delta.id === 'terminal-B' && delta.style?.position === null)).toBe(true);
        expect(restores[0].deltas).toContainEqual({action: 'removeNode', id: placeholder.id});
        expect(zone.dragProxy).toBeNull()
    } finally {
        gate.resolve();
        if (ending) await ending;
        Helper.updateBatch = delegate
    }
});

for (const destroyZone of [false, true]) test(`owner destruction inside the real moveTo callback cleans terminal nodes${destroyZone ? ' and its zone' : ''}`, async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), ownerId = owner.id, proxyId = proxy.id,
          placeholderId                 = placeholder.id, actualMove = owner.moveTo.bind(owner), commits = [];
    await zone.onDragMove({clientX: 140, clientY: 50});
    await Promise.all([owner.promiseUpdate(), ...owner.items.map(item => item.promiseUpdate()), placeholder.promiseUpdate()]);
    owner.moveTo = (from, to) => {
        commits.push({from, to});
        const result = actualMove(from, to);
        owner.destroy(true);
        if (destroyZone) zone.destroy();
        return result
    };
    recording = true;
    const ending = zone.onDragEnd({}).then(() => ({status: 'resolved'}), error => ({status: 'rejected', error: String(error)}));
    let timer;
    const outcome = await Promise.race([ending, new Promise(resolve => {timer = setTimeout(() => resolve({status: 'pending'}), 300)})]);
    clearTimeout(timer);
    const receipt = {destroyZone, outcome, commits, writes,
        ownerDestroyed         : owner.isDestroyed, originalDestroyed: dragged.isDestroyed,
        proxyDestroyed         : proxy.isDestroyed, placeholderDestroyed: placeholder.isDestroyed,
        terminalMetaLeftOnOwner: Object.hasOwn(owner, 'getVdomUpdateMeta'),
        zoneDestroyed          : zone.isDestroyed, dragEndActive: zone.dragEndActive};
    await testInfo.attach('owner-destroy-terminal', {body: JSON.stringify(receipt), contentType: 'application/json'});
    // A failed lifetime assertion must not leave its deliberately exposed callback in the test worker.
    if (outcome.status === 'pending') {VDomUpdate.rejectCallbacks(ownerId, Neo.isDestroyed); await ending}
    expect(outcome.status, 'a dead owner must not park a new render wait').not.toBe('pending');
    if (!destroyZone) expect(outcome.status).toBe('resolved');
    expect(commits).toEqual([{from: 2, to: 1}]);
    expect(writes.flatMap(write => write.deltas).filter(delta => delta.action === 'removeNode' && delta.id === proxyId)).toHaveLength(1);
    expect(writes.flatMap(write => write.deltas).filter(delta => delta.action === 'removeNode' && delta.id === placeholderId)).toHaveLength(1);
    expect(proxy.isDestroyed && placeholder.isDestroyed).toBe(true);
    expect(receipt.terminalMetaLeftOnOwner).toBe(false);
    expect(zone.isDestroyed || zone.dragEndActive === false).toBe(true)
});

for (const remoteHelper of [false, true]) test(`covering render rejection ${remoteHelper ? 'after' : 'before'} Main still cleans the live terminal and surfaces the failure`, async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), proxyId = proxy.id, placeholderId = placeholder.id,
          originalMeta                  = owner.getVdomUpdateMeta, failure = new Error('deliberate covering render rejection'),
          actualMove                    = owner.moveTo.bind(owner), commits = [], queries = [];
    await zone.onDragMove({clientX: 140, clientY: 50});
    await Promise.all([owner.promiseUpdate(), ...owner.items.map(item => item.promiseUpdate()), placeholder.promiseUpdate()]);
    owner.moveTo = (from, to) => {commits.push({from, to}); return actualMove(from, to)};
    // Node controls transport rather than native DOM. Model the already-recorded Main removal,
    // whose response is the existing getChildNodeIds contract, not a worker delivery inference.
    Neo.main.DomAccess.getChildNodeIds = async data => {
        queries.push(data);
        return writes.some(write => write.deltas.some(delta => delta.action === 'removeNode' && delta.id === proxyId)) ? null :
            writes.some(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id && delta.parentId === owner.id)) ? [] : [dragged.id]
    };
    let   rejectionReached = false, writesAtRejection;
    const recordRejection  = () => {
        rejectionReached = true;
        writesAtRejection = writes.length
    };
    if (remoteHelper) {
        owner.afterExecuteVdomUpdate = () => {
            if (!batches.some(batch => batch.meta[owner.id]?.sortZoneTerminal)) return;
            recordRejection();
            delete owner.afterExecuteVdomUpdate;
            throw failure
        }
    } else {
        rejectNextTerminalApply(failure, recordRejection)
    }
    Neo.config.useVdomWorker = remoteHelper;
    recording = true;
    const outcome = await zone.onDragEnd({}).then(() => ({status: 'resolved'}), error => ({status: 'rejected', sameError: error === failure}));
    await testInfo.attach('covering-render-rejection', {body: JSON.stringify({remoteHelper, outcome, rejectionReached,
        writesAtRejection, writes, batches, commits, queries, proxyDestroyed: proxy.isDestroyed, placeholderDestroyed: placeholder.isDestroyed}), contentType: 'application/json'});
    expect(rejectionReached, 'the error must occur after actual metadata collection').toBe(true);
    expect(writesAtRejection).toBe(remoteHelper ? 1 : 0);
    expect(outcome).toEqual({status: 'rejected', sameError: true});
    expect(proxy.isDestroyed && placeholder.isDestroyed, 'a rejected covering render cannot leave the live terminal parked in a proxy').toBe(true);
    const cleanup = writes.at(-1)?.deltas || [];
    expect(commits).toEqual([{from: 2, to: 1}]);
    expect(queries).toEqual(Array.from({length: remoteHelper ? 1 : 2}, () => ({id: proxyId, windowId: owner.windowId})));
    expect(cleanup.some(delta => delta.action === 'moveNode')).toBe(false);
    if (remoteHelper) {
        expect(writes.slice(writesAtRejection).some(write => write.deltas.some(delta => delta.action === 'moveNode')),
            'already applied final order must not be moved back to the old slot').toBe(false)
    } else {
        expect(writes.at(-2).deltas).toEqual([{action: 'moveNode', id: dragged.id, index: 2, parentId: owner.id}])
    }
    expect(cleanup).toContainEqual({action: 'removeNode', id: placeholderId});
    expect(cleanup).toContainEqual({action: 'removeNode', id: proxyId});
    expect(dragged.isDestroyed).not.toBe(true);
    expect(zone.dragProxy).toBeNull(); expect(zone.dragPlaceholder).toBeNull();
    expect(zone.dragEndActive).toBe(false);
    expect(owner.getVdomUpdateMeta).toBe(originalMeta)
});

test('failed recovery move retains a live proxy when its native destination is absent', async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), proxyId = proxy.id, failure = new Error('deliberate pre-Main rejection');
    rejectNextTerminalApply(failure);
    // Model Main's documented no-op move against an absent destination: original remains a proxy child.
    Neo.main.DomAccess.getChildNodeIds = async () => [dragged.id];
    recording = true;
    const error = await zone.onDragEnd({}).then(() => null, error => error);
    await testInfo.attach('failed-terminal-recovery', {body: JSON.stringify({writes, name: error?.name,
        errors: error?.errors?.map(String), proxyDestroyed: proxy.isDestroyed}), contentType: 'application/json'});
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors[0]).toBe(failure);
    expect(error.errors[1].message).toBe('Live drag component remains in its proxy after terminal recovery');
    expect(writes.flatMap(write => write.deltas).some(delta => delta.action === 'removeNode' && delta.id === proxyId)).toBe(false);
    expect(proxy.isDestroyed).not.toBe(true); expect(dragged.isDestroyed).not.toBe(true);
    expect(zone.dragProxy).toBe(proxy); expect(zone.dragPlaceholder).toBe(placeholder);
    expect(zone.dragEndActive).toBe(false)
});

test('owner destruction during a captured covering render still retires the proxy', async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), ownerId = owner.id, proxyId = proxy.id,
          placeholderId                 = placeholder.id, delegate = Helper.updateBatch, gate = Promise.withResolvers();
    let captured = false;
    Helper.updateBatch = async function(data) {
        const response = await delegate.call(this, data);
        if (response.meta?.[ownerId]?.sortZoneTerminal) {captured = true; await gate.promise}
        return response
    };
    recording = true;
    const ending = zone.onDragEnd({}).then(() => ({status: 'resolved'}), error => ({status: 'rejected', error: String(error)}));
    try {
        await expect.poll(() => captured).toBe(true);
        owner.destroy(true);
        const outcome = await ending;
        await testInfo.attach('owner-destroy-during-render', {body: JSON.stringify({captured, outcome, writes, batches,
            proxyDestroyed: proxy.isDestroyed, placeholderDestroyed: placeholder.isDestroyed}), contentType: 'application/json'});
        expect(outcome.status).toBe('rejected');
        expect(writes.flatMap(write => write.deltas).some(delta => delta.action === 'moveNode' && delta.id === dragged.id)).toBe(false);
        expect(writes.flatMap(write => write.deltas)).toContainEqual({action: 'removeNode', id: proxyId});
        expect(writes.flatMap(write => write.deltas)).toContainEqual({action: 'removeNode', id: placeholderId});
        expect(proxy.isDestroyed && placeholder.isDestroyed).toBe(true);
        expect(zone.dragProxy).toBeNull(); expect(zone.dragPlaceholder).toBeNull();
        expect(zone.dragEndActive).toBe(false);
        expect(Object.hasOwn(owner, 'getVdomUpdateMeta')).toBe(false)
    } finally {
        gate.resolve(); await ending; Helper.updateBatch = delegate
    }
});

test('covering render rejection is not swallowed when the hook also destroys the zone', async ({}, testInfo) => {
    const {dragged, proxy, placeholder} = await createScene(), failure = new Error('render failure also destroys zone');
    owner.afterExecuteVdomUpdate = () => {
        delete owner.afterExecuteVdomUpdate;
        zone.destroy();
        throw failure
    };
    Neo.main.DomAccess.getChildNodeIds = async () => writes.some(write =>
        write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id)) ? [] : [dragged.id];
    recording = true;
    const outcome = await zone.onDragEnd({}).then(() => ({status: 'resolved'}), error => ({status: 'rejected', sameError: error === failure}));
    await testInfo.attach('render-rejection-zone-destroy', {body: JSON.stringify({outcome, writes,
        zoneDestroyed: zone.isDestroyed, proxyDestroyed: proxy.isDestroyed, placeholderDestroyed: placeholder.isDestroyed}), contentType: 'application/json'});
    expect(outcome).toEqual({status: 'rejected', sameError: true});
    expect(zone.isDestroyed).toBe(true);
    expect(proxy.isDestroyed && placeholder.isDestroyed).toBe(true)
});

for (const committed of [false, true]) test(`a callback throwing ${committed ? 'after' : 'before'} its model write still settles once`, async () => {
    const {dragged, proxy, placeholder, originalItems} = await createScene(),
          failure                                      = new Error('deliberate commit callback failure'), originalMeta = owner.getVdomUpdateMeta,
          actualMove                                   = owner.moveTo.bind(owner);
    await zone.onDragMove({clientX: 140, clientY: 50});
    await Promise.all([owner.promiseUpdate(), ...owner.items.map(item => item.promiseUpdate()), placeholder.promiseUpdate()]);
    let calls = 0;
    owner.moveTo = (from, to) => {
        calls++;
        if (committed) actualMove(from, to);
        throw failure
    };
    recording = true;
    const error = await zone.onDragEnd({}).then(() => null, error => error);
    expect(error).toBe(failure);
    expect(calls).toBe(1);
    expect(owner.items).toEqual(committed ? [originalItems[0], originalItems[2], originalItems[1]] : originalItems);
    expect(writes.filter(write => write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id))).toHaveLength(1);
    expect(proxy.isDestroyed && placeholder.isDestroyed).toBe(true);
    expect(zone.dragProxy).toBeNull(); expect(zone.dragPlaceholder).toBeNull();
    expect(zone.itemRects).toBeNull(); expect(zone.dragEndActive).toBe(false);
    expect(owner.getVdomUpdateMeta).toBe(originalMeta);
    expect(owner.silentVdomUpdate).toBe(0)
});

test('malformed prior terminal metadata rejects without silently spreading it or losing the live subtree', async () => {
    const {dragged, proxy, placeholder} = await createScene();
    owner.getVdomUpdateMeta = () => ({sortZoneTerminal: 'invalid'});
    const originalMeta = owner.getVdomUpdateMeta;
    Neo.main.DomAccess.getChildNodeIds = async () => writes.some(write =>
        write.deltas.some(delta => delta.action === 'moveNode' && delta.id === dragged.id)) ? [] : [dragged.id];
    recording = true;
    const error = await zone.onDragEnd({}).then(() => null, error => error);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toContain('must be an array');
    expect(proxy.isDestroyed && placeholder.isDestroyed).toBe(true);
    expect(dragged.isDestroyed).not.toBe(true);
    expect(owner.getVdomUpdateMeta).toBe(originalMeta);
    expect(zone.dragProxy).toBeNull(); expect(zone.itemRects).toBeNull()
});
