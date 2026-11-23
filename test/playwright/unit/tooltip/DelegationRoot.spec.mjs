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
import DomEvent       from '../../../../src/manager/DomEvent.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

/**
 * @summary Where a tooltip listens, and which shared tooltip serves a window: each component instance once, a target's
 * root at the top of its `parentId` chain, one shared tooltip per browser window that anchors each app's main view
 * there, a root that answers only to the tooltip of its current window, listeners that leave with either side, and a
 * shared tooltip that leaves with its window and its pending delays. The browser behavior is pinned by
 * `test/playwright/component/tooltip/FloatingRoot.spec.mjs`.
 */
const listenersOf = component => (component.domListeners || []).filter(listener => listener.mouseenter);

/**
 * The mouseenter and mouseleave listeners `Neo.manager.DomEvent` dispatches to a tooltip from a component
 * @param {Neo.component.Base} component
 * @param {Neo.tooltip.Base} tooltip
 * @returns {Number[]}
 */
const dispatchedTo = (component, tooltip) => ['mouseenter', 'mouseleave'].map(
    eventName => (DomEvent.items[component.id]?.[eventName] || []).filter(listener => listener.scope === tooltip).length
);

/**
 * Records the worker's `disconnect` subscriptions, and fires them for a departing window with the ports still open
 * @returns {{disconnect: Function, listeners: Function, restore: Function}}
 */
const stubWorker = () => {
    let worker    = Neo.currentWorker,
        {on, un}  = worker,
        listeners = [];

    worker.on = (name, fn, scope) => listeners.push({fn, name, scope});
    worker.un = (name, fn, scope) => {listeners = listeners.filter(item => item.fn !== fn || item.scope !== scope)};

    return {
        disconnect(windowId, ports) {
            worker.ports = ports;
            listeners.forEach(({fn, name, scope}) => name === 'disconnect' && fn.call(scope, {windowId}))
        },
        listeners: () => listeners,
        restore() {
            Object.assign(worker, {on, un});
            delete worker.ports
        }
    }
};

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
        let worker = stubWorker(),
            mainA  = create({module: Component, appName, id: 'delegation-main-a', windowId: 11}),
            mainB  = create({module: Component, appName, id: 'delegation-main-b', windowId: 11}),
            appA   = {mainView: mainA, name: appName},
            appB   = {mainView: mainB, name: 'TooltipDelegationRootTestB'};

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
            worker.disconnect(11, [{windowId: 11}]);
            expect(first.isDestroyed).toBeFalsy();

            worker.disconnect(11, []);
            expect(first.isDestroyed).toBe(true);
            expect(other.isDestroyed, 'another window keeps its tooltip').toBeFalsy();
            expect(worker.listeners().filter(({scope}) => scope === first), 'the departed tooltip stops listening').toHaveLength(0);

            let next = Tooltip.createSingleton(appA);

            created.push(next);
            expect(next).not.toBe(first)
        } finally {
            worker.restore()
        }
    });

    test('a root that moves to another window answers only to the tooltip of that window', () => {
        let worker = stubWorker(),
            app    = {mainView: null, name: appName},
            root   = create({module: Component, appName, id: 'delegation-moving-root', windowId: 21});

        try {
            let left    = Tooltip.createSingleton(app, 21),
                reached = Tooltip.createSingleton(app, 22);

            created.push(left, reached);

            left.addDelegationRoot(root);
            expect(dispatchedTo(root, left)).toEqual([1, 1]);

            root.windowId = 22;
            reached.addDelegationRoot(root);

            expect(dispatchedTo(root, left), 'the window it left').toEqual([0, 0]);
            expect(dispatchedTo(root, reached), 'the window it reached').toEqual([1, 1])
        } finally {
            worker.restore()
        }
    });

    test('a root destroyed first leaves no listener of the tooltip behind', () => {
        let tooltip = create({module: Tooltip, appName}),
            root    = create({module: Component, appName, id: 'delegation-doomed-root'});

        tooltip.addDelegationRoot(root);
        expect(dispatchedTo(root, tooltip)).toEqual([1, 1]);

        root.destroy();
        expect(dispatchedTo(root, tooltip)).toEqual([0, 0])
    });

    test('a tooltip destroyed first leaves no listener behind on the root it kept', () => {
        let tooltip = create({module: Tooltip, appName}),
            root    = create({module: Component, appName, id: 'delegation-kept-root'});

        tooltip.addDelegationRoot(root);
        expect(dispatchedTo(root, tooltip)).toEqual([1, 1]);

        tooltip.destroy();
        expect(dispatchedTo(root, tooltip)).toEqual([0, 0]);
        expect(root.domListeners.filter(listener => listener.scope === tooltip)).toHaveLength(0)
    });

    test('a tooltip that leaves with its window runs no pending show, while another window\'s tooltip still shows', async () => {
        let worker = stubWorker(),
            app    = {mainView: null, name: appName},
            shown  = [];

        try {
            let departing = Tooltip.createSingleton(app, 31),
                staying   = Tooltip.createSingleton(app, 32);

            created.push(departing, staying);

            [departing, staying].forEach(tooltip => {
                tooltip.showDelay = 20;
                tooltip.show      = () => shown.push(tooltip.windowId);
                tooltip.showDelayed({})
            });

            worker.disconnect(31, [{windowId: 32}]);
            expect(departing.isDestroyed).toBe(true);

            await new Promise(resolve => setTimeout(resolve, 60));

            expect(shown).toEqual([32])
        } finally {
            worker.restore()
        }
    })
});
