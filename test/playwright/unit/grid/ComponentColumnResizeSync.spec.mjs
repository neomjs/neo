/**
 * @file test/playwright/unit/grid/ComponentColumnResizeSync.spec.mjs
 * @summary Header→cell width sync for COMPONENT columns, on a virtualized body.
 *
 * `ColumnResizeCellSync.spec.mjs` covers the same path with three plain px columns on a body with
 * default buffering. This fixture carries the shape that combination never reaches: a
 * `type: 'component'` column, both axes buffered at range 1, and columns assigned AFTER construct.
 *
 * @see Neo.grid.header.Toolbar
 * @see Neo.grid.column.Component
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridComponentColumnResizeTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/**
 * @param {Neo.grid.Body} body
 * @param {String} dataField
 * @returns {Object|null}
 */
function getCellStyle(body, dataField) {
    const row = body.items[0];

    return row?.vdom.cn.find(cell => cell.data?.field === dataField)?.style || null
}

test.describe('grid component columns — resize reaches cells on a buffered body', () => {
    let grid, store;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            data: Array.from({length: 200}, (_, i) => ({
                id: i + 1, login: `user${i}`, impact: i, total: i * 10
            })),
            model: {
                fields: [
                    {name: 'id',     type: 'Integer'},
                    {name: 'login',  type: 'String'},
                    {name: 'impact', type: 'Integer'},
                    {name: 'total',  type: 'Integer'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridComponentColumnResizeTest',
            height   : 400,
            width    : 600,
            store,
            rowHeight: 40,
            // The buffering shape this regression came from: both axes on, range 1.
            body          : {bufferColumnRange: 1, bufferRowRange: 1},
            columnDefaults: {width: 150}
        });

        // The app this regression came from built its columns in `construct()`, AFTER
        // `super.construct()`, by assigning `this.columns`. The column set therefore replaces one
        // the toolbar has already seen.
        grid.columns = [
            {dataField: 'login', text: 'User', width: 250, type: 'component', component: ({record}) => ({
                module: Component,
                html  : record.login
            })},
            {dataField: 'impact', text: 'Impact', width: 100},
            {dataField: 'total',  text: 'Total',  width: 100}
        ];

        await grid.initVnode();
        grid.mounted = true;

        grid.body.set({availableHeight: 360, containerWidth: 600});

        grid.headerToolbar.getLayoutRect = async () => {
            let x = 0;

            return grid.headerToolbar.items.map(item => {
                const rect = {height: 40, width: item.width, x, y: 0};

                x += item.width;

                return rect
            })
        };

        await grid.headerToolbar.passSizeToBody();
        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('the toolbar owns the columns assigned after construct', () => {
        expect(grid.headerToolbar.items.length).toBe(3);
        expect(grid.headerToolbar.getColumn('login')).toBeTruthy()
    });

    test('growing a component column moves its cells and shifts the neighbour', async () => {
        const {body, headerToolbar} = grid;

        headerToolbar.getColumn('login').width = 400;

        await headerToolbar.passSizeToBody();
        await grid.timeout(20);

        expect(getCellStyle(body, 'login').width).toBe('400px');
        expect(getCellStyle(body, 'impact').left).toBe('400px')
    });

    test('the LIVE drag path updates a component column cell', async () => {
        // `grid.header.plugin.Resizable#onDragMove` does not call `passSizeToBody()` per frame — it
        // calls `body.updateCellPositions(dataField, width)` directly. That is the path a real
        // resize drag takes, and it is the one the existing fixture never exercises.
        const {body} = grid;

        body.updateCellPositions('login', 400);
        await grid.timeout(20);

        expect(getCellStyle(body, 'login').width).toBe('400px')
    });

    test('shrinking a component column pulls the cells back in', async () => {
        const {body, headerToolbar} = grid;

        headerToolbar.getColumn('login').width = 120;

        await headerToolbar.passSizeToBody();
        await grid.timeout(20);

        expect(getCellStyle(body, 'login').width).toBe('120px');
        expect(getCellStyle(body, 'impact').left).toBe('120px')
    })
});
