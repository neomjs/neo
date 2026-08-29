import {setup} from '../../setup.mjs';

const
    appName  = 'MenuListTreeStoreTest',
    mainView = {
        id          : 'menu-treestore-main-view',
        domListeners: [],
        addDomListeners() {},
        removeDomListeners() {}
    };

setup({
    neoConfig: {
        unitTestMode: true
    },
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
import TreeModel      from '../../../../src/data/TreeModel.mjs';
import TreeStore      from '../../../../src/data/TreeStore.mjs';

/**
 * @summary menu.List driven by a Neo.data.TreeStore.
 *
 * The cascade renders one floating menu.List per level. A level never renders a subset of the shared
 * tree store — list.Base index math (getSelectedIndex, getHeaderlessIndex) walks the full store.items,
 * so a subset would resolve selection against the whole tree. Each level therefore derives its own flat
 * store, and the tree store stays the single shared source of truth that no level owns.
 */

class MenuTreeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Menu.ListTreeStore.MenuTreeModel',
        fields   : [
            {name: 'id',      type: 'String'},
            {name: 'iconCls', type: 'String'},
            {name: 'text',    type: 'String'}
        ]
    }
}

const MenuModel = Neo.setupClass(MenuTreeModel);

/**
 * @param {Object} [config]
 * @returns {Neo.data.TreeStore}
 */
function createTreeStore(config={}) {
    return Neo.create(TreeStore, {
        model: MenuModel,
        data : [
            {id: 'file',      text: 'File',       isLeaf: false, collapsed: true},
            {id: 'file-new',  text: 'New',        isLeaf: false, collapsed: true, parentId: 'file'},
            {id: 'file-new-f',text: 'File…',      isLeaf: true,                   parentId: 'file-new'},
            {id: 'file-open', text: 'Open',       isLeaf: true,                   parentId: 'file'},
            {id: 'edit',      text: 'Edit',       isLeaf: false, collapsed: true},
            {id: 'edit-copy', text: 'Copy',       isLeaf: true,                   parentId: 'edit'},
            {id: 'about',     text: 'About',      isLeaf: true}
        ],
        ...config
    })
}

/**
 * @param {Object} [config]
 * @returns {Neo.menu.List}
 */
function createMenu(config={}) {
    const menu = Neo.create(MenuList, {
        appName,
        id: Neo.getId('treestore-menu'),
        ...config
    });

    menu.alignTo       = Neo.emptyFn;
    menu.focus         = Neo.emptyFn;
    menu.initDomEvents = Neo.emptyFn;

    return menu
}

