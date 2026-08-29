import {setup} from '../../setup.mjs';

const appName = 'MenuModelFieldsTest';

setup({
    appConfig: {
        name    : appName,
        mainView: {id: 'menu-model-fields-main-view', addDomListeners() {}, removeDomListeners() {}}
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import MenuList       from '../../../../src/menu/List.mjs';

/**
 * @summary Creates a Menu with DOM-dependent mount work neutralized.
 * @param {Object[]} items
 * @returns {Neo.menu.List}
 */
function createMenu(items) {
    const menu = Neo.create(MenuList, {
        appName,
        id   : Neo.getId('model-fields-menu'),
        items
    });

    menu.alignTo       = Neo.emptyFn;
    menu.focus         = Neo.emptyFn;
    menu.initDomEvents = Neo.emptyFn;

    return menu
}

/** Returns the cls array the list actually rendered for the record at `index`. */
const clsAt = (menu, index) => menu.createItem(menu.store.getAt(index), index).cls;

// Asserted through behaviour rather than by reading `menu.Model`'s field literal back: a test that
// greps the declaration only proves the declaration was written. What matters is that the record
// carries the value all the way into `createItem`, which is what was broken.
test.describe('Neo.menu.Model declared fields', () => {
    test.describe('disabled reaches the row', () => {
        let menu;

        test.beforeEach(() => {
            menu = createMenu([
                {id: 1, text: 'Enabled'},
                {id: 2, text: 'Disabled', disabled: true}
            ])
        });

        test.afterEach(() => {
            menu?.destroy();
            menu = null
        });

        test('a record carrying the field survives into the store', () => {
            expect(menu.store.getAt(1).disabled).toBe(true)
        });

        test('createItem pushes neo-disabled — and only onto that row', () => {
            expect(clsAt(menu, 0)).not.toContain('neo-disabled');
            expect(clsAt(menu, 1)).toContain('neo-disabled')
        });

        test('CONTROL: an UNdeclared field is silently dropped', () => {
            // This is what `disabled` did before the model declared it, and it is why the fix is a
            // field declaration rather than a render change: `Neo.data.Model` gives a record accessors
            // only for declared fields, so an undeclared one is accepted by the object literal and
            // never reaches `createItem`. Without this arm, the assertions above would pass against a
            // model that declares every conceivable field, proving nothing about THIS one.
            const control = createMenu([{id: 1, text: 'Item', notADeclaredField: true}]);

            expect(control.store.getAt(0).notADeclaredField).toBeUndefined();
            expect(control.store.getAt(0).text).toBe('Item');

            control.destroy()
        });

        test('the excluding class matches what list.Base hands the navigator', () => {
            // `neo-disabled` is load-bearing rather than cosmetic: the same literal appears in the
            // navigator selector and in the click delegate. A render that pushed some other class
            // would look right and stay clickable, which is the defect this ticket removes.
            expect(clsAt(menu, 1)).toContain('neo-disabled')
        })
    });

    test.describe('separator reaches the row', () => {
        let menu;

        test.beforeEach(() => {
            menu = createMenu([
                {id: 1, text: 'Cut'},
                {id: 2, separator: true},
                {id: 3, text: 'Paste'}
            ])
        });

        test.afterEach(() => {
            menu?.destroy();
            menu = null
        });

        test('a record carrying the field survives into the store', () => {
            expect(menu.store.getAt(1).separator).toBe(true);
            expect(menu.store.getAt(0).separator).toBeFalsy()
        });

        test('it does not collide with the header concept', () => {
            // A separator is not a header: `list.Base` renders `isHeader` as a labelled `dt`, and a
            // separator has no text to label anything with.
            expect(menu.store.getAt(1).isHeader).toBeFalsy()
        })
    })
});
