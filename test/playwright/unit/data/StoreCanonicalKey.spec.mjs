import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name             : 'StoreCanonicalKeyTest',
        isMounted        : () => true,
        vnodeInitialising: false
    },
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Model           from '../../../../src/data/Model.mjs';
import RecordFactory   from '../../../../src/data/RecordFactory.mjs';
import Store           from '../../../../src/data/Store.mjs';
import TreeModel       from '../../../../src/data/TreeModel.mjs';
import TreeStore       from '../../../../src/data/TreeStore.mjs';

let StringKeyModel = class StringKeyModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.StringKeyModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',     type: 'String'},
            {name: 'name',   type: 'String'},
            {name: 'active', type: 'Boolean', defaultValue: true}
        ]
    }
};
StringKeyModel = Neo.setupClass(StringKeyModel);

let IntKeyModel = class IntKeyModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.IntKeyModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',   type: 'Integer'},
            {name: 'name', type: 'String'}
        ]
    }
};
IntKeyModel = Neo.setupClass(IntKeyModel);

let StringKeyTreeModel = class StringKeyTreeModel extends TreeModel {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.StringKeyTreeModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'}
        ]
    }
};
StringKeyTreeModel = Neo.setupClass(StringKeyTreeModel);

let IntKeyTreeModel = class IntKeyTreeModel extends TreeModel {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.IntKeyTreeModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',   type: 'Integer'},
            {name: 'name', type: 'String'}
        ]
    }
};
IntKeyTreeModel = Neo.setupClass(IntKeyTreeModel);

let ConvertKeyModel = class ConvertKeyModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.ConvertKeyModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',   type: 'String', convert: (value, record) => `${record ? 'record' : 'plain'}:${value}`},
            {name: 'name', type: 'String'}
        ]
    }
};
ConvertKeyModel = Neo.setupClass(ConvertKeyModel);

let CalculatedKeyModel = class CalculatedKeyModel extends Model {
    static config = {
        className  : 'Test.Unit.Data.StoreCanonicalKey.CalculatedKeyModel',
        keyProperty: 'id',
        fields     : [
            {name: 'id',   type: 'String', calculate: data => `calc:${data?.name ?? ''}`},
            {name: 'name', type: 'String'}
        ]
    }
};
CalculatedKeyModel = Neo.setupClass(CalculatedKeyModel);

let HeterogeneousStore = class HeterogeneousStore extends Store {
    static config = {
        className: 'Test.Unit.Data.StoreCanonicalKey.HeterogeneousStore',
        shape    : null
    }

    modelOf(item) {
        return item?.total ? this.shape : this.model
    }
};
HeterogeneousStore = Neo.setupClass(HeterogeneousStore);

