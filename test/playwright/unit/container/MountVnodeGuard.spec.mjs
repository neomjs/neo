import {setup} from '../../setup.mjs';

const appName = 'ContainerMountVnodeGuardTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const realApplyDeltas = Neo.applyDeltas;

class ProbeComponent extends Component {
    static config = {
        className: 'Test.Unit.Container.MountVnodeGuard.ProbeComponent',
        ntype    : 'test-unit-container-mount-vnode-probe-component'
    }

    mountSnapshots = []

    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined && value) {
            this.mountSnapshots.push({
                hasVnode        : Boolean(this.vnode),
                vnodeInitialized: this.vnodeInitialized
            })
        }

        super.afterSetMounted(value, oldValue)
    }
}
ProbeComponent = Neo.setupClass(ProbeComponent);

class ProbeContainer extends Container {
    static config = {
        className: 'Test.Unit.Container.MountVnodeGuard.ProbeContainer',
        ntype    : 'test-unit-container-mount-vnode-probe-container'
    }

    mountSnapshots = []

    afterSetMounted(value, oldValue) {
        if (oldValue !== undefined && value) {
            this.mountSnapshots.push({
                hasVnode        : Boolean(this.vnode),
                vnodeInitialized: this.vnodeInitialized
            })
        }

        super.afterSetMounted(value, oldValue)
    }
}
ProbeContainer = Neo.setupClass(ProbeContainer);

/**
 * @summary Verifies that `Container#afterSetMounted` never sets `mounted: true` on child items ahead of their `vnode`.
 */
test.describe('Neo.container.Base#afterSetMounted vnode guard', () => {
    let root, run = 0;

    test.afterEach(() => {
        Neo.applyDeltas = realApplyDeltas;
        Neo.config.allowVdomUpdatesInTests = true;
        root?.isDestroyed || root?.destroy();
        root = null
    });

    test('holds mounted: false on items added while initVnode(true) is in flight until their insertNode lands', async () => {
        const prefix = `mount-guard-inflight-${++run}`,
              gates  = [];

        Neo.applyDeltas = async (windowId, deltas) => {
            const gate = {};
            gate.held = new Promise(resolve => gate.release = resolve);
            gates.push({deltas, release: gate.release});
            await gate.held;
            return {}
        };

        root = Neo.create(ProbeContainer, {
            appName,
            id: `${prefix}-viewport`
        });

        const initPromise = root.initVnode(true);

        await expect.poll(() => gates.length).toBe(1);

        const workspace = root.add({
                  module: ProbeContainer,
                  id    : `${prefix}-workspace`,
                  items : [{
                      module: ProbeContainer,
                      id    : `${prefix}-host`
                  }]
              }),
              host            = workspace.items[0],
              hostAwaitState  = {settled: false},
              hostAwaitMount  = host.promiseUpdate().then(() => { hostAwaitState.settled = true });

        gates[0].release();
        await initPromise;

        expect(root.mounted).toBe(true);
        expect(root.vnode).not.toBeNull();
        expect(workspace.mounted).toBe(false);
        expect(workspace.vnode).toBeNull();
        expect(host.mounted).toBe(false);
        expect(host.vnode).toBeNull();
        expect(hostAwaitState.settled).toBe(false);

        await expect.poll(() => gates.length).toBe(2);
        gates[1].release();

        await hostAwaitMount;

        expect(workspace.mounted).toBe(true);
        expect(workspace.vnode).not.toBeNull();
        expect(host.mounted).toBe(true);
        expect(host.vnode).not.toBeNull();
        expect(workspace.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}]);
        expect(host.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}]);

        const shellPromise = (host.add({
            module: ProbeComponent,
            id    : `${prefix}-feed`,
            text  : 'Feed'
        }), host.promiseUpdate());

        await expect.poll(() => gates.length).toBe(3);
        gates[2].release();
        await shellPromise;

        expect(VDomUpdate.promiseCallbackMap.has(host.id)).toBe(false);
        expect(host.items[0].mounted).toBe(true);
        expect(host.items[0].vnode).not.toBeNull()
    });

    test('mounts nested containers only after syncVnodeTree assigns each child vnode', async () => {
        const prefix = `mount-guard-nested-${++run}`;

        Neo.applyDeltas = async () => ({});

        root = Neo.create(ProbeContainer, {
            appName,
            id: `${prefix}-viewport`
        });

        await root.initVnode(true);

        const workspace = root.add({
                  module: ProbeContainer,
                  id    : `${prefix}-workspace`,
                  items : [{
                      module: ProbeComponent,
                      id    : `${prefix}-host`,
                      text  : 'Dock host'
                  }]
              }),
              host = workspace.items[0];

        await root.promiseUpdate();

        expect(workspace.mounted).toBe(true);
        expect(host.mounted).toBe(true);
        expect(workspace.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}]);
        expect(host.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}])
    });

    test('remounts existing and newly inserted children only once their vnodes are restored', async () => {
        const prefix = `mount-guard-remount-${++run}`;

        Neo.applyDeltas = async () => ({});

        root = Neo.create(ProbeContainer, {
            appName,
            id   : `${prefix}-outer`,
            items: [{
                module: ProbeContainer,
                id    : `${prefix}-parent`,
                items : [{
                    module: ProbeComponent,
                    id    : `${prefix}-existing`,
                    text  : 'Existing'
                }]
            }]
        });

        const parent        = root.items[0],
              existingChild = parent.items[0];

        await root.initVnode(true);

        expect(existingChild.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}]);

        parent.vdom.removeDom = true;
        root.updateDepth = -1;
        await root.promiseUpdate();

        expect(parent.mounted).toBe(false);
        expect(existingChild.mounted).toBe(false);
        expect(existingChild.vnode).toBeNull();
        expect(existingChild.vnodeInitialized).toBe(true);

        const silentChild = parent.insert(1, {
                  module: ProbeComponent,
                  id    : `${prefix}-silent`,
                  text  : 'Silent'
              }, true),
              liveChild = parent.add({
                  module: ProbeComponent,
                  id    : `${prefix}-live`,
                  text  : 'Live'
              });

        delete parent.vdom.removeDom;
        parent.updateDepth = -1;
        root.updateDepth   = -1;
        await root.promiseUpdate();

        expect(parent.mounted).toBe(true);
        expect(existingChild.mounted).toBe(true);
        expect(silentChild.mounted).toBe(true);
        expect(liveChild.mounted).toBe(true);
        expect(existingChild.mountSnapshots).toEqual([
            {hasVnode: true, vnodeInitialized: true},
            {hasVnode: true, vnodeInitialized: true}
        ]);
        expect(silentChild.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}]);
        expect(liveChild.mountSnapshots).toEqual([{hasVnode: true, vnodeInitialized: true}])
    });

    test('preserves manual mounted cascade when unitTestMode runs without allowVdomUpdatesInTests', () => {
        const prefix = `mount-guard-manual-${++run}`;

        Neo.config.allowVdomUpdatesInTests = false;

        root = Neo.create(ProbeContainer, {
            appName,
            id   : `${prefix}-container`,
            items: [{
                module: ProbeComponent,
                id    : `${prefix}-visible`
            }, {
                module: ProbeComponent,
                id    : `${prefix}-removed`,
                vdom  : {tag: 'div', removeDom: true}
            }]
        });

        const [visibleChild, removedChild] = root.items;

        expect(visibleChild.vnode).toBeNull();
        root.mounted = true;

        expect(visibleChild.mounted).toBe(true);
        expect(removedChild.mounted).toBe(false);

        root.mounted = false;
        expect(visibleChild.mounted).toBe(false)
    });
});
