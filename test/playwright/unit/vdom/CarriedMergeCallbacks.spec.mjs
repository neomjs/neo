import {setup} from '../../setup.mjs';

const appName = 'CarriedMergeCallbacksTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';

/**
 * @summary Mounts `root -> [intermediate -> [host], sibling]` under a single window and returns all four instances.
 * @param {String} prefix Unique id prefix
 * @param {Number} [windowId=1] Owning window id
 * @returns {Promise<{host: Neo.component.Base, intermediate: Neo.container.Base, root: Neo.container.Base, sibling: Neo.component.Base}>}
 */
async function mountTree(prefix, windowId=1) {
    const root = Neo.create(Container, {
        appName,
        id   : `${prefix}-root`,
        windowId,
        items: [{
            module: Container,
            id    : `${prefix}-intermediate`,
            items : [{
                module: Component,
                id    : `${prefix}-host`,
                text  : 'before'
            }]
        }, {
            module: Component,
            id    : `${prefix}-sibling`,
            text  : 'sibling-before'
        }]
    });

    await root.initVnode(true);
    root.mounted = true;
    await root.promiseUpdate();

    const [intermediate, sibling] = root.items,
          [host]                  = intermediate.items;

    return {host, intermediate, root, sibling}
}

/**
 * @summary Stages `intermediate` via public `setSilent` and merges `host.promiseUpdate()` into it.
 * @param {{host: Neo.component.Base, intermediate: Neo.container.Base}} tree
 * @returns {{isSettled: Function, ticket: Promise<any>}}
 */
function stageMergedHost({host, intermediate}) {
    let settled = false;

    intermediate.setSilent({cls: ['staged-owner']});
    intermediate.updateDepth = -1;

    host.text        = 'after';
    host.updateDepth = 1;

    const ticket = host.promiseUpdate().then(() => {
        settled = true
    });

    expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);

    return {isSettled: () => settled, ticket}
}

