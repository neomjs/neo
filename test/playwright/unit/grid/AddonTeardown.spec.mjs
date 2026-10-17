import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridAddonTeardownTest',
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
 * @summary A grid that goes away leaves no main-thread addon registration behind.
 *
 * A grid registers its addons after awaiting `Neo.currentWorker.getAddon()`, and each registration
 * keeps listeners (and for `GridDragScroll` the grid's elements) on the main thread until it is
 * unregistered. Two teardown gaps follow, one arm each:
 *
 * - A grid destroyed before that await resolves must register nothing. `Base#destroy` deletes its
 *   properties, so a resumed register arm either throws or, as `addResizeObserver` does, adds a
 *   holder after destroy's synchronous unregister, which nothing removes.
 * - Destroy reaches the ScrollManager and the vertical scrollbar directly, never through an unmount,
 *   so each destroy retires what was registered.
 *
 * The recorder sits at the worker boundary on both doors: `getAddon()` and the `Neo.main.addon`
 * namespace that `Container#destroy` calls. Each addon's own bookkeeping is out of scope here.
 */
test.describe('grid.Container — addon registrations end with the grid', () => {
    let calls, grid, originalGetAddon, originalResizeObserver, rejections, store;

    const onRejection = reason => rejections.push(reason),
        // `then` stays undefined, so `await` hands the recorder back instead of treating it as a promise
        addon = name => new Proxy({}, {
            get: (target, method) => method === 'then' ? undefined : (data = {}) => {
                calls.push({name, method, key: data.componentId || data.id})
            }
        }),
        // Registrations still held, as `<addon> <id>`. Each addon replaces a registration by id (the
        // ResizeObserver dedups its holder), so the last call for an id decides, not a count of calls
        held = () => {
            const state = {};

            calls.forEach(({name, method, key}) => {
                if (method === 'register' || method === 'unregister') {
                    state[`${name} ${key}`] = method === 'register'
                }
            });

            return Object.keys(state).filter(entry => state[entry]).sort()
        },
        settle = () => new Promise(resolve => setTimeout(resolve, 50));

    test.beforeEach(async () => {
        calls      = [];
        rejections = [];

        process.on('unhandledRejection', onRejection);

        originalGetAddon           = Neo.currentWorker.getAddon;
        Neo.currentWorker.getAddon = async name => addon(name);

        Neo.main       ??= {};
        Neo.main.addon ??= {};
        originalResizeObserver        = Neo.main.addon.ResizeObserver;
        Neo.main.addon.ResizeObserver = addon('ResizeObserver');

        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [{id: 1, col1: 'a', col2: 'b'}],
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'col1', type: 'String'}, {name: 'col2', type: 'String'}]}
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridAddonTeardownTest',
            height   : 400,
            width    : 600,
            store,
            rowHeight: 40,
            columns  : [
                {dataField: 'col1', text: 'Col 1', width: 100},
                {dataField: 'col2', text: 'Col 2', width: 100}
            ]
        });

        // The size hand-off measures through `Neo.main.DomAccess` and, with no main thread, retries
        // itself indefinitely; it is a separate contract
        grid.passSizeToBody = async () => {};

        await grid.initVnode()
    });

    test.afterEach(() => {
        process.off('unhandledRejection', onRejection);

        Neo.currentWorker.getAddon    = originalGetAddon;
        Neo.main.addon.ResizeObserver = originalResizeObserver;

        !grid.isDestroyed  && grid.destroy();
        !store.isDestroyed && store.destroy()
    });

    test('a grid destroyed in the tick it mounts registers nothing and throws nothing', async () => {
        grid.mounted = true;
        grid.destroy();

        await settle();

        expect(rejections).toEqual([]);
        expect(held()).toEqual([])
    });

    test('destroying a mounted grid retires every registration it holds', async () => {
        const {scrollManager, verticalScrollbar, view} = grid;

        grid.mounted = true;
        await settle();

        // The row hover sync registers once a column locks at run time
        grid.columns.get('col1').locked = 'start';
        await settle();

        // Positive control: the living grid holds all seven registrations
        expect(held()).toEqual([
            `GridDragScroll ${scrollManager.id}`,
            `GridHorizontalScrollSync ${scrollManager.id}__h_scroll`,
            `GridRowHoverSync ${scrollManager.id}`,
            `GridRowScrollPinning ${scrollManager.id}`,
            `ResizeObserver ${grid.id}`,
            `ResizeObserver ${view.id}`,
            `ScrollSync ${verticalScrollbar.id}`
        ]);

        grid.destroy();
        await settle();

        expect(rejections).toEqual([]);
        expect(held()).toEqual([])
    });

    test('destroy retires the row hover sync after its flag was switched off', async () => {
        const {scrollManager} = grid;

        grid.mounted = true;
        await settle();

        grid.columns.get('col1').locked = 'start';
        await settle();

        // Positive control: the lock registered it
        expect(held()).toContain(`GridRowHoverSync ${scrollManager.id}`);

        // No hook unregisters on flag-off, so destroy must not consult the flag
        scrollManager.rowHoverSync = false;
        grid.destroy();
        await settle();

        expect(rejections).toEqual([]);
        expect(held()).toEqual([])
    });

    test('a grid unmounted and destroyed in one tick still retires every registration', async () => {
        grid.mounted = true;
        await settle();

        // Destroy skips its synchronous unregister for an unmounted grid, so the unmount's own
        // unregisters, still awaiting their addons, must resume on the destroyed instance
        grid.mounted = false;
        grid.destroy();
        await settle();

        expect(rejections).toEqual([]);
        expect(held()).toEqual([])
    })
});
