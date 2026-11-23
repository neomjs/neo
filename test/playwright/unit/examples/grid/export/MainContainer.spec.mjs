import {setup} from '../../../../setup.mjs';

const appName = 'GridExportMainContainerTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs';
import MainContainer  from '../../../../../../examples/grid/export/MainContainer.mjs';

/**
 * @summary The page's own listeners on a Store, by event name
 * @param {Neo.data.Store} store
 * @param {Object} page
 * @returns {{filter: Number, load: Number}}
 */
function pageListeners(store, page) {
    const eventMap = store[Object.getOwnPropertySymbols(store).find(symbol => symbol.description === 'eventMap')] || {},
          count    = name => (eventMap[name] || []).filter(listener => listener.scope === page).length;

    return {filter: count('filter'), load: count('load')}
}

test.describe('examples/grid/export MainContainer', () => {
    test('destroying the page releases its Store listeners without firing a Store event', () => {
        const page   = Neo.create(MainContainer, {appName, applyBodyCls: false}),
              store  = page.getReference('grid').store,
              events = [],
              fire   = store.fire;

        expect(pageListeners(store, page)).toEqual({filter: 1, load: 1});

        // A Store can outlive the grid that shows it; keep it alive across the page's destruction
        store.destroy = () => {};
        store.fire    = (name, ...args) => {events.push(name); return fire.call(store, name, ...args)};

        page.destroy();

        expect(pageListeners(store, page)).toEqual({filter: 0, load: 0});
        expect(events).toEqual([])
    });
});
