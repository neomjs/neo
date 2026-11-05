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

    test('renderer returning a Neo config (module, ntype, or className) creates, reuses on recordChange, and forwards theme/windowId', async () => {
        await createTable([{
            dataField: 'action',
            text     : 'Action (module)',
            renderer : ({value}) => ({
                module: Button,
                text  : value
            })
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
              r1ActionCellId = body.getCellId(r1Record, 'action'),
              r1StatusCellId = body.getCellId(r1Record, 'status');

        expect(body.createdCellComponents.size).toBe(4);

        const actionBtn = body.createdCellComponents.get(r1ActionCellId),
              statusBtn = body.createdCellComponents.get(r1StatusCellId);

        expect(actionBtn instanceof Button).toBe(true);
        expect(actionBtn.parentId).toBe(body.id);
        expect(actionBtn.text).toBe('Edit');
        expect(statusBtn instanceof Button).toBe(true);
        expect(statusBtn.text).toBe('Status: Open');

        expect(body.vdom.cn[0].cn[0].cn).toEqual([actionBtn.createVdomReference()]);
        expect(body.vdom.cn[0].cn[1].cn).toEqual([statusBtn.createVdomReference()]);

        // Record change reuses the same component instance in place without leaking a new one
        r1Record.action = 'Save';

        expect(body.createdCellComponents.get(r1ActionCellId)).toBe(actionBtn);
        expect(actionBtn.isDestroyed).toBeFalsy();
        expect(actionBtn.text).toBe('Save');

        // Theme and windowId updates propagate to createdCellComponents
        body.theme    = 'neo-theme-dark';
        body.windowId = 'window-2';

        expect(actionBtn.theme).toBe('neo-theme-dark');
        expect(actionBtn.windowId).toBe('window-2')
    });

    test('createdCellComponents are destroyed when replaced by primitive output, spanned over, filtered out, cleared, or when body destroys', async () => {
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

        // 1. Colspan covering status column in row 1 destroys r1StatusBtn
        r1Record.colspan = {action: 2};
        expect(r1StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r1StatusCellId)).toBe(false);

        // 2. Switching renderer output from config to primitive string destroys r1ActionBtn on recordChange
        useConfig       = false;
        r1Record.action = 'PlainText';
        expect(r1ActionBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r1ActionCellId)).toBe(false);
        expect(body.vdom.cn[0].cn[0].html).toBe('PlainText');

        // 3. Re-rendering createViewData with a single record destroys r2StatusBtn
        store.data = [{id: 'r1', action: 'PlainText', status: 'StillOpen'}];
        expect(r2ActionBtn.isDestroyed).toBe(true);
        expect(r2StatusBtn.isDestroyed).toBe(true);
        expect(body.createdCellComponents.has(r2StatusCellId)).toBe(false);

        const newR1StatusCellId = body.getCellId(store.get('r1'), 'status'),
              newR1StatusBtn    = body.createdCellComponents.get(newR1StatusCellId);
        expect(newR1StatusBtn instanceof Button).toBe(true);
        expect(newR1StatusBtn.isDestroyed).toBeFalsy();

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
