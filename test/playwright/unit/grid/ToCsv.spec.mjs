/**
 * @file test/playwright/unit/grid/ToCsv.spec.mjs
 * @summary Pins `Neo.grid.Container#toCsv()`: columns in display order across the lock regions, rows in the store's
 * current order (rows a buffered grid never rendered included), RFC 4180 quoting, the formula guard, and the cell
 * value a grid row reads, or a column's `exportRenderer`.
 *
 * @see Neo.grid.Container#toCsv
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
        name             : 'GridToCsvTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Store          from '../../../../src/data/Store.mjs';

// Imported for their side effects: the vdom rig `initVnode()` needs, and the instance manager `Neo.get` needs.
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

const appName = 'GridToCsvTest';

/**
 * @param {Object[]} data
 * @param {Object[]} fields
 * @returns {Neo.data.Store}
 */
const createStore = (data, fields) => Neo.create(Store, {
    keyProperty: 'id',
    data,
    model      : {fields: [{name: 'id', type: 'Integer'}, ...fields]}
});

/**
 * @param {Neo.data.Store} store
 * @param {Object[]} columns
 * @returns {Promise<Neo.grid.Container>}
 */
const createGrid = async (store, columns) => {
    const grid = Neo.create(GridContainer, {appName, columns, height: 300, rowHeight: 40, store, useInternalId: false, width: 600});

    await grid.initVnode();
    grid.mounted = true;
    await grid.timeout(50);

    // the harness has no geometry to derive the row pool from: three rendered rows, whatever the store holds
    grid.body.set({availableRows: 3, availableWidth: 600, containerWidth: 600});
    await grid.timeout(20);

    return grid
};

test.describe('Neo.grid.Container#toCsv', () => {
    let grid, store;

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('columns run start, center, end, under their header text', async () => {
        store = createStore([{id: 1, a: 'a1', b: 'b1', c: 'c1'}], ['a', 'b', 'c'].map(name => ({name, type: 'String'})));
        grid  = await createGrid(store, [
            {dataField: 'b', text: 'Bee', locked: 'end'},
            {dataField: 'c', text: 'Cee'},
            {dataField: 'a', text: 'Ay',  locked: 'start'}
        ]);

        expect(grid.toCsv()).toBe('Ay,Cee,Bee\r\na1,c1,b1');
        expect(grid.toCsv({header: false})).toBe('a1,c1,b1')
    });

    test('rows follow the store\'s filter and sort, including rows the grid never rendered', async () => {
        store = createStore(Array.from({length: 40}, (_, i) => ({id: i, name: `n${i}`, score: i})),
                            [{name: 'name', type: 'String'}, {name: 'score', type: 'Integer'}]);
        grid  = await createGrid(store, [{dataField: 'name', text: 'Name'}, {dataField: 'score', text: 'Score'}]);

        store.sorters = [{property: 'score', direction: 'DESC'}];
        store.filters = [{property: 'score', operator: '>=', value: 10}];

        const lines = grid.toCsv().split('\r\n');

        expect(grid.body.items.length).toBeLessThan(30);
        expect(lines.length).toBe(31);
        expect(lines[1]).toBe('n39,39');
        expect(lines.at(-1)).toBe('n10,10')
    });

    test('quoting follows RFC 4180, and the delimiter option moves it', async () => {
        store = createStore([{id: 1, text: 'a,b'}, {id: 2, text: 'say "hi"'}, {id: 3, text: 'two\nlines'}, {id: 4, text: 'a;b'}],
                            [{name: 'text', type: 'String'}]);
        grid  = await createGrid(store, [{dataField: 'text', text: 'Text'}]);

        expect(grid.toCsv({header: false})).toBe('"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\na;b');
        expect(grid.toCsv({delimiter: ';', header: false})).toBe('a,b\r\n"say ""hi"""\r\n"two\nlines"\r\n"a;b"')
    });

    test('a formula-like string gets a leading quote, a number never does, and the guard can be turned off', async () => {
        store = createStore([{id: 1, text: '=SUM(A1)', amount: -5}, {id: 2, text: '-5', amount: 3}, {id: 3, text: '@cmd', amount: 0}],
                            [{name: 'text', type: 'String'}, {name: 'amount', type: 'Integer'}]);
        grid  = await createGrid(store, [{dataField: 'text', text: 'Text'}, {dataField: 'amount', text: 'Amount'}]);

        expect(grid.toCsv({header: false})).toBe("'=SUM(A1),-5\r\n'-5,3\r\n'@cmd,0");
        expect(grid.toCsv({escapeFormulas: false, header: false})).toBe('=SUM(A1),-5\r\n-5,3\r\n@cmd,0')
    });

    test('a dotted dataField exports what record.get resolves, exportRenderer overrides it, and dates and nulls normalize', async () => {
        store = createStore([
            {id: 1, address: {city: 'Berlin'}, revenue: 10,   since: new Date(Date.UTC(2026, 10, 5)), note: 'x'},
            {id: 2, address: {city: 'Paris'},  revenue: null, since: new Date(Date.UTC(2026, 0, 1)),  note: null}
        ], [{name: 'address', type: 'Object'}, {name: 'revenue', type: 'Number'}, {name: 'since', type: 'Date'}, {name: 'note', type: 'String'}]);
        grid  = await createGrid(store, [
            {dataField: 'address.city', text: 'City'},
            {dataField: 'revenue',      text: 'Revenue', exportRenderer: ({value}) => value === null ? 'n/a' : value.toFixed(2)},
            {dataField: 'since',        text: 'Since'},
            {dataField: 'note',         text: 'Note'}
        ]);

        expect(grid.toCsv()).toBe('City,Revenue,Since,Note\r\nBerlin,10.00,2026-11-05T00:00:00.000Z,x\r\nParis,n/a,2026-01-01T00:00:00.000Z,')
    })
});
