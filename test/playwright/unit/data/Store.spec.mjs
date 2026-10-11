import {setup} from '../../setup.mjs';

const appName = 'StoreTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model          from '../../../../src/data/Model.mjs';
import RecordFactory  from '../../../../src/data/RecordFactory.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary Tests for Neo.data.Store
 */
test.describe('Neo.data.Store explicit data assignment intent', () => {
    let store;

    test.afterEach(() => store?.destroy());

    for (const autoInitRecords of [true, false]) {
        test(`continuation preserves data hooks, filtering and fresh records (eager=${autoInitRecords})`, async () => {
            store = Neo.create(Store, {
                autoInitRecords,
                model  : {module: Model, fields: [{name: 'id', type: 'String'}, {name: 'rank'}, {name: 'hidden'}]},
                sorters: [{property: 'rank', direction: 'ASC'}],
                data   : [{id: 'a', rank: 2}, {id: 'b', rank: 3}]
            });
            await store.ready();
            store.filters = [{filterBy: ({item}) => item.hidden === true}];
            const previous = store.get('a'), loads = [], hooks = [], before = store.beforeSetData;
            store.beforeSetData = function(value, oldValue) {
                hooks.push(value.map(({id, rank, hidden}) => ({id, rank, hidden})));
                return before.call(this, value, oldValue)
            };
            store.on('load', ({postChunkLoad, items}) => loads.push({postChunkLoad, count: items.length}));
            const data = [{id: 'a', rank: 4}, {id: 'b', rank: 1}, {id: 'hidden', rank: 0, hidden: true}];

            store.setData(data, {continuation: true});

            expect(hooks).toEqual([data.map(({id, rank, hidden}) => ({id, rank, hidden}))]);
            expect(store.data.map(item => item.id)).toEqual(data.map(item => item.id));
            expect(store.items.map(item => item.id)).toEqual(['b', 'a']);
            expect(store.allItems.count).toBe(3);
            expect(store.get('a')).not.toBe(previous);
            expect(loads).toEqual([{postChunkLoad: true, count: 2}]);

            loads.length = 0;
            store.setData([{id: 'short', rank: 0}]);
            expect(store.items.map(item => item.id)).toEqual(['short']);
            expect(store.allItems.count).toBe(1);
            expect(loads.every(event => event.postChunkLoad === false)).toBe(true);
            expect(loads.length).toBeGreaterThan(0);

            loads.length = 0;
            store.setData([], {continuation: true});
            expect(store.count).toBe(0);
            expect(store.allItems.count).toBe(0);
            expect(loads).toEqual([{postChunkLoad: true, count: 0}]);

            loads.length = 0;
            store.add({id: 'ordinary', rank: 0});
            expect(loads).toEqual([{postChunkLoad: false, count: 1}]);
            loads.length = 0;
            store.sort('rank');
            expect(loads.length).toBeGreaterThan(0);
            expect(loads.some(event => event.postChunkLoad === true)).toBe(false)
        });
    }

    test('a nested ordinary assignment and later mutation do not inherit continuation', async () => {
        store = Neo.create(Store, {model: {module: Model, fields: [{name: 'id', type: 'String'}]}, data: [{id: 'initial'}]});
        await store.ready();
        const loads  = [];
        let   nested = false;
        store.on('load', ({postChunkLoad}) => {
            loads.push(postChunkLoad);
            if (!nested) {
                nested = true;
                store.setData([{id: 'nested'}]);
            }
        });

        store.setData([{id: 'outer'}], {continuation: true});
        store.add({id: 'later'});

        expect(loads).toEqual([true, false, false]);
        expect(store.items.map(item => item.id)).toEqual(['nested', 'later'])
    });

    test('a rejected config hook restores the continuation context', async () => {
        store = Neo.create(Store, {model: {module: Model, fields: [{name: 'id', type: 'String'}]}, data: [{id: 'initial'}]});
        await store.ready();
        const loads = [], before = store.beforeSetData;
        store.beforeSetData = function(value, oldValue) {
            if (value[0]?.id === 'throw') throw new Error('hook refused');
            return before.call(this, value, oldValue)
        };
        store.on('load', ({postChunkLoad}) => loads.push(postChunkLoad));

        expect(() => store.setData([{id: 'throw'}], {continuation: true})).toThrow('hook refused');
        store.data = [{id: 'ordinary'}];

        expect(loads).toEqual([false]);
        expect(store.items.map(item => item.id)).toEqual(['ordinary'])
    });
});

