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
                    {name: 'vip',     type: 'Boolean'},
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
              r1Record       = store.get('r1'),
              r1StatusCellId = body.getCellId(r1Record, 'status'),
              createdFnBtn   = body.createdCellComponents.get(r1StatusCellId),
              returnedCell   = body.vdom.cn[0].cn[0],
              createdCell    = body.vdom.cn[0].cn[1];

        expect(body.updateDepth).toBe(-1);
        expect(returnedCell.cn).toEqual([{componentId: fnBtn.id}]);
        expect(returnedCell.cn[0]).not.toBe(fnBtn.vdom);
        expect(createdFnBtn instanceof FunctionalButton).toBe(true);
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

    test('renderer returning a Neo config reuses record-keyed cell components across recordChange and sort without leaking omitted config keys (#4574 / #20364)', async () => {
        const receivedComponents = [];

        await createTable([{
            dataField: 'action',
            text     : 'Action (module)',
            renderer : ({component, record, value}) => {
                receivedComponents.push(component);
                return {
                    module: Button,
                    text  : value,
                    ...(record.vip && {iconCls: 'fa fa-star'})
                }
            }
        }, {
            dataField: 'status',
            text     : 'Status (ntype)',
            renderer : ({value}) => ({
                ntype: 'button',
                text : `Status: ${value}`
            })
        }], [
            {id: 'r1', action: 'Edit',   status: 'Open',   vip: true},
            {id: 'r2', action: 'Delete', status: 'Closed', vip: false}
        ]);

        const {body}         = table,
              r1Record       = store.get('r1'),
              r2Record       = store.get('r2'),
              r1ActionCellId = body.getCellId(r1Record, 'action'),
              r1StatusCellId = body.getCellId(r1Record, 'status'),
              r2ActionCellId = body.getCellId(r2Record, 'action'),
              r2StatusCellId = body.getCellId(r2Record, 'status');

        expect(body.createdCellComponents.size).toBe(4);
        expect(receivedComponents).toEqual([undefined, undefined]);

        const r1ActionBtn = body.createdCellComponents.get(r1ActionCellId),
              r1StatusBtn = body.createdCellComponents.get(r1StatusCellId),
              r2ActionBtn = body.createdCellComponents.get(r2ActionCellId),
              r2StatusBtn = body.createdCellComponents.get(r2StatusCellId);

        expect(r1ActionBtn instanceof Button).toBe(true);
        expect(r1ActionBtn.parentId).toBe(body.id);
        expect(r1ActionBtn.text).toBe('Edit');
        expect(r1ActionBtn.iconCls).toBe('fa fa-star');
        expect(r2ActionBtn.iconCls).toBeNull();
        expect(r1StatusBtn instanceof Button).toBe(true);
        expect(r1StatusBtn.text).toBe('Status: Open');

        expect(body.vdom.cn[0].cn[0].cn).toEqual([r1ActionBtn.createVdomReference()]);
        expect(body.vdom.cn[0].cn[1].cn).toEqual([r1StatusBtn.createVdomReference()]);

        // 1. Record change reuses the record's cell component in place and passes it as `component` to column.renderer
        r1Record.action = 'Save';

        expect(body.createdCellComponents.get(r1ActionCellId)).toBe(r1ActionBtn);
        expect(receivedComponents[2]).toBe(r1ActionBtn);
        expect(r1ActionBtn.isDestroyed).toBeFalsy();
        expect(r1ActionBtn.text).toBe('Save');

        // 2. Store sort reorders rows while keeping each record bound to its own cell component — omitted `iconCls` on r2 never inherits r1's star
        store.sort({property: 'id', direction: 'DESC'});

        expect(body.createdCellComponents.get(r1ActionCellId)).toBe(r1ActionBtn);
        expect(body.createdCellComponents.get(r2ActionCellId)).toBe(r2ActionBtn);
        expect(r1ActionBtn.isDestroyed).toBeFalsy();
        expect(r2ActionBtn.isDestroyed).toBeFalsy();
        expect(body.vdom.cn[0].cn[0].cn).toEqual([r2ActionBtn.createVdomReference()]);
        expect(body.vdom.cn[1].cn[0].cn).toEqual([r1ActionBtn.createVdomReference()]);
        expect(r2ActionBtn.text).toBe('Delete');
        expect(r2ActionBtn.iconCls).toBeNull();
        expect(r1ActionBtn.text).toBe('Save');
        expect(r1ActionBtn.iconCls).toBe('fa fa-star');
        expect(r2StatusBtn.text).toBe('Status: Closed');
        expect(r1StatusBtn.text).toBe('Status: Open');

        // 3. Mounted, theme, and windowId updates propagate to createdCellComponents
        body.mounted  = true;
        body.theme    = 'neo-theme-dark';
        body.windowId = 'window-2';

        expect(r1ActionBtn.mounted).toBe(true);
        expect(r1ActionBtn.theme).toBe('neo-theme-dark');
        expect(r1ActionBtn.windowId).toBe('window-2');

        body.mounted = false;
        expect(r1ActionBtn.mounted).toBe(false)
    });

    test('createdCellComponents are destroyed when replaced by primitive output, spanned over, removed by store reload, cleared, or when body destroys', async () => {
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
              r2Record       = store.get('r2'),
              r1ActionCellId = body.getCellId(r1Record, 'action'),
              r1StatusCellId = body.getCellId(r1Record, 'status'),
              r2ActionCellId = body.getCellId(r2Record, 'action'),
              r2StatusCellId = body.getCellId(r2Record, 'status'),
              r1ActionBtn    = body.createdCellComponents.get(r1ActionCellId),
              r1StatusBtn    = body.createdCellComponents.get(r1StatusCellId),
              r2ActionBtn    = body.createdCellComponents.get(r2ActionCellId),
              r2StatusBtn    = body.createdCellComponents.get(r2StatusCellId);

        expect(body.createdCellComponents.size).toBe(4);

        // 1. Colspan covering status column in r1 destroys r1StatusBtn
        r1Record.colspan = {action: 2};
        expect(r1StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r1StatusCellId)).toBe(false);

        // 2. Switching renderer output from config to primitive string destroys r1ActionBtn on recordChange
        useConfig       = false;
        r1Record.action = 'PlainText';
        expect(r1ActionBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r1ActionCellId)).toBe(false);
        expect(body.vdom.cn[0].cn[0].html).toBe('PlainText');

        // 3. Re-rendering createViewData with a single replacement record destroys r2's components while creating the new record's status component
        store.data = [{id: 'r1', action: 'PlainText', status: 'StillOpen'}];
        expect(r2ActionBtn.isDestroyed).toBe(true);
        expect(r2StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r2StatusCellId)).toBe(false);

        const newR1StatusCellId = body.getCellId(store.get('r1'), 'status'),
              newR1StatusBtn    = body.createdCellComponents.get(newR1StatusCellId);
        expect(newR1StatusBtn instanceof Button).toBe(true);
        expect(newR1StatusBtn.isDestroyed).toBeFalsy();
        expect(newR1StatusBtn.text).toBe('StillOpen');

        // 4. Clearing all rows via onStoreLoad({items: []}) destroys remaining created components
        body.onStoreLoad({items: []});
        expect(newR1StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.size).toBe(0);

        // 5. Re-populating and destroying the table destroys any active created components
        body.createViewData();
        const finalStatusBtn = body.createdCellComponents.get(newR1StatusCellId);
        expect(finalStatusBtn.isDestroyed).toBeFalsy();

        table.destroy();
        table = null;
        expect(finalStatusBtn.isDestroyed).toBe(true)
    })
});
