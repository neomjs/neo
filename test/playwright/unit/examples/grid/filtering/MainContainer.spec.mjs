import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridFilteringTest',
        vnodeInitialising: false
    }
});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainContainer  from '../../../../../../examples/grid/filtering/MainContainer.mjs';

/**
 * @summary Reads the handlers a Store keeps for one event from Observable's private registry: a destroyed scope is
 * pruned only when the event fires again, so retention shows nowhere else.
 * @param {Neo.data.Store} store
 * @param {String} name The event name
 * @returns {Object[]}
 */
function handlers(store, name) {
    const registry = Object.getOwnPropertySymbols(store).find(symbol => symbol.description === 'eventMap');

    return store[registry]?.[name] ?? []
}

let addedDomEventsStub = false;

// The number and date fields register their disabled input characters with the main thread on construction
test.beforeAll(() => {
    const main = Neo.ns('Neo.main', true);

    if (!main.DomEvents) {
        main.DomEvents     = {registerDisabledInputChars() {}, unregisterDisabledInputChars() {}};
        addedDomEventsStub = true
    }
});

test.afterAll(() => {
    addedDomEventsStub && delete Neo.main.DomEvents
});

test('the page releases its Store observations when it is destroyed, while the Store lives on', () => {
    const page  = Neo.create(MainContainer, {appName: 'GridFilteringTest', applyBodyCls: false, autoMount: false}),
          store = page.getReference('grid').store,
          held  = name => handlers(store, name).filter(({scope}) => scope === page).length;

    expect(held('filter')).toBe(1);
    expect(held('load')).toBe(1);

    page.destroy();

    expect(store.isDestroyed).toBeFalsy();
    expect(held('filter')).toBe(0);
    expect(held('load')).toBe(0);

    store.destroy()
});
