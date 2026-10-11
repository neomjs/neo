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

/**
 * @summary A floating root holding the given records; each one without `items` becomes a parent of one leaf.
 * @param {Neo.menu.List[]} menus The describe block's teardown list
 * @param {Object[]} records Parents, or leaves marked `leaf: true`
 * @param {Object} [config]
 * @returns {Neo.menu.List}
 */
function createRoot(menus, records, config={}) {
    const root = createMenu({floating: true, isRoot: true, ...config});

    menus.push(root);
    root.store.add(records.map(({leaf, ...record}) => leaf ? record : {...record, items: [{text: `${record.text} leaf`}]}));

    return root
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

    /**
     * @summary A root plus two descendant levels, wired so the real dismissal cascade can run.
     *
     * `activeSubMenu` is what `hideSubMenu()` follows, so it — not `subMenuMap` — is what makes an
     * ancestor's `unmount()` reach its descendants. `Neo.applyDeltas` is stubbed by the unit setup,
     * so no `unmount()` here needs replacing with a counter: the levels really do unmount, and
     * `mounted` is the witness.
     * @param {Object} [level2Config]
     * @returns {Object}
     */
    function createTree(level2Config={}) {
        const
            root   = createMenu({floating: true, isRoot: true}),
            level1 = createMenu({floating: true, isRoot: false, parentMenu: root}),
            level2 = createMenu({floating: true, isRoot: false, parentMenu: level1, ...level2Config});

        menus.push(root, level1, level2);

        // Added after construct, not as an `items` config: resolving items during initConfig reaches
        // getController(), which needs a manager the unit harness does not stand up.
        level2.store.add({text: 'Copy name'});

        root._mounted = level1._mounted = level2._mounted = true;
        root.activeSubMenu   = level1;
        level1.activeSubMenu = level2;

        // Every level belongs to the root's focus branch, so focus anywhere in the cascade is the root's flag
        root.menuFocus = true;

        return {root, level1, level2, leafNodeId: level2.getItemId(level2.store.getAt(0))}
    }

    test('a leaf click inside a submenu unmounts every level, not only its own', () => {
        const {root, level1, level2, leafNodeId} = createTree();

        expect(root.menuFocus).toBe(true);

        level2.onKeyDownEnter(leafNodeId);

        // The regression left level1 and the root mounted while level2 closed under them, so the
        // witness has to be every level's mounted state — counting that the root was TOLD to unmount
        // would pass against exactly that bug. Depth 2 on purpose: at depth 1 the root IS the parent,
        // so closing only the clicked menu passes by accident.
        expect(level2.mounted).toBe(false);
        expect(level1.mounted).toBe(false);
        expect(root.mounted).toBe(false)
    });

    test('hideOnLeafItemClick: false leaves the whole tree mounted on a leaf click', () => {
        const {root, level1, level2, leafNodeId} = createTree({hideOnLeafItemClick: false});

        level2.onKeyDownEnter(leafNodeId);

        // The policy gate still governs the new setter write, not just the unmount that follows it.
        expect(level2.mounted).toBe(true);
        expect(level1.mounted).toBe(true);
        expect(root.mounted).toBe(true);
        expect(root.menuFocus).toBe(true)
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

/**
 * A record's submenu is cached under the record's store key, while a rendered item id carries the internalId
 * (`list.Base#useInternalId`). Every arm therefore derives its node id the way the list renders it, and the toggle
 * arm runs for a record with an `id` and for one the store has to key itself — the two key shapes a lookup built
 * from the node id could miss.
 */
test.describe('Neo.menu.List submenu cache', () => {
    let menus;

    test.beforeEach(() => {
        menus = []
    });

    test.afterEach(() => {
        menus.forEach(menu => {
            !menu.isDestroyed && menu.destroy()
        })
    });

    for (const [label, parent] of [['keyed by its id', {id: 'more', text: 'More'}], ['keyed by the store', {text: 'More'}]]) {
        test(`without hover, Enter on a parent whose submenu is showing closes it, and the next Enter shows it again (${label})`, () => {
            const
                root   = createRoot(menus, [parent], {showSubMenuOnHover: false}),
                record = root.store.getAt(0),
                nodeId = root.getItemId(record);

            // The first show belongs to the selection the same click makes
            root.onSelect([nodeId]);

            const submenu = root.activeSubMenu;

            // initVnode() returns early in unit mode, so the mount is stated rather than rendered
            submenu._mounted = true;

            root.onKeyDownEnter(nodeId);

            expect(root.activeSubMenu).toBe(null);
            expect(submenu.mounted).toBe(false);

            root.onKeyDownEnter(nodeId);

            expect(root.activeSubMenu).toBe(submenu)
        })
    }

    test('showing a sibling\'s submenu unmounts the one showing before it', () => {
        const
            root            = createRoot(menus, [{text: 'First'}, {text: 'Second'}]),
            [first, second] = root.store.items;

        root.showSubMenu(root.getItemId(first), first);

        const firstSubmenu = root.activeSubMenu;

        firstSubmenu._mounted = true;

        root.showSubMenu(root.getItemId(second), second);

        expect(root.activeSubMenu).not.toBe(firstSubmenu);
        expect(firstSubmenu.mounted).toBe(false)
    })
});

/**
 * The pointer rest drives these arms through the handlers the delegated `mouseenter` / `mouseleave` listeners call,
 * with a short real delay. The component spec owns the real pointer; these own the timer and the root policy.
 */
test.describe('Neo.menu.List pointer rest', () => {
    const delay = 20;

    let menus;

    test.beforeEach(() => {
        menus = []
    });

    test.afterEach(() => {
        menus.forEach(menu => {
            !menu.isDestroyed && menu.destroy()
        })
    });

    /**
     * @summary A mounted root whose first record is a parent and whose second is a leaf.
     * @param {Object} [config]
     * @returns {{root: Neo.menu.List, parentId: String, leafId: String}}
     */
    function createMountedRoot(config={}) {
        const root = createRoot(menus, [{text: 'More'}, {leaf: true, text: 'Open'}], {subMenuHoverDelay: delay, ...config});

        root._mounted = true;

        return {root, parentId: root.getItemId(root.store.getAt(0)), leafId: root.getItemId(root.store.getAt(1))}
    }

    test('a rest on a parent previews its submenu after the delay, without selecting or taking focus', async () => {
        const {root, parentId} = createMountedRoot();

        root.onItemMouseEnter({currentTarget: parentId});

        expect(root.activeSubMenu).toBe(null);

        await expect.poll(() => root.activeSubMenu).not.toBe(null);

        expect(root.activeSubMenu.focusOnMount).toBe(false);
        expect(root.selectionModel.items).toEqual([])
    });

    test('leaving the item before the delay cancels the rest', async () => {
        const {root, parentId} = createMountedRoot();

        root.onItemMouseEnter({currentTarget: parentId});
        root.cancelRest();

        // Absence cannot be polled for: wait out two delays, then read
        await new Promise(resolve => setTimeout(resolve, 2 * delay));

        expect(root.activeSubMenu).toBe(null)
    });

    test('a rest on a leaf hides the submenu showing for its sibling', () => {
        const {root, parentId, leafId} = createMountedRoot({subMenuHoverDelay: 0});

        root.onItemMouseEnter({currentTarget: parentId});

        const submenu = root.activeSubMenu;

        submenu._mounted = true;
        root.onItemMouseEnter({currentTarget: leafId});

        expect(root.activeSubMenu).toBe(null);
        expect(submenu.mounted).toBe(false)
    });

    test('a submenu level follows the root policy, including a change after the level was cached', () => {
        const {root, parentId} = createMountedRoot({subMenuHoverDelay: 0});

        root.onItemMouseEnter({currentTarget: parentId});

        const
            submenu  = root.activeSubMenu,
            nested   = submenu.store.getAt(0),
            nestedId = submenu.getItemId(nested);

        submenu._mounted = true;
        nested.items     = [{text: 'Deeper'}];

        // The level's own values would forbid an immediate rest; the root's allow it
        submenu.showSubMenuOnHover = false;
        submenu.subMenuHoverDelay  = 500;
        submenu.onItemMouseEnter({currentTarget: nestedId});

        expect(submenu.activeSubMenu).not.toBe(null);

        submenu.hideSubMenu();
        root.showSubMenuOnHover = false;
        submenu.onItemMouseEnter({currentTarget: nestedId});

        expect(submenu.activeSubMenu).toBe(null)
    });

    test('a rest pending when its menu unmounts shows nothing', async () => {
        const {root, parentId} = createMountedRoot();

        root.onItemMouseEnter({currentTarget: parentId});
        root.unmount();
        root._mounted = true; // shown again inside the delay: a stale rest must not act on the new mount

        await new Promise(resolve => setTimeout(resolve, 2 * delay));

        expect(root.activeSubMenu).toBe(null)
    });

    test('a rest pending when its menu is destroyed shows nothing, even from a store that outlives the menu', async () => {
        const
            {root, parentId} = createMountedRoot({autoDestroyStore: false}),
            {store}          = root,
            {showSubMenu}    = MenuList.prototype;

        let shown = 0;

        // destroy() cancels nothing and leaves the instance reading as mounted, and a surviving store still answers
        // the lookup, so only the resume check stops the rest. The spy sits on the prototype because destroy()
        // deletes an instance stub.
        MenuList.prototype.showSubMenu = function(...args) {
            shown++;
            return showSubMenu.apply(this, args)
        };

        try {
            root.onItemMouseEnter({currentTarget: parentId});
            root.destroy();

            await new Promise(resolve => setTimeout(resolve, 2 * delay));

            expect(shown).toBe(0)
        } finally {
            MenuList.prototype.showSubMenu = showSubMenu;
            store.destroy()
        }
    });

    test('a submenu that unmounts itself stops being its parent\'s active submenu, so a rest shows it again', () => {
        const {root, parentId} = createMountedRoot({subMenuHoverDelay: 0});

        root.onItemMouseEnter({currentTarget: parentId});

        const submenu = root.activeSubMenu;

        submenu._mounted = true;

        // Escape inside a submenu unmounts that level alone, without going through the parent's hideSubMenu()
        submenu.onKeyDownEscape();

        expect(root.activeSubMenu).toBe(null);

        let mounts = 0;

        submenu.initVnode = () => {mounts++};
        root.onItemMouseEnter({currentTarget: parentId});

        expect(mounts).toBe(1)
    });

    test('Enter on the parent of a preview keeps it showing and enters it', () => {
        const {root, parentId} = createMountedRoot({subMenuHoverDelay: 0});

        root.onItemMouseEnter({currentTarget: parentId});

        const submenu = root.activeSubMenu;

        root.onKeyDownEnter(parentId);

        expect(root.activeSubMenu).toBe(submenu);
        expect(submenu.focusOnMount).toBe(true)
    })
});
