import {setup} from '../../../setup.mjs';

const appName = 'NestedDataFieldColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../src/Neo.mjs';
import * as core              from '../../../../../src/core/_export.mjs';
import InstanceManager        from '../../../../../src/manager/Instance.mjs';
import AnimatedChangeColumn   from '../../../../../src/grid/column/AnimatedChange.mjs';
import AnimatedCurrencyColumn from '../../../../../src/grid/column/AnimatedCurrency.mjs';
import CountryFlagColumn      from '../../../../../src/grid/column/CountryFlag.mjs';
import IconColumn             from '../../../../../src/grid/column/Icon.mjs';
import IconLinkColumn         from '../../../../../src/grid/column/IconLink.mjs';
import LinkedInColumn         from '../../../../../src/grid/column/LinkedIn.mjs';
import ProgressColumn         from '../../../../../src/grid/column/Progress.mjs';
import SparklineColumn        from '../../../../../src/grid/column/Sparkline.mjs';
import TreeColumn             from '../../../../../src/grid/column/Tree.mjs';
import Model                  from '../../../../../src/data/Model.mjs';
import Store                  from '../../../../../src/data/Store.mjs';

/**
 * @summary A dotted `dataField` reaches every grid column type that reads its value itself.
 *
 * A plain cell reads `record.get(dataField)`, which resolves `metrics.load`. Nine column types read the value
 * on their own, so each one is pinned here twice. The same value is reached through a flat field and through a
 * nested path, both on a store record and on the plain object a Turbo Mode row carries (`autoInitRecords: false`).
 * The flat arm is the control: it must behave exactly as before.
 */
const values = {
    country  : 'DE',
    delta    : -5,
    handle   : 'jane',
    icon     : 'fa fa-check',
    load     : 40,
    location : 'Germany',
    site     : 'https://neomjs.com',
    siteLabel: 'Neo',
    trend    : [1, 2, 3]
};

const raw = {id: 1, ...values, nested: {...values}};

let record, store;

test.beforeAll(() => {
    store = Neo.create(Store, {
        data : [structuredClone(raw)],
        model: {
            module: Model,
            fields: [
                {name: 'id', type: 'Integer'},
                ...Object.keys(values).map(name => ({name})),
                {name: 'nested', type: 'Object'}
            ]
        }
    });

    record = store.get(1)
});

test.afterAll(() => {
    store.destroy()
});

/**
 * `AnimatedChange` (and `AnimatedCurrency` through it) subscribes to its grid's store at construction, so
 * these columns get a stub parent: a store that accepts the listener and a body that counts row lookups.
 * @param {Array} [rows=[]] Collects the records a matched change looks up
 * @returns {Object}
 */
function stubParent(rows=[]) {
    return {body: {getRow(row) {rows.push(row); return null}}, store: {on() {}, un() {}}}
}

/**
 * One row per column type: the class, extra configs built from the field prefix, the read under test,
 * the flat field name, and the value the read must return.
 */
const cases = [
    ['Progress',         ProgressColumn,         () => ({}),                                    (c, r) => c.applyRecordConfigs({}, r).value,       'load',    40],
    ['Sparkline',        SparklineColumn,        () => ({}),                                    (c, r) => c.applyRecordConfigs({}, r).values,      'trend',   [1, 2, 3]],
    ['Tree',             TreeColumn,             () => ({}),                                    (c, r) => c.applyRecordConfigs({}, r).value,       'load',    40],
    ['Icon',             IconColumn,             () => ({}),                                    (c, r) => c.applyRecordConfigs({}, r).cellIconCls, 'icon',    'fa fa-check'],
    ['IconLink',         IconLinkColumn,         p  => ({labelField: `${p}siteLabel`}),         (c, r) => {
        const {label, url} = c.applyRecordConfigs({}, r);
        return {label, url}
    }, 'site', {label: 'Neo', url: 'https://neomjs.com'}],
    ['LinkedIn',         LinkedInColumn,         () => ({}),                                    (c, r) => c.applyRecordConfigs({}, r).url,         'handle',  'https://www.linkedin.com/in/jane/'],
    ['CountryFlag',      CountryFlagColumn,      p  => ({contentField: `${p}location`}),        (c, r) => c.applyRecordConfigs({}, r),             'country', {countryCode: 'DE', location: 'Germany'}],
    ['AnimatedCurrency', AnimatedCurrencyColumn, () => ({parent: stubParent()}),                (c, r) => c.getAnimationCls(r),                    'delta',   'neo-animated-negative']
];

for (const [name, ColumnClass, extraConfigs, read, field, expected] of cases) {
    test.describe(`Neo.grid.column.${name}`, () => {
        for (const prefix of ['', 'nested.']) {
            test(`reads ${prefix ? 'a nested' : 'a flat'} dataField from a record and from a plain row object`, () => {
                const column = Neo.create(ColumnClass, {dataField: `${prefix}${field}`, ...extraConfigs(prefix)});

                expect(read(column, record)).toEqual(expected);
                expect(read(column, structuredClone(raw))).toEqual(expected);

                column.destroy()
            })
        }
    })
}

test.describe('Neo.grid.column.AnimatedCurrency compareField', () => {
    test('a nested compareField picks the animation class', () => {
        const column = Neo.create(AnimatedCurrencyColumn, {compareField: 'nested.delta', dataField: 'load', parent: stubParent()});

        expect(column.getAnimationCls(record)).toBe('neo-animated-negative');
        expect(column.getAnimationCls(structuredClone(raw))).toBe('neo-animated-negative');

        column.destroy()
    })
});

test.describe('Neo.grid.column.AnimatedChange', () => {
    /**
     * Runs one record change through the column. A matched change asks the grid body for the row,
     * so the stub body's `getRow` calls tell whether the column would animate.
     * @param {String}   dataField
     * @param {Object[]} fields
     * @returns {Promise<Boolean>}
     */
    async function animates(dataField, fields) {
        const rows   = [],
              column = Neo.create(AnimatedChangeColumn, {dataField, parent: stubParent(rows)});

        await column.onRecordChange({fields, record: {id: 1}});

        column.destroy();

        return rows.length > 0
    }

    test('a flat dataField animates on its own change only', async () => {
        expect(await animates('load', [{name: 'load', oldValue: 40, value: 41}])).toBe(true);
        expect(await animates('load', [{name: 'location', oldValue: 'Germany', value: 'France'}])).toBe(false)
    });

    test('a nested dataField animates when the value at its path changes', async () => {
        expect(await animates('metrics.load', [{name: 'metrics', oldValue: {load: 40, peak: 1}, value: {load: 41, peak: 1}}])).toBe(true);
        expect(await animates('metrics.load', [{name: 'metrics.load', oldValue: 40, value: 41}])).toBe(true)
    });

    test('a nested dataField stays still when only a sibling member of its object changes', async () => {
        expect(await animates('metrics.load', [{name: 'metrics', oldValue: {load: 40, peak: 1}, value: {load: 40, peak: 2}}])).toBe(false);
        expect(await animates('metrics.load', [{name: 'load', oldValue: 40, value: 41}])).toBe(false)
    })
});
