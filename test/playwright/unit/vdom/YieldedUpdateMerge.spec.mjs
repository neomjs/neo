import {setup} from '../../setup.mjs';

const appName = 'YieldedUpdateMergeTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        logVdomUpdateCollisions: false,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        isMounted        : () => true,
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * @summary Verifies that `VdomLifecycle#updateVdom` sets `needsVdomUpdate = true` when yielding to an
 * in-flight descendant (`isChildUpdating`), an in-flight ancestor (`isParentUpdating`), or `themeFilesLoaded`,
 * allowing subsequent descendant updates to merge into the queued cycle instead of launching disjoint flights.
 */
test.describe('Neo.mixin.VdomLifecycle yielded update merging', () => {
    const originalUpdateBatch = VdomHelper.updateBatch;

    let batches = [],
        created = [],
        gates   = [],
        run     = 0;

    const id = name => `yielded-merge-${name}-${++run}`;

    const trackComponent = component => {
        created.push(component);
        return component
    };

    const holdBatches = count => {
        batches = [];
        gates   = Array.from({length: count}, () => {
            const gate = {};
            gate.entered = new Promise(resolve => {gate.enter = resolve});
            gate.held    = new Promise(resolve => {gate.release = resolve});
            return gate
        });

        let index = 0;

        VdomHelper.updateBatch = async function(data) {
            batches.push(data);
            const gate = gates[index++];
            if (gate) {
                gate.enter(data);
                await gate.held
            }
            return originalUpdateBatch.call(this, data)
        };

        return gates
    };

    test.afterEach(() => {
        gates.forEach(gate => gate.release());
        gates = [];
        VdomHelper.updateBatch = originalUpdateBatch;

        while (created.length) {
            const component = created.pop();
            component.isDestroyed || component.destroy()
        }
    });

    test('coalesces sibling updates into an ancestor yielded on isChildUpdating during atomic Container#insert', async () => {
        const root = trackComponent(Neo.create(Container, {
            appName,
            id   : id('root'),
            items: [{
                module: Container,
                id    : id('child-a'),
                layout: null,
                items : [{
                    module: Component,
                    id    : id('movable-item'),
                    vdom  : {tag: 'span', text: 'item-payload'}
                }]
            }, {
                module: Container,
                id    : id('child-b'),
                layout: null,
                items : []
            }, {
                module: Component,
                id    : id('child-c'),
                vdom  : {tag: 'div', text: 'c-before'}
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const [childA, childB, childC] = root.items,
              item                     = childA.items[0];

        holdBatches(2);

        childC.vdom.text = 'c-in-flight';
        const childCFlight = childC.promiseUpdate();

        await gates[0].entered;

        expect(VDomUpdate.hasInFlightDescendants(root.id)).toBe(true);
        expect(root.isVdomUpdating).toBe(false);
        expect(root.needsVdomUpdate).toBe(false);

        let insertFired = false,
            moveSettled = false,
            movePromise;

        const origPromiseUpdate = root.promiseUpdate.bind(root);
        root.promiseUpdate = () => {
            root.promiseUpdate = origPromiseUpdate;
            return movePromise = origPromiseUpdate().then(result => {
                moveSettled = true;
                return result
            })
        };
        childB.on('insert', () => {insertFired = true});

        childB.insert(0, item);

        expect(root.updateDepth).toBe(-1);
        expect(root.isVdomUpdating).toBe(false);
        expect(root.needsVdomUpdate).toBe(true);
        expect(VDomUpdate.postUpdateQueueMap.get(childC.id)?.children.some(entry => entry.childId === root.id)).toBe(true);

        childA.vdom.cls = ['neo-container', 'child-a-after-move'];
        childB.vdom.cls = ['neo-container', 'child-b-after-move'];
        const childAFlight = childA.promiseUpdate(),
              childBFlight = childB.promiseUpdate();

        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(childA.id)).toBe(true);
        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(childB.id)).toBe(true);
        expect(childA.needsVdomUpdate).toBe(true);
        expect(childB.needsVdomUpdate).toBe(true);
        expect(childA.isVdomUpdating).toBe(false);
        expect(childB.isVdomUpdating).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(childA.id)).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(childB.id)).toBe(false);

        gates[0].release();
        await childCFlight;

        const rootBatch = await gates[1].entered;

        expect(moveSettled).toBe(false);
        expect(insertFired).toBe(false);
        expect(Object.keys(rootBatch.updates)).toEqual([root.id]);
        expect(root.needsVdomUpdate).toBe(false);
        expect(childA.needsVdomUpdate).toBe(false);
        expect(childB.needsVdomUpdate).toBe(false);

        gates[1].release();

        const [moveResult] = await Promise.all([movePromise, childAFlight, childBFlight]);

        expect(moveSettled).toBe(true);
        expect(insertFired).toBe(true);
        expect(batches.map(batch => Object.keys(batch.updates))).toEqual([[childC.id], [root.id]]);
        expect(moveResult.deltas.some(delta =>
            delta.action === 'moveNode' && delta.id === item.id && delta.parentId === childB.getVdomItemsRoot().id
        )).toBe(true);
        expect(childA.vnode.className).toContain('child-a-after-move');
        expect(childB.vnode.className).toContain('child-b-after-move');
        expect(childB.vnode.childNodes.map(node => node.id)).toContain(item.id);
        expect(childA.vnode.childNodes.map(node => node.id)).not.toContain(item.id);
        expect(root.needsVdomUpdate).toBe(false);
        expect([root.id, childA.id, childB.id, childC.id, item.id].every(id => !VDomUpdate.inFlightUpdateMap.has(id))).toBe(true);
        expect(VDomUpdate.promiseCallbackMap.has(root.id)).toBe(false);
        expect(VDomUpdate.mergedCallbackMap.has(root.id)).toBe(false)
    });

    test('coalesces grandchild updates into a branch yielded on isParentUpdating', async () => {
        const root = trackComponent(Neo.create(Container, {
            appName,
            id   : id('parent-yield-root'),
            items: [{
                module: Container,
                id    : id('parent-yield-branch'),
                items : [{
                    module: Component,
                    id    : id('parent-yield-leaf'),
                    vdom  : {tag: 'span', text: 'leaf-before'}
                }]
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const branch = root.items[0],
              leaf   = branch.items[0];

        holdBatches(2);

        root.updateDepth = 2;
        root.vdom.cls    = ['neo-container', 'root-in-flight'];
        const rootFlight = root.promiseUpdate();

        await gates[0].entered;

        expect(root.isVdomUpdating).toBe(true);
        expect(root.needsVdomUpdate).toBe(false);
        expect(VDomUpdate.getInFlightUpdateDepth(root.id)).toBe(2);

        let branchSettled = false;
        branch.updateDepth = 2;
        branch.vdom.cls    = ['neo-container', 'branch-queued'];
        const branchFlight = branch.promiseUpdate().then(result => {
            branchSettled = true;
            return result
        });

        expect(branch.isVdomUpdating).toBe(false);
        expect(branch.needsVdomUpdate).toBe(true);
        expect(VDomUpdate.postUpdateQueueMap.get(root.id)?.children.some(entry => entry.childId === branch.id)).toBe(true);

        leaf.vdom.text = 'leaf-merged';
        const leafFlight = leaf.promiseUpdate();

        expect(VDomUpdate.mergedCallbackMap.get(branch.id)?.children.has(leaf.id)).toBe(true);
        expect(leaf.needsVdomUpdate).toBe(true);
        expect(leaf.isVdomUpdating).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(leaf.id)).toBe(false);

        gates[0].release();
        await rootFlight;

        const branchBatch = await gates[1].entered;

        expect(branchSettled).toBe(false);
        expect(Object.keys(branchBatch.updates)).toEqual([branch.id]);
        expect(branch.needsVdomUpdate).toBe(false);
        expect(leaf.needsVdomUpdate).toBe(false);

        gates[1].release();
        await Promise.all([branchFlight, leafFlight]);

        expect(branchSettled).toBe(true);
        expect(batches.map(batch => Object.keys(batch.updates))).toEqual([[root.id], [branch.id]]);
        expect(branch.vnode.className).toContain('branch-queued');
        expect(leaf.vnode.textContent).toBe('leaf-merged');
        expect(VDomUpdate.promiseCallbackMap.has(branch.id)).toBe(false);
        expect(VDomUpdate.promiseCallbackMap.has(leaf.id)).toBe(false)
    });

    test('sets needsVdomUpdate during themeFilesLoaded deferral and merges child updates', async () => {
        const root = trackComponent(Neo.create(Container, {
            appName,
            id   : id('theme-root'),
            items: [{
                module: Component,
                id    : id('theme-child'),
                vdom  : {tag: 'span', text: 'theme-before'}
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const child            = root.items[0],
              origUnitTestMode = Neo.config.unitTestMode,
              origWorkerOn     = Neo.currentWorker.on,
              origCount        = Neo.currentWorker.countLoadingThemeFiles,
              listeners        = [];

        try {
            Neo.config.unitTestMode                  = false;
            Neo.currentWorker.countLoadingThemeFiles = 1;
            Neo.currentWorker.on                     = (event, fn, scope) => {
                listeners.push({event, fn, scope})
            };

            root.updateDepth = 2;
            root.vdom.cls    = ['neo-container', 'theme-ready'];
            const rootFlight = root.promiseUpdate();

            expect(listeners).toHaveLength(1);
            expect(listeners[0].event).toBe('themeFilesLoaded');
            expect(root.needsVdomUpdate).toBe(true);
            expect(root.isVdomUpdating).toBe(false);

            child.vdom.text = 'theme-merged-child';
            const childFlight = child.promiseUpdate();

            expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(child.id)).toBe(true);
            expect(child.needsVdomUpdate).toBe(true);
            expect(child.isVdomUpdating).toBe(false);
            expect(listeners).toHaveLength(1);

            Neo.currentWorker.countLoadingThemeFiles = 0;
            listeners[0].fn.call(listeners[0].scope);

            await Promise.all([rootFlight, childFlight]);

            expect(root.needsVdomUpdate).toBe(false);
            expect(child.needsVdomUpdate).toBe(false);
            expect(root.vnode.className).toContain('theme-ready');
            expect(child.vnode.textContent).toBe('theme-merged-child');
            expect(VDomUpdate.promiseCallbackMap.has(root.id)).toBe(false);
            expect(VDomUpdate.promiseCallbackMap.has(child.id)).toBe(false)
        } finally {
            Neo.config.unitTestMode = origUnitTestMode;
            Neo.currentWorker.on    = origWorkerOn;

            if (origCount === undefined) {
                delete Neo.currentWorker.countLoadingThemeFiles
            } else {
                Neo.currentWorker.countLoadingThemeFiles = origCount
            }
        }
    });

    test('sets needsVdomUpdate on !vnode parent-yield while keeping !mounted false', async () => {
        const unmounted = trackComponent(Neo.create(Component, {
            appName,
            id  : id('unmounted'),
            vdom: {tag: 'div', text: 'initial'}
        }));

        await unmounted.initVnode(false);
        expect(unmounted.vnodeInitialized).toBe(true);
        expect(unmounted.mounted).toBe(false);

        unmounted.vdom.text = 'updated-while-unmounted';
        unmounted.update();

        expect(unmounted.isAwaitingMount).toBe(true);
        expect(unmounted.needsVdomUpdate).toBe(false);

        const root = trackComponent(Neo.create(Container, {
            appName,
            id   : id('vnode-null-root'),
            items: [{
                module: Component,
                id    : id('vnode-null-child'),
                vdom  : {tag: 'span', text: 'child-before'}
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const child           = root.items[0],
              origReportError = console.error,
              errors          = [];

        holdBatches(1);

        try {
            console.error = (...args) => errors.push(args);

            root.updateDepth = -1;
            root.vdom.cls    = ['neo-container', 'parent-covering'];
            const rootFlight = root.promiseUpdate();

            await gates[0].entered;

            child._vnode    = null;
            child.vdom.text = 'child-after';
            child.update();

            expect(child.needsVdomUpdate).toBe(true);
            expect(errors).toEqual([]);
            expect(VDomUpdate.postUpdateQueueMap.get(root.id)?.children.some(entry => entry.childId === child.id)).toBe(true);

            gates[0].release();
            await rootFlight;

            await expect.poll(() => !child.isVdomUpdating && !child.needsVdomUpdate && child.vnode?.textContent === 'child-after').toBe(true)
        } finally {
            console.error = origReportError
        }
    });

    test('preserves needsVdomUpdate across chained isChildUpdating yields with default flexbox containers', async () => {
        const root = trackComponent(Neo.create(Container, {
            appName,
            id   : id('chained-root'),
            items: [{
                module: Container,
                id    : id('chained-a'),
                items : [{
                    module: Component,
                    id    : id('chained-item'),
                    vdom  : {tag: 'span', text: 'chained-payload'}
                }]
            }, {
                module: Container,
                id    : id('chained-b'),
                items : []
            }, {
                module: Component,
                id    : id('chained-c'),
                vdom  : {tag: 'div', text: 'c-initial'}
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const [childA, childB, childC] = root.items,
              item                     = childA.items[0];

        holdBatches(3);

        childC.vdom.text = 'c-busy';
        const childCFlight = childC.promiseUpdate();

        await gates[0].entered;

        childB.insert(0, item);
        expect(root.needsVdomUpdate).toBe(true);

        const itemBatch = await gates[1].entered;
        expect(Object.keys(itemBatch.updates)).toEqual([item.id]);

        gates[0].release();
        await childCFlight;

        expect(root.isVdomUpdating).toBe(false);
        expect(root.needsVdomUpdate).toBe(true);
        expect(VDomUpdate.postUpdateQueueMap.get(item.id)?.children.some(entry => entry.childId === root.id)).toBe(true);

        childA.vdom.cls = ['neo-container', 'chained-a-updated'];
        childB.vdom.cls = ['neo-container', 'chained-b-updated'];
        const childAFlight = childA.promiseUpdate(),
              childBFlight = childB.promiseUpdate();

        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(childA.id)).toBe(true);
        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(childB.id)).toBe(true);
        expect(VDomUpdate.inFlightUpdateMap.has(childA.id)).toBe(false);
        expect(VDomUpdate.inFlightUpdateMap.has(childB.id)).toBe(false);

        gates[1].release();
        const rootBatch = await gates[2].entered;

        expect(Object.keys(rootBatch.updates)).toEqual([root.id]);
        gates[2].release();

        await Promise.all([childAFlight, childBFlight]);
        await expect.poll(() => !root.isVdomUpdating && !root.needsVdomUpdate).toBe(true);

        expect(batches.map(batch => Object.keys(batch.updates))).toEqual([[childC.id], [item.id], [root.id]]);
        expect(childB.vnode.childNodes.map(node => node.id)).toContain(item.id);
        expect(childA.vnode.childNodes.map(node => node.id)).not.toContain(item.id)
    });

    test('fires beforeExecuteVdomUpdate and afterExecuteVdomUpdate for every co-emitted root merged into a yielded depth-1 ancestor without firing on absorbed children', async () => {
        const root = trackComponent(Neo.create(Container, {
            appName,
            id    : id('co-emitted-root'),
            layout: null,
            items : [{
                module: Container,
                id    : id('co-emitted-branch'),
                layout: null,
                items : [{
                    module: Component,
                    id    : id('absorbed-leaf'),
                    vdom  : {tag: 'span', text: 'leaf-initial'}
                }]
            }, {
                module: Component,
                id    : id('busy-sibling'),
                vdom  : {tag: 'div', text: 'busy-initial'}
            }]
        }));

        await root.initVnode(true);
        root.mounted = true;
        await root.promiseUpdate();

        const [branch, busySibling] = root.items,
              leaf                  = branch.items[0],
              beforeCalls           = [],
              afterCalls            = [];

        [root, branch, leaf].forEach(component => {
            component.beforeExecuteVdomUpdate = () => beforeCalls.push(component.id);
            component.afterExecuteVdomUpdate  = () => afterCalls.push(component.id)
        });

        holdBatches(2);

        busySibling.vdom.text = 'busy-flight';
        const busyFlight = busySibling.promiseUpdate();

        await gates[0].entered;

        root.updateDepth = 1;
        root.vdom.cls    = ['neo-container', 'root-depth-1'];
        const rootFlight = root.promiseUpdate();

        expect(root.needsVdomUpdate).toBe(true);
        expect(root.isVdomUpdating).toBe(false);

        branch.updateDepth = 2;
        branch.vdom.cls    = ['neo-container', 'branch-depth-2'];
        const branchFlight = branch.promiseUpdate();

        leaf.vdom.text = 'leaf-absorbed';
        const leafFlight = leaf.promiseUpdate();

        expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(branch.id)).toBe(true);
        expect(VDomUpdate.mergedCallbackMap.get(branch.id)?.children.has(leaf.id)).toBe(true);

        gates[0].release();
        await busyFlight;

        const mergedBatch = await gates[1].entered;

        expect(Object.keys(mergedBatch.updates)).toEqual([root.id, branch.id]);
        expect(beforeCalls).toEqual([root.id, branch.id]);
        expect(afterCalls).toEqual([]);

        gates[1].release();
        await Promise.all([rootFlight, branchFlight, leafFlight]);

        expect(afterCalls).toEqual([root.id, branch.id]);
        expect(leaf.vnode.textContent).toBe('leaf-absorbed');

        beforeCalls.length = 0;
        afterCalls.length  = 0;

        holdBatches(2);

        busySibling.vdom.text = 'busy-flight-2';
        const busyFlight2 = busySibling.promiseUpdate();

        await gates[0].entered;

        root.updateDepth = 1;
        root.vdom.cls    = ['neo-container', 'root-depth-1-wave2'];
        const rootFlight2 = root.promiseUpdate();

        branch.updateDepth = 2;
        branch.vdom.cls    = ['neo-container', 'branch-depth-2-wave2'];
        const branchFlight2 = branch.promiseUpdate();

        gates[0].release();
        await busyFlight2;

        await gates[1].entered;
        expect(beforeCalls).toEqual([root.id, branch.id]);

        branch.destroy(true, true);
        await expect(branchFlight2).rejects.toBe(Neo.isDestroyed);

        gates[1].release();
        await rootFlight2;

        expect(afterCalls).toEqual([root.id])
    })
});
