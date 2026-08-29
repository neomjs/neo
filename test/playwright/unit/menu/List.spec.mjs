import {setup} from '../../setup.mjs';

const
    appName  = 'MenuListDismissalTest',
    added    = [],
    removed  = [],
    mainView = {
        id          : 'menu-test-main-view',
        domListeners: [],

        addDomListeners(value) {
            const listeners = Array.isArray(value) ? value : [value];

            this.domListeners.push(...listeners);
            added.push(...listeners)
        },

        removeDomListeners(value) {
            const listeners = Array.isArray(value) ? value : [value];

            listeners.forEach(listener => {
                const index = this.domListeners.indexOf(listener);

                if (index > -1) {
                    this.domListeners.splice(index, 1)
                }

                removed.push(listener)
            })
        }
    };

setup({
    appConfig: {
        name: appName,
        mainView
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import MenuList       from '../../../../src/menu/List.mjs';

/**
 * @summary Creates a root or descendant Menu with DOM-dependent mount work neutralized.
 * @param {Object} [config]
 * @returns {Neo.menu.List}
 */
function createMenu(config={}) {
    const menu = Neo.create(MenuList, {
        appName,
        id      : Neo.getId('dismissal-menu'),
        ...config
    });

    menu.alignTo       = Neo.emptyFn;
    menu.focus         = Neo.emptyFn;
    menu.initDomEvents = Neo.emptyFn;

    return menu
}

test.describe('Neo.menu.List floating dismissal', () => {
    let menus;

    test.beforeEach(() => {
        added.length = 0;
        removed.length = 0;
        mainView.domListeners.length = 0;
        menus = []
    });

    test.afterEach(() => {
        menus.forEach(menu => {
            !menu.isDestroyed && menu.destroy()
        })
    });

    test('attaches one exact app-root listener only while a floating root is mounted', () => {
        const
            menu    = createMenu({floating: true,  isRoot: true}),
            inline  = createMenu({floating: false, isRoot: true}),
            submenu = createMenu({floating: true,  isRoot: false});

        menus.push(menu, inline, submenu);
        menu.mounted = true;
        menu.mounted = true;
        inline.mounted = true;
        submenu.mounted = true;

        expect(added).toHaveLength(1);
        expect(mainView.domListeners).toEqual(added);

        menu.mounted = false;

        expect(removed).toHaveLength(1);
        expect(removed[0]).toBe(added[0]);
        expect(mainView.domListeners).toEqual([])
    });

    test('treats the trigger and every mounted submenu level as inside, but dismisses outside', () => {
        const
            root = createMenu({
                align   : {edgeAlign: 't0-b0', target: 'menu-trigger'},
                floating: true,
                isRoot  : true
            }),
            level1 = createMenu({floating: true, isRoot: false, parentMenu: root}),
            level2 = createMenu({floating: true, isRoot: false, parentMenu: level1});

        menus.push(root, level1, level2);
        level1._mounted = level2._mounted = true;
        root.subMenuMap = {first: level1};
        level1.subMenuMap = {second: level2};

        let dismissals = 0;

        root.unmount = () => dismissals++;

        [root.id, 'menu-trigger', level1.id, level2.id].forEach(id => {
            root.onAppMouseDown({path: [{id}]})
        });

        expect(dismissals).toBe(0);

        // This models the deterministically broken case: pointer input on non-focusable app chrome,
        // with no focus event available to help dismissal.
        root.onAppMouseDown({path: [{id: 'non-focusable-workspace'}]});

        expect(dismissals).toBe(1)
    });

    test('uses structural focus partners instead of a frame-sized correctness timer', () => {
        const
            root   = createMenu({floating: true, isRoot: true}),
            level1 = createMenu({floating: true, isRoot: false, parentMenu: root}),
            level2 = createMenu({floating: true, isRoot: false, parentMenu: level1});

        menus.push(root, level1, level2);
        level1._mounted = level2._mounted = true;
        root.subMenuMap = {first: level1};
        level1.subMenuMap = {second: level2};

        let dismissals = 0;

        root.unmount = () => dismissals++;
        root.menuFocus = true;

        root.onFocusLeave({
            oldPath      : [{id: level1.id}],
            relatedTarget: {id: level1.id}
        });
        root.onFocusLeave({
            oldPath      : [{id: level2.id}],
            relatedTarget: {id: level2.id}
        });

        expect(root.menuFocus).toBe(true);
        expect(dismissals).toBe(0);
        expect(root.focusTimeoutId).toBeUndefined();

        root.onFocusLeave({
            oldPath      : [{id: 'focusable-outside'}],
            relatedTarget: {id: 'focusable-outside'}
        });

        expect(dismissals).toBe(1);
        expect(root.focusTimeoutId).toBeUndefined()
    });

    test('keeps document blur and Escape as immediate dismissal paths', () => {
        const root = createMenu({floating: true, isRoot: true});

        menus.push(root);

        let dismissals = 0;

        root.unmount = () => dismissals++;
        root.menuFocus = true;
        root.onFocusLeave({oldPath: [{id: root.id}], relatedTarget: null});
        root.menuFocus = true;
        root.onFocusLeave({
            oldPath      : [{id: root.id}],
            relatedTarget: {id: 'focusable-outside'}
        });
        root.onKeyDownEscape({});

        expect(dismissals).toBe(3)
    });

    test('a leaf click inside a submenu dismisses the whole tree, not only its own level', () => {
        const
            root   = createMenu({floating: true, isRoot: true}),
            level1 = createMenu({floating: true, isRoot: false, parentMenu: root}),
            level2 = createMenu({floating: true, isRoot: false, parentMenu: level1});

        menus.push(root, level1, level2);

        // Added after construct, not as an `items` config: resolving items during initConfig reaches
        // getController(), which needs a manager the unit harness does not stand up.
        level2.store.add({text: 'Copy name'});
        root._mounted = level1._mounted = level2._mounted = true;
        root.subMenuMap   = {first: level1};
        level1.subMenuMap = {second: level2};

        let rootDismissals = 0,
            leafDismissals = 0;

        root.unmount   = () => rootDismissals++;
        level2.unmount = () => leafDismissals++;

        // Focus reaching the deepest level primes the whole chain — afterSetMenuFocus bubbles upwards.
        level2.menuFocus = true;

        expect(root.menuFocus).toBe(true);

        level2.onKeyDownEnter(level2.getItemId(level2.store.getAt(0)));

        // Depth 2 on purpose: at depth 1 the root IS the parent, so closing only the clicked menu
        // passes by accident and the regression stays invisible.
        expect(leafDismissals).toBe(1);
        expect(rootDismissals).toBe(1)
    });

    test('removes the exact app-root listener during destroy', () => {
        const menu = createMenu({floating: true, isRoot: true});

        menus.push(menu);
        menu.mounted = true;
        menu.destroy();

        expect(added).toHaveLength(1);
        expect(removed).toHaveLength(1);
        expect(removed[0]).toBe(added[0]);
        expect(mainView.domListeners).toEqual([])
    })
});
