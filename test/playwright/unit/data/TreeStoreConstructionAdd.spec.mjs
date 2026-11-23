import {setup} from '../../setup.mjs';

const appName = 'TreeStoreConstructionAddTest';

setup({
    neoConfig: {
        unitTestMode: true
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
import TreeStore      from '../../../../src/data/TreeStore.mjs';
import TreeModel      from '../../../../src/data/TreeModel.mjs';

class ConstructionModel extends TreeModel {
    static config = {
        className: 'Test.Unit.Data.TreeStoreConstructionAdd.Model',
        fields   : [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]
    }
}

ConstructionModel = Neo.setupClass(ConstructionModel);

const records = open => [
    {id: 'unit-1',   name: 'Unit',   isLeaf: false, collapsed: !open},
    {id: 'person-1', name: 'Person', parentId: 'unit-1', isLeaf: true}
];

/**
 * @summary Generates its records from a reactive config, as the big-data examples do: the first `add()` runs while the
 * store processes its configs.
 */
class GeneratedStore extends TreeStore {
    static config = {
        className: 'Test.Unit.Data.TreeStoreConstructionAdd.GeneratedStore',
        model    : ConstructionModel,
        /**
         * @member {Boolean} open_=false
         * @reactive
         */
        open_: false
    }

    afterSetOpen(value) {
        this.add(records(value))
    }
}

GeneratedStore = Neo.setupClass(GeneratedStore);

/**
 * @summary The ids of the visible projection, in order.
 * @param {Neo.data.TreeStore} store
 * @returns {String[]}
 */
const visible = store => Array.from({length: store.count}, (item, index) => store.getAt(index).id);

test.describe('Neo.data.TreeStore (records added while it is constructed)', () => {
    for (const open of [false, true]) {
        const expected = open ? ['unit-1', 'person-1'] : ['unit-1'];

        test(`an ${open ? 'expanded' : 'collapsed'} parent added during construction projects its rows`, () => {
            const store = Neo.create(GeneratedStore, {appName, open});

            expect(visible(store)).toEqual(expected);
            store.destroy()
        });

        test(`control: the same ${open ? 'expanded' : 'collapsed'} parent loaded through data`, () => {
            const store = Neo.create(TreeStore, {appName, model: ConstructionModel, data: records(open)});

            expect(visible(store)).toEqual(expected);
            store.destroy()
        })
    }
});
