import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridDeferredViewDataTest',
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import GridContainer   from '../../../../src/grid/Container.mjs';
import Store           from '../../../../src/data/Store.mjs';
import VDomUpdate      from '../../../../src/manager/VDomUpdate.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';

/**
 * @summary `grid.Body#createViewData` defers itself while the body's update is in flight, and every call deferred
 * during one flight collapses into one run: `VDomUpdate.registerPreUpdate()` keeps a single callback per id. That run
 * must carry the strongest intent of the calls it replaces — forced if any caller forced (the cells must re-bind to a
 * changed column set), and rendering if any caller asked to render (a silent pass must not cancel it). A column lock
 * change asks for a forced render and then a plain one while its body is in flight, and the plain one used to win.
 */
test.describe('grid.Body deferred view data', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let body, grid, runs, store;

    /**
     * Defers the given calls behind an in-flight update, then lands the flight: the one deferred run is recorded.
     * @param {Array[]} calls `[silent, force]` pairs, in order
     * @returns {Object[]} the runs, as `{silent, force}`
     */
    const deferAndLand = calls => {
        const create = body.createViewData;

        body.isVdomUpdating = true;
        calls.forEach(([silent, force]) => body.createViewData(silent, force));

        body.createViewData = (silent, force) => {
            runs.push({silent, force});
            return create.call(body, silent, force)
        };

        body.isVdomUpdating = false;
        VDomUpdate.executePreUpdates(body.id);
        delete body.createViewData;

        return runs
    };

    test.beforeEach(async () => {
        runs  = [];
        store = Neo.create(Store, {
            keyProperty: 'id',
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]},
            data       : Array.from({length: 50}, (value, i) => ({id: i, name: `Row ${i}`}))
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridDeferredViewDataTest',
            height   : 400,
            width    : 600,
            store,
            rowHeight: 40,
            columns  : [
                {dataField: 'id',   text: 'ID',   width: 50},
                {dataField: 'name', text: 'Name', width: 200}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;
        body         = grid.body;

        body.columnPositions.clear();
        body.columnPositions.add([
            {dataField: 'id',   width: 50,  x: 0},
            {dataField: 'name', width: 200, x: 50}
        ]);

        body.set({availableHeight: 360, containerWidth: 600});

        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(50);
        grid?.destroy();
        store?.destroy()
    });

    test('a forced render deferred before a plain one still runs forced', () => {
        expect(deferAndLand([[false, true], [false, false]])).toEqual([{silent: false, force: true}])
    });

    test('a render deferred before a silent pass still runs as a render', () => {
        expect(deferAndLand([[false, true], [true, false]])).toEqual([{silent: false, force: true}])
    });

    test('silent passes alone stay silent, and one deferral runs with its own arguments', () => {
        expect(deferAndLand([[true, false], [true, false]])).toEqual([{silent: true, force: false}]);

        runs = [];
        expect(deferAndLand([[false, false]])).toEqual([{silent: false, force: false}])
    })
});
