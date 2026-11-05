import {setup} from '../../setup.mjs';

const appName = 'TableBodyRendererInstancesTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Button           from '../../../../src/button/Base.mjs';
import CoreBase         from '../../../../src/core/Base.mjs';
import FunctionalButton from '../../../../src/functional/button/Base.mjs';
import Model            from '../../../../src/data/Model.mjs';
import Store            from '../../../../src/data/Store.mjs';
import TableContainer   from '../../../../src/table/Container.mjs';
import TreeBuilder      from '../../../../src/util/vdom/TreeBuilder.mjs';
import '../../../../src/manager/Instance.mjs';

class CustomVdomInstance extends CoreBase {
    static config = {
        className: 'Test.Unit.Table.BodyRendererInstances.CustomVdomInstance'
    }

    vdom = {tag: 'span', cls: ['custom-vdom-node'], text: 'custom'}
}

Neo.setupClass(CustomVdomInstance);

test.describe('Neo.table.Body#applyRendererOutput Neo instances and configs (#4574)', () => {
    let externalInstances = [],
        store,
        table;

    test.afterEach(() => {
        externalInstances.forEach(instance => {
            if (!instance.isDestroyed) {
                instance.destroy()
            }
        });
        externalInstances = [];

        table?.destroy();
        table = null;

        store?.destroy();
        store = null
    });

    async function createTable(columns, items) {
        store = Neo.create(Store, {
            keyProperty: 'id',
            model      : {
                module: Model,
                fields: [
                    {name: 'id',      type: 'String'},
                    {name: 'action',  type: 'String'},
                    {name: 'status',  type: 'String'},
                    {name: 'colspan', type: 'Object'}
                ]
            },
            data: items || [
                {id: 'r1', action: 'Edit',   status: 'Open'},
                {id: 'r2', action: 'Delete', status: 'Closed'}
            ]
        });

        table = Neo.create(TableContainer, {
            appName,
            store,
            columns
        });

        await Promise.resolve();

        return table
    }

    test('renderer returning a Neo.component.Base instance embeds its VDOM reference and sets updateDepth = -1', async () => {
        const button = Neo.create(Button, {
            appName,
            text: 'External Button'
        });
        externalInstances.push(button);

        await createTable([{
            dataField: 'action',
            text     : 'Action',
            renderer : () => button
        }], [{id: 'r1', action: 'Edit', status: 'Open'}]);

        const {body} = table,
              cell   = body.vdom.cn[0].cn[0];

        expect(body.updateDepth).toBe(-1);
        expect(cell.cn).toEqual([button.createVdomReference()]);

        const expandedTree = TreeBuilder.getVdomTree(body.vdom, body.updateDepth);
        expect(expandedTree.cn[0].cn[0].cn[0].id).toBe(button.id);
        expect(expandedTree.cn[0].cn[0].cn[0].tag).toBe('button')
    });

    test('renderer returning or creating a functional component (Neo.component.Abstract) embeds createVdomReference()', async () => {
        const fnBtn = Neo.create(FunctionalButton, {
            appName,
            text: 'Returned Functional Button'
        });
        externalInstances.push(fnBtn);

        await createTable([{
            dataField: 'action',
            text     : 'Action (returned functional)',
            renderer : () => fnBtn
        }, {
            dataField: 'status',
            text     : 'Status (config functional)',
            renderer : ({value}) => ({
                module: FunctionalButton,
                text  : value
            })
        }], [{id: 'r1', action: 'Edit', status: 'Open'}]);

        const {body}         = table,
              r1StatusSlotId = body.getCellComponentId(0, 'status'),
              createdFnBtn   = body.createdCellComponents.get(r1StatusSlotId),
              returnedCell   = body.vdom.cn[0].cn[0],
              createdCell    = body.vdom.cn[0].cn[1];

        expect(body.updateDepth).toBe(-1);
        expect(returnedCell.cn).toEqual([{componentId: fnBtn.id}]);
        expect(returnedCell.cn[0]).not.toBe(fnBtn.vdom);
        expect(createdFnBtn instanceof FunctionalButton).toBe(true);
        expect(createdFnBtn.id).toBe(r1StatusSlotId);
        expect(createdCell.cn).toEqual([{componentId: createdFnBtn.id}]);
        expect(createdCell.cn[0]).not.toBe(createdFnBtn.vdom)
    });

    test('renderer returning a non-component Neo.core.Base instance embeds its vdom directly', async () => {
        const customInstance = Neo.create(CustomVdomInstance);
        externalInstances.push(customInstance);

        await createTable([{
            dataField: 'action',
            text     : 'Action',
            renderer : () => customInstance
        }], [{id: 'r1', action: 'Edit', status: 'Open'}]);

        const {body} = table,
              cell   = body.vdom.cn[0].cn[0];

        expect(body.updateDepth).toBe(-1);
        expect(cell.cn).toEqual([customInstance.vdom])
    });

    test('renderer returning a Neo config rotates slot components by rowIndex across recordChange, sort, and store reload (#6529 / #20364)', async () => {
        const receivedComponents = [];

        await createTable([{
            dataField: 'action',
            text     : 'Action (module)',
            renderer : ({component, value}) => {
                receivedComponents.push(component);
                return {
                    module: Button,
                    text  : value
                }
            }
        }, {
            dataField: 'status',
            text     : 'Status (ntype)',
            renderer : ({value}) => ({
                ntype: 'button',
                text : `Status: ${value}`
            })
        }]);

        const {body}         = table,
              r1Record       = store.get('r1'),
              row0ActionSlot = body.getCellComponentId(0, 'action'),
              row0StatusSlot = body.getCellComponentId(0, 'status'),
              row1ActionSlot = body.getCellComponentId(1, 'action'),
              row1StatusSlot = body.getCellComponentId(1, 'status');

        expect(body.createdCellComponents.size).toBe(4);
        // Initial render had no prior created component for row 0 / row 1 action slots
        expect(receivedComponents).toEqual([undefined, undefined]);

        const row0ActionBtn = body.createdCellComponents.get(row0ActionSlot),
              row0StatusBtn = body.createdCellComponents.get(row0StatusSlot),
              row1ActionBtn = body.createdCellComponents.get(row1ActionSlot),
              row1StatusBtn = body.createdCellComponents.get(row1StatusSlot);

        expect(row0ActionBtn instanceof Button).toBe(true);
        expect(row0ActionBtn.id).toBe(row0ActionSlot);
        expect(row0ActionBtn.parentId).toBe(body.id);
        expect(row0ActionBtn.text).toBe('Edit');
        expect(row0StatusBtn instanceof Button).toBe(true);
        expect(row0StatusBtn.text).toBe('Status: Open');

        expect(body.vdom.cn[0].cn[0].cn).toEqual([row0ActionBtn.createVdomReference()]);
        expect(body.vdom.cn[0].cn[1].cn).toEqual([row0StatusBtn.createVdomReference()]);

        // 1. Record change reuses the same slot component in place and passes it as `component` to column.renderer
        r1Record.action = 'Save';

        expect(body.createdCellComponents.get(row0ActionSlot)).toBe(row0ActionBtn);
        expect(receivedComponents[2]).toBe(row0ActionBtn);
        expect(row0ActionBtn.isDestroyed).toBeFalsy();
        expect(row0ActionBtn.text).toBe('Save');

        // 2. Store sort rotates existing row-slot components onto the newly ordered records without destroying them
        store.sort({property: 'id', direction: 'DESC'});

        expect(body.createdCellComponents.get(row0ActionSlot)).toBe(row0ActionBtn);
        expect(body.createdCellComponents.get(row1ActionSlot)).toBe(row1ActionBtn);
        expect(row0ActionBtn.isDestroyed).toBeFalsy();
        expect(row1ActionBtn.isDestroyed).toBeFalsy();
        expect(row0ActionBtn.text).toBe('Delete');
        expect(row1ActionBtn.text).toBe('Save');
        expect(row0StatusBtn.text).toBe('Status: Closed');
        expect(row1StatusBtn.text).toBe('Status: Open');

        // 3. Store page/dataset reload with brand-new record IDs rotates existing slot components in place (preserving active DESC sort: r20 at row 0, r10 at row 1)
        store.data = [
            {id: 'r10', action: 'Approve', status: 'Pending'},
            {id: 'r20', action: 'Archive', status: 'Done'}
        ];

        expect(body.createdCellComponents.get(row0ActionSlot)).toBe(row0ActionBtn);
        expect(body.createdCellComponents.get(row1ActionSlot)).toBe(row1ActionBtn);
        expect(row0ActionBtn.isDestroyed).toBeFalsy();
        expect(row1ActionBtn.isDestroyed).toBeFalsy();
        expect(row0ActionBtn.text).toBe('Archive');
        expect(row1ActionBtn.text).toBe('Approve');
        expect(row0StatusBtn.text).toBe('Status: Done');
        expect(row1StatusBtn.text).toBe('Status: Pending');

        // 4. Mounted, theme, and windowId updates propagate to createdCellComponents
        body.mounted  = true;
        body.theme    = 'neo-theme-dark';
        body.windowId = 'window-2';

        expect(row0ActionBtn.mounted).toBe(true);
        expect(row0ActionBtn.theme).toBe('neo-theme-dark');
        expect(row0ActionBtn.windowId).toBe('window-2');

        body.mounted = false;
        expect(row0ActionBtn.mounted).toBe(false)
    });

    test('createdCellComponents rotate surviving slots when row count shrinks and destroy when replaced by primitive output, spanned over, cleared, or when body destroys', async () => {
        let useConfig = true;

        await createTable([{
            dataField: 'action',
            text     : 'Action',
            renderer : ({value}) => useConfig ? {className: 'Neo.button.Base', text: value} : value
        }, {
            dataField: 'status',
            text     : 'Status',
            renderer : ({value}) => ({ntype: 'button', text: value})
        }]);

        await table.body.initVnode();

        const {body}         = table,
              r1Record       = store.get('r1'),
              row0ActionSlot = body.getCellComponentId(0, 'action'),
              row0StatusSlot = body.getCellComponentId(0, 'status'),
              row1ActionSlot = body.getCellComponentId(1, 'action'),
              row1StatusSlot = body.getCellComponentId(1, 'status'),
              r1ActionBtn    = body.createdCellComponents.get(row0ActionSlot),
              r1StatusBtn    = body.createdCellComponents.get(row0StatusSlot),
              r2ActionBtn    = body.createdCellComponents.get(row1ActionSlot),
              r2StatusBtn    = body.createdCellComponents.get(row1StatusSlot);

        expect(body.createdCellComponents.size).toBe(4);

        // 1. Colspan covering status column in row 0 destroys r1StatusBtn
        r1Record.colspan = {action: 2};
        expect(r1StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(row0StatusSlot)).toBe(false);

        // 2. Switching renderer output from config to primitive string destroys r1ActionBtn on recordChange
        useConfig       = false;
        r1Record.action = 'PlainText';
        expect(r1ActionBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(row0ActionSlot)).toBe(false);
        expect(body.vdom.cn[0].cn[0].html).toBe('PlainText');

        // 3. Re-rendering createViewData with a single record destroys excess row 1 slots while creating/rotating row 0 status slot
        store.data = [{id: 'r99', action: 'PlainText', status: 'StillOpen'}];
        expect(r2ActionBtn.isDestroyed).toBe(true);
        expect(r2StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(row1StatusSlot)).toBe(false);

        const newR1StatusBtn = body.createdCellComponents.get(row0StatusSlot);
        expect(newR1StatusBtn instanceof Button).toBe(true);
        expect(newR1StatusBtn.isDestroyed).toBeFalsy();
        expect(newR1StatusBtn.text).toBe('StillOpen');

        // 4. Clearing all rows via onStoreLoad({items: []}) destroys remaining created components
        body.onStoreLoad({items: []});
        expect(newR1StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.size).toBe(0);

        // 5. Re-populating and destroying the table destroys any active created components
        body.createViewData();
        const finalStatusBtn = body.createdCellComponents.get(row0StatusSlot);
        expect(finalStatusBtn.isDestroyed).toBeFalsy();

        table.destroy();
        table = null;
        expect(finalStatusBtn.isDestroyed).toBe(true)
    })
});
