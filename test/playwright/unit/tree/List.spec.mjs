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
});
