import {setup} from '../../setup.mjs';

const appName = 'TreeAccordionAsyncClickTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Accordion       from '../../../../src/tree/Accordion.mjs';
import VDomUtil        from '../../../../src/util/VDom.mjs';

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

test.describe('Neo.tree.Accordion showIcon', () => {
    test('a store that holds its records at construction renders, and showIcon hides and shows the leaf icons', async () => {
        const tree = Neo.create(Accordion, {
            appName,
            showCollapseExpandAllIcons: false,
            store                     : {
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
                data: [
                    {id: 'section', name: 'Section', isLeaf: false, collapsed: false, parentId: null},
                    {id: 'leaf',    name: 'Leaf',    isLeaf: true,  content: 'A leaf', iconCls: 'fa fa-user', parentId: 'section'},
                    {id: 'nested',  name: 'Nested',  isLeaf: false, collapsed: false, content: 'A folder', iconCls: 'fa fa-database', parentId: 'section'},
                    {id: 'child',   name: 'Child',   isLeaf: true,  content: 'Its child', iconCls: 'fa fa-square', parentId: 'nested'}
                ]
            }
        });

        try {
            await tree.initVnode();

            const icon = id => VDomUtil.getByFlag(tree.getVdomChild(tree.getItemId(id)), 'iconCls');

            expect(icon('leaf').removeDom).toBe(false);
            expect(icon('child').removeDom).toBe(false);

            tree.showIcon = false;
            expect(icon('leaf').removeDom).toBe(true);
            expect(icon('child').removeDom).toBe(true);

            tree.showIcon = true;
            expect(icon('leaf').removeDom).toBe(false)
        } finally {
            tree.destroy()
        }
    })
});

test.describe('Neo.tree.Accordion collapsed sections', () => {
    test('a section the store holds collapsed renders its children out of the DOM, and a click opens it', async () => {
        const tree = Neo.create(Accordion, {
            appName,
            rootParentsAreCollapsible : true,
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {
                    fields: [
                        {name: 'collapsed', type: 'Boolean'},
                        {name: 'id',        type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean'},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String'}
                    ]
                },
                data: [
                    {id: 'open',   name: 'Open',   isLeaf: false, collapsed: false, parentId: null},
                    {id: 'a',      name: 'A',      isLeaf: true,  parentId: 'open'},
                    {id: 'closed', name: 'Closed', isLeaf: false, collapsed: true,  parentId: null},
                    {id: 'b',      name: 'B',      isLeaf: true,  parentId: 'closed'}
                ]
            }
        });

        try {
            await tree.initVnode();

            const children = id => tree.getVdomChild(`${tree.id}__${id}__ul`);

            expect(children('open').removeDom).toBe(false);
            expect(children('closed').removeDom).toBe(true);

            const closedId = tree.getItemId('closed');

            await tree.onItemClick(tree.getVdomChild(closedId), {path: [{id: closedId}]});

            expect(children('closed').removeDom).toBe(false)
        } finally {
            tree.destroy()
        }
    })
});
