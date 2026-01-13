import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: 'TreeListRaceTest'
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

test.describe('Neo.tree.List Race Conditions', () => {

    test('expandParents followed by store update should not break VDOM', async () => {
        const tree = Neo.create(TreeList, {
            appName: 'TreeListRaceTest',
            id     : 'race-tree',
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

        await tree.initVnode();

        const folderId = tree.getItemId('folder1');

        // Expand the parent folder via VDOM manipulation.
        // This sets the folder to open in the VDOM, but does not update the Store record.
        tree.expandParents('child1');

        let folderNode = tree.getVdomChild(folderId);

        expect(folderNode.cls).toContain('neo-folder-open');

        // Simulate an external store update where the record is still collapsed.
        // This triggers onStoreRecordChange, which re-renders the item using the Store's state.
        const record = tree.store.get('folder1');

        tree.store.fire('recordChange', {
            fields: [],
            record
        });

        await tree.timeout(50);

        folderNode = tree.getVdomChild(folderId);

        // Verify that the store state overrides the temporary VDOM expansion state.
        // The folder should revert to being closed.
        expect(folderNode.cls).not.toContain('neo-folder-open');

        // Ensure VDOM structure integrity (LI and UL separation) persists despite state mismatch.
        // We want to confirm that the LI node was replaced correctly and not merged with the UL.
        const
            {index, parentNode} = VDomUtil.find(tree.vdom, folderId),
            nextSibling         = parentNode.cn[index + 1];

        expect(folderNode.tag).toBe('li');
        expect(nextSibling).toBeDefined();
        expect(nextSibling.tag).toBe('ul');

        tree.destroy();
    });
});
