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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Grid Dynamic Column Updates', () => {
    let grid, store;

    test.beforeEach(async () => {
        // Mock Neo.applyDeltas
        Neo.applyDeltas = async () => {};

        // Mock Neo.main and Neo.currentWorker
        Neo.main = {
            addon: {
                DragDrop: {},
                ResizeObserver: {
                    register  : () => {},
                    unregister: () => {}
                }
            },
            DomAccess: {
                getBoundingClientRect: async ({id}) => {
                    const rect = {width: 600, height: 400, x: 0, y: 0};
                    if (Array.isArray(id)) {
                        return id.map(() => rect);
                    }
                    return rect;
                },
                scrollIntoView: async () => {},
                scrollTo      : async () => {}
            }
        };

        Neo.currentWorker = {
            getAddon: async () => ({
                register  : () => {},
                unregister: () => {}
            }),
            insertThemeFiles: () => {},
            on              : () => {},
            promiseMessage  : async () => {}
        };

        Neo.worker = Neo.worker || {};
        Neo.worker.App = {
            promiseMessage: async () => {}
        };

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
            store    : store,
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
        await grid.timeout(20);
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
});
