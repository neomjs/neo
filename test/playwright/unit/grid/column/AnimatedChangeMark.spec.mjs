/**
 * @file test/playwright/unit/grid/column/AnimatedChangeMark.spec.mjs
 * @summary An animatedChange column's mark is render state: every render of a changed cell inside the mark's window
 * carries it, a change to a cell that still carries the mark switches the keyframes, the body's own repaint renders
 * it, and ended marks leave the column's map at a bounded cost.
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
 * @param {Number} [count=3] The records of the store, ids from 1. The body mounts three rows.
 */
async function createGrid(type='animatedChange', markDuration=1000, count=3) {
    store = Neo.create(Store, {
        keyProperty: 'id',
        data       : Array.from({length: count}, (_, i) => ({id: i + 1, counter: 0})),
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

/**
 * @summary Counts the visits to mark entries while `fn` runs, however a column walks its marks: a Map iterator or
 * `Map#forEach`. A mark entry is a value with a `cls` array and a numeric `until`.
 * @param {Function} fn
 * @returns {Number}
 */
function countMarkVisits(fn) {
    const iterator  = Object.getPrototypeOf(new Map().entries()),
          {next}    = iterator,
          {forEach} = Map.prototype,
          isMark    = value => Array.isArray(value?.cls) && typeof value.until === 'number';

    let visits = 0;

    iterator.next = function() {
        const result = next.call(this);

        isMark(Array.isArray(result.value) ? result.value[1] : result.value) && visits++;
        return result
    };

    Map.prototype.forEach = function(callback, scope) {
        return forEach.call(this, (value, key, map) => {
            isMark(value) && visits++;
            callback.call(scope, value, key, map)
        })
    };

    try {
        fn()
    } finally {
        iterator.next         = next;
        Map.prototype.forEach = forEach
    }

    return visits
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

    test('a change after the mark ended, with no render in between, switches the keyframes', async () => {
        await createGrid('animatedChange', 100);

        const record = store.get(1);

        record.counter = 1;
        await grid.timeout(150);
        expect(cellCls(1), 'control: nothing rendered the row since, so the ended mark is still on the cell').toContain('neo-animated');
        expect(cellCls(1)).not.toContain('neo-animated-alt');

        record.counter = 2;
        await grid.timeout(40);
        expect(cellCls(1)).toEqual(expect.arrayContaining(['neo-animated', 'neo-animated-alt']));

        await grid.timeout(150);
        grid.body.createViewData(false, true);
        await grid.timeout(40);
        expect(cellCls(1), 'a rebuild after the window').not.toContain('neo-animated');

        // a cell without the mark gets the plain keyframes
        record.counter = 3;
        await grid.timeout(40);
        expect(cellCls(1)).toContain('neo-animated');
        expect(cellCls(1)).not.toContain('neo-animated-alt')
    });

    test('a single edit repaints its row once: the body renders the mark, and the column adds no update', async () => {
        await createGrid();

        const row     = grid.body.getRow(store.get(1)),
              update  = row.update.bind(row);
        let   updates = 0;

        row.update = (...args) => {updates++; return update(...args)};

        store.get(1).counter = 4;
        await grid.timeout(40);

        expect(cellCls(1)).toContain('neo-animated');
        expect(updates).toBe(1)
    });

    test('an edit to a column without rendered cells marks no cell of another column', async () => {
        const fields = Array.from({length: 24}, (_, i) => `c${i}`);

        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [1, 2, 3].map(id => ({id, ...Object.fromEntries(fields.map(field => [field, 0]))})),
            model      : {fields: [{name: 'id', type: 'Integer'}, ...fields.map(name => ({name, type: 'Number'}))]}
        });

        grid = Neo.create(GridContainer, {
            appName  : 'AnimatedChangeMarkTest',
            columns  : fields.map(dataField => ({dataField, text: dataField, type: 'animatedChange', width: 100})),
            height   : 400,
            rowHeight: 40,
            store,
            width    : 400
        });

        await grid.initVnode();
        grid.mounted = true;
        await grid.timeout(50);

        grid.body.set({availableRows: 3, availableWidth: 400, containerWidth: 400});
        await grid.timeout(40);

        const row    = grid.body.getRow(store.get(1)),
              marked = () => row.vdom.cn.filter(node => node.cls?.includes('neo-animated')).map(node => node.data.field);

        expect(row.vdom.cn.some(node => node.data?.field === 'c23'), 'control: c23 has no rendered cell').toBe(false);

        store.get(1).c23 = 1;
        await grid.timeout(40);
        expect(marked()).toEqual([]);

        store.get(1).c0 = 1;
        await grid.timeout(40);
        expect(marked(), 'control: a rendered column marks its own cell').toEqual(['c0'])
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
        expect(cellCls(1)).not.toContain('neo-animated-negative');
        expect(cellCls(1), 'a sign change needs no alternate keyframes').not.toContain('neo-animated-alt');

        store.get(1).counter = 6;
        await grid.timeout(40);
        expect(cellCls(1), 'a change of the same sign').toEqual(expect.arrayContaining(['neo-animated-positive', 'neo-animated-alt']))
    });

    test('thousands of batched changes in one window cost each mark a bounded visit, and ended marks leave once', async () => {
        const count = 5000;

        await createGrid('animatedChange', 200, count);

        const column = grid.columns.get('counter'),
              mark   = column.mark.bind(column);
        let   marked = 0,
              visits;

        column.mark = record => {marked++; mark(record)};

        // Records, not raw rows: only a record publishes recordChange in a batch
        for (let i = 0; i < count; i++) store.getAt(i);

        visits = countMarkVisits(() => {
            store.updateRows(Array.from({length: count}, (_, i) => ({key: i + 1, values: {counter: 1}})))
        });

        expect(marked, 'control: every row of the batch reached the column').toBe(count);
        expect(visits, 'control: the counter sees the column walk its marks').toBeGreaterThanOrEqual(count);
        expect(visits, 'a bounded visit per mark').toBeLessThanOrEqual(2 * count);

        await grid.timeout(250);

        visits = countMarkVisits(() => {store.get(1).counter = 2});
        expect(visits, 'each ended mark is visited once as it leaves').toBeLessThanOrEqual(count + 1);

        visits = countMarkVisits(() => {store.get(2).counter = 2});
        expect(visits, 'the ended marks are gone').toBeLessThanOrEqual(2)
    })
});