test.describe('Carried merge owners and sparse descendant flags (#21974)', () => {
    test('a full-depth root flight collects and settles a host callback merged into a staged intermediate', async () => {
        const tree                       = await mountTree('deep-carried'),
              {host, intermediate, root} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            root.updateDepth = -1;
            await root.promiseUpdate();
            await ticket;

            expect(isSettled()).toBe(true);
            expect(intermediate.needsVdomUpdate).toBe(false);
            expect(host.needsVdomUpdate).toBe(false);
            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)).toBeNull();
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            root.destroy()
        }
    });

    test('a dense depth-3 root flight collects a staged intermediate at distance 1 and settles its merged child', async () => {
        const tree                       = await mountTree('dense-depth'),
              {host, intermediate, root} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            root.denseUpdate = true;
            root.updateDepth = 3;
            await root.promiseUpdate();
            await ticket;

            expect(isSettled()).toBe(true);
            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)).toBeNull();
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            root.destroy()
        }
    });

    test('a sparse depth-2 root flight preserves the needsVdomUpdate flag of a pruned staged intermediate', async () => {
        const tree                                = await mountTree('sparse-pruned'),
              {host, intermediate, root, sibling} = tree;

        try {
            const {isSettled, ticket} = stageMergedHost(tree);

            root.setSilent({cls: ['sparse-root']});
            root.updateDepth = 2;
            sibling.text     = 'sibling-after';
            expect(VDomUpdate.mergedCallbackMap.get(root.id)?.children.has(sibling.id)).toBe(true);

            await root.promiseUpdate();

            expect(intermediate.needsVdomUpdate, 'pruned intermediate keeps its owed update flag').toBe(true);
            expect(host.needsVdomUpdate, 'merged host keeps its owed update flag').toBe(true);
            expect(VDomUpdate.mergedCallbackMap.get(intermediate.id)?.children.has(host.id)).toBe(true);
            expect(isSettled()).toBe(false);

            intermediate.update();
            await ticket;

            expect(isSettled()).toBe(true);
            expect(intermediate.needsVdomUpdate).toBe(false);
            expect(host.needsVdomUpdate).toBe(false);
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            root.destroy()
        }
    });

    test('a newly constructed vnode-less container added to a mounted root settles and cleans up its merged child entry', async () => {
        const {root} = await mountTree('detached-mount');

        try {
            const detached = Neo.create(Container, {
                appName,
                id      : 'detached-owner',
                windowId: root.windowId,
                items   : [{
                    module: Container,
                    id    : 'detached-host',
                    items : []
                }]
            });
            const [detachedHost] = detached.items;

            // Adding detached triggers root's flight (depth -1); before collection, detachedHost merges into detached.
            root.add(detached);
            detachedHost.add({module: Component, id: 'detached-leaf', text: 'mounted-leaf'});
            detachedHost.updateDepth = -1;

            let   settled = false;
            const ticket  = detachedHost.promiseUpdate().then(() => {
                settled = true
            });

            expect(VDomUpdate.mergedCallbackMap.get(detached.id)?.children.has(detachedHost.id)).toBe(true);

            await root.promiseUpdate();
            await ticket;

            expect(settled).toBe(true);
            expect(VDomUpdate.mergedCallbackMap.get(detached.id)).toBeNull();
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            root.destroy()
        }
    });

    test('does not collect a parked merge owner that shares parentId without belonging to the ancestor items tree or window', async () => {
        const {root}      = await mountTree('isolation-w1', 1),
              foreignTree = await mountTree('isolation-w2', 2);

        let logicalOwner;

        try {
            logicalOwner = Neo.create(Container, {
                appName,
                id      : 'logical-only-owner',
                windowId: 1,
                items   : [{module: Component, id: 'logical-only-host', text: 'before'}]
            });
            await logicalOwner.initVnode(true);
            logicalOwner.mounted  = true;
            logicalOwner.parentId = root.id;
            await logicalOwner.promiseUpdate();

            const [logicalHost] = logicalOwner.items,
                  logicalStage  = stageMergedHost({host: logicalHost, intermediate: logicalOwner}),
                  foreignStage  = stageMergedHost(foreignTree);

            root.updateDepth = -1;
            await root.promiseUpdate();

            expect(logicalStage.isSettled(), 'non-rendered logical child stays parked on its own owner').toBe(false);
            expect(foreignStage.isSettled(), 'foreign-window merge owner stays parked on its own window').toBe(false);

            logicalOwner.update();
            foreignTree.root.updateDepth = -1;
            await Promise.all([
                logicalStage.ticket,
                foreignTree.root.promiseUpdate(),
                foreignStage.ticket
            ]);

            expect(logicalStage.isSettled()).toBe(true);
            expect(foreignStage.isSettled()).toBe(true);
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            logicalOwner?.destroy();
            foreignTree.root.destroy();
            root.destroy()
        }
    });

    test('descendantMergedOwnerMap performs O(1) root lookup with zero global owner scans across unrelated trees', async () => {
        const {root}        = await mountTree('perf-target', 1),
              unrelatedRoot = Neo.create(Container, {
                  appName,
                  id      : 'perf-unrelated-root',
                  windowId: 1,
                  items   : Array.from({length: 50}, (_, index) => ({
                      module: Container,
                      id    : `perf-owner-${index}`,
                      items : [{module: Component, id: `perf-leaf-${index}`, text: 'v0'}]
                  }))
              });

        try {
            await unrelatedRoot.initVnode(true);
            unrelatedRoot.mounted = true;
            await unrelatedRoot.promiseUpdate();

            const tickets = unrelatedRoot.items.map(owner => {
                const [leaf] = owner.items;
                owner.setSilent({cls: ['staged']});
                owner.updateDepth = -1;
                leaf.text         = 'v1';
                return leaf.promiseUpdate()
            });

            expect(VDomUpdate.mergedCallbackMap.count).toBe(50);
            expect(VDomUpdate.getParkedOwnersUnder(root.id)).toBeUndefined();

            let   mapGetCount = 0;
            const originalGet = VDomUpdate.mergedCallbackMap.get.bind(VDomUpdate.mergedCallbackMap);
            VDomUpdate.mergedCallbackMap.get = key => {
                mapGetCount++;
                return originalGet(key)
            };

            try {
                root.updateDepth = -1;
                await root.promiseUpdate()
            } finally {
                VDomUpdate.mergedCallbackMap.get = originalGet
            }

            // Only `root.id` itself (collection + executeCallbacks) is queried on `mergedCallbackMap`;
            // none of the 50 unrelated parked owners is scanned.
            expect(mapGetCount).toBeLessThanOrEqual(4);

            unrelatedRoot.updateDepth = -1;
            await unrelatedRoot.promiseUpdate();
            await Promise.all(tickets);
            expect(VDomUpdate.descendantMergedOwnerMap.size).toBe(0)
        } finally {
            unrelatedRoot.destroy();
            root.destroy()
        }
    })
});
