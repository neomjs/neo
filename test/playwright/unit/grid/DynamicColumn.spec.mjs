/**
 * @file test/playwright/unit/grid/DynamicColumn.spec.mjs
 * @summary Unit test to reproduce the GridBody regression where dynamic column `dataField` changes break horizontal scrolling.
 *
 * This test verifies that `Neo.grid.Body` correctly updates its internal `columnPositions` map
 * when a column's `dataField` is modified at runtime (e.g. switching from 'y2020' to 'c2020').
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
        name             : 'GridDynamicColumnTest',
        vnodeInitialising: false
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import InstanceManager      from '../../../../src/manager/Instance.mjs';
import BaseColumn           from '../../../../src/grid/column/Base.mjs';
import GridContainer        from '../../../../src/grid/Container.mjs';
import HeaderButton         from '../../../../src/grid/header/Button.mjs';
import Store                from '../../../../src/data/Store.mjs';
import VdomHelper           from '../../../../src/vdom/Helper.mjs';
import VNodeUtil            from '../../../../src/util/VNode.mjs';
import BigDataGridContainer from '../../../../examples/grid/bigData/GridContainer.mjs';
import BigDataMainStore     from '../../../../examples/grid/bigData/MainStore.mjs';

class MyColumn extends BaseColumn {
    static config = {
        className: 'Test.Unit.Grid.DynamicColumn.MyColumn',
        type     : 'myCustomColumn'
    }
}

MyColumn = Neo.setupClass(MyColumn);

test.describe('Grid Dynamic Column Updates', () => {
    let grid, store;

    test.beforeEach(async () => {
        const data = [];
        for (let i = 0; i < 20; i++) {
            data.push({
                id: i,
                name: `User ${i}`,
                y2020: 100 + i,
                c2020: 10 + i,
                zEnd : 999
            });
        }

        store = Neo.create(Store, {
            keyProperty: 'id',
            data,
            model: {
                fields: [
                    {name: 'id',    type: 'Integer'},
                    {name: 'name',  type: 'String'},
                    {name: 'y2020', type: 'Integer'},
                    {name: 'c2020', type: 'Integer'},
                    {name: 'zEnd',  type: 'Integer'}
                ]
            }
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridDynamicColumnTest',
            height   : 400,
            width    : 300, // Constrained width to force scrolling
            store,
            rowHeight: 40,
            bufferColumnRange: 1,
            columns  : [{
                dataField: 'id',
                text     : 'ID',
                width    : 50
            }, {
                dataField: 'name',
                text     : 'Name',
                width    : 100
            }, {
                dataField: 'y2020',
                text     : '2020',
                width    : 100
            }, {
                dataField: 'zEnd',
                text     : 'End',
                width    : 50
            }]
        });

        await grid.initVnode();
        grid.mounted = true;

        // Manually setup column positions (normally done by HeaderToolbar)
        // Initial State: ID(0-50), Name(50-150), y2020(150-250), zEnd(250-300)
        const colPos = [
            {dataField: 'id',    width: 50,  x: 0},
            {dataField: 'name',  width: 100, x: 50},
            {dataField: 'y2020', width: 100, x: 150},
            {dataField: 'zEnd',  width: 50,  x: 250}
        ];

        grid.body.columnPositions.clear();
        grid.body.columnPositions.add(colPos);

        grid.body.set({
            availableHeight: 400 - 40,
            containerWidth : 300
        });

        await grid.timeout(50);
    });

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy();
    });

    test('Changing dataField should preserve column order', async () => {
        const body = grid.body;

        // 1. Verify Initial Order
        // Index 2 should be y2020
        expect(body.columnPositions.getAt(2).dataField).toBe('y2020');
        expect(body.columnPositions.getAt(3).dataField).toBe('zEnd');

        // 2. Simulate Data Mode Switch
        const yearColumn = grid.columns.items[2];
        const oldDataField = 'y2020';
        const newDataField = 'c2020';

        // This triggers Column.afterSetDataField -> colPositions.remove() -> add()
        yearColumn.dataField = newDataField;

        // 3. Verify Map Update (Should work)
        const positions = body.columnPositions;
        expect(positions.get(oldDataField)).toBeNull();
        expect(positions.get(newDataField)).toBeDefined();

        // 4. Verify ORDER PRESERVATION (This is the bug)
        // With current implementation, 'add()' pushes to end.
        // So 'c2020' moves to index 3. 'zEnd' shifts to index 2.
        // WE WANT: c2020 at index 2.

        const index2 = positions.getAt(2).dataField;
        const index3 = positions.getAt(3).dataField;

        // If bug exists: index2 = 'zEnd', index3 = 'c2020'
        // If fix works:  index2 = 'c2020', index3 = 'zEnd'
        expect(index2).toBe(newDataField);
        expect(index3).toBe('zEnd');
    });

    test('Changing dataField re-keys grid.columns without changing its order (#20673)', () => {
        const columns = grid.columns,
              items   = [...columns.items],
              column  = items[2];

        expect(columns.get('y2020')).toBe(column);
        expect(columns.get('c2020')).toBeNull();

        column.dataField = 'c2020';

        expect(columns.get('c2020')).toBe(column);
        expect(columns.get('y2020')).toBeNull();
        expect(columns.count).toBe(items.length);
        items.forEach((item, index) => expect(columns.items[index]).toBe(item))
    });

    for (const visible of [true, false]) {
        test(`Changing dataField re-keys ${visible ? 'visible' : 'filtered-out'} columns in allItems (#20673)`, () => {
            const columns = grid.columns,
                  items   = [...columns.items],
                  column  = items[2];

            columns.filters = [{property: 'text', value: visible ? '2020' : 'Name'}];

            expect(columns.get('y2020')).toBe(visible ? column : null);
            expect(columns.allItems.get('y2020')).toBe(column);

            column.dataField = 'c2020';

            expect(columns.get('c2020')).toBe(visible ? column : null);
            expect(columns.get('y2020')).toBeNull();
            expect(columns.allItems.get('c2020')).toBe(column);
            expect(columns.allItems.get('y2020')).toBeNull();
            expect(columns.allItems.count).toBe(items.length);
            items.forEach((item, index) => expect(columns.allItems.items[index]).toBe(item));

            columns.clearFilters();

            expect(columns.get('c2020')).toBe(column);
            expect(columns.get('y2020')).toBeNull();
            expect(columns.count).toBe(items.length);
            items.forEach((item, index) => expect(columns.items[index]).toBe(item))
        })
    }

    test('Replacing grid.columns at runtime destroys old Column & Button instances and skips intermediate onColumnsMutate', async () => {
        const oldColumnIds = grid.columns.items.map(col => col.id);
        const oldButtonIds = grid.headerToolbar.items.map(btn => btn.id);

        let   mutateCalls         = 0;
        const origOnColumnsMutate = grid.onColumnsMutate.bind(grid);
        grid.onColumnsMutate = data => {
            mutateCalls++;
            return origOnColumnsMutate(data)
        };

        grid.columns = [
            {dataField: 'id',   text: 'ID',   width: 60},
            {dataField: 'name', text: 'Name', width: 120}
        ];

        expect(mutateCalls).toBe(0);
        expect(grid.columns.count).toBe(2);
        expect(grid.headerToolbar.items.length).toBe(2);
        expect(grid.getAriaRoot()['aria-colcount']).toBe(2);
        expect(() => VNodeUtil.createMap(grid.vnode)).not.toThrow();

        for (const id of oldColumnIds) {
            expect(InstanceManager.get(id)).toBeNull()
        }

        for (const id of oldButtonIds) {
            expect(InstanceManager.get(id)).toBeNull()
        }

        const remainingColumnIds = grid.columns.items.map(col => col.id);
        const collectionId       = grid.columns.id;

        grid.destroy();
        grid = null;

        for (const id of remainingColumnIds) {
            expect(InstanceManager.get(id)).toBeNull()
        }

        expect(InstanceManager.get(collectionId)).toBeNull()
    });

    test('examples/grid/bigData GridContainer and MainStore update columns before store data and use clearSilent', async () => {
        const bigStore = Neo.create(BigDataMainStore, {
            amountColumns: 10,
            amountRows   : 5
        });

        const bigGrid = Neo.create(BigDataGridContainer, {
            appName      : 'GridDynamicColumnTest',
            amountColumns: 10,
            store        : bigStore
        });

        let clearCalls         = 0,
            columnsCountAtLoad = null;
        const origClear       = bigStore.clear.bind(bigStore),
              origClearSilent = bigStore.clearSilent.bind(bigStore);
        let   clearSilentCalled = 0;

        bigStore.clear = (...args) => {
            clearCalls++;
            return origClear(...args)
        };
        bigStore.clearSilent = (...args) => {
            clearSilentCalled++;
            return origClearSilent(...args)
        };
        bigStore.on('load', () => {
            columnsCountAtLoad = bigGrid.columns.count
        });

        bigGrid.amountColumns = 15;

        expect(clearCalls).toBe(0);
        expect(clearSilentCalled).toBe(1);
        expect(columnsCountAtLoad).toBe(bigGrid.columns.count);
        expect(columnsCountAtLoad).toBeGreaterThan(11);
        expect(bigStore.count).toBe(5);

        bigStore.amountRows = 8;

        expect(clearCalls).toBe(0);
        expect(clearSilentCalled).toBe(2);
        expect(bigStore.count).toBe(8);

        bigGrid.destroy();
        bigStore.destroy()
    });

    test('Column config module creates external column class, keeps HeaderButton, wins over type, and survives runtime columns replacement (#20256)', async () => {
        expect(Object.values(GridContainer.columnTypes)).not.toContain(MyColumn);

        const moduleGrid = Neo.create(GridContainer, {
            appName: 'GridDynamicColumnTest',
            store,
            columns: [{
                module   : MyColumn,
                dataField: 'name',
                text     : 'Custom Name'
            }, {
                module   : MyColumn,
                type     : 'index',
                dataField: 'y2020',
                text     : 'Module Wins Over Type'
            }, {
                type     : 'index',
                dataField: 'id',
                text     : '#'
            }]
        });

        const [col0, col1, col2] = moduleGrid.columns.items;
        const [btn0, btn1, btn2] = moduleGrid.headerToolbar.items;

        expect(col0).toBeInstanceOf(MyColumn);
        expect(col0.module).toBeNull();
        expect(col1).toBeInstanceOf(MyColumn);
        expect(col2).toBeInstanceOf(GridContainer.columnTypes.index);

        expect(btn0).toBeInstanceOf(HeaderButton);
        expect(btn0).not.toBeInstanceOf(MyColumn);
        expect(btn1).toBeInstanceOf(HeaderButton);
        expect(btn2).toBeInstanceOf(HeaderButton);

        moduleGrid.columns = [{
            module   : MyColumn,
            dataField: 'zEnd',
            text     : 'Replaced Custom'
        }, {
            dataField: 'name',
            text     : 'Default Column'
        }];

        expect(moduleGrid.columns.items[0]).toBeInstanceOf(MyColumn);
        expect(moduleGrid.columns.items[1]).toBeInstanceOf(BaseColumn);
        expect(moduleGrid.columns.items[1]).not.toBeInstanceOf(MyColumn);
        expect(moduleGrid.headerToolbar.items[0]).toBeInstanceOf(HeaderButton);
        expect(moduleGrid.headerToolbar.items[0]).not.toBeInstanceOf(MyColumn);

        moduleGrid.destroy()
    });

    test('Destroying a freshly created GridContainer or HeaderButton before Resizable import resolves does not write plugins after destroy (#20270)', async () => {
        const warnings = [];
        const origWarn = console.warn;

        console.warn = (...args) => {
            warnings.push(args.join(' '));
            return origWarn.apply(console, args)
        };

        try {
            const transientGrid = Neo.create(GridContainer, {
                appName: 'GridDynamicColumnTest',
                store,
                columns: [
                    {dataField: 'name', text: 'Col A'},
                    {dataField: 'y2020', text: 'Col B'}
                ]
            });

            const buttons = [...transientGrid.headerToolbar.items];
            transientGrid.destroy();

            await import('../../../../src/grid/header/plugin/Resizable.mjs');
            await new Promise(resolve => setTimeout(resolve, 0));

            for (const btn of buttons) {
                expect(btn.isDestroyed).toBe(true);
                expect(btn.plugins).toBeNull()
            }

            expect(warnings.filter(w => w.includes("'plugins' was set after destroy()"))).toEqual([])
        } finally {
            console.warn = origWarn
        }
    });
});
