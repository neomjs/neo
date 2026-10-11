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
import BaseList       from '../../../../src/list/Base.mjs';
import MenuList       from '../../../../src/menu/List.mjs';

/**
 * Returns the click delegate `Neo.selection.ListModel` actually registered on a list.
 *
 * The delegate is the *second* consumer of `nonInteractiveItemCls` — a hand-rolled class check,
 * because a delegate cannot consume a CSS selector. Asserting the selector string proves the
 * navigator's half only; this reaches the half a click travels through.
 */
const clickDelegate = list =>
    list.domListeners.find(listener => listener.click && listener.delegate)?.delegate;

/** A vdom path node as the delegate receives it. */
const node = (...cls) => ({cls});

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
        });

        test('renders as an empty rule, not a row', () => {
            const item = menu.createItem(menu.store.getAt(1), 1);

            expect(item.cls).toContain('neo-menu-separator');
            expect(item.cn).toEqual([]);
            expect(item.role).toBe('separator')
        });

        test('it is present, not hidden — the empty-content path must not remove it', () => {
            // `list.Base` treats "every child is removeDom" as "hide the item", and a separator has
            // no children at all. Without the explicit clear it would vanish instead of render.
            expect(menu.createItem(menu.store.getAt(1), 1).removeDom).toBe(false)
        });

        test('it is out of the command set: no tabIndex, no aria-selected', () => {
            const separator = menu.createItem(menu.store.getAt(1), 1),
                  command   = menu.createItem(menu.store.getAt(0), 0);

            expect(separator.tabIndex).toBeUndefined();
            expect(separator['aria-selected']).toBeUndefined();

            // The control: ordinary items DO carry both, so the deletions above are the separator's
            // doing rather than a property this list never sets.
            expect(command.tabIndex).toBe(-1);
            expect(command['aria-selected']).toBe(false)
        });

        test('it is excluded from clicking AND arrow-key navigation, not merely painted', () => {
            // The class alone only paints. Both exclusion surfaces read `nonInteractiveItemCls`, so
            // a separator that rendered the class without extending that config would look right and
            // still take focus on the first arrow-down.
            expect(menu.nonInteractiveItemCls).toContain('neo-menu-separator');
            expect(menu.getNavigableItemSelector()).toContain(':not(');
            expect(menu.getNavigableItemSelector()).toContain('.neo-menu-separator')
        });

        test('an ordinary item is untouched by any of it', () => {
            const item = menu.createItem(menu.store.getAt(0), 0);

            expect(item.cls).not.toContain('neo-menu-separator');
            expect(item.role).toBeUndefined();
            expect(item.cn.length).toBeGreaterThan(0)
        })
    });

    test.describe('the click delegate — the second consumer, executed', () => {
        let menu;

        test.beforeEach(() => {
            menu = createMenu([
                {id: 1, text: 'Cut'},
                {id: 2, separator: true},
                {id: 3, disabled: true, text: 'Paste'}
            ])
        });

        test.afterEach(() => {
            menu?.destroy();
            menu = null
        });

        test('it is registered at all', () => {
            // Guards every assertion below: a helper that silently returned undefined would make
            // them all vacuously pass, since `undefined` is also the "no match" answer.
            expect(typeof clickDelegate(menu)).toBe('function')
        });

        test('an ordinary item matches; a separator and a disabled item do not', () => {
            const delegate = clickDelegate(menu);

            expect(delegate([node('neo-list-item')])).toBe(0);
            expect(delegate([node('neo-list-item', 'neo-menu-separator')])).toBeUndefined();
            expect(delegate([node('neo-list-item', 'neo-disabled')])).toBeUndefined();
            expect(delegate([node('neo-list-item', 'neo-list-header')])).toBeUndefined();
            expect(delegate([node('something-else')])).toBeUndefined()
        });

        test('it walks the path and returns the index of the first eligible node', () => {
            const delegate = clickDelegate(menu);

            expect(delegate([node('neo-content'), node('neo-list-item')])).toBe(1)
        });

        test('CONTROL: a plain list DOES match a separator-classed node', () => {
            // The causal arm. `list.Base` does not know about separators, so its delegate accepts
            // one — which is what a menu's would do too if `menu.List` had not extended the config.
            // Without this, the assertions above could hold for a delegate that rejects everything.
            const plain    = Neo.create(BaseList, {appName, store: {data: []}}),
                  delegate = clickDelegate(plain);

            expect(delegate([node('neo-list-item', 'neo-menu-separator')])).toBe(0);
            expect(delegate([node('neo-list-item', 'neo-disabled')])).toBeUndefined();

            plain.destroy()
        });

        test('both consumers agree, which is the point of the shared config', () => {
            // The navigator reads a CSS selector, the delegate reads class names. They are two
            // expressions of one rule; the config exists so they cannot disagree.
            const delegate = clickDelegate(menu),
                  selector = menu.getNavigableItemSelector();

            for (const cls of menu.nonInteractiveItemCls) {
                expect(selector).toContain(`.${cls}`);
                expect(delegate([node('neo-list-item', cls)])).toBeUndefined()
            }
        });

        test('the menu set is DERIVED from the base set, not copied', () => {
            // A restated copy would pass every assertion above and still silently miss a fourth
            // concept added to list.Base later.
            for (const cls of BaseList.config.nonInteractiveItemCls) {
                expect(menu.nonInteractiveItemCls).toContain(cls)
            }

            expect(menu.nonInteractiveItemCls).toContain('neo-menu-separator');
            expect(menu.nonInteractiveItemCls.length).toBe(BaseList.config.nonInteractiveItemCls.length + 1)
        })
    })
});
