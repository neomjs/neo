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

    test('asContinuation marks the loads of an add and a splice, returns what its callback returns, and leaves later mutations ordinary', async () => {
        store = Neo.create(Store, {model: {module: Model, fields: [{name: 'id', type: 'String'}]}, data: [{id: 'a'}, {id: 'b'}]});
        await store.ready();
        const loads = [];
        store.on('load', ({postChunkLoad}) => loads.push(postChunkLoad));

        const count = store.asContinuation(() => {
            store.add({id: 'c'});
            store.splice(0, 1);
            return store.count
        });

        expect(count).toBe(2);
        expect(loads).toEqual([true, true]);

        loads.length = 0;
        store.add({id: 'd'});
        expect(loads).toEqual([false])
    });

    test('asContinuation restores the ordinary context after a throw, and an ordinary assignment inside it stays ordinary', async () => {
        store = Neo.create(Store, {model: {module: Model, fields: [{name: 'id', type: 'String'}]}, data: [{id: 'a'}]});
        await store.ready();
        const loads = [];
        store.on('load', ({postChunkLoad}) => loads.push(postChunkLoad));

        expect(() => store.asContinuation(() => {
            store.add({id: 'b'});
            throw new Error('producer failed')
        })).toThrow('producer failed');
        store.add({id: 'c'});
        expect(loads).toEqual([true, false]);

        loads.length = 0;
        store.asContinuation(() => {
            store.setData([{id: 'replaced'}]);
            store.add({id: 'after'})
        });
        expect(loads.length).toBeGreaterThan(1);
        expect(loads.slice(0, -1).every(postChunkLoad => postChunkLoad === false), 'the nested assignment is ordinary').toBe(true);
        expect(loads.at(-1), 'the outer continuation returns after it').toBe(true);
        expect(store.items.map(item => item.id)).toEqual(['replaced', 'after'])
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
    });

    test.describe('Temporary negative record IDs (#3559)', () => {
        test('assigns clean, non-mutating temporary IDs in eager mode with String keys', () => {
            const
                rawInitial = {name: 'Alpha'},
                rawAdded   = {name: 'Beta'},
                rawCreated = {name: 'Gamma'},
                changes    = [];

            const stringKeyStore = Neo.create(Store, {
                model: {
                    module             : Model,
                    trackModifiedFields: true,
                    fields             : [
                        {name: 'id',   type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                data     : [rawInitial],
                listeners: {
                    recordChange: data => changes.push(data)
                }
            });

            // Caller raw object must remain untouched
            expect(rawInitial.id).toBeUndefined();

            const firstRecord = stringKeyStore.getAt(0);
            expect(firstRecord.id).toBe('-1');
            expect(stringKeyStore.get('-1')).toBe(firstRecord);
            expect(firstRecord.isModified).toBe(false);
            expect(firstRecord.isModifiedField('id')).toBe(false);
            expect(firstRecord.version).toBe(2);

            // Adding a keyless item returns the created record and indexes by converted String key
            const addedRecords = stringKeyStore.add(rawAdded);
            expect(rawAdded.id).toBeUndefined();
            expect(addedRecords).toHaveLength(1);
            expect(addedRecords[0]).not.toBeNull();
            expect(addedRecords[0].id).toBe('-2');
            expect(stringKeyStore.get('-2')).toBe(addedRecords[0]);
            expect(addedRecords[0].isModified).toBe(false);
            expect(addedRecords[0].isModifiedField('id')).toBe(false);
            expect(addedRecords[0].version).toBe(2);
            expect(changes).toHaveLength(0);

            // Direct createRecord() also assigns temporary negative key before instantiation
            const standaloneRecord = stringKeyStore.createRecord(rawCreated);
            expect(rawCreated.id).toBeUndefined();
            expect(standaloneRecord.id).toBe('-3');
            expect(standaloneRecord.isModified).toBe(false);
            expect(standaloneRecord.version).toBe(2);

            stringKeyStore.destroy()
        });

        test('assigns numeric temporary IDs for Integer key fields', () => {
            const intKeyStore = Neo.create(Store, {
                model: {
                    module: Model,
                    fields: [
                        {name: 'id',   type: 'Integer'},
                        {name: 'name', type: 'String'}
                    ]
                }
            });

            const [r1, r2] = intKeyStore.add([{name: 'One'}, {name: 'Two'}]);

            expect(r1.id).toBe(-1);
            expect(r2.id).toBe(-2);
            expect(intKeyStore.get(-1)).toBe(r1);
            expect(intKeyStore.get(-2)).toBe(r2);
            expect(r1.version).toBe(1);
            expect(r2.version).toBe(1);

            intKeyStore.destroy()
        });

        test('respects mapped keys when present and assigns temporary ID when mapped key is absent', () => {
            const mappedStore = Neo.create(Store, {
                model: {
                    module: Model,
                    fields: [
                        {name: 'id',   type: 'String', mapping: 'meta.uid'},
                        {name: 'name', type: 'String'}
                    ]
                }
            });

            const [mappedRecord, unmappedRecord] = mappedStore.add([
                {meta: {uid: 'ext-42'}, name: 'Mapped'},
                {name: 'Unmapped'}
            ]);

            expect(mappedRecord.id).toBe('ext-42');
            expect(mappedStore.get('ext-42')).toBe(mappedRecord);
            expect(unmappedRecord.id).toBe('-1');
            expect(mappedStore.get('-1')).toBe(unmappedRecord);

            mappedStore.destroy()
        });

        test('re-keys map and allItems.map on hydration in Turbo Mode with String keys', () => {
            const lazyStringStore = Neo.create(Store, {
                autoInitRecords: false,
                model          : {
                    module: Model,
                    fields: [
                        {name: 'id',   type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                filters: [{property: 'name', operator: '!==', value: 'Hidden'}],
                data   : [{name: 'Visible'}, {name: 'Hidden'}]
            });

            const hydrated = lazyStringStore.getAt(0);
            expect(RecordFactory.isRecord(hydrated)).toBe(true);
            expect(hydrated.id).toBe('-1');
            expect(lazyStringStore.get('-1')).toBe(hydrated);
            expect(lazyStringStore.map.has(-1)).toBe(false);

            lazyStringStore.clearFilters();
            expect(lazyStringStore.get('-1')).toBe(hydrated);

            lazyStringStore.destroy()
        })
    });

    test.describe('Turbo Mode soft hydration with filterBy filters (#20267)', () => {
        test('Store#filter and Store#isFilteredItem soft-hydrate declared fields for an enabled filterBy filter without a value', () => {
            const lazyStore = Neo.create(Store, {
                autoInitRecords: false,
                model          : {
                    module: Model,
                    fields: [
                        {name: 'id',      type: 'Integer'},
                        {name: 'amount',  type: 'Integer'},
                        {name: 'doubled', type: 'Integer', calculate: data => data.amount * 2}
                    ]
                },
                data: [
                    {id: 1, amount: 5},
                    {id: 2, amount: 12}
                ]
            });

            // Configure a filterBy filter without a value -> triggers Store#filter() soft hydration
            lazyStore.filters = [{
                fields  : ['doubled'],
                filterBy: ({item}) => item.doubled < 20
            }];

            expect(lazyStore.count).toBe(1);
            expect(lazyStore.getAt(0).id).toBe(2);

            // Store#isFilteredItem on a fresh raw item also soft-hydrates declared fields
            const rawKept        = {id: 3, amount: 15},
                  rawFilteredOut = {id: 4, amount: 4};

            expect(lazyStore.isFilteredItem(rawKept)).toBe(false);
            expect(rawKept.doubled).toBe(30);

            expect(lazyStore.isFilteredItem(rawFilteredOut)).toBe(true);
            expect(rawFilteredOut.doubled).toBe(8);

            lazyStore.destroy()
        })
    });

    test.describe('Filtering by dotted property paths in Record and Turbo Mode (#20284)', () => {
        class DottedFilterModel extends Model {
            static config = {
                className: 'Test.Unit.Data.Store.DottedFilterModel',
                fields   : [
                    {name: 'id',    type: 'Integer'},
                    {name: 'tp',    type: 'Integer'},
                    {name: 'stats', type: 'Object'},
                    {
                        name  : 'user',
                        fields: [
                            {name: 'score', type: 'Integer'}
                        ]
                    },
                    {
                        name     : 'computed',
                        type     : 'Object',
                        calculate: data => ({score: (data.stats?.score ?? 0) * 2})
                    }
                ]
            }
        }

        Neo.setupClass(DottedFilterModel);

        const makeRows = () => [
            {id: 1, tp: 20, stats: {score: 20}, user: {score: 20}},
            {id: 2, tp: 50, stats: {score: 50}, user: {score: 50}}
        ];

        for (const autoInitRecords of [true, false]) {
            test(`matches flat, undeclared Object path, declared nested field, and calculated Object path (autoInitRecords=${autoInitRecords})`, () => {
                for (const [property, threshold] of [['tp', 30], ['stats.score', 30], ['user.score', 30], ['computed.score', 60]]) {
                    const s = Neo.create(Store, {
                        autoInitRecords,
                        model  : DottedFilterModel,
                        data   : makeRows(),
                        filters: [{operator: '>=', property, value: threshold}]
                    });

                    expect(s.items.map(item => item.id), `${property} (autoInitRecords=${autoInitRecords})`).toEqual([2]);

                    if (!autoInitRecords) {
                        expect(s.items.some(item => Object.hasOwn(item, 'stats.score'))).toBe(false);
                        expect(s.items.some(item => Object.hasOwn(item, 'user.score'))).toBe(false);
                        expect(s.items.some(item => Object.hasOwn(item, 'computed.score'))).toBe(false)
                    }

                    s.destroy()
                }
            });

            test(`matches flat field filled by defaultValue on load and add (autoInitRecords=${autoInitRecords})`, () => {
                const s = Neo.create(Store, {
                    autoInitRecords,
                    model: {
                        module: Model,
                        fields: [
                            {name: 'id',     type: 'Integer'},
                            {name: 'status', type: 'String', defaultValue: 'open'}
                        ]
                    },
                    data   : [{id: 1, status: 'open'}, {id: 2}],
                    filters: [{operator: '===', property: 'status', value: 'open'}]
                });

                expect(s.items.map(item => item.id), `load path (autoInitRecords=${autoInitRecords})`).toEqual([1, 2]);

                s.add({id: 3});
                expect(s.items.map(item => item.id), `add path (autoInitRecords=${autoInitRecords})`).toEqual([1, 2, 3]);

                s.destroy()
            })
        }
    })
});

test.describe('Neo.data.Store Model ownership', () => {
    class OwnershipModel extends Model {
        static config = {
            className: 'Test.Unit.Data.StoreModelOwnership.Model',
            fields   : [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]
        }
    }
    OwnershipModel = Neo.setupClass(OwnershipModel);

    const data          = () => [{id: 1, name: 'a'}, {id: 2, name: 'b'}],
          recordClassOf = model => Neo.ns(`${RecordFactory.recordNamespace}.${model.className}`)?.[model.id];

    // Released: nothing global keeps the Model reachable, while a retained record still reads and writes through it
    const expectReleased = (model, record) => {
        expect(Neo.get(model.id)).toBeNull();
        expect(recordClassOf(model)).toBeUndefined();
        expect(model.isDestroyed).not.toBe(true);
        expect(record.get('name')).toBe(record.name);
        expect(() => {record.name = 'changed'}).not.toThrow();
        expect(record.name).toBe('changed')
    };

    for (const [label, model] of [['class', () => OwnershipModel], ['config', () => ({module: OwnershipModel})]]) {
        test(`destroy() releases a Model the Store created from a ${label}`, () => {
            const store            = Neo.create(Store, {model: model(), data: data()}),
                  record           = store.get(1),
                  {model: created} = store;

            expect(Neo.get(created.id)).toBe(created);
            expect(recordClassOf(created)).toBeTruthy();

            store.destroy();

            expectReleased(created, record)
        })
    }

    test('replacing a Model the Store created releases it; its records keep working', () => {
        const store   = Neo.create(Store, {model: OwnershipModel, data: data()}),
              record  = store.get(1),
              created = store.model,
              passed  = Neo.create(OwnershipModel);

        store.model = passed;
        expectReleased(created, record);

        store.destroy();
        expect(Neo.get(passed.id)).toBe(passed);

        passed.destroy()
    });

    test('a passed Model instance stays its owner\'s, on destroy and on replacement', () => {
        const shared = Neo.create(OwnershipModel),
              first  = Neo.create(Store, {model: shared, data: data()});

        first.destroy();
        expect(Neo.get(shared.id)).toBe(shared);

        const second = Neo.create(Store, {model: shared, data: data()});
        second.model = OwnershipModel;
        expect(shared.isDestroyed).not.toBe(true);
        expect(Neo.get(shared.id)).toBe(shared);

        second.destroy();
        expect(recordClassOf(shared)).toBeTruthy();

        shared.destroy();
        expect(recordClassOf(shared)).toBeUndefined()
    });

    test('a released Model whose id a successor reused retires nothing of the successor\'s', () => {
        const id       = 'test-unit-data-store-model-ownership-reused-id',
              first    = Neo.create(Store, {model: {module: OwnershipModel, id}, data: data()}),
              released = first.model;

        first.destroy();
        expect(Neo.get(id)).toBeNull();

        const successor = Neo.create(OwnershipModel, {id}),
              second    = Neo.create(Store, {model: successor, data: data()}),
              ownClass  = recordClassOf(successor);

        expect(Neo.get(id)).toBe(successor);
        expect(ownClass).toBeTruthy();

        released.release();
        expect(Neo.get(id), 'a late release').toBe(successor);
        expect(recordClassOf(successor), 'a late release').toBe(ownClass);

        released.destroy();
        expect(Neo.get(id), 'the first destroy').toBe(successor);
        expect(recordClassOf(successor), 'the first destroy').toBe(ownClass);

        second.destroy();
        successor.destroy();
        expect(Neo.get(id)).toBeNull();
        expect(recordClassOf(successor)).toBeUndefined()
    })
});
