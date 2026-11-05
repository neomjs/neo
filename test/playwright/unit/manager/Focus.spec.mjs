import {setup} from '../../setup.mjs';

const appName  = 'ManagerFocusTest',
      windowId = 'focus-main';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Component        from '../../../../src/component/Base.mjs';
import ComponentManager from '../../../../src/manager/Component.mjs';
import DomEvent         from '../../../../src/manager/DomEvent.mjs';
import FocusManager     from '../../../../src/manager/Focus.mjs';
import MenuList         from '../../../../src/menu/List.mjs';

test.describe('Neo.manager.Focus', () => {
    let components;

    test.afterEach(() => {
        components?.forEach(component => component.destroy());
        components = null;

        FocusManager.history         = {};
        FocusManager.pendingFocusOut = {};
    });

    function createFocusComponent(id, parentId, log) {
        const component = Neo.create(Component, {
            appName,
            id,
            parentId
        });

        component.onFocusEnter = data => log.push(['enter', id, data.component.id]);
        component.onFocusLeave = data => log.push(['leave', id, data.component.id]);
        component.onFocusMove  = data => log.push(['move',  id, data.component.id, data.oldPath, data.path]);

        return component
    }

    test('fires focusMove only on the closest common component', () => {
        const log = [];

        components = [
            createFocusComponent('focus-root',       'document.body', log),
            createFocusComponent('focus-parent',     'focus-root',    log),
            createFocusComponent('focus-old-child',  'focus-parent',  log),
            createFocusComponent('focus-new-child',  'focus-parent',  log)
        ];

        const [root, parent, oldChild, newChild] = components;

        root.containsFocus = true;
        parent.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history[windowId] = [{
            componentPath: ['focus-old-child', 'focus-parent', 'focus-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            windowId,
            componentPath: ['focus-new-child', 'focus-parent', 'focus-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['enter', 'focus-new-child', 'focus-new-child'],
            ['move',  'focus-parent',    'focus-parent', ['old-dom-node'], ['new-dom-node']]
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(parent.containsFocus).toBe(true);
        expect(root.containsFocus).toBe(true);
        expect(FocusManager.history[windowId][0].componentPath).toEqual(['focus-new-child', 'focus-parent', 'focus-root']);
    });

    test('walks a floating menu through its configured logical owner', () => {
        const log = [];

        components = [
            createFocusComponent('focus-menu-root',  'document.body',   log),
            createFocusComponent('focus-menu-owner', 'focus-menu-root', log)
        ];

        const menu = Neo.create(MenuList, {
            appName,
            id             : 'focus-floating-menu',
            parentComponent: components[1],
            parentId       : 'document.body'
        });

        components.push(menu);

        expect(menu.parentComponent).toBe(components[1]);
        expect(ComponentManager.getParentPath([menu.id])).toEqual([
            'focus-floating-menu',
            'focus-menu-owner',
            'focus-menu-root'
        ])
    });

    test('handles disjoint component paths without firing focusMove', () => {
        const log = [];

        components = [
            createFocusComponent('focus-old-root',  'document.body',  log),
            createFocusComponent('focus-old-child', 'focus-old-root', log),
            createFocusComponent('focus-new-root',  'document.body',  log),
            createFocusComponent('focus-new-child', 'focus-new-root', log)
        ];

        const [oldRoot, oldChild, newRoot, newChild] = components;

        oldRoot.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history[windowId] = [{
            componentPath: ['focus-old-child', 'focus-old-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            windowId,
            componentPath: ['focus-new-child', 'focus-new-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['leave', 'focus-old-root',  'focus-old-root'],
            ['enter', 'focus-new-child', 'focus-new-child'],
            ['enter', 'focus-new-root',  'focus-new-root']
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(oldRoot.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(newRoot.containsFocus).toBe(true);
        expect(FocusManager.history[windowId][0].componentPath).toEqual(['focus-new-child', 'focus-new-root']);
    });

    test('records history when the closest common component no longer exists', () => {
        const log = [];

        components = [
            createFocusComponent('focus-old-child', 'document.body', log),
            createFocusComponent('focus-new-child', 'document.body', log)
        ];

        const [oldChild, newChild] = components;

        oldChild.containsFocus = true;

        FocusManager.history[windowId] = [{
            componentPath: ['focus-old-child', 'focus-missing-common', 'focus-root'],
            data         : {path: ['old-dom-node']}
        }];

        FocusManager.focusMove({
            windowId,
            componentPath: ['focus-new-child', 'focus-missing-common', 'focus-root'],
            data         : {
                path         : ['new-dom-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave', 'focus-old-child', 'focus-old-child'],
            ['enter', 'focus-new-child', 'focus-new-child']
        ]);

        expect(oldChild.containsFocus).toBe(false);
        expect(newChild.containsFocus).toBe(true);
        expect(FocusManager.history[windowId][0].componentPath).toEqual(['focus-new-child', 'focus-missing-common', 'focus-root']);
        expect(FocusManager.history[windowId][0].data.path).toEqual(['new-dom-node']);
    });

    test('notifies only the nearest common component for focusChange consumers', () => {
        const log = [];

        components = [
            createFocusComponent('focus-root',      'document.body', log),
            createFocusComponent('focus-parent',    'focus-root',    log),
            createFocusComponent('focus-old-child', 'focus-parent',  log),
            createFocusComponent('focus-new-child', 'focus-parent',  log)
        ];

        const [root, parent, oldChild] = components;

        root.onFocusChange   = data => log.push(['change', 'root',   data.component.id, data.oldPath, data.path]);
        parent.onFocusChange = data => log.push(['change', 'parent', data.component.id, data.oldPath, data.path]);

        root.containsFocus = true;
        parent.containsFocus = true;
        oldChild.containsFocus = true;

        FocusManager.history[windowId] = [{
            componentPath: ['focus-old-child', 'focus-parent', 'focus-root'],
            data         : {path: ['old-event-node']}
        }];

        FocusManager.focusMove({
            windowId,
            componentPath: ['focus-new-child', 'focus-parent', 'focus-root'],
            data         : {
                path         : ['new-event-node'],
                relatedTarget: null
            }
        });

        expect(log).toEqual([
            ['leave',  'focus-old-child', 'focus-old-child'],
            ['enter',  'focus-new-child', 'focus-new-child'],
            ['move',   'focus-parent',    'focus-parent', ['old-event-node'], ['new-event-node']],
            ['change', 'parent',          'focus-parent', ['old-event-node'], ['new-event-node']]
        ]);
    });

    test('records independent newest-first histories for events originating in different windows', () => {
        const log = [];

        components = [
            createFocusComponent('focus-window-a-old', 'document.body', log),
            createFocusComponent('focus-window-b',     'document.body', log),
            createFocusComponent('focus-window-a-new', 'document.body', log)
        ];

        for (const [windowId, id] of [
            ['focus-a', 'focus-window-a-old'], ['focus-b', 'focus-window-b'], ['focus-a', 'focus-window-a-new']
        ]) {
            FocusManager.onFocusin({windowId, componentPath: [id], data: {path: [{id}]}})
        }

        expect(FocusManager.history['focus-a']?.map(entry => entry.componentPath[0]))
            .toEqual(['focus-window-a-new', 'focus-window-a-old']);
        expect(FocusManager.history['focus-b']?.map(entry => entry.componentPath[0])).toEqual(['focus-window-b']);
    });

    test('the production dispatcher retains envelope origin rather than the component or event data window', () => {
        components = [createFocusComponent('focus-envelope-origin', 'document.body', [])];

        expect(components[0].windowId).not.toBe('focus-origin');

        DomEvent.fire({
            eventName: 'focusin',
            windowId : 'focus-origin',
            data     : {path: [{id: components[0].id}], windowId: 'focus-data-window'}
        });

        expect(Object.keys(FocusManager.history)).toEqual(['focus-origin']);
        expect(FocusManager.history['focus-origin'][0].componentPath).toEqual([components[0].id]);
        expect(FocusManager.history['focus-origin'][0].windowId).toBe('focus-origin')
    });

    test('bounds each history independently at maxHistoryLength', () => {
        const limit = FocusManager.maxHistoryLength;

        for (let i = 0; i <= limit; i++) {
            FocusManager.addToHistory({windowId: 'focus-a', componentPath: [String(i)], data: {}})
        }

        FocusManager.addToHistory({windowId: 'focus-b', componentPath: ['only-b'], data: {}});

        expect(FocusManager.history['focus-a']).toHaveLength(limit);
        expect(FocusManager.history['focus-a'][0].componentPath).toEqual([String(limit)]);
        expect(FocusManager.history['focus-a'].at(-1).componentPath).toEqual(['1']);
        expect(FocusManager.history['focus-b']).toHaveLength(1)
    });

    test('a first focusout with no recorded history can still be followed by a focusin', async () => {
        const log = [], originalTimeout = FocusManager.timeout, timers = [];

        components = [createFocusComponent('focus-first-entry', 'document.body', log)];
        FocusManager.timeout = () => new Promise(resolve => timers.push(resolve));

        try {
            const opts = {windowId: 'focus-a', componentPath: ['focus-first-entry'], data: {path: []}};

            FocusManager.onFocusout(opts);
            FocusManager.onFocusin(opts);
            timers.forEach(resolve => resolve());
            await Promise.resolve();

            expect(components[0].containsFocus).toBe(true);
            expect(FocusManager.history['focus-a']).toHaveLength(1);
            expect(log.map(entry => entry[0])).toEqual(['enter'])
        } finally {
            FocusManager.timeout = originalTimeout
        }
    });

    test('a sibling focusin cannot consume a window\'s pending focusout', async () => {
        const log             = [],
              originalTimeout = FocusManager.timeout,
              timers          = [];

        components = [
            createFocusComponent('focus-pending-a', 'document.body', log),
            createFocusComponent('focus-pending-b', 'document.body', log)
        ];

        FocusManager.timeout = () => new Promise(resolve => timers.push(resolve));

        try {
            FocusManager.onFocusin({windowId: 'focus-a', componentPath: ['focus-pending-a'], data: {path: []}});
            FocusManager.onFocusout({windowId: 'focus-a', componentPath: ['focus-pending-a'], data: {path: []}});
            FocusManager.onFocusin({windowId: 'focus-b', componentPath: ['focus-pending-b'], data: {path: []}});

            expect(components[0].containsFocus, 'the first window keeps its pending leave until its own timer').toBe(true);
            expect(components[1].containsFocus).toBe(true);

            timers.forEach(resolve => resolve());
            await Promise.resolve();

            expect(components[0].containsFocus).toBe(false);
            expect(components[1].containsFocus).toBe(true);
            expect(log.filter(entry => entry[0] === 'leave').map(entry => entry[1])).toEqual(['focus-pending-a'])
        } finally {
            FocusManager.timeout = originalTimeout
        }
    });

    test('both windows settle their pending leaves independently', async () => {
        const log             = [],
              originalTimeout = FocusManager.timeout,
              timers          = [];

        components = [
            createFocusComponent('focus-leave-a', 'document.body', log),
            createFocusComponent('focus-leave-b', 'document.body', log)
        ];

        FocusManager.timeout = () => new Promise(resolve => timers.push(resolve));

        try {
            for (const [windowId, id] of [['focus-a', 'focus-leave-a'], ['focus-b', 'focus-leave-b']]) {
                FocusManager.onFocusin({windowId, componentPath: [id], data: {path: []}});
                FocusManager.onFocusout({windowId, componentPath: [id], data: {path: []}})
            }

            expect(components.map(component => component.containsFocus)).toEqual([true, true]);

            timers.forEach(resolve => resolve());
            await Promise.resolve();

            expect(components.map(component => component.containsFocus)).toEqual([false, false]);
            expect(log.filter(entry => entry[0] === 'leave').map(entry => entry[1])).toEqual(['focus-leave-a', 'focus-leave-b'])
        } finally {
            FocusManager.timeout = originalTimeout
        }
    });

    test('a focusin the App Worker handles after the gap still makes a move with the focusout waiting for it', async () => {
        const log = [];

        components = [
            createFocusComponent('focus-busy-old', 'document.body', log),
            createFocusComponent('focus-busy-new', 'document.body', log)
        ];

        const [oldComponent, newComponent] = components,
              {maxFocusInOutGap}           = FocusManager;

        FocusManager.onFocusin({windowId, componentPath: ['focus-busy-old'], data: {path: ['old-node'], relatedTarget: null}});

        // The browser raises both halves of the move in one task. The worker handles the focusout, then work
        // longer than the gap, then the focusin — before the focusout's timer gets to run.
        FocusManager.onFocusout({windowId, componentPath: ['focus-busy-old'], data: {path: ['old-node'], relatedTarget: null}});

        const busyUntil = Date.now() + maxFocusInOutGap * 2;
        while (Date.now() < busyUntil) {}

        FocusManager.onFocusin({windowId, componentPath: ['focus-busy-new'], data: {path: ['new-node'], relatedTarget: null}});

        await FocusManager.timeout(maxFocusInOutGap * 2);

        expect(oldComponent.containsFocus, 'the old path lost focus').toBe(false);
        expect(newComponent.containsFocus).toBe(true);

        expect(log).toEqual([
            ['enter', 'focus-busy-old', 'focus-busy-old'],
            ['leave', 'focus-busy-old', 'focus-busy-old'],
            ['enter', 'focus-busy-new', 'focus-busy-new']
        ])
    });

    test('a superseded focusout does not deliver its stale leave, and a later one still delivers its own', async () => {
        const log = [];

        components = [
            createFocusComponent('focus-stale-root',  'document.body',    log),
            createFocusComponent('focus-stale-child', 'focus-stale-root', log),
            createFocusComponent('focus-stale-other', 'document.body',    log)
        ];

        const [root, child] = components;

        // Derived, never hard-coded: if maxFocusInOutGap changes, these stay inside the collapse
        // window instead of silently drifting outside it and making the arm vacuous.
        const {maxFocusInOutGap} = FocusManager,
              step               = maxFocusInOutGap / 5;

        root.containsFocus  = true;
        child.containsFocus = true;

        // The dismissal. `onFocusout` defers delivery by maxFocusInOutGap, so nothing has been
        // delivered yet and this leave is still only pending.
        FocusManager.onFocusout({
            windowId,
            componentPath: ['focus-stale-child', 'focus-stale-root'],
            data         : {path: ['dismissed-node'], relatedTarget: null}
        });

        await FocusManager.timeout(step);

        // The reopen, inside the gap. The component path is unchanged because the SAME instance
        // remounts under the same id — the shape a hidden/un-hidden floating menu produces. The
        // out/in pair therefore collapses into a focusMove across identical paths, which correctly
        // delivers nothing: focus never actually left this subtree.
        FocusManager.history[windowId] = [{
            componentPath: ['focus-stale-child', 'focus-stale-root'],
            data         : {path: ['dismissed-node']}
        }];

        FocusManager.onFocusin({
            windowId,
            componentPath: ['focus-stale-child', 'focus-stale-root'],
            data         : {path: ['reopened-node'], relatedTarget: null}
        });

        await FocusManager.timeout(step);

        // An unrelated, later focusout. It carries its own opts and deserves its own leave, and it is
        // the pending one when the FIRST focusout's timer comes due: that timer must not deliver for it.
        FocusManager.onFocusout({
            windowId,
            componentPath: ['focus-stale-other'],
            data         : {path: ['other-node'], relatedTarget: null}
        });

        // Outlast both pending timers.
        await FocusManager.timeout(maxFocusInOutGap * 3);

        const leaves = log.filter(entry => entry[0] === 'leave').map(entry => entry[1]);

        // The stale leave belongs to a mount that no longer exists. Delivering it to the remounted
        // instance is what unmounts a freshly reopened floating menu.
        expect(leaves).not.toContain('focus-stale-child');

        // ...and the guard must not buy that by suppressing leaves generally: the later focusout is
        // the newest one and still delivers. Without this half the arm passes if focusLeave never
        // runs at all.
        expect(leaves).toEqual(['focus-stale-other']);
    });

    /**
     * @summary A root menu that held focus when the engine removed its DOM, still holding that menuFocus.
     * @param {String} id
     * @param {Boolean} floating
     * @returns {Neo.menu.List}
     */
    function createDismissedMenu(id, floating) {
        const menu = Neo.create(MenuList, {appName, floating, id, isRoot: true, parentId: 'document.body'});

        menu.alignTo       = Neo.emptyFn;
        menu.focus         = Neo.emptyFn;
        menu.initDomEvents = Neo.emptyFn;

        menu._mounted  = true;
        menu.menuFocus = true;
        menu._hidden   = true;

        return menu
    }

    test('the leave of a removed floating menu does not dismiss the menu once it is shown again', async () => {
        const menu = createDismissedMenu('focus-reopened-menu', true);

        components = [menu];

        FocusManager.onFocusout({
            windowId,
            componentPath: [menu.id],
            data         : {path: [{id: menu.id}], relatedTarget: null, removedNodeId: menu.id}
        });

        // The reopen lands inside the gap, before the reopened menu's own focusin
        menu._hidden = false;

        await FocusManager.timeout(FocusManager.maxFocusInOutGap * 2);

        expect(menu.menuFocus).toBe(true);
        expect(menu.mounted).toBe(true)
    });

    test('a removed menu that stays hidden, focus leaving a shown menu, and a non-floating remount all still dismiss', async () => {
        const cases = [
            {id: 'focus-hidden-menu',       floating: true,  hiddenAtDue: true,  removed: true},
            {id: 'focus-left-menu',         floating: true,  hiddenAtDue: false, removed: false},
            {id: 'focus-non-floating-menu', floating: false, hiddenAtDue: false, removed: true}
        ];

        components = [];

        // One case at a time: a newer focusout supersedes a pending one
        for (const {id, floating, hiddenAtDue, removed} of cases) {
            const menu = createDismissedMenu(id, floating);

            components.push(menu);

            FocusManager.onFocusout({
            windowId,
                componentPath: [id],
                data         : {path: [{id}], relatedTarget: null, ...removed && {removedNodeId: id}}
            });

            menu._hidden = hiddenAtDue;

            await FocusManager.timeout(FocusManager.maxFocusInOutGap * 2)
        }

        expect(components.map(menu => [menu.id, menu.menuFocus])).toEqual(cases.map(({id}) => [id, false]))
    });
});
