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
});
