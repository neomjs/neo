import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'TreeListTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import TreeList           from '../../../../src/tree/List.mjs';
import VDomUtil           from '../../../../src/util/VDom.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.tree.List VDOM Structure', () => {

    test('expandParents should maintain correct VDOM structure', async () => {
        const tree = Neo.create(TreeList, {
            appName                   : 'TreeListTest',
            id                        : 'test-tree',
            showCollapseExpandAllIcons: false,
            store: {
                model: {
                    fields: [
                        {name: 'id',       type: 'String'},
                        {name: 'name',     type: 'String'},
                        {name: 'parentId', type: 'String'},
                        {name: 'isLeaf',   type: 'Boolean'},
                        {name: 'collapsed', type: 'Boolean'}
                    ]
                },
                data: [
                    {id: 'folder1', name: 'Folder 1', parentId: null, isLeaf: false, collapsed: true},
                    {id: 'child1',  name: 'Child 1',  parentId: 'folder1', isLeaf: true}
                ]
            }
        });

        await tree.initVnode(); // Ensure initial render

        const folderId = tree.getItemId('folder1');
        const childId  = tree.getItemId('child1');

        // Verify initial structure (collapsed)
        let folderNode = tree.getVdomChild(folderId);
        expect(folderNode).toBeDefined();
        expect(folderNode.tag).toBe('li');
        expect(folderNode.cls).toContain('neo-list-folder');
        expect(folderNode.cls).not.toContain('neo-folder-open');

        // Check the UL sibling (should be hidden/removed)
        const {parentNode, index} = VDomUtil.find(tree.vdom, folderId);
        const nextSibling = parentNode.cn[index + 1];

        expect(nextSibling).toBeDefined();
        expect(nextSibling.tag).toBe('ul');
        expect(nextSibling.removeDom).toBe(true); // Initially hidden

        // Execute expandParents on the child
        tree.expandParents('child1');

        // Re-fetch nodes to check for corruption
        folderNode = tree.getVdomChild(folderId);

        // 1. Check if Folder Node is still an LI
        expect(folderNode.tag).toBe('li'); // This triggers the "Chimera" bug if it fails (becomes UL)
        expect(folderNode.cls).toContain('neo-folder-open');
        expect(folderNode.style.position).toBe('sticky'); // Check sticky fix

        // 2. Check the sibling UL
        const {parentNode: newParent, index: newIndex} = VDomUtil.find(tree.vdom, folderId);
        const newNextSibling = newParent.cn[newIndex + 1];

        expect(newNextSibling.tag).toBe('ul');
        expect(newNextSibling.removeDom).toBe(false); // Should be visible now

        // 3. Check for Chimera characteristics
        // The bug report showed the UL having the ID of the LI.
        // We verify that the node with the folder ID is definitely NOT a UL.
        expect(folderNode.tag).not.toBe('ul');

        tree.destroy();
    });

    test('filter hides unmatched siblings and folders, and collapses unmatched child folders inside matched folders', async () => {
        const tree = Neo.create(TreeList, {
            appName                   : 'TreeListTest',
            id                        : 'test-tree-filter',
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {
                    fields: [
                        {name: 'id',        type: 'String'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'collapsed', type: 'Boolean'}
                    ]
                },
                data: [
                    {id: 'component', name: 'component', parentId: null,        isLeaf: false, collapsed: false},
                    {id: 'button',    name: 'Button',    parentId: 'component', isLeaf: true},
                    {id: 'splitter',  name: 'Splitter',  parentId: 'component', isLeaf: true},
                    {id: 'toast',     name: 'Toast',     parentId: 'component', isLeaf: true},
                    {id: 'form',      name: 'form',      parentId: null,        isLeaf: false, collapsed: false},
                    {id: 'field',     name: 'field',     parentId: 'form',      isLeaf: false, collapsed: false},
                    {id: 'textfield', name: 'Text',      parentId: 'field',     isLeaf: true},
                    {id: 'formctn',   name: 'Container', parentId: 'form',      isLeaf: true},
                    {id: 'util',      name: 'util',      parentId: null,        isLeaf: false, collapsed: false},
                    {id: 'array',     name: 'Array',     parentId: 'util',      isLeaf: true}
                ]
            }
        });

        await tree.initVnode();

        const getNode    = id => tree.getVdomChild(tree.getItemId(id));
        const getChildUl = id => {
            const {parentNode, index} = VDomUtil.find(tree.vdom, tree.getItemId(id));
            return parentNode.cn[index + 1];
        };

        // 1. Leaf match ("Splitter"): hides earlier and later leaf siblings ("Button", "Toast")
        //    and hides folders without a result ("form", "util")
        tree.filter('name', 'Splitter', null);

        expect(getNode('component').style.display).toBe('flex');
        expect(getNode('component').cls).toContain('neo-folder-open');
        expect(getChildUl('component').removeDom).toBe(false);

        expect(getNode('button').style.display).toBe('none');
        expect(getNode('splitter').style.display).toBe('flex');
        expect(getNode('splitter').cn[0].html).toBe('<span class="neo-highlight-search">Splitter</span>');
        expect(getNode('toast').style.display).toBe('none');

        expect(getNode('form').style.display).toBe('none');
        expect(getNode('util').style.display).toBe('none');

        // 2. Folder match ("form"): expands "form", shows its direct children ("field" folder and "Container" leaf),
        //    but collapses the child folder ("field") since nothing inside "field" matched "form"
        tree.filter('name', 'form', null);

        expect(getNode('component').style.display).toBe('none');
        expect(getNode('util').style.display).toBe('none');

        expect(getNode('form').style.display).toBe('flex');
        expect(getNode('form').cls).toContain('neo-folder-open');
        expect(getChildUl('form').removeDom).toBe(false);

        expect(getNode('formctn').style.display).toBe('flex');
        expect(getNode('field').style.display).toBe('flex');
        expect(getNode('field').cls).not.toContain('neo-folder-open');
        expect(getChildUl('field').removeDom).toBe(true);

        // 3. Clearing filter (""): restores all items without empty highlight spans and expands folders
        tree.filter('name', '', null);

        expect(getNode('component').style.display).toBe('flex');
        expect(getNode('splitter').style.display).toBe('flex');
        expect(getNode('splitter').cn[0].html).toBe('Splitter');
        expect(getNode('toast').style.display).toBe('flex');
        expect(getNode('form').style.display).toBe('flex');
        expect(getNode('field').cls).toContain('neo-folder-open');
        expect(getChildUl('field').removeDom).toBe(false);
        expect(getNode('util').style.display).toBe('flex');

        tree.destroy();
    });

    test('filter treats regex metacharacters as literal case-insensitive substrings', async () => {
        const tree = Neo.create(TreeList, {
            appName                   : 'TreeListTest',
            id                        : 'test-tree-filter-regex',
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {
                    fields: [
                        {name: 'id',        type: 'String'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'collapsed', type: 'Boolean'}
                    ]
                },
                data: [
                    {id: 'root',    name: 'Folder',                   parentId: null,   isLeaf: false, collapsed: false},
                    {id: 'paren',   name: 'Child (1) (a)',            parentId: 'root', isLeaf: true},
                    {id: 'bracket', name: 'Bracket [a]',              parentId: 'root', isLeaf: true},
                    {id: 'ops',     name: 'Plus + Question ? Star *', parentId: 'root', isLeaf: true},
                    {id: 'dot',     name: 'Other.thing',              parentId: 'root', isLeaf: true},
                    {id: 'plain',   name: 'Plain item',               parentId: 'root', isLeaf: true}
                ]
            }
        });

        await tree.initVnode();

        const getNode = id => tree.getVdomChild(tree.getItemId(id));

        expect(() => tree.filter('name', '(', null)).not.toThrow();
        expect(getNode('paren').style.display).toBe('flex');
        expect(getNode('paren').cn[0].html).toBe(
            'Child <span class="neo-highlight-search">(</span>1) <span class="neo-highlight-search">(</span>a)'
        );
        expect(getNode('dot').style.display).toBe('none');
        expect(getNode('plain').style.display).toBe('none');

        expect(() => tree.filter('name', '[', null)).not.toThrow();
        expect(getNode('bracket').style.display).toBe('flex');
        expect(getNode('bracket').cn[0].html).toBe('Bracket <span class="neo-highlight-search">[</span>a]');
        expect(getNode('paren').style.display).toBe('none');

        for (const op of ['+', '?', '*']) {
            expect(() => tree.filter('name', op, null)).not.toThrow();
            expect(getNode('ops').style.display).toBe('flex');
            expect(getNode('ops').cn[0].html).toContain(`<span class="neo-highlight-search">${op}</span>`);
            expect(getNode('plain').style.display).toBe('none');
        }

        expect(() => tree.filter('name', 'child (1', null)).not.toThrow();
        expect(getNode('paren').style.display).toBe('flex');
        expect(getNode('paren').cn[0].html).toBe('<span class="neo-highlight-search">Child (1</span>) (a)');
        expect(getNode('dot').style.display).toBe('none');

        expect(() => tree.filter('name', '.', null)).not.toThrow();
        expect(getNode('dot').style.display).toBe('flex');
        expect(getNode('dot').cn[0].html).toBe('Other<span class="neo-highlight-search">.</span>thing');
        expect(getNode('paren').style.display).toBe('none');
        expect(getNode('plain').style.display).toBe('none');

        tree.destroy();
    });

    test('a record selected through the model shows as selected, and stays selected through a render', async () => {
        const tree = Neo.create(TreeList, {
            appName                   : 'TreeListTest',
            id                        : 'selection-tree',
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {
                    fields: [
                        {name: 'id',        type: 'String'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'collapsed', type: 'Boolean'}
                    ]
                },
                data: [
                    {id: 'folder', name: 'Folder', parentId: null,     isLeaf: false, collapsed: false},
                    {id: 'a',      name: 'A',      parentId: 'folder', isLeaf: true},
                    {id: 'b',      name: 'B',      parentId: 'folder', isLeaf: true}
                ]
            }
        });

        await tree.initVnode();

        const
            itemId   = tree.getItemId('a'),
            selected = () => tree.getVdomChild(itemId),
            other    = () => tree.getVdomChild(tree.getItemId('b'));

        tree.selectionModel.select(tree.store.get('a'));

        expect(selected().cls).toContain('neo-selected');

        // A store load renders every item again: a folder's lazily loaded children, a drop, a sort
        tree.createItems();

        expect(selected().cls).toContain('neo-selected');
        expect(selected()['aria-selected']).toBe(true);
        expect(other().cls).not.toContain('neo-selected');
        expect(other()['aria-selected']).toBeUndefined();

        // A record change renders its own item again: a rename
        tree.store.get('a').name = 'Renamed';

        expect(selected().cn[0].html).toBe('Renamed');
        expect(selected().cls).toContain('neo-selected');
        expect(selected()['aria-selected']).toBe(true);

        // A tree without selection renders none
        tree.disableSelection = true;
        tree.createItems();

        expect(selected().cls).not.toContain('neo-selected');

        tree.destroy();
    });

    [
        {label: 'a zero key',      field: {name: 'id', type: 'Integer'}, raw: 0,   key: 0},
        {label: 'a plain key',     field: {name: 'id', type: 'Integer'}, raw: 1,   key: 1},
        {label: 'a converted key', field: {name: 'id', type: 'String', convert: value => `mapped:${value}`}, raw: 'a', key: 'mapped:a'}
    ].forEach(({label, field, raw, key}) => {
        test(`a rendered item id selects its Store record, and the record its item, for ${label}`, async () => {
            const tree = Neo.create(TreeList, {
                appName                   : 'TreeListTest',
                showCollapseExpandAllIcons: false,
                store                     : {
                    model: {fields: [field, {name: 'name', type: 'String'}, {name: 'parentId'}, {name: 'isLeaf', type: 'Boolean'}]},
                    data : [{id: raw, name: 'Leaf', parentId: null, isLeaf: true}]
                }
            });

            await tree.initVnode();

            const record = tree.store.get(key);
            let records;

            tree.on('select', data => {records = data.records});

            // The id the tree renders, as a click or the navigator hands it over
            tree.selectionModel.select(tree.getItemId(key));
            expect(records).toEqual([record]);

            tree.selectionModel.deselectAll();
            tree.selectionModel.select(record);
            expect(tree.getVdomChild(tree.getItemId(key)).cls).toContain('neo-selected');

            tree.destroy()
        })
    });

    test('a tree built without selection marks no item, even when its model is handed one', async () => {
        const tree = Neo.create(TreeList, {
            appName                   : 'TreeListTest',
            disableSelection          : true,
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}, {name: 'parentId'}, {name: 'isLeaf', type: 'Boolean'}]},
                data : [{id: 'a', name: 'A', parentId: null, isLeaf: true}]
            }
        });

        await tree.initVnode();

        tree.selectionModel.select(tree.store.get('a'));

        const item = tree.getVdomChild(tree.getItemId('a'));

        expect(item.cls).not.toContain('neo-selected');
        expect(item['aria-selected']).toBeUndefined();
        expect(tree.selectionModel.hasSelection()).toBe(false);

        tree.destroy()
    });
});
