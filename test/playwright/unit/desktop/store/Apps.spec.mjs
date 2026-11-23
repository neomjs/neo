import {setup} from '../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'DesktopAppsStoreTest'
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import Apps            from '../../../../../src/desktop/store/Apps.mjs';

/**
 * @summary The arrangement rules of `Neo.desktop.store.Apps`: the data is the catalog, `order` is the arrangement, and a
 * filter decides only what shows.
 */

const catalog = [
    {id: 'work',  text: 'Work',  isLeaf: false, collapsed: false},
    {id: 'mail',  text: 'Mail',  parentId: 'work'},
    {id: 'chat',  text: 'Chat',  parentId: 'work'},
    {id: 'notes', text: 'Notes', parentId: 'work'},
    {id: 'play',  text: 'Play',  isLeaf: false, collapsed: false},
    {id: 'music', text: 'Music', parentId: 'play'},
    {id: 'films', text: 'Films', parentId: 'play'}
];

class CatalogApps extends Apps {
    static config = {
        className: 'Test.Unit.Desktop.Store.CatalogApps',
        data     : catalog
    }
}

CatalogApps = Neo.setupClass(CatalogApps);

/**
 * @param {Neo.desktop.store.Apps} store
 * @param {String} parentKey
 * @returns {String[]}
 */
const children = (store, parentKey) => store.getChildren(parentKey).map(record => record.id);

test.describe('Neo.desktop.store.Apps', () => {
    let stores;

    const create = config => {
        const store = Neo.create(CatalogApps, config);

        stores.push(store);
        return store
    };

    test.beforeEach(() => {
        stores = []
    });

    test.afterEach(() => {
        stores.forEach(store => store.destroy())
    });

    test('each app takes its catalog place as its order, and the rows a consumer passes stay as they are', () => {
        const rows  = catalog.map(row => ({...row})),
              store = Neo.create(Apps, {data: rows}),
              other = create();

        stores.push(store);

        expect(['mail', 'chat', 'notes'].map(id => store.get(id).order)).toEqual([0, 1, 2]);

        store.arrange({work: ['notes', 'mail', 'chat']});
        store.collapse('work');

        expect(rows).toEqual(catalog);
        expect(children(other, 'work')).toEqual(['mail', 'chat', 'notes'])
    });

    test('arrange() and getArrangement() round-trip, the root level included', () => {
        const store = create(),
              copy  = create();

        store.arrange({work: ['notes', 'mail', 'chat'], play: ['films', 'music']});

        expect(store.getArrangement()).toEqual({
            play: ['films', 'music'],
            root: ['work', 'play'],
            work: ['notes', 'mail', 'chat']
        });

        copy.arrange(store.getArrangement());

        expect(copy.getArrangement()).toEqual(store.getArrangement())
    });

    test('apps an arrangement omits take their catalog place, whatever the last arrangement gave them', () => {
        const store = create();

        store.arrange({work: ['notes', 'chat', 'mail']});
        store.arrange({work: ['chat']});

        expect(children(store, 'work')).toEqual(['chat', 'mail', 'notes'])
    });

    test('a key the catalog does not hold, a repeated key and a value that is no array are ignored', () => {
        const store = create();

        store.arrange({nowhere: ['mail'], play: 'films', work: ['ghost', 'notes', 'notes']});

        expect(children(store, 'work')).toEqual(['notes', 'mail', 'chat']);
        expect(children(store, 'play')).toEqual(['music', 'films'])
    });

    test('a filter decides what shows and leaves order alone; the arrangement keeps the filtered-out apps', () => {
        const store = create();

        store.arrange({work: ['notes', 'mail', 'chat']});
        store.filters = [{operator: 'included', property: 'id', value: ['mail', 'notes']}];

        expect(store.items.map(record => record.id)).toEqual(['work', 'notes', 'mail']);
        expect(['mail', 'chat', 'notes'].map(id => store.get(id).order)).toEqual([1, 2, 0]);
        expect(store.getArrangement().work).toEqual(['notes', 'mail', 'chat']);

        store.clearFilters();

        expect(store.items.map(record => record.id)).toEqual(['work', 'notes', 'mail', 'chat', 'play', 'music', 'films'])
    });

    test('a catalog without groups arranges under the root', () => {
        const store = Neo.create(Apps, {data: [{id: 'a', text: 'A'}, {id: 'b', text: 'B'}, {id: 'c', text: 'C'}]});

        stores.push(store);

        store.arrange({root: ['c', 'a']});

        expect(store.items.map(record => record.id)).toEqual(['c', 'a', 'b']);
        expect(store.getArrangement()).toEqual({root: ['c', 'a', 'b']})
    })
});
