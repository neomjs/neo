import {setup} from '../../setup.mjs';

const appName = 'TreeAccordionAsyncClickTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Accordion      from '../../../../src/tree/Accordion.mjs';

class AsyncAccordion extends Accordion {
    static config = {
        className: 'Test.tree.AsyncAccordion'
    }

    /**
     * @summary Captures async folder-hook ordering before the base folder toggle completes.
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async onFolderItemClick(record) {
        this.clickOrder.push('hook:start');

        if (this.cancelNextClick) {
            this.clickOrder.push('hook:cancel');
            return false
        }

        await new Promise(resolve => setTimeout(resolve, 0));

        this.clickOrder.push('hook:end')
    }
}

AsyncAccordion = Neo.setupClass(AsyncAccordion);

test.describe('Neo.tree.Accordion async folder clicks', () => {
    test('awaits the tree.List folder hook before firing the accordion folder event', async () => {
        const tree = Neo.create(AsyncAccordion, {
            appName,
            clickOrder                 : [],
            id                         : 'accordion-async-click-test',
            rootParentsAreCollapsible  : true,
            showCollapseExpandAllIcons : false,
            store: {
                model: {
                    fields: [
                        {name: 'collapsed', type: 'Boolean'},
                        {name: 'content',   type: 'String'},
                        {name: 'iconCls',   type: 'String'},
                        {name: 'id',        type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'}
                    ]
                },
                data: [{
                    id       : 'folder1',
                    collapsed: true,
                    content  : 'Folder Content',
                    iconCls  : '',
                    isLeaf   : false,
                    name     : 'Folder 1',
                    parentId : null
                }]
            }
        });

        try {
            await tree.initVnode();

            const itemId = tree.getItemId('folder1');

            tree.on('folderItemClick', ({record}) => {
                tree.clickOrder.push(`event:${record.collapsed}`)
            });

            await tree.onItemClick(tree.getVdomChild(itemId), {
                path: [{id: itemId}]
            });

            const record = tree.store.get('folder1');

            expect(tree.clickOrder).toEqual(['hook:start', 'hook:end', 'event:false']);
            expect(record.collapsed).toBe(false);
            expect(tree.getVdomChild(itemId).cls).toContain('neo-folder-open')
        } finally {
            tree.destroy()
        }
    })

    test('does not fire the accordion folder event when the base hook cancels', async () => {
        const tree = Neo.create(AsyncAccordion, {
            appName,
            cancelNextClick            : true,
            clickOrder                 : [],
            id                         : 'accordion-cancelled-click-test',
            rootParentsAreCollapsible  : true,
            showCollapseExpandAllIcons : false,
            store: {
                model: {
                    fields: [
                        {name: 'collapsed', type: 'Boolean'},
                        {name: 'content',   type: 'String'},
                        {name: 'iconCls',   type: 'String'},
                        {name: 'id',        type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'}
                    ]
                },
                data: [{
                    id       : 'folder1',
                    collapsed: true,
                    content  : 'Folder Content',
                    iconCls  : '',
                    isLeaf   : false,
                    name     : 'Folder 1',
                    parentId : null
                }]
            }
        });

        try {
            await tree.initVnode();

            const itemId = tree.getItemId('folder1');

            tree.on('folderItemClick', ({record}) => {
                tree.clickOrder.push(`event:${record.collapsed}`)
            });

            await expect(tree.onItemClick(tree.getVdomChild(itemId), {
                path: [{id: itemId}]
            })).resolves.toBe(false);

            expect(tree.clickOrder).toEqual(['hook:start', 'hook:cancel']);
            expect(tree.store.get('folder1').collapsed).toBe(true);
            expect(tree.getVdomChild(itemId).cls).not.toContain('neo-folder-open')
        } finally {
            tree.destroy()
        }
    })
});
