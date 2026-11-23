import {setup} from '../../../setup.mjs';

const appName = 'ItemEditingTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Instance       from '../../../../../src/manager/Instance.mjs';
import ItemEditing    from '../../../../../src/list/plugin/ItemEditing.mjs';
import List           from '../../../../../src/list/Base.mjs';

/**
 * @summary Neo.list.plugin.ItemEditing's teardown: a plugin destroyed on its own takes its bindings with it and ends
 * its edit, and an owner destroyed mid-edit takes the editor with it without rendering again.
 */

let list, plugin;

/**
 * @param {String} recordId
 * @returns {String} The record's item id
 */
const itemId = recordId => list.getItemId(list.getRecordId(list.store.get(recordId)));

test.describe('Neo.list.plugin.ItemEditing', () => {
    test.beforeEach(async () => {
        list = Neo.create(List, {
            appName,
            displayField: 'name',
            id          : 'item-editing-list',
            plugins     : [{module: ItemEditing}],
            store       : {
                model: {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
                data : [{id: 'a', name: 'a.txt'}, {id: 'b', name: 'b.txt'}]
            }
        });

        await list.initVnode();

        plugin = list.getPlugin('plugin-list-item-editing')
    });

    test.afterEach(() => {
        list.isDestroyed || list.destroy()
    });

    test('a plugin destroyed on its own takes its F2 key and its double-click listener with it', () => {
        const
            f2Keys       = () => list.keys._keys.filter(key => key.key === 'F2'),
            doubleClicks = () => list.domListeners.filter(listener => Object.hasOwn(listener, 'dblclick'));

        expect(f2Keys()).toEqual([{fn: 'onF2Key', key: 'F2', scope: plugin.id}]);
        expect(doubleClicks()).toHaveLength(1);

        expect(plugin.startEdit(itemId('b'))).toBe(true);

        const {editor} = plugin.session;

        plugin.destroy();

        expect(f2Keys()).toHaveLength(0);
        expect(doubleClicks()).toHaveLength(0);
        expect(editor.isDestroyed).toBe(true);
        expect(list.getVdomChild(itemId('b')).html, 'the item shows its text again').toBe('b.txt')
    });

    test('an owner destroyed mid-edit takes the editor with it and renders nothing more', () => {
        plugin.startEdit(itemId('a'));

        const
            {editor} = plugin.session,
            update   = list.update;

        let updates = 0;

        list.update = (...args) => {
            updates++;
            return update.apply(list, args)
        };

        list.destroy();

        expect(editor.isDestroyed).toBe(true);
        expect(updates, 'a list being destroyed is not rendered again').toBe(0)
    })
});
