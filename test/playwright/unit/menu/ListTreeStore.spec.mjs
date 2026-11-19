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
        data : treeData(),
        ...config
    })
}

/**
 * @returns {Object[]} A fresh copy of the menu tree, per store
 */
function treeData() {
    return [
        {id: 'file',      text: 'File',       isLeaf: false, collapsed: true},
        {id: 'file-new',  text: 'New',        isLeaf: false, collapsed: true, parentId: 'file'},
        {id: 'file-new-f',text: 'File…',      isLeaf: true,                   parentId: 'file-new'},
        {id: 'file-open', text: 'Open',       isLeaf: true,                   parentId: 'file'},
        {id: 'edit',      text: 'Edit',       isLeaf: false, collapsed: true},
        {id: 'edit-copy', text: 'Copy',       isLeaf: true,                   parentId: 'edit'},
        {id: 'about',     text: 'About',      isLeaf: true}
    ]
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

    test('a tree store passed as a class or a config drives the same levels, and the root destroys what it built', () => {
        const ClassFormStore = Neo.setupClass(class extends TreeStore {
                  static config = {
                      className: 'Test.Unit.Menu.ListTreeStore.ClassFormStore',
                      model    : MenuModel,
                      data     : treeData()
                  }
              }),
              byClass  = createMenu({store: ClassFormStore}),
              byConfig = createMenu({store: {module: TreeStore, model: MenuModel, data: treeData()}});

        menus.push(byClass, byConfig);

        for (const root of [byClass, byConfig]) {
            const {sourceStore} = root,
                  file          = root.store.get('file');

            expect(sourceStore instanceof TreeStore).toBe(true);
            expect(root.store.items.map(item => item.id)).toEqual(['file', 'edit', 'about']);
            expect(root.hasChildren(file), 'a parent, not a leaf the click would close the menu on').toBe(true);

            root.showSubMenu(root.getItemId(root.store.getKey(file)), file);

            expect(root.activeSubMenu.sourceStore).toBe(sourceStore);
            expect(root.activeSubMenu.store.items.map(item => item.id)).toEqual(['file-new', 'file-open']);

            root.destroy();

            expect(sourceStore.isDestroyed).toBe(true)
        }
    });

    test('a live store replacement re-derives the root, retires the open cascade, and releases only a built source', () => {
        const root  = createMenu({store: {module: TreeStore, model: MenuModel, data: treeData()}}),
              built = root.sourceStore,
              file  = root.store.get('file');

        menus.push(root);

        root.showSubMenu(root.getItemId(root.store.getKey(file)), file);

        const oldChild = root.activeSubMenu;

        // A built source gives way to a borrowed one
        root.store = treeStore;

        expect(built.isDestroyed, 'the source the menu built').toBe(true);
        expect(oldChild.isDestroyed, 'the submenu the old source drove').toBe(true);
        expect(root.sourceStore).toBe(treeStore);
        expect(root.store.items.map(item => item.id)).toEqual(['file', 'edit', 'about']);

        treeStore.add({id: 'help', text: 'Help', isLeaf: true});

        expect(root.store.items.map(item => item.id), 'the new source drives the root').toContain('help');

        // A borrowed source gives way to a built one
        root.store = {module: TreeStore, model: MenuModel, data: [{id: 'solo', text: 'Solo', isLeaf: true}]};

        const second = root.sourceStore;

        treeStore.add({id: 'late', text: 'Late', isLeaf: true});

        expect(treeStore.isDestroyed, 'a borrowed source stays its owner\'s').toBeFalsy();
        expect(root.store.items.map(item => item.id), 'the old source no longer reaches the root').toEqual(['solo']);

        root.destroy();

        expect(second.isDestroyed).toBe(true);
        expect(treeStore.isDestroyed).toBeFalsy()
    });

    test('the store or tree source already in place, assigned again, keeps one set of listeners and its owner', () => {
        const count = store => {
                  const {listeners} = store.toJSON();
                  return ['filter', 'mutate', 'recordChange', 'sort'].map(name => (listeners[name] || []).length)
              },
              pristine = count(treeStore),
              owner    = createMenu({store: {module: TreeStore, model: MenuModel, data: treeData()}}),
              borrower = createMenu({store: treeStore}),
              built    = owner.sourceStore,
              file     = owner.store.get('file');

        menus.push(owner, borrower);

        owner.showSubMenu(owner.getItemId(owner.store.getKey(file)), file);

        const child  = owner.activeSubMenu,
              levels = [owner.store, borrower.store],
              before = [count(built), count(treeStore)];

        owner.store    = built;
        owner.store    = owner.store;
        borrower.store = treeStore;

        expect([owner.store, borrower.store], 'each level stays').toEqual(levels);
        expect(owner.activeSubMenu, 'the open submenu stays').toBe(child);
        expect([count(built), count(treeStore)], 'no listener is bound twice').toEqual(before);

        owner.destroy();
        borrower.destroy();

        expect(built.isDestroyed, 'the menu still owns the source it built').toBe(true);
        expect(count(treeStore), 'the borrowed source keeps none of the menu\'s listeners').toEqual(pristine)
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

    test('changing one record repaints that row only — no level rebuild', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        let rebuilds = 0, rowRepaints = 0;

        menu.createItems         = () => {rebuilds++};
        menu.onStoreRecordChange = () => {rowRepaints++};

        treeStore.get('edit').text = 'Edit (modified)';

        expect(rowRepaints).toBe(1);
        expect(rebuilds).toBe(0);

        // Levels share record instances with the tree, so the data was already current.
        expect(menu.store.get('edit').text).toBe('Edit (modified)')
    });

    test('a record contributed after mount appears, and only its own level re-renders', () => {
        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('edit'))});

        menus.push(root, level1);

        let rootRenders = 0, levelRenders = 0;

        root.createItems   = () => {rootRenders++};
        level1.createItems = () => {levelRenders++};

        expect(level1.store.getCount()).toBe(1);

        // An unrelated module contributes into a group it does not own.
        treeStore.add({id: 'edit-find', text: 'Find', isLeaf: true, parentId: 'edit'});

        expect(level1.store.get('edit-find').text).toBe('Find');
        expect(level1.store.getCount()).toBe(2);
        expect(levelRenders).toBe(1);

        // The root level holds no record parented by 'edit', so it must not have moved at all.
        expect(rootRenders).toBe(0);
        expect(root.store.getCount()).toBe(3)
    });

    test('contribution order does not change the result', () => {
        const storeA = createTreeStore(),
              storeB = createTreeStore(),
              menuA  = createMenu({store: storeA}),
              menuB  = createMenu({store: storeB});

        menus.push(menuA, menuB);

        storeA.add({id: 'x', text: 'X', isLeaf: true});
        storeA.add({id: 'y', text: 'Y', isLeaf: true});

        storeB.add({id: 'y', text: 'Y', isLeaf: true});
        storeB.add({id: 'x', text: 'X', isLeaf: true});

        // Same set either way. Order is the tree's to decide (see the sort test), not the caller's.
        expect(new Set(menuA.store.items.map(i => i.id)))
            .toEqual(new Set(menuB.store.items.map(i => i.id)));

        storeA.destroy();
        storeB.destroy()
    });

    test('sibling order follows the tree, and a tree sort reaches every level', () => {
        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('file'))});

        menus.push(root, level1);

        expect(level1.store.items.map(i => i.text)).toEqual(['New', 'Open']);

        treeStore.sorters = [{property: 'text', direction: 'DESC'}];

        // Order is controlled once, at the tree; a level never sorts independently of it.
        expect(level1.store.items.map(i => i.text)).toEqual(['Open', 'New'])
    });

    test('a late addition stays live: add, then change it at the source, repaints exactly one row', () => {
        const menu = createMenu({store: treeStore});

        menus.push(menu);

        treeStore.add({id: 'late', text: 'Late', isLeaf: true});

        // The level must hold the SOURCE's own instance. Letting the level store hydrate the mutate
        // payload mints a clone, and a later recordChange — resolved by identity — can never find it,
        // so the row silently freezes for the rest of the menu's life.
        expect(menu.store.get('late')).toBe(treeStore.get('late'));

        let rowRepaints = 0;

        menu.onStoreRecordChange = () => {rowRepaints++};

        treeStore.get('late').text = 'Late (modified)';

        expect(rowRepaints).toBe(1);
        expect(menu.store.get('late').text).toBe('Late (modified)')
    });

    test('a filter set before the menu exists reaches every level, a kept ancestor included', () => {
        // Only "Copy" matches. Its group stays because a descendant matched (TreeStore#filter()'s ancestor
        // preservation); "File", its subtree and "About" match nothing and leave every level.
        treeStore.filters = [{property: 'text', value: 'Copy'}];

        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('edit'))});

        menus.push(root, level1);

        expect(root.store.items.map(item => item.id)).toEqual(['edit']);
        expect(level1.store.items.map(item => item.id)).toEqual(['edit-copy']);

        // The Structural Layer read stays filter-independent: the level applies the mask, getChildren() does not
        expect(treeStore.getChildren('root').map(item => item.id)).toEqual(['file', 'edit', 'about'])
    });

    test('changing or clearing the filters re-derives every live level', () => {
        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('file'))});

        menus.push(root, level1);

        // No group text is listed, so a group stays only for a kept child. A group that matched itself would
        // keep its whole subtree (TreeStore#filter()'s descendant preservation).
        treeStore.filters = [{property: 'text', operator: 'included', value: ['New', 'Copy']}];

        expect(root.store.items.map(item => item.id)).toEqual(['file', 'edit']);
        expect(level1.store.items.map(item => item.id)).toEqual(['file-new']);

        treeStore.filters = [{property: 'text', operator: 'included', value: ['Open', 'About']}];

        expect(root.store.items.map(item => item.id)).toEqual(['file', 'about']);
        expect(level1.store.items.map(item => item.id)).toEqual(['file-open']);

        treeStore.clearFilters();

        expect(root.store.items.map(item => item.id)).toEqual(['file', 'edit', 'about']);
        expect(level1.store.items.map(item => item.id)).toEqual(['file-new', 'file-open'])
    });

    test('a record added under an active filter joins its level only when the filter keeps it', () => {
        // Groups carry no iconCls, so a group stays only for a kept child
        treeStore.filters = [{property: 'iconCls', value: 'keep'}];

        const root   = createMenu({store: treeStore}),
              level1 = createMenu({parentRecordId: 'file', store: treeStore});

        menus.push(root, level1);

        expect(root.store.getCount()).toBe(0);
        expect(level1.store.getCount()).toBe(0);

        treeStore.add([
            {id: 'file-hidden', text: 'Hidden', isLeaf: true, parentId: 'file'},
            {id: 'file-save',   text: 'Save',   isLeaf: true, parentId: 'file', iconCls: 'keep'}
        ]);

        // Exactly once: the filter event re-derives the level before the mutation reaches it
        expect(level1.store.items.map(item => item.id)).toEqual(['file-save']);
        expect(level1.store.get('file-save')).toBe(treeStore.get('file-save'));
        expect(root.store.items.map(item => item.id)).toEqual(['file'])
    });

    test('a filter that drops the item of the open submenu hides that submenu', () => {
        const root   = createMenu({store: treeStore}),
              record = root.store.get('file');

        menus.push(root);

        root.showSubMenu(root.getItemId(root.store.getKey(record)), record);

        const submenu = root.activeSubMenu;

        menus.push(submenu);

        expect(submenu.parentRecordId).toBe('file');

        treeStore.filters = [{property: 'text', value: 'About'}];

        expect(root.store.items.map(item => item.id)).toEqual(['about']);
        expect(root.activeSubMenu).toBeNull()
    });

    /**
     * Opens root → File → New and returns every level.
     * @param {Neo.menu.List} root
     * @returns {Object}
     */
    function openFileNewCascade(root) {
        const file = root.store.get('file');

        root.showSubMenu(root.getItemId(root.store.getKey(file)), file);

        const fileLevel = root.activeSubMenu,
              newRecord = fileLevel.store.get('file-new');

        fileLevel.showSubMenu(fileLevel.getItemId(fileLevel.store.getKey(newRecord)), newRecord);

        menus.push(fileLevel, fileLevel.activeSubMenu);

        return {fileLevel, newLevel: fileLevel.activeSubMenu}
    }

    test('a collapse in the tree is no removal: an open cascade survives the collapse/expand round trip', async () => {
        await treeStore.expand('file');
        await treeStore.expand('file-new');

        const root = createMenu({store: treeStore});

        menus.push(root);

        const {fileLevel, newLevel} = openFileNewCascade(root);

        // The Projection Layer drops the branch's visible descendants, the Structural Layer keeps them
        treeStore.collapse('file');

        expect(fileLevel.store.items.map(item => item.id)).toEqual(['file-new', 'file-open']);
        expect(newLevel.store.items.map(item => item.id)).toEqual(['file-new-f']);
        expect(fileLevel.activeSubMenu).toBe(newLevel);

        await treeStore.expand('file');

        // Exactly once: the expansion re-projects rows no level let go of
        expect(fileLevel.store.items.map(item => item.id)).toEqual(['file-new', 'file-open']);
        expect(newLevel.store.items.map(item => item.id)).toEqual(['file-new-f']);
        expect(fileLevel.activeSubMenu).toBe(newLevel)
    });

    test('removing the item of the open submenu from the tree hides that submenu', () => {
        const root = createMenu({store: treeStore});

        menus.push(root);

        const {fileLevel} = openFileNewCascade(root);

        treeStore.remove('file-new');

        expect(fileLevel.store.items.map(item => item.id)).toEqual(['file-open']);
        expect(fileLevel.activeSubMenu).toBeNull()
    });

    test('a destroyed level leaves no listener behind on the still-live source', () => {
        const root   = createMenu({store: treeStore}),
              level1 = createMenu({...root.getSubMenuData(root.store.get('file'))});

        menus.push(root);

        const before = treeStore.toJSON().listeners;

        expect(before.sort.length).toBeGreaterThan(0);

        level1.destroy();

        const after = treeStore.toJSON().listeners;

        // Teardown must be symmetric with what onConstructed subscribed. An asymmetric un() leaves a
        // destroyed level still driving syncLevelRecords on the next source sort or filter.
        expect((after.filter       || []).length).toBe(before.filter.length       - 1);
        expect((after.mutate       || []).length).toBe(before.mutate.length       - 1);
        expect((after.recordChange || []).length).toBe(before.recordChange.length - 1);
        expect((after.sort         || []).length).toBe(before.sort.length         - 1);

        // And the surviving level keeps working when the source sorts afterwards.
        treeStore.sorters = [{property: 'text', direction: 'DESC'}];

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
