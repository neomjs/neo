import {setup} from '../../setup.mjs';

const appName = 'ListUseCheckBoxesTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import List           from '../../../../src/list/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

test.describe('Neo.list.Base#useCheckBoxes and checkedField synchronization', () => {
    class CheckListModel extends Model {
        static config = {
            className: 'Test.Unit.List.UseCheckBoxes.Model',
            fields   : [
                {name: 'id',      type: 'String'},
                {name: 'name',    type: 'String'},
                {name: 'checked', type: 'Boolean', defaultValue: false}
            ]
        }
    }
    Neo.setupClass(CheckListModel);

    class CheckListStore extends Store {
        static config = {
            className  : 'Test.Unit.List.UseCheckBoxes.Store',
            model      : CheckListModel,
            keyProperty: 'id'
        }
    }
    Neo.setupClass(CheckListStore);

    class CustomCheckModel extends Model {
        static config = {
            className: 'Test.Unit.List.UseCheckBoxes.CustomModel',
            fields   : [
                {name: 'id',        type: 'String'},
                {name: 'name',      type: 'String'},
                {name: 'isChecked', type: 'Boolean', defaultValue: false}
            ]
        }
    }
    Neo.setupClass(CustomCheckModel);

    class CustomCheckStore extends Store {
        static config = {
            className  : 'Test.Unit.List.UseCheckBoxes.CustomStore',
            model      : CustomCheckModel,
            keyProperty: 'id'
        }
    }
    Neo.setupClass(CustomCheckStore);

    let list;

    test.afterEach(() => {
        list?.store?.destroy();
        list?.destroy();
        list = null
    });

    test('syncs initial checked records to selection and updates record[checkedField] on select/deselect', () => {
        list = Neo.create(List, {
            appName,
            useCheckBoxes : true,
            selectionModel: {
                ntype        : 'selection-listmodel',
                singleSelect : false,
                toggleOnClick: true
            },
            store: Neo.create(CheckListStore, {
                data: [
                    {id: 'a', name: 'Alpha', checked: true},
                    {id: 'b', name: 'Beta',  checked: false},
                    {id: 'c', name: 'Gamma', checked: false}
                ]
            })
        });

        const
            recA   = list.store.get('a'),
            recB   = list.store.get('b'),
            itemA  = list.getItemId(recA),
            itemB  = list.getItemId(recB),
            sModel = list.selectionModel;

        // Initial record with checked: true is synced to selectionModel and VDOM
        expect(sModel.isSelected(itemA)).toBe(true);
        expect(list.vdom.cn[0].cls).toContain('neo-selected');
        expect(list.vdom.cn[1].cls).not.toContain('neo-selected');

        // Selecting itemB updates recB.checked to true
        sModel.select(itemB);
        expect(recB.checked).toBe(true);
        expect(recA.checked).toBe(true);
        expect(list.vdom.cn[1].cls).toContain('neo-selected');

        // Deselecting itemA updates recA.checked to false
        sModel.deselect(itemA);
        expect(recA.checked).toBe(false);
        expect(list.vdom.cn[0].cls).not.toContain('neo-selected');

        // Mutating recA.checked = true directly syncs back to selectionModel and VDOM
        recA.checked = true;
        expect(sModel.isSelected(itemA)).toBe(true);
        expect(list.vdom.cn[0].cls).toContain('neo-selected');

        // Mutating recB.checked = false directly deselects itemB
        recB.checked = false;
        expect(sModel.isSelected(itemB)).toBe(false);
        expect(list.vdom.cn[1].cls).not.toContain('neo-selected');
    });

    test('supports custom checkedField name and radio-style singleSelect deselection', () => {
        list = Neo.create(List, {
            appName,
            checkedField  : 'isChecked',
            useCheckBoxes : true,
            selectionModel: {
                ntype       : 'selection-listmodel',
                singleSelect: true
            },
            store: Neo.create(CustomCheckStore, {
                data: [
                    {id: '1', name: 'One', isChecked: true},
                    {id: '2', name: 'Two', isChecked: false}
                ]
            })
        });

        const
            rec1 = list.store.get('1'),
            rec2 = list.store.get('2');

        expect(list.selectionModel.isSelected(list.getItemId(rec1))).toBe(true);

        // Selecting rec2 in singleSelect mode sets rec2.isChecked = true and rec1.isChecked = false
        list.selectionModel.select(list.getItemId(rec2));
        expect(rec2.isChecked).toBe(true);
        expect(rec1.isChecked).toBe(false);
    });

    for (const reset of [false, true]) {
        test(`one click unchecks only its record ${reset ? 'after selection is re-enabled' : 'without a view reset'}`, () => {
            list = Neo.create(List, {
                appName,
                useCheckBoxes : true,
                selectionModel: {ntype: 'selection-listmodel', singleSelect: false, toggleOnClick: true},
                store         : Neo.create(CheckListStore, {
                    data: [
                        {id: 'a', name: 'Alpha', checked: true},
                        {id: 'b', name: 'Beta',  checked: true},
                        {id: 'c', name: 'Gamma', checked: false}
                    ]
                })
            });

            const records = ['a', 'b', 'c'].map(id => list.store.get(id)),
                  ids     = records.map(record => list.getItemId(list.getRecordId(record))),
                  items   = ids.map(id => list.getVdomChild(id)),
                  model   = list.selectionModel;
            let recordChanges = 0, selectionChanges = 0;

            list.store.on('recordChange', () => recordChanges++);
            model.on('selectionChange', () => selectionChanges++);

            if (reset) {
                list.vnodeInitialized = true;
                list.disableSelection = true;
                const resetEvents = selectionChanges;

                list.disableSelection = false;
                expect(selectionChanges).toBe(resetEvents)
            }

            expect(recordChanges).toBe(0);
            expect(records.map(record => record.checked)).toEqual([true, true, false]);
            expect(ids.map(id => model.isSelected(id))).toEqual([true, true, false]);
            expect(items.map(item => item.cls.includes('neo-selected'))).toEqual([true, true, false]);
            expect(items.map(item => item['aria-selected'])).toEqual([true, true, false]);
            ids.forEach((id, index) => expect(list.getVdomChild(id)).toBe(items[index]));

            model.onListClick({currentTarget: ids[0]});
            expect(records.map(record => record.checked)).toEqual([false, true, false]);
            expect(ids.map(id => model.isSelected(id))).toEqual([false, true, false])
        })
    }

    test('re-enabling single selection preserves custom checked marks and filtered store order', () => {
        const store = Neo.create(CustomCheckStore, {
            data: [
                {id: 'a', name: 'Hidden', isChecked: true},
                {id: 'b', name: 'Beta',   isChecked: true},
                {id: 'c', name: 'Gamma',  isChecked: true}
            ]
        });
        const records = ['a', 'b', 'c'].map(id => store.get(id));

        store.set({filters: [{property: 'id', operator: '!=', value: 'a'}], sorters: [{property: 'id', direction: 'DESC'}]});
        list = Neo.create(List, {
            appName,
            checkedField  : 'isChecked',
            useCheckBoxes : true,
            selectionModel: {ntype: 'selection-listmodel', singleSelect: true},
            store
        });

        const visible = store.items.map(record => list.getItemId(list.getRecordId(record))),
              items   = visible.map(id => list.getVdomChild(id));
        let recordChanges = 0, selectionChanges = 0;

        expect(store.items.map(record => record.id)).toEqual(['c', 'b']);
        expect(visible.map(id => list.selectionModel.isSelected(id))).toEqual([true, false]);
        store.on('recordChange', () => recordChanges++);
        list.selectionModel.on('selectionChange', () => selectionChanges++);
        list.vnodeInitialized = true;
        list.disableSelection = true;
        const resetEvents = selectionChanges;

        list.disableSelection = false;
        expect(selectionChanges).toBe(resetEvents);
        expect(recordChanges).toBe(0);
        expect(records.map(record => record.isChecked)).toEqual([true, true, true]);
        expect(visible.map(id => list.selectionModel.isSelected(id))).toEqual([true, false]);
        expect(items.map(item => item.cls.includes('neo-selected'))).toEqual([true, true]);
        expect(items.map(item => item['aria-selected'])).toEqual([true, true]);
        visible.forEach((id, index) => expect(list.getVdomChild(id)).toBe(items[index]))
    });

    test('view resets (disableSelection / deselectAll and selectedIndex = null) do not overwrite checked record data', () => {
        list = Neo.create(List, {
            appName,
            useCheckBoxes : true,
            selectionModel: {
                ntype        : 'selection-listmodel',
                singleSelect : false,
                toggleOnClick: true
            },
            store: Neo.create(CheckListStore, {
                data: [
                    {id: 'a', name: 'Alpha', checked: true},
                    {id: 'b', name: 'Beta',  checked: true},
                    {id: 'c', name: 'Gamma', checked: false}
                ]
            })
        });

        const
            recA = list.store.get('a'),
            recB = list.store.get('b'),
            recC = list.store.get('c');

        // C1: disableSelection / selectionModel.deselectAll() must not clear persisted checked state on a and b
        list.vnodeInitialized = true;
        list.disableSelection = true;
        expect(recA.checked).toBe(true);
        expect(recB.checked).toBe(true);

        list.disableSelection = false;
        list.createItems(true);
        list.selectionModel.deselectAll();
        expect(recA.checked).toBe(true);
        expect(recB.checked).toBe(true);

        // C2: selectedIndex = 2 then selectedIndex = null must not clear checked state across records
        list.createItems(true);
        list.selectedIndex = 2;
        expect(recC.checked).toBe(true);

        list.selectedIndex = null;
        expect(recA.checked).toBe(true);
        expect(recB.checked).toBe(true);
        expect(recC.checked).toBe(true);
    });
});
