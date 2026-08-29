import {setup} from '../../setup.mjs';

const appName = 'ListNonInteractiveTest';

setup({
    appConfig: {
        name    : appName,
        mainView: {id: 'list-non-interactive-main-view', addDomListeners() {}, removeDomListeners() {}}
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import List           from '../../../../src/list/Base.mjs';

/**
 * The rule "which items may be clicked or arrowed to" is consumed twice, in two languages: as a CSS
 * `:not()` selector handed to the Navigator addon, and as a class check inside the click delegate,
 * which cannot parse a selector. `nonInteractiveItemCls` is the single source both derive from.
 */
test.describe('Neo.list.Base non-interactive items', () => {
    let list;

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('the default selector is byte-identical to the literal it replaced', () => {
        // Behaviour preservation is the whole claim of this refactor, so it is asserted against the
        // exact string that shipped before rather than against a regenerated equivalent.
        list = Neo.create(List, {appName, store: {data: []}});

        expect(list.getNavigableItemSelector())
            .toBe('.neo-list-item:not(.neo-disabled,.neo-list-header)')
    });

    test('a subclass concept reaches the selector without touching list.Base again', () => {
        list = Neo.create(List, {
            appName,
            nonInteractiveItemCls: ['neo-disabled', 'neo-list-header', 'neo-menu-separator'],
            store                : {data: []}
        });

        expect(list.getNavigableItemSelector())
            .toBe('.neo-list-item:not(.neo-disabled,.neo-list-header,.neo-menu-separator)')
    });

    test('it tracks itemCls too, so a renamed item class cannot desync the selector', () => {
        list = Neo.create(List, {appName, itemCls: 'my-item', store: {data: []}});

        expect(list.getNavigableItemSelector()).toBe('.my-item:not(.neo-disabled,.neo-list-header)')
    });

    test('CONTROL: an emptied list excludes nothing rather than emitting a broken selector', () => {
        // A naive join yields `:not(.)` — invalid CSS, which throws inside the addon's
        // querySelectorAll and takes navigation down entirely rather than widening it. Clearing the
        // config must degrade to "everything is navigable".
        //
        // Asserted on the STRING, not by parsing it: this tier runs in Node, so `document` does not
        // exist and a querySelectorAll probe would throw ReferenceError whatever the selector said —
        // green or red for the wrong reason.
        list = Neo.create(List, {appName, nonInteractiveItemCls: [], store: {data: []}});

        expect(list.getNavigableItemSelector()).toBe('.neo-list-item');
        expect(list.getNavigableItemSelector()).not.toContain(':not(')
    })
});
