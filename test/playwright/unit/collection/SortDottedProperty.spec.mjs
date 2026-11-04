/**
 * @file test/playwright/unit/collection/SortDottedProperty.spec.mjs
 * @summary Sorting by dotted property paths across Collection, Store (Record and Turbo Mode), and TreeStore.
 *
 * @see Neo.collection.Sorter.getValue
 * @see Neo.collection.Base#sortArray
 * @see Neo.data.Store#resolveField
 * @see Neo.data.TreeStore#doSort
 */
import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CollectionSortDottedPropertyTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Collection      from '../../../../src/collection/Base.mjs';
import Sorter          from '../../../../src/collection/Sorter.mjs';
import Model           from '../../../../src/data/Model.mjs';
import RecordFactory   from '../../../../src/data/RecordFactory.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeModel       from '../../../../src/data/TreeModel.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';

class TelemetryModel extends Model {
    static config = {
        className: 'Test.Unit.Collection.SortDottedProperty.TelemetryModel',
        fields   : [
            {name: 'id',    type: 'Integer'},
            {name: 'group', type: 'String'},
            {name: 'stats', type: 'Object'},
            {
                name     : 'computed',
                type     : 'Object',
                calculate: data => ({score: (data.stats?.running?.throughput ?? 0) * 2})
            }
        ]
    }
}

Neo.setupClass(TelemetryModel);

class TelemetryTreeModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Collection.SortDottedProperty.TelemetryTreeModel',
        fields   : [
            {name: 'id',    type: 'String'},
            {name: 'index', type: 'Integer'},
            {name: 'stats', type: 'Object'},
            {
                name     : 'computed',
                type     : 'Object',
                calculate: data => ({score: (data.stats?.running?.throughput ?? 0) * 2})
            }
        ]
    }
}

Neo.setupClass(TelemetryTreeModel);

const items = () => [
    {id: 1, group: 'b', stats: {running: {label: 'Beta',  throughput: 20}}},
    {id: 2, group: 'a', stats: {running: {label: 'alpha', throughput: 50}}},
    {id: 3, group: 'a', stats: {running: {label: null,    throughput: null}}},
    {id: 4, group: 'b', stats: {running: {label: 'gamma', throughput: 10}}}
];