test.describe('Neo.data.Store', () => {
    let store;

    test.beforeEach(() => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            model: {
                module: Model,
                fields: [
                    {name: 'id',   type: 'String'},
                    {name: 'name', type: 'String'}
                ]
            },
            items: [
                {id: '1', name: 'Item 1'},
                {id: '2', name: 'Item 2'}
            ]
        });
    });

    test('Add items (init=true by default)', () => {
        const result = store.add({id: '3', name: 'Item 3'});

        expect(store.count).toBe(3);
        expect(result.length).toBe(1);
        expect(RecordFactory.isRecord(result[0])).toBe(true);
        expect(result[0].name).toBe('Item 3');
    });

    test('Add items (init=false)', () => {
        const result = store.add({id: '4', name: 'Item 4'}, false);

        expect(store.count).toBe(3); // count is 3 because we added 1 to the initial 2
        expect(result.length).toBe(1);
        expect(RecordFactory.isRecord(result[0])).toBe(false);
        expect(result[0].name).toBe('Item 4');
    });

    test('initRecord with raw object', () => {
        const raw = {id: '5', name: 'Item 5'};
        // Manually add raw item first so it's in the store (initRecord retrieves it)
        store.add(raw, false);

        const record = store.initRecord(raw);

        expect(RecordFactory.isRecord(record)).toBe(true);
        expect(record.name).toBe('Item 5');
        // Verify it replaced the raw item in the store
        expect(store.get('5')).toBe(record);
    });

    test('initRecord with existing record (Optimization)', () => {
        const raw = {id: '6', name: 'Item 6'};
        store.add(raw, false);
        const record = store.initRecord(raw); // Create the record

        // Now call initRecord again with the record instance
        const sameRecord = store.initRecord(record);

        expect(sameRecord).toBe(record);
        expect(RecordFactory.isRecord(sameRecord)).toBe(true);
    });

    test('autoInitRecords config', () => {
        const lazyStore = Neo.create(Store, {
            autoInitRecords: false,
            keyProperty: 'id',
            model: {
                module: Model,
                fields: [{name: 'id'}, {name: 'name'}]
            }
        });

        const result = lazyStore.add({id: 'lazy1', name: 'Lazy Item'});
        expect(RecordFactory.isRecord(result[0])).toBe(false);

        const insertResult = lazyStore.insert(0, {id: 'lazy2', name: 'Lazy Insert'});
        expect(RecordFactory.isRecord(insertResult[0])).toBe(false);

        // Test data config
        lazyStore.data = [{id: 'lazy3', name: 'Lazy Data'}];

        // Check internal map directly to verify it is stored as a raw object (lazy)
        const rawItem = lazyStore.map.get('lazy3');
        expect(RecordFactory.isRecord(rawItem)).toBe(false);

        // Accessing via get() should instantiate the record
        const record = lazyStore.get('lazy3');
        expect(RecordFactory.isRecord(record)).toBe(true);
    });

    // forEach hands its callbacks one shared copy of the items: these pin what that copy holds
    test.describe('forEach callback items', () => {
        function createLazyStore() {
            return Neo.create(Store, {
                autoInitRecords: false,
                keyProperty    : 'id',
                model          : {module: Model, fields: [{name: 'id'}, {name: 'name'}]},
                data           : [{id: 1, name: 'a'}, {id: 2, name: 'b'}]
            })
        }

        test('every reached entry is the Record the callback receives', () => {
            const lazyStore = createLazyStore();

            lazyStore.forEach((record, index, items) => {
                expect(RecordFactory.isRecord(record)).toBe(true);
                expect(items[index]).toBe(record)
            });

            lazyStore.destroy()
        });

        test('mutating the items copy leaves the store untouched', () => {
            const
                lazyStore = createLazyStore(),
                seen      = [];

            lazyStore.forEach((record, index, items) => {
                index === 0 && items.pop();
                seen.push(record.id);
                expect(items[index]).toBe(record)
            });

            expect(seen).toEqual([1, 2]);
            expect(lazyStore.count).toBe(2);

            lazyStore.destroy()
        });

        test('a record a callback adds is visited and appears in the next copy', () => {
            const
                lazyStore = createLazyStore(),
                seen      = [];

            lazyStore.forEach((record, index, items) => {
                index === 0 && lazyStore.add({id: 3, name: 'c'});
                seen.push(record.id);
                index === 2 && expect(items).toHaveLength(3)
            });

            expect(seen).toEqual([1, 2, 3]);

            lazyStore.destroy()
        })
    })
});
