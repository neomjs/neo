import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridRowHoverSyncMountTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Toolbar            from '../../../../src/grid/header/Toolbar.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/**
 * @summary A grid with locked columns syncs row hover across its regions from its first mount.
 *
 * `GridRowHoverSync` highlights a hovered row's cells in every body. It is registered through
 * `Container#updateColCount()`, which a grid with locked columns in its config only runs from
 * `construct`, before `onConstructed()` creates the ScrollManager, so that first call cannot register
 * it. The addon also skips a view with no DOM node, so the registration belongs to the mount
 * lifecycle that the ScrollManager owns for its other addons.
 *
 * The recorder sits at the worker boundary, behind `getAddon()`.
 */
test.describe('grid.ScrollManager — row hover sync follows the mount of a grid with locked columns', () => {
    let calls, grid, originalGetAddon, store;

    // `then` stays undefined, so `await` hands the recorder back instead of treating it as a promise
    const addon = name => new Proxy({}, {
            get: (target, method) => method === 'then' ? undefined : (data = {}) => {
                calls.push({name, method, id: data.id})
            }
        }),
        // An addon replaces a registration by id, so the last call for an id decides
        hoverSyncHeld = () => {
            let held = false;

            calls.forEach(({name, method}) => {
                if (name === 'GridRowHoverSync' && (method === 'register' || method === 'unregister')) {
                    held = method === 'register'
                }
            });

            return held
        },
        settle = () => new Promise(resolve => setTimeout(resolve, 50)),
        create = columns => {
            grid = Neo.create(GridContainer, {
                appName  : 'GridRowHoverSyncMountTest',
                height   : 400,
                width    : 600,
                store,
                rowHeight: 40,
                windowId : 'w1',
                columns
            });

            // The size hand-off measures through `Neo.main.DomAccess` and, with no main thread, retries
            // itself indefinitely; it is a separate contract
            grid.passSizeToBody = async () => {};

            return grid.initVnode()
        };

    test.beforeEach(() => {
        calls = [];

        originalGetAddon           = Neo.currentWorker.getAddon;
        Neo.currentWorker.getAddon = async name => addon(name);

        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [{id: 1, col1: 'a', col2: 'b'}],
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'col1', type: 'String'}, {name: 'col2', type: 'String'}]}
        })
    });

    test.afterEach(() => {
        Neo.currentWorker.getAddon = originalGetAddon;

        grid && !grid.isDestroyed && grid.destroy();
        !store.isDestroyed && store.destroy()
    });

    test('a grid constructed with locked columns registers the row hover sync when it mounts', async () => {
        await create([
            {dataField: 'col1', text: 'Col 1', width: 100, locked: 'start'},
            {dataField: 'col2', text: 'Col 2', width: 100}
        ]);

        grid.mounted = true;
        await settle();

        expect(hoverSyncHeld()).toBe(true)
    });

    test('unmounting retires it, and unlocking the last locked column retires it as well', async () => {
        await create([
            {dataField: 'col1', text: 'Col 1', width: 100, locked: 'start'},
            {dataField: 'col2', text: 'Col 2', width: 100}
        ]);

        grid.mounted = true;
        await settle();
        grid.mounted = false;
        await settle();

        expect(hoverSyncHeld()).toBe(false);

        grid.mounted = true;
        await settle();

        // Positive control: a remount registers it again
        expect(hoverSyncHeld()).toBe(true);

        grid.columns.get('col1').locked = null;
        await settle();

        expect(hoverSyncHeld()).toBe(false)
    });

    test('a grid without locked columns registers no row hover sync', async () => {
        await create([
            {dataField: 'col1', text: 'Col 1', width: 100},
            {dataField: 'col2', text: 'Col 2', width: 100}
        ]);

        grid.mounted = true;
        await settle();

        expect(calls.filter(({name, method}) => name === 'GridRowHoverSync' && method === 'register')).toEqual([])
    })
});