test.describe('Neo.collection.Sorter.getValue and dotted property sorting', () => {
    test('Sorter.getValue resolves flat keys, Symbol keys, and dotted paths on Records and plain objects', () => {
        const
            model  = Neo.create(TelemetryModel),
            record = RecordFactory.createRecord(model, items()[0]),
            symbol = Symbol.for('initialIndex');

        expect(Sorter.getValue(record, 'id')).toBe(1);
        expect(Sorter.getValue(record, symbol)).toBe(record[symbol]);
        expect(Sorter.getValue(record, 'stats.running.throughput')).toBe(20);
        expect(Sorter.getValue(record, 'computed.score')).toBe(40);
        expect(Sorter.getValue(items()[1], 'stats.running.throughput')).toBe(50);
        expect(Sorter.getValue(null, 'stats.running.throughput')).toBe(undefined);

        model.destroy()
    });

    test('Collection sorts by dotted property paths with useTransformValue true/false and custom sortBy', () => {
        const collection = Neo.create(Collection, {
            items  : items(),
            sorters: [{direction: 'ASC', property: 'stats.running.throughput'}]
        });

        // null sinks on ASC and DESC
        expect(collection.getRange().map(item => item.id)).toEqual([4, 1, 2, 3]);

        collection.sorters = [{direction: 'DESC', property: 'stats.running.throughput', useTransformValue: false}];
        expect(collection.getRange().map(item => item.id)).toEqual([2, 1, 4, 3]);

        // Mixed custom sortBy + defaultSortBy with dotted path and case-insensitive transformValue
        collection.sorters = [
            {sortBy: (a, b) => a.group.localeCompare(b.group)},
            {direction: 'ASC', property: 'stats.running.label'}
        ];
        expect(collection.getRange().map(item => item.id)).toEqual([2, 3, 1, 4]);

        collection.destroy()
    });

    test('Store sorts Records and Turbo Mode raw objects by dotted paths without stamping flat keys, and resets via sort()', () => {
        const recordStore = Neo.create(Store, {
            autoInitRecords: true,
            data           : items(),
            model          : TelemetryModel,
            sorters        : [{direction: 'DESC', property: 'stats.running.throughput'}]
        });

        expect(recordStore.items.map(r => r.id)).toEqual([2, 1, 4, 3]);

        // Reset to initial insertion order via Symbol.for('initialIndex')
        recordStore.sort();
        expect(recordStore.items.map(r => r.id)).toEqual([1, 2, 3, 4]);

        recordStore.destroy();

        const turboStore = Neo.create(Store, {
            autoInitRecords: false,
            data           : items(),
            model          : TelemetryModel,
            sorters        : [{direction: 'ASC', property: 'computed.score'}]
        });

        expect(turboStore.items.map(item => item.id)).toEqual([3, 4, 1, 2]);
        expect(turboStore.items.some(item => Object.hasOwn(item, 'computed.score'))).toBe(false);
        expect(turboStore.items.some(item => RecordFactory.isRecord(item))).toBe(false);

        // Mutate nested value in place and re-sort by undeclared dotted path
        turboStore.items.find(item => item.id === 4).stats.running.throughput = 99;
        turboStore.sorters = [{direction: 'DESC', property: 'stats.running.throughput'}];

        expect(turboStore.items.map(item => item.id)).toEqual([4, 2, 1, 3]);
        expect(turboStore.items.some(item => Object.hasOwn(item, 'stats.running.throughput'))).toBe(false);

        turboStore.destroy()
    });

    test('TreeStore inherits sortArray from Collection and sorts hierarchical levels by dotted paths and index in Record and Turbo Mode', () => {
        expect(TreeStore.prototype.sortArray).toBe(Collection.prototype.sortArray);

        const treeData = () => [
            {id: 'g1', parentId: null, isLeaf: false, collapsed: false, index: 2, stats: {running: {throughput: 30}}},
            {id: 'g2', parentId: null, isLeaf: false, collapsed: false, index: 1, stats: {running: {throughput: 80}}},
            {id: 'c1', parentId: 'g1', isLeaf: true,  index: 2, stats: {running: {throughput: 25}}},
            {id: 'c2', parentId: 'g1', isLeaf: true,  index: 1, stats: {running: {throughput: 10}}},
            {id: 'c3', parentId: 'g1', isLeaf: true,  index: 0, stats: {running: {throughput: null}}}
        ];

        const recordTreeStore = Neo.create(TreeStore, {
            autoInitRecords: true,
            model          : TelemetryTreeModel,
            data           : treeData(),
            sorters        : [{direction: 'ASC', property: 'stats.running.throughput'}]
        });

        expect(recordTreeStore.items.every(node => RecordFactory.isRecord(node))).toBe(true);
        expect(recordTreeStore.items.map(node => node.id)).toEqual(['g1', 'c2', 'c1', 'c3', 'g2']);

        recordTreeStore.sorters = [{direction: 'DESC', property: 'computed.score'}];
        expect(recordTreeStore.items.map(node => node.id)).toEqual(['g2', 'g1', 'c1', 'c2', 'c3']);

        recordTreeStore.destroy();

        const treeStore = Neo.create(TreeStore, {
            autoInitRecords: false,
            model          : TelemetryTreeModel,
            data           : treeData(),
            sorters        : [{direction: 'ASC', property: 'stats.running.throughput'}]
        });

        expect(treeStore.items.map(node => node.id)).toEqual(['g1', 'c2', 'c1', 'c3', 'g2']);
        expect(treeStore.items.some(node => Object.hasOwn(node, 'stats.running.throughput'))).toBe(false);

        // Sort by `index` field on TreeStore (verifies sortPosition Symbol safety inherited from Collection#sortArray)
        treeStore.sorters = [{direction: 'ASC', property: 'index'}];
        expect(treeStore.items.map(node => node.id)).toEqual(['g2', 'g1', 'c3', 'c2', 'c1']);

        treeStore.destroy()
    })
});
