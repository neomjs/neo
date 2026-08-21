import {setup} from '../../setup.mjs';

const appName = 'ListModelToggleOnClickTest';

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
// registers Neo.get — list.Base resolves registered instances through it; without this the spec
// crashes in isolation (green only when a sibling in the shared worker imported it first)
import Instance       from '../../../../src/manager/Instance.mjs';
import List           from '../../../../src/list/Base.mjs';
import Model          from '../../../../src/data/Model.mjs';
import Store          from '../../../../src/data/Store.mjs';

/**
 * @summary The reusable engine contract of `selection.ListModel#toggleOnClick`, asserted through
 * the REAL click entry (`onListClick` with a vdom item id — the same record→selection-id
 * conversion the DOM path exercises), never by poking the selection collection directly:
 * default `false` preserves the shipped re-click-keeps-selected behavior, the multi-select opt-in
 * deselects on a second click, and `singleSelect` never consults the flag at all.
 */
test.describe('Neo.selection.ListModel — toggleOnClick engine contract', () => {
    class TestModel extends Model {
        static config = {
            className: 'Test.Unit.Selection.ToggleOnClick.Model',
            fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
        }
    }
    Neo.setupClass(TestModel);

    class TestStore extends Store {
        static config = {
            className  : 'Test.Unit.Selection.ToggleOnClick.Store',
            model      : TestModel,
            keyProperty: 'id'
        }
    }
    Neo.setupClass(TestStore);

    const createList = selectionModel => Neo.create(List, {
        appName,
        displayField  : 'name',
        selectionModel,
        store: Neo.create(TestStore, {
            data: [
                {id: 'a', name: 'Alpha'},
                {id: 'b', name: 'Beta'}
            ]
        })
    });

    // the RENDERED item id for a record — resolved through the same record→id conversion the
    // list applies when it renders (internal-id aware), so clicks and asserts match the DOM's ids
    const itemId = (list, recordId) => list.getItemId(list.store.get(recordId));

    const clickRecord = (list, recordId) => list.selectionModel.onListClick({
        currentTarget: itemId(list, recordId)
    });

    test('default false: a re-click on a selected item KEEPS it selected — the shipped behavior', () => {
        const list  = createList({ntype: 'selection-listmodel', singleSelect: false}),
              model = list.selectionModel;

        expect(model.toggleOnClick).toBe(false);

        clickRecord(list, 'a');
        expect(model.isSelected(itemId(list, 'a'))).toBe(true);

        clickRecord(list, 'a');
        expect(model.isSelected(itemId(list, 'a')), 'no opt-in ⇒ re-click never deselects').toBe(true);

        list.store.destroy();
        list.destroy()
    });

    test('multi-select opt-in: a second click deselects through the vnode-id conversion; additivity survives', () => {
        const list  = createList({ntype: 'selection-listmodel', singleSelect: false, toggleOnClick: true}),
              model = list.selectionModel;

        clickRecord(list, 'a');
        clickRecord(list, 'b');
        expect(model.items).toHaveLength(2);

        // the toggle: clicking the SELECTED record again removes exactly it, the sibling stays
        clickRecord(list, 'b');
        expect(model.isSelected(itemId(list, 'b'))).toBe(false);
        expect(model.isSelected(itemId(list, 'a'))).toBe(true);

        clickRecord(list, 'a');
        expect(model.items, 'toggling the last selection empties it').toHaveLength(0);

        list.store.destroy();
        list.destroy()
    });

    test('singleSelect ignores an accidental toggleOnClick:true — re-click keeps the selection', () => {
        const list  = createList({ntype: 'selection-listmodel', singleSelect: true, toggleOnClick: true}),
              model = list.selectionModel;

        clickRecord(list, 'a');
        clickRecord(list, 'a');
        expect(model.isSelected(itemId(list, 'a')), 'single-select semantics stay untouched').toBe(true);

        list.store.destroy();
        list.destroy()
    })
});
