import {setup} from '../../setup.mjs';

const appName = 'ReparentedMergedChildTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * @summary A child merges into an ancestor's pending update, then moves to another parent before that update's flight
 * collects its payloads — as a grid Row re-parents the cell editor it embeds. The owner's bridge to the child must not
 * follow the child out of the owner's subtree.
 *
 * Tree: `root` > `owner` > `mid` > `child`, and `root` > `other`, the child's new parent.
 */
test.describe('A merged child re-parented before its flight is collected', () => {
    let child, mid, other, owner, root, testRun = 0;

    // Ids of its own: a worker runs other spec files in the same component registry
    const id = name => `reparented-merged-${name}-${testRun}`;

    test.beforeEach(async () => {
        testRun++;

        root = Neo.create(Container, {
            appName,
            id   : id('root'),
            items: [{
                module: Container,
                id    : id('owner'),
                items : [{
                    module: Container,
                    id    : id('mid'),
                    items : [{module: Component, id: id('child')}]
                }]
            }, {
                module: Container,
                id    : id('other')
            }]
        });

        await root.initVnode();
        root.mounted = true;

        [child, mid, other, owner] = ['child', 'mid', 'other', 'owner'].map(name => Neo.getComponent(id(name)))
    });

    test.afterEach(() => {
        root.destroy()
    });

    /**
     * Queues an owner update deep enough to merge the grandchild, and merges it: the first update takes the flight,
     * so the second waits as `needsVdomUpdate`, which is what a merge joins.
     */
    const mergeChildIntoPendingOwnerUpdate = () => {
        owner.updateDepth = -1;
        owner.update();
        owner.update();
        child.update();

        expect(VDomUpdate.getMergedChildIds(owner.id), 'the child merged at distance 2, bridged by mid').toEqual(new Set([child.id, mid.id]))
    };

    test('the bridge stops at the owner, so it holds none of the new parent\'s ancestors', () => {
        mergeChildIntoPendingOwnerUpdate();

        child.parentId = other.id;

        expect(VDomUpdate.getMergedChildIds(owner.id)).toEqual(new Set([child.id]))
    });

    test('the owner\'s next flight settles, even when an ancestor of the new parent covers the owner', async () => {
        mergeChildIntoPendingOwnerUpdate();

        root.updateDepth = -1;
        child.parentId   = other.id;

        const settled = await Promise.race([
            owner.promiseUpdate().then(() => true),
            // out-waits: executeVdomUpdate()'s 1 ms yield before collecting, by far. A wedged flight never settles
            new Promise(resolve => setTimeout(() => resolve(false), 1000))
        ]);

        expect(settled, 'the owner\'s flight resolved it').toBe(true);
        expect(owner.isVdomUpdating).toBe(false)
    })
});
