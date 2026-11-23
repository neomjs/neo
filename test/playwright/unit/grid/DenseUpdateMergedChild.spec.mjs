/**
 * @file test/playwright/unit/grid/DenseUpdateMergedChild.spec.mjs
 * @summary Verifies that silent child VDOM writes in `grid.header.Toolbar#afterSetSortable` and
 * `grid.Body#updateCellPositions` still ship to every header and row vnode when a single child's own
 * reactive update merges into the same render cycle (`denseUpdate = true`).
 *
 * @see Neo.grid.header.Toolbar#afterSetSortable
 * @see Neo.grid.Body#updateCellPositions
 * @see Neo.mixin.VdomLifecycle#denseUpdate
 */

import {setup} from '../../setup.mjs';

const appName = 'GridDenseUpdateMergedChildTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * Mounts a multi-column grid with rendered rows and mocked fixed-width header rects.
 * @param {Neo.data.Store} store
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store) {
    const grid = Neo.create(GridContainer, {
        appName,
        columns  : [
            {dataField: 'id',   text: 'ID',   width: 80},
            {dataField: 'name', text: 'Name', width: 200},
            {dataField: 'city', text: 'City', width: 120}
        ],
        height   : 400,
        rowHeight: 40,
        store,
        width    : 600
    });

    await grid.initVnode();
    grid.mounted = true;

    grid.headerToolbar.getLayoutRect = async () => {
        let x = 0;

        return grid.headerToolbar.items.map(item => {
            const rect = {height: 40, width: item.width, x, y: 0};
            x += item.width;
            return rect
        })
    };

    await grid.headerToolbar.passSizeToBody();
    grid.body.set({availableHeight: 360, containerWidth: 600});
    await grid.timeout(50);

    return grid
}

test.describe('Grid denseUpdate across silent child VDOM writes', () => {
    let grid, store;

    test.beforeEach(() => {
        grid  = null;
        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : Array.from({length: 12}, (_, index) => ({
                city: `City ${index}`,
                id  : index,
                name: `Row ${index}`
            })),
            model      : {
                fields: [
                    {name: 'city', type: 'String'},
                    {name: 'id',   type: 'Integer'},
                    {name: 'name', type: 'String'}
                ]
            }
        })
    });

    test.afterEach(async () => {
        await grid?.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('toggling headerToolbar.sortable in the same pass as a single header update ships neo-sort-hidden to every header vnode', async () => {
        grid = await createGrid(store);

        const {headerToolbar} = grid,
              cityButton      = headerToolbar.getColumn('city');

        // Settle initial render so updateDepth resets from -1 to its default before testing merged cycles
        await headerToolbar.promiseUpdate();

        // Silent child writes across all headers + one header's own reactive update in the same synchronous pass
        headerToolbar.sortable = false;
        cityButton.text        = 'Town';

        await expect.poll(() => [headerToolbar, ...headerToolbar.items].every(
            item => !item.isVdomUpdating && !item.needsVdomUpdate
        )).toBe(true);

        for (const button of headerToolbar.items) {
            expect(
                button.vnode.className,
                `header "${button.dataField}" vnode carries neo-sort-hidden`
            ).toContain('neo-sort-hidden')
        }

        // And toggling sortable back on while another header updates removes neo-sort-hidden across every header vnode
        headerToolbar.sortable = true;
        cityButton.text        = 'City';

        await expect.poll(() => [headerToolbar, ...headerToolbar.items].every(
            item => !item.isVdomUpdating && !item.needsVdomUpdate
        )).toBe(true);

        for (const button of headerToolbar.items) {
            expect(
                button.vnode.className || [],
                `header "${button.dataField}" vnode drops neo-sort-hidden`
            ).not.toContain('neo-sort-hidden')
        }
    });

    test('body.updateCellPositions in the same pass as a single record update ships the new cell width and neighbour offset to every rendered row vnode', async () => {
        grid = await createGrid(store);

        const {body}       = grid,
              renderedRows = () => body.items.filter(row => row.record && row.vnode?.childNodes?.length);

        // Settle initial render so body.updateDepth resets from -1 before testing merged cycles
        await body.promiseUpdate();
        expect(renderedRows().length).toBeGreaterThanOrEqual(8);

        // Live column-resize call + single row record mutation in the same synchronous pass
        body.updateCellPositions('name', 333);
        store.get(3).city = 'Changed';

        await expect.poll(() => [body, ...body.items].every(
            item => !item.isVdomUpdating && !item.needsVdomUpdate
        )).toBe(true);

        for (const row of renderedRows()) {
            const nameCell = row.vnode.childNodes.find(cell => cell.attributes?.['data-field'] === 'name'),
                  cityCell = row.vnode.childNodes.find(cell => cell.attributes?.['data-field'] === 'city');

            expect(nameCell?.style?.width, `row ${row.rowIndex} name cell vnode width`).toBe('333px');
            expect(cityCell?.style?.left, `row ${row.rowIndex} city cell vnode left`).toBe('413px')
        }
    })
});
