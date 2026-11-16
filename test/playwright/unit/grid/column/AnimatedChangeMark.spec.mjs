/**
 * @file test/playwright/unit/grid/column/AnimatedChangeMark.spec.mjs
 * @summary An animatedChange column's mark is render state: every render of a changed cell inside the mark's window
 * carries it, a change inside the window switches the keyframes, and a store batch marks through its own repaint.
 *
 * The arms read the counter cell's classes from the row's vdom, the state each render sends.
 *
 * @see Neo.grid.column.AnimatedChange
 * @see Neo.grid.Row#applyRendererOutput
 */
import {setup} from '../../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'AnimatedChangeMarkTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../../src/grid/Container.mjs';
import Store              from '../../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomUtil           from '../../../../../src/util/VDom.mjs';

let grid, store;

/**
 * @param {String} [type='animatedChange']
 * @param {Number} [markDuration=1000]
 */
async function createGrid(type='animatedChange', markDuration=1000) {
    store = Neo.create(Store, {
        keyProperty: 'id',
        data       : [1, 2, 3].map(id => ({id, counter: 0})),
        model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'counter', type: 'Number'}]}
    });

    grid = Neo.create(GridContainer, {
        appName: 'AnimatedChangeMarkTest',
        columns: [{dataField: 'id', text: 'Id', width: 100}, {dataField: 'counter', markDuration, text: 'Counter', type, width: 100}],
        height : 400,
        rowHeight: 40,
        store,
        width  : 600
    });

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    grid.body.set({availableRows: 3, availableWidth: 600, containerWidth: 600});
    await grid.timeout(40)
}

/**
 * @param {Number} id
 * @returns {String[]} The classes of the record's counter cell in its row's current vdom
 */
function cellCls(id) {
    const {body} = grid,
          row    = body.getRow(store.get(id));

    return VdomUtil.find(row.vdom, body.getCellId(row.rowIndex, 'counter'))?.vdom.cls || []
}

test.describe('Neo.grid.column.AnimatedChange marks as render state', () => {
    test.afterEach(async () => {
        if (grid && !grid.isDestroyed) await grid.timeout(20);
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('a single edit marks its cell, a rebuild inside the window keeps the mark, and one after it drops it', async () => {
        await createGrid('animatedChange', 200);

        store.get(1).counter = 5;
        await grid.timeout(40);
        expect(cellCls(1)).toContain('neo-animated');

        grid.body.createViewData(false, true);
        await grid.timeout(40);
        expect(cellCls(1), 'a rebuild inside the window').toContain('neo-animated');
        expect(cellCls(2), 'an unchanged cell').not.toContain('neo-animated');

        await grid.timeout(250);
        grid.body.createViewData(false, true);
        await grid.timeout(40);
        expect(cellCls(1), 'a rebuild after the window').not.toContain('neo-animated')
    });

    test('a change inside a live mark switches to the alternate keyframes, and the next one switches back', async () => {
        await createGrid();

        const record = store.get(2);

        record.counter = 1;
        await grid.timeout(40);
        expect(cellCls(2)).toContain('neo-animated');
        expect(cellCls(2)).not.toContain('neo-animated-alt');

        record.counter = 2;
        await grid.timeout(40);
        expect(cellCls(2)).toEqual(expect.arrayContaining(['neo-animated', 'neo-animated-alt']));

        record.counter = 3;
        await grid.timeout(40);
        expect(cellCls(2)).toContain('neo-animated');
        expect(cellCls(2)).not.toContain('neo-animated-alt')
    });

    test('a store batch marks its rows through its own repaint, and the column adds no row update', async () => {
        await createGrid();

        const updates = [];

        grid.body.items.forEach(row => {
            const update = row.update.bind(row);
            row.update = (...args) => {updates.push(row.record?.id); return update(...args)}
        });

        store.updateRows([{key: 1, values: {counter: 9}}, {key: 3, values: {counter: 7}}]);
        await grid.timeout(40);

        expect(cellCls(1)).toContain('neo-animated');
        expect(cellCls(3)).toContain('neo-animated');
        expect(cellCls(2)).not.toContain('neo-animated');
        expect(updates, 'the batch repaint updates the body, not each marked row').toEqual([])
    });

    test('AnimatedCurrency marks with the sign of the new value', async () => {
        await createGrid('animatedCurrency');

        store.get(1).counter = -5;
        await grid.timeout(40);
        expect(cellCls(1)).toContain('neo-animated-negative');

        store.get(1).counter = 5;
        await grid.timeout(40);
        expect(cellCls(1)).toContain('neo-animated-positive');
        expect(cellCls(1)).not.toContain('neo-animated-negative')
    })
});
