import {setup} from '../../setup.mjs';

const appName = 'TooltipDelegationRootTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

/**
 * @summary Where a tooltip listens, and which shared tooltip serves a window: each component instance once, a target's
 * root at the top of its `parentId` chain, one shared tooltip per browser window that anchors each app's main view
 * there, and a shared tooltip that leaves with its window. The browser behavior is pinned by
 * `test/playwright/component/tooltip/FloatingRoot.spec.mjs`.
 */
const listenersOf = component => (component.domListeners || []).filter(listener => listener.mouseenter);

test.describe('Neo.tooltip.Base delegation roots', () => {
    let created = [];

    const create = config => {
        let instance = Neo.create(config);
        created.push(instance);
        return instance
    };

    test.afterEach(() => {
        created.reverse().forEach(instance => instance.isDestroyed || instance.destroy());
        created = []
    });

    test('addDelegationRoot() listens on a component instance once, and again on a new instance of its id', () => {
        let tooltip = create({module: Tooltip, appName}),
            root    = create({module: Component, appName, id: 'delegation-root'});

        tooltip.addDelegationRoot(root);
        tooltip.addDelegationRoot(root);

        expect(listenersOf(root)).toHaveLength(1);
        expect(listenersOf(root)[0]).toMatchObject({delegate: tooltip.delegate, scope: tooltip});

        root.destroy();

        let successor = create({module: Component, appName, id: 'delegation-root'});

        tooltip.addDelegationRoot(successor);

        expect(listenersOf(successor)).toHaveLength(1)
    });

    test('delegateFromRootOf() hands the top of the target\'s parentId chain to the shared tooltip of its window', () => {
        let original = Tooltip.createSingleton,
            calls    = [],
            dialog   = create({module: Component, appName, id: 'delegation-dialog', parentId: 'document.body', windowId: 1}),
            inner    = create({module: Component, appName, id: 'delegation-inner',  parentId: dialog.id,       windowId: 1}),
            target   = create({module: Component, appName, id: 'delegation-target', parentId: inner.id,        windowId: 1}),
            other    = create({module: Component, appName, id: 'delegation-other',  parentId: 'document.body', windowId: 2});

        Tooltip.createSingleton = (app, windowId) => ({addDelegationRoot: root => calls.push({root: root.id, windowId})});

        try {
            Tooltip.delegateFromRootOf(target);
            Tooltip.delegateFromRootOf(other)
        } finally {
            Tooltip.createSingleton = original
        }

        expect(calls).toEqual([{root: dialog.id, windowId: 1}, {root: other.id, windowId: 2}])
    });

    test('createSingleton() keeps one tooltip per window, anchors each app\'s main view in its own window, and lets the tooltip leave with its window', () => {
        let worker    = Neo.currentWorker,
            {on, un}  = worker,
            listeners = [],
            mainA     = create({module: Component, appName, id: 'delegation-main-a', windowId: 11}),
            mainB     = create({module: Component, appName, id: 'delegation-main-b', windowId: 11}),
            appA      = {mainView: mainA, name: appName},
            appB      = {mainView: mainB, name: 'TooltipDelegationRootTestB'};

        worker.on = (name, fn, scope) => listeners.push({fn, name, scope});
        worker.un = (name, fn, scope) => {listeners = listeners.filter(item => item.fn !== fn || item.scope !== scope)};

        try {
            let first  = Tooltip.createSingleton(appA),
                second = Tooltip.createSingleton(appB),
                other  = Tooltip.createSingleton(appA, 12);

            created.push(first, other);

            expect(second, 'two apps in one window share its tooltip').toBe(first);
            expect(other, 'another window has its own').not.toBe(first);
            expect(other.windowId).toBe(12);
            expect(listenersOf(mainA)).toHaveLength(1);
            expect(listenersOf(mainB), 'each app anchors its main view').toHaveLength(1);

            // A window with a live port keeps its tooltip; the last port gone, the tooltip leaves
            worker.ports = [{windowId: 11}];
            listeners.forEach(({fn, name, scope}) => name === 'disconnect' && fn.call(scope, {windowId: 11}));
            expect(first.isDestroyed).toBeFalsy();

            worker.ports = [];
            listeners.forEach(({fn, name, scope}) => name === 'disconnect' && fn.call(scope, {windowId: 11}));
            expect(first.isDestroyed).toBe(true);
            expect(other.isDestroyed, 'another window keeps its tooltip').toBeFalsy();
            expect(listeners.filter(({scope}) => scope === first), 'the departed tooltip stops listening').toHaveLength(0);

            let next = Tooltip.createSingleton(appA);

            created.push(next);
            expect(next).not.toBe(first)
        } finally {
            Object.assign(worker, {on, un});
            delete worker.ports
        }
    })
});