test.describe('Neo.menu.List driven by a TreeStore', () => {
    let menus, treeStore;

    test.beforeEach(() => {
        menus     = [];
        treeStore = createTreeStore()
    });

    test.afterEach(() => {
        menus.forEach(menu => {!menu.isDestroyed && menu.destroy()});
        !treeStore.isDestroyed && treeStore.destroy()
    });

    test('the root level renders the tree roots only, not the flattened tree', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        // The tree holds 7 records across 3 depths. The root menu shows 3.
        expect(menu.store.getCount()).toBe(3);
        expect(menu.store.items.map(item => item.id)).toEqual(['file', 'edit', 'about'])
    });

    test('keeps the tree store as sourceStore and does NOT render it directly', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        expect(menu.sourceStore).toBe(treeStore);
        expect(menu.store).not.toBe(treeStore);
        expect(menu.store instanceof TreeStore).toBe(false)
    });

    test('the level store reuses the tree model class, so hierarchy fields survive', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        // Re-adding under menu.Model would silently drop isLeaf/parentId, and hasChildren() reads isLeaf.
        const record = menu.store.get('file');

        expect(record.isLeaf).toBe(false);
        expect(record.text).toBe('File');

        // A distinct model INSTANCE, so no level can destroy a schema another level is using.
        expect(menu.store.model).not.toBe(treeStore.model);
        expect(menu.store.model.className).toBe(treeStore.model.className)
    });

    test('hasChildren answers from isLeaf, never from a nested items array', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        const branch = menu.store.get('file'),
              leaf   = menu.store.get('about');

        expect(branch.items).toBeUndefined();
        expect(menu.hasChildren(branch)).toBe(true);
        expect(menu.hasChildren(leaf)).toBe(false)
    });

    test('a child level renders the children of its parent record, at any depth', () => {
        const root = createMenu({store: treeStore});

        menus.push(root);

        const level1 = createMenu({...root.getSubMenuData(root.store.get('file'))});

        menus.push(level1);

        expect(level1.store.items.map(item => item.id)).toEqual(['file-new', 'file-open']);

        // Depth 3: the cascade is not limited to one level of nesting.
        const level2 = createMenu({...level1.getSubMenuData(level1.store.get('file-new'))});

        menus.push(level2);

        expect(level2.store.items.map(item => item.id)).toEqual(['file-new-f'])
    });

    test('a child level reads through the COLLAPSED tree — expansion is not a rendering prerequisite', () => {
        const root = createMenu({store: treeStore});

        menus.push(root);

        // Every branch in the fixture is collapsed. A menu must never mutate expansion state to render.
        expect(treeStore.get('file').collapsed).toBe(true);

        const level1 = createMenu({...root.getSubMenuData(root.store.get('file'))});

        menus.push(level1);

        expect(level1.store.getCount()).toBe(2);
        expect(treeStore.get('file').collapsed).toBe(true)
    });

    test('destroying a level does NOT destroy the shared tree store', () => {
        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('edit'))});

        expect(level1.store.getCount()).toBe(1);

        // list.Base sets autoDestroyStore: true and destroys me.store on teardown. Because a level's
        // store is its own derived one, the shared source can never be reached by that path.
        level1.destroy();
        root.destroy();

        expect(treeStore.isDestroyed).toBeFalsy();
        expect(treeStore.getCount()).toBe(3);
        expect(treeStore.getChildren('edit')).toHaveLength(1)
    });

    test('showSubMenu opens a real child level and leaves the parent alive', () => {
        const root = createMenu({store: treeStore});

        menus.push(root);

        const record = root.store.get('file'),
              nodeId = root.getItemId(root.store.getKey(record));

        root.showSubMenu(nodeId, record);

        const submenu = root.activeSubMenu;

        menus.push(submenu);

        expect(submenu).toBeTruthy();
        expect(submenu.sourceStore).toBe(treeStore);
        expect(submenu.store.items.map(item => item.id)).toEqual(['file-new', 'file-open']);

        // Opening a child must not tear the parent down. Guards the whole interaction path, which a
        // themeless browser cannot report on reliably.
        expect(root.isDestroyed).toBeFalsy();
        expect(root.store.getCount()).toBe(3)
    });

    test('the classic nested-items API is untouched', () => {
        const menu = createMenu({
            items: [
                {id: 'a', text: 'A', items: [{id: 'a-1', text: 'A1'}]},
                {id: 'b', text: 'B'}
            ]
        });

        menus.push(menu);

        expect(menu.sourceStore).toBeNull();
        expect(menu.store.getCount()).toBe(2);
        expect(menu.hasChildren(menu.store.get('a'))).toBe(true);
        expect(menu.hasChildren(menu.store.get('b'))).toBe(false);
        expect(menu.getSubMenuData(menu.store.get('a'))).toEqual({items: [{id: 'a-1', text: 'A1'}]})
    });

    test('an empty items array is a leaf to every path, not just to the arrow', () => {
        const menu = createMenu({items: [{id: 'empty', text: 'Empty', items: []}]});

        menus.push(menu);

        // Guards the raw-truthiness regression: `!record.items` is false for [], so the keyboard path
        // used to treat an empty array as a parent while the arrow treated it as a leaf.
        expect(menu.hasChildren(menu.store.get('empty'))).toBe(false)
    })
});