test.describe('Neo.data.Store & Neo.data.TreeStore - Canonical Key Boundaries (#20928)', () => {
    const owned = [];

    const own = (...instances) => {
        owned.push(...instances);
        return instances[0]
    };

    test.afterEach(() => {
        owned.splice(0).reverse().forEach(instance => instance?.destroy?.())
    });

    for (const autoInitRecords of [false, true]) {
        const modeLabel = autoInitRecords ? 'eager (autoInitRecords: true)' : 'Turbo Mode (autoInitRecords: false)';

        test(`Store (${modeLabel}): String key field fed numeric raw ids resolves one Record across get(1), repeated get(1), get('1') and getAt(0)`, () => {
            const store = own(Neo.create(Store, {
                autoInitRecords,
                model: StringKeyModel,
                data : [
                    {id: 1, name: 'alpha'},
                    {id: 2, name: 'beta'}
                ]
            }));

            const first  = store.get(1),
                  second = store.get(1),
                  byStr  = store.get('1'),
                  atZero = store.getAt(0);

            expect(first).not.toBeNull();
            expect(first.isRecord).toBe(true);
            expect(first.id).toBe('1');
            expect(second).toBe(first);
            expect(byStr).toBe(first);
            expect(atZero).toBe(first);

            first.name = 'updated';
            expect(store.get(1).name).toBe('updated');
            expect(store.get('1').name).toBe('updated');
            expect(store.getAt(0).name).toBe('updated')
        });

        test(`TreeStore (${modeLabel}): String key field fed numeric raw ids preserves single Record identity across get(), getChildren() and expand()`, async () => {
            const tree = own(Neo.create(TreeStore, {
                autoInitRecords,
                model: StringKeyTreeModel,
                data : [
                    {id: 1, name: 'root-1', parentId: null},
                    {id: 2, name: 'child',  parentId: 1},
                    {id: 3, name: 'root-2', parentId: null}
                ]
            }));

            const rootFirst  = tree.get(1),
                  rootSecond = tree.get(1),
                  rootByStr  = tree.get('1'),
                  rootAtZero = tree.getAt(0);

            expect(rootFirst).not.toBeNull();
            expect(rootFirst.id).toBe('1');
            expect(rootFirst.isLeaf).toBe(false);
            expect(rootSecond).toBe(rootFirst);
            expect(rootByStr).toBe(rootFirst);
            expect(rootAtZero).toBe(rootFirst);

            const childFirst  = tree.getChildren(1)[0],
                  childSecond = tree.getChildren(1)[0],
                  childByStr  = tree.getChildren('1')[0];

            expect(childFirst).toBeDefined();
            expect(childFirst.id).toBe('2');
            expect(childFirst.parentId).toBe('1');
            expect(childFirst.depth).toBe(1);
            expect(childSecond).toBe(childFirst);
            expect(childByStr).toBe(childFirst);
            expect(tree.get(2)).toBe(childFirst);
            expect(tree.get('2')).toBe(childFirst);

            childFirst.name = 'edited-child';
            expect(tree.get(2).name).toBe('edited-child');
            expect(tree.get('2').name).toBe('edited-child');
            expect(tree.getChildren(1)[0].name).toBe('edited-child');

            await tree.expand(1);
            expect(tree.getAt(1)).toBe(childFirst);
            expect(tree.getAt(1).name).toBe('edited-child')
        });

        test(`Symmetric Integer key field (${modeLabel}): string raw ids resolve one Record across get('1'), get(1) and getAt(0)`, () => {
            const store = own(Neo.create(Store, {
                autoInitRecords,
                model: IntKeyModel,
                data : [{id: '1', name: 'one'}, {id: '2', name: 'two'}]
            }));

            const fromStr = store.get('1'),
                  fromInt = store.get(1);

            expect(fromStr).not.toBeNull();
            expect(fromStr.id).toBe(1);
            expect(fromStr).toBe(fromInt);
            expect(fromStr).toBe(store.get('1'));
            expect(fromStr).toBe(store.getAt(0));

            const tree = own(Neo.create(TreeStore, {
                autoInitRecords,
                model: IntKeyTreeModel,
                data : [{id: '1', name: 'root-one', parentId: null}]
            }));

            const treeRoot = tree.get('1');
            expect(treeRoot).not.toBeNull();
            expect(treeRoot.id).toBe(1);
            expect(tree.get('1')).toBe(treeRoot);
            expect(tree.get(1)).toBe(treeRoot);
            expect(tree.getAt(0)).toBe(treeRoot)
        });
    }

    test('Filtered Turbo Mode Store keeps allItems map synchronized for numeric raw ids and auto-stamped keyless rows', () => {
        const store = own(Neo.create(Store, {
            autoInitRecords: false,
            filters        : [{property: 'active', value: true}],
            model          : StringKeyModel,
            data           : [
                {id: 1, name: 'visible', active: true},
                {id: 2, name: 'hidden',  active: false},
                {name: 'keyless',        active: true}
            ]
        }));

        expect(store.count).toBe(2);

        const visible = store.get(1);
        expect(visible.id).toBe('1');
        expect(store.get('1')).toBe(visible);

        const keyless = store.getAt(1);
        expect(keyless.id).toBe('-1');
        expect(store.get('-1')).toBe(keyless);
        expect(store.get(-1)).toBe(keyless);

        store.clearFilters();
        expect(store.count).toBe(3);
        expect(store.get(1)).toBe(visible);
        expect(store.get(2).id).toBe('2');
        expect(store.get('-1')).toBe(keyless)
    });

    test('String ids, stores without a declared key field, and convert/calculate keys preserve existing contracts', () => {
        const stringIdStore = own(Neo.create(Store, {
            autoInitRecords: false,
            model          : StringKeyModel,
            data           : [{id: 'str-1', name: 'plain'}]
        }));

        const stringRecord = stringIdStore.get('str-1');
        expect(stringRecord.id).toBe('str-1');
        expect(stringIdStore.get('str-1')).toBe(stringRecord);
        expect(stringIdStore.getAt(0)).toBe(stringRecord);

        const noKeyFieldStore = own(Neo.create(Store, {
            autoInitRecords: false,
            model          : {module: Model, fields: [{name: 'name', type: 'String'}]},
            data           : [{id: 'raw-1', name: 'untyped'}]
        }));

        expect(noKeyFieldStore.getCanonicalKey('raw-1')).toBe('raw-1');
        expect(noKeyFieldStore.getCanonicalKey(null)).toBeUndefined();
        expect(noKeyFieldStore.get('raw-1').name).toBe('untyped');

        const convertStore = own(Neo.create(Store, {
            autoInitRecords: false,
            model          : ConvertKeyModel,
            data           : [{id: '1', name: 'converted'}]
        }));

        const converted = convertStore.getAt(0);
        expect(converted.id).toBe('record:1');
        expect(convertStore.get('record:1')).toBe(converted);
        expect(convertStore.get('1')).toBeNull();

        const calcStore = own(Neo.create(Store, {
            autoInitRecords: false,
            model          : CalculatedKeyModel,
            data           : [{name: 'alpha'}]
        }));

        const calculated = calcStore.getAt(0);
        expect(calculated.id).toBe('calc:alpha');
        expect(calcStore.get('calc:alpha')).toBe(calculated)
    });

    test('Heterogeneous modelOf(item) Store canonicalizes each raw row by its own model without querying modelOf on Records', () => {
        const shape = Neo.create(Model, {
            keyProperty: 'id',
            fields     : [
                {name: 'id',    type: 'String'},
                {name: 'label', type: 'String'}
            ]
        });

        const store = Neo.create(HeterogeneousStore, {
            autoInitRecords: false,
            model          : IntKeyModel,
            shape,
            data           : [
                {id: '10', name: 'leaf-ten'},
                {id: '2026-total', label: 'Year Total', total: true}
            ]
        });

        shape.storeId = store.id;
        own(shape, store);

        const group = store.get('2026-total'),
              leaf  = store.get(10);

        expect(group).not.toBeNull();
        expect(group.id).toBe('2026-total');
        expect(leaf).not.toBeNull();
        expect(leaf.id).toBe(10);
        expect(store.get('10')).toBe(leaf);

        const asked       = [];
        const origModelOf = store.modelOf;
        store.modelOf = item => (asked.push(item), origModelOf.call(store, item));

        expect(store.getKey(group)).toBe('2026-total');
        expect(store.getKey(leaf)).toBe(10);
        expect(asked).toEqual([])
    });

    test('RecordFactory.isCanonicalFieldValue skips parseRecordValue for already-canonical raw keys while preserving HTML/length/type fallbacks', () => {
        const boundedModel = own(Neo.create(Model, {
            keyProperty: 'id',
            fields     : [{name: 'id', type: 'String', maxLength: 4}]
        }));
        const boundedStore = own(Neo.create(Store, {
            autoInitRecords: false,
            model          : boundedModel
        }));

        const intStore    = own(Neo.create(Store,     {autoInitRecords: false, model: IntKeyModel}));
        const strStore    = own(Neo.create(Store,     {autoInitRecords: false, model: StringKeyModel}));
        const intTree     = own(Neo.create(TreeStore, {autoInitRecords: false, model: IntKeyTreeModel}));
        const strTree     = own(Neo.create(TreeStore, {autoInitRecords: false, model: StringKeyTreeModel}));
        const origParse   = RecordFactory.parseRecordValue;
        let   parserCalls = 0;

        RecordFactory.parseRecordValue = function(...args) {
            parserCalls++;
            return origParse.apply(this, args)
        };

        try {
            intStore.add([{id: 0, name: 'zero'}, {id: 1, name: 'one'}, {id: -2, name: 'neg'}], false);
            strStore.add([{id: '', name: 'empty'}, {id: 'alpha', name: 'plain'}], false);
            intTree.add([{id: 1, name: 'root', parentId: null}, {id: 2, name: 'leaf', parentId: 1}], false);
            strTree.add([{id: 'r1', name: 'root', parentId: null}, {id: 'c1', name: 'leaf', parentId: 'r1'}], false);

            expect(parserCalls, 'already-canonical Store and TreeStore rows bypass parseRecordValue').toBe(0);

            expect(strStore.getCanonicalKey('<b>tag</b>')).toBe('tag');
            expect(parserCalls, 'strings containing < fall through to HTML stripping').toBe(1);

            expect(intStore.getCanonicalKey('42')).toBe(42);
            expect(parserCalls, 'string raw keys under Integer fall through to parseInt').toBe(2);

            expect(boundedStore.getCanonicalKey('abc')).toBe('abc');
            expect(boundedStore.getCanonicalKey('too-long')).toBeUndefined();
            expect(parserCalls, 'fields with maxLength/minLength fall through to length validation').toBe(4)
        } finally {
            RecordFactory.parseRecordValue = origParse
        }
    });
});
