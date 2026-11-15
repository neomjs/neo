/**
 * @file test/playwright/unit/grid/CellValues.spec.mjs
 * @summary Pins `Neo.grid.Container#getCellValues()` and `#dataFields`: the grid's one value walk over any set of
 * records and columns, its `export` mode (a column's `exportRenderer`, scalars only) and its `raw` mode (the
 * record's value, untouched).
 *
 * @see Neo.grid.Container#getCellValues
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
        name             : 'GridCellValuesTest',
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

const appName = 'GridCellValuesTest';

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

test.describe('Neo.grid.Container#getCellValues', () => {
    let grid, store;

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        grid = store = null
    });

    test('dataFields and the default walk run start, center, end over the store\'s current order', async () => {
        store = createStore(Array.from({length: 40}, (_, i) => ({id: i, a: `a${i}`, b: `b${i}`, c: i})),
                            [{name: 'a', type: 'String'}, {name: 'b', type: 'String'}, {name: 'c', type: 'Integer'}]);
        grid  = await createGrid(store, [
            {dataField: 'b', text: 'Bee', locked: 'end'},
            {dataField: 'c', text: 'Cee'},
            {dataField: 'a', text: 'Ay',  locked: 'start'}
        ]);

        store.sorters = [{property: 'c', direction: 'DESC'}];
        store.filters = [{property: 'c', operator: '>=', value: 38}];

        expect(grid.dataFields).toEqual(['a', 'c', 'b']);

        // rows the grid never rendered are part of the walk: the store holds the data
        expect(grid.getCellValues()).toEqual([['a39', 39, 'b39'], ['a38', 38, 'b38']])
    });

    test('reads exactly the records and columns given, in the order given', async () => {
        store = createStore([{id: 1, name: 'Ada', address: {city: 'Berlin'}}, {id: 2, name: 'Bo', address: {city: 'Paris'}}],
                            [{name: 'name', type: 'String'}, {name: 'address', type: 'Object'}]);
        grid  = await createGrid(store, [{dataField: 'name', text: 'Name'}, {dataField: 'address.city', text: 'City'}]);

        const ada = store.get(1),
              bo  = store.get(2);

        store.filters = [{property: 'name', operator: '===', value: 'Bo'}];

        expect(grid.getCellValues()).toEqual([['Bo', 'Paris']]);

        // a record the store's filter hides, a reversed column order, and a plain row a store never held
        expect(grid.getCellValues({
            dataFields: ['address.city', 'name'],
            records   : [bo, ada, {name: 'Cy', address: {city: 'Oslo'}}]
        })).toEqual([['Paris', 'Bo'], ['Berlin', 'Ada'], ['Oslo', 'Cy']]);

        expect(grid.getCellValues({dataFields: ['name'], records: []})).toEqual([])
    });

    test('export mode applies exportRenderer and yields scalars only', async () => {
        const since = new Date(Date.UTC(2026, 10, 5));

        store = createStore([{id: 1, revenue: 10, since, active: true, tags: ['a', 'b'], address: {city: 'Berlin'}, note: null}], [
            {name: 'revenue', type: 'Number'},
            {name: 'since',   type: 'Date'},
            {name: 'active',  type: 'Boolean'},
            {name: 'tags',    type: 'Array'},
            {name: 'address', type: 'Object'},
            {name: 'note',    type: 'String'}
        ]);
        grid  = await createGrid(store, [
            {dataField: 'revenue', text: 'Revenue'},
            {dataField: 'since',   text: 'Since'},
            {dataField: 'active',  text: 'Active'},
            {dataField: 'tags',    text: 'Tags'},
            {dataField: 'address', text: 'Address'},
            {dataField: 'note',    text: 'Note', exportRenderer: ({record, value}) => value ?? `none for ${record.get('id')}`}
        ]);

        const [row] = grid.getCellValues();

        expect(row[0]).toBe(10);
        expect(row[1]).toBeInstanceOf(Date);
        expect(row[1].toISOString()).toBe('2026-11-05T00:00:00.000Z');
        expect(row[2]).toBe(true);
        expect(row[3]).toBe('["a","b"]');
        expect(row[4]).toBe('{"city":"Berlin"}');
        expect(row[5]).toBe('none for 1');

        // a value the row does not hold, and a renderer returning nothing, both read as null
        grid.columns.get('note').exportRenderer = () => undefined;

        expect(grid.getCellValues({dataFields: ['revenue', 'note'], records: [{note: 'x'}]})).toEqual([[null, null]])
    });

    test('raw mode returns the record\'s value untouched and ignores exportRenderer', async () => {
        const row = {name: 'Cy', address: {city: 'Oslo'}};

        store = createStore([{id: 1, name: 'Ada', address: {city: 'Berlin'}}],
                            [{name: 'name', type: 'String'}, {name: 'address', type: 'Object'}]);
        grid  = await createGrid(store, [
            {dataField: 'name',        text: 'Name', exportRenderer: () => 'exported'},
            {dataField: 'address',     text: 'Address'},
            {dataField: 'address.zip', text: 'Zip'}
        ]);

        let resolveFieldCalls = 0,
            resolveField      = store.resolveField;

        store.resolveField = function(...args) {
            resolveFieldCalls++;
            return resolveField.apply(this, args)
        };

        const values = grid.getCellValues({mode: 'raw', records: [row, store.get(1)]});

        expect(values[0][0]).toBe('Cy');
        expect(values[0][1]).toBe(row.address);
        expect(values[0][2]).toBeUndefined();
        expect(values[1][0]).toBe('Ada');
        expect(values[1][1]).toEqual({city: 'Berlin'});
        // the plain row is resolved on a copy and stays as it was
        expect(row).toEqual({name: 'Cy', address: {city: 'Oslo'}});

        // a record is read, never resolved
        resolveFieldCalls = 0;
        grid.getCellValues({mode: 'raw', records: [store.get(1)]});
        expect(resolveFieldCalls).toBe(0)
    });

    test('resolves complex model fields from Turbo Mode rows without hydrating them', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => {
                const id = i + 1;

                return {id, value: id, address: {city: `City ${id}`}, alias: `Alias ${id}`, upper: 'ab'}
            }),
            keyProperty: 'id',
            model      : {
                fields: [
                    {name: 'id',     type: 'Integer'},
                    {name: 'value',  type: 'Integer'},
                    {name: 'double', calculate: data => data.value * 2},
                    {name: 'city',   mapping: 'address.city'},
                    {name: 'load',   mapping: 'address.load'},
                    {name: 'upper',  convert: value => String(value).toUpperCase()}
                ]
            }
        });
        grid = await createGrid(store, [
            {dataField: 'value',       text: 'Value'},
            {dataField: 'double',      text: 'Double'},
            {dataField: 'city',        text: 'City'},
            {dataField: 'upper',       text: 'Upper'}
        ]);

        const raw = store.items.find(item => item.id === 52 && typeof item.get !== 'function'),
              recordCountBefore = store.items.filter(item => typeof item.get === 'function').length;

        expect(raw).toBeDefined();
        const detached = {load: 1};

        expect(grid.centerColumns[0].getRecordValue(detached, 'load')).toBe(1);
        expect(detached).toEqual({load: 1});

        expect(grid.getCellValues({mode: 'raw', records: [raw]})).toEqual([[52, 104, 'City 52', 'AB']]);
        expect(grid.getCellValues({mode: 'export', records: [raw]})).toEqual([[52, 104, 'City 52', 'AB']]);
        expect(store.items.filter(item => typeof item.get === 'function').length).toBe(recordCountBefore);

        grid.centerColumns[0].dataField = 'alias';
        expect(grid.getCellValues({dataFields: ['alias'], mode: 'raw', records: [raw]})).toEqual([['Alias 52']]);

        grid.centerColumns[0].dataField = 'address.city';
        expect(grid.getCellValues({dataFields: ['address.city'], mode: 'raw', records: [raw]})).toEqual([['City 52']]);

        grid.centerColumns[0].dataField = 'value';
        expect(grid.getCellValues({mode: 'raw'})[51]).toEqual([52, 104, 'City 52', 'AB']);
        expect(store.items.filter(item => typeof item.get === 'function').length).toBe(recordCountBefore);

        const csvLines = grid.toCsv().split('\r\n');

        expect(csvLines[52]).toBe('52,104,City 52,AB');
        expect(store.items.filter(item => typeof item.get === 'function').length).toBe(recordCountBefore);

        const record = store.get(52);

        expect(grid.getCellValues({mode: 'raw', records: [record]})).toEqual([[52, 104, 'City 52', 'AB']]);
    });

    test('resolves non-idempotent conversions on copies across repeated walks', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => {
                const id = i + 1;

                return {id, scaled: id, metrics: {value: id}}
            }),
            keyProperty: 'id',
            model      : {
                fields: [
                    {name: 'id',           type: 'Integer'},
                    {name: 'scaled',       convert: value => value * 1000},
                    {name: 'mappedScaled', mapping: 'metrics.value', convert: value => value * 1000}
                ]
            }
        });
        grid = await createGrid(store, [
            {dataField: 'scaled',       text: 'Scaled'},
            {dataField: 'mappedScaled', text: 'Mapped'}
        ]);

        const raw = store.items.find(item => item.id === 52 && typeof item.get !== 'function');

        expect(raw).toBeDefined();

        const keys = Object.keys(raw),
              recordCountBefore = store.items.filter(item => typeof item.get === 'function').length;

        expect(grid.getCellValues({mode: 'raw', records: [raw]})).toEqual([[52000, 52000]]);
        expect(grid.getCellValues({mode: 'raw', records: [raw]})).toEqual([[52000, 52000]]);
        expect(Object.keys(raw)).toEqual(keys);
        expect(raw.scaled).toBe(52);
        expect(Object.hasOwn(raw, 'mappedScaled')).toBe(false);
        expect(store.items.filter(item => typeof item.get === 'function').length).toBe(recordCountBefore);

        const record = store.get(52);

        expect([record.get('scaled'), record.get('mappedScaled')]).toEqual([52000, 52000])
    });

    test('a Turbo Mode row reads a path below a mapped field as its record does', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => ({id: i + 1, address: {city: `City ${i + 1}`}})),
            keyProperty    : 'id',
            model          : {fields: [{name: 'id', type: 'Integer'}, {name: 'geo', mapping: 'address'}]}
        });
        grid = await createGrid(store, [{dataField: 'geo.city', text: 'City'}]);

        const raw = store.items.find(item => item.id === 52 && typeof item.get !== 'function');

        expect(grid.getCellValues({mode: 'raw', records: [raw]})).toEqual([['City 52']]);
        expect(Object.hasOwn(raw, 'geo')).toBe(false);
        expect(grid.getCellValues({mode: 'raw', records: [store.get(52)]})).toEqual([['City 52']])
    });

    test('a Turbo Mode row of a model without complex fields reads defaults and types as its record does', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => ({id: i + 1, n: String(i + 1)})),
            keyProperty    : 'id',
            model          : {fields: [{name: 'id', type: 'Integer'}, {name: 'flag', defaultValue: 'x'}, {name: 'n', type: 'Integer'}]}
        });
        grid = await createGrid(store, [{dataField: 'flag', text: 'Flag'}, {dataField: 'n', text: 'N'}]);

        const raw = store.items.find(item => item.id === 52 && typeof item.get !== 'function');

        expect(store.model.hasComplexFields).toBe(false);
        expect(grid.getCellValues({mode: 'raw', records: [raw]})).toEqual([['x', 52]]);
        expect(Object.keys(raw)).toEqual(['id', 'n']);
        expect(raw.n).toBe('52');
        expect(grid.getCellValues({mode: 'raw', records: [store.get(52)]})).toEqual([['x', 52]])
    });

    test('a Turbo Mode row reads the same values in any column order, and they equal its record\'s', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => ({
                id     : i + 1,
                amount : String(i + 1).padStart(3, '0'),
                details: JSON.stringify({city: `City ${i + 1}`}),
                address: {code: String(i + 1).padStart(3, '0')}
            })),
            keyProperty: 'id',
            model      : {fields: [
                {name: 'id',      type: 'Integer'},
                {name: 'amount',  type: 'Integer'},
                {name: 'code',    mapping: 'amount'},
                {name: 'details', convert: value => typeof value === 'string' ? JSON.parse(value) : value},
                {name: 'address', fields: [{name: 'code', type: 'Integer'}]}
            ]}
        });
        grid = await createGrid(store, [
            {dataField: 'amount',       text: 'Amount'},
            {dataField: 'code',         text: 'Code'},
            {dataField: 'details.city', text: 'City'},
            {dataField: 'address.code', text: 'Address code'}
        ]);

        const
            raw      = store.items.find(item => item.id === 7 && typeof item.get !== 'function'),
            fields   = ['amount', 'code', 'details.city', 'address.code'],
            expected = [7, '007', 'City 7', 7],
            read     = names => grid.getCellValues({dataFields: names, mode: 'raw', records: [raw]})[0];

        expect(read(fields)).toEqual(expected);
        expect(read([...fields].reverse())).toEqual([...expected].reverse());
        expect(raw.address).toEqual({code: '007'});
        expect(grid.getCellValues({dataFields: fields, mode: 'raw', records: [store.get(7)]})[0]).toEqual(expected)
    });

    test('a mapping reads what the record\'s earlier fields assigned: a default, a mapped value, nothing from a later field', async () => {
        store = Neo.create(Store, {
            autoInitRecords: false,
            data           : Array.from({length: 60}, (_, i) => ({id: i + 1, raw: {amt: i + 1}})),
            keyProperty    : 'id',
            model          : {fields: [
                {name: 'id',     type: 'Integer'},
                {name: 'amount', defaultValue: 'D'},
                {name: 'code',   mapping: 'amount'},
                {name: 'total',  mapping: 'raw.amt'},
                {name: 'sum',    mapping: 'total'},
                {name: 'early',  mapping: 'late'},
                {name: 'late',   defaultValue: 'L'}
            ]}
        });
        const fields = ['amount', 'code', 'total', 'sum', 'early', 'late'];

        grid = await createGrid(store, fields.map(dataField => ({dataField, text: dataField})));

        const
            raw      = store.items.find(item => item.id === 7 && typeof item.get !== 'function'),
            expected = ['D', 'D', 7, 7, undefined, 'L'],
            read     = names => grid.getCellValues({dataFields: names, mode: 'raw', records: [raw]})[0];

        expect(read(fields)).toEqual(expected);
        expect(read([...fields].reverse())).toEqual([...expected].reverse());
        expect(Object.keys(raw)).toEqual(['id', 'raw']);
        expect(raw.raw).toEqual({amt: 7});
        expect(grid.getCellValues({dataFields: fields, mode: 'raw', records: [store.get(7)]})[0]).toEqual(expected)
    });

    test('a column pointed at another field at runtime is read under its new dataField', async () => {
        store = createStore([{id: 1, first: 'one', second: 'two'}], [{name: 'first', type: 'String'}, {name: 'second', type: 'String'}]);
        grid  = await createGrid(store, [{dataField: 'first', text: 'Value'}]);

        grid.centerColumns[0].dataField = 'second';

        expect(grid.dataFields).toEqual(['second']);
        expect(grid.getCellValues()).toEqual([['two']]);
        expect(grid.toCsv()).toBe('Value\r\ntwo')
    });

    test('an unknown mode throws, and a dataField no column carries holds its position', async () => {
        store = createStore([{id: 1, name: 'Ada'}], [{name: 'name', type: 'String'}]);
        grid  = await createGrid(store, [{dataField: 'name', text: 'Name'}]);

        expect(() => grid.getCellValues({mode: 'display'})).toThrow('unknown mode \'display\'');

        expect(grid.getCellValues({dataFields: ['id', 'name']})).toEqual([[null, 'Ada']]);
        expect(grid.getCellValues({dataFields: ['id', 'name'], mode: 'raw'})).toEqual([[undefined, 'Ada']])
    })
});
