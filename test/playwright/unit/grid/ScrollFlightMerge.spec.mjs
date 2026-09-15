import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridScrollFlightMergeTest',
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
 * @summary `grid.View#syncBodies` repaints its rows silently and ships them in one View update deep
 * enough to reach the cells. A body update that waited behind the View's previous update merges into
 * that repaint at landing, and the merge gives the repaint an allow-list: sparse tree generation then
 * treats every row outside it as clean and prunes it.
 *
 * `ScrollManager#onContainerScroll` sets the body's `isScrolling` before it syncs the bodies, which is
 * this order. On a hosted runner it blanked #18439's paint frames: the View's `scrollTop` meta arrived
 * with only the body's class, and the rows followed with the next unmerged repaint. Here no later
 * repaint comes, so a pruned row keeps a stored vnode for the index it showed before the scroll.
 */
test.describe('grid.View scroll repaint with a merged body update', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(async () => {
        store = Neo.create(Store, {
            keyProperty: 'id',
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]},
            data       : Array.from({length: 100}, (value, i) => ({id: i, name: `Row ${i}`}))
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridScrollFlightMergeTest',
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

        grid.body.columnPositions.clear();
        grid.body.columnPositions.add([
            {dataField: 'id',   width: 50,  x: 0},
            {dataField: 'name', width: 200, x: 50}
        ]);

        grid.body.set({availableHeight: 360, containerWidth: 600});

        await grid.timeout(50)
    });

    test.afterEach(async () => {
        await grid.timeout(50);
        grid?.destroy();
        store?.destroy()
    });

    test('rows repainted while a body update waits behind the View still ship when it merges into the repaint', async () => {
        const {body, view}          = grid,
              originalUpdateBatch = VdomHelper.updateBatch,
              repaints            = [];

        // Records each finite-depth View payload with whether the body was merged into it at collection
        view.getVdomUpdatePayload = function(ids, depth) {
            const updateDepth = depth ?? this.updateDepth;

            updateDepth !== -1 && repaints.push(VDomUpdate.getMergedChildIds(this.id)?.has(body.id) === true);

            return Object.getPrototypeOf(this).getVdomUpdatePayload.call(this, ids, depth)
        };

        // One worker round trip of latency, so the first repaint is still in the air when the body updates
        VdomHelper.updateBatch = async function(data) {
            await new Promise(resolve => setTimeout(resolve, 20));
            return originalUpdateBatch.call(this, data)
        };

        try {
            view.syncBodies(400);
            await grid.timeout(5);
            expect(view.isVdomUpdating, 'the first repaint is in the air').toBe(true);

            // The hosted order: the body updates first and waits behind the View, then the second repaint queues
            body.addCls('merged-probe');
            view.syncBodies(800);

            await grid.timeout(150);
            expect(view.isVdomUpdating || view.needsVdomUpdate, 'no repaint is left to carry the rows').toBe(false);
            expect(repaints, 'the queued repaint was collected with the body merged into it').toContain(true);

            const withRecord = body.items.filter(row => row.record),
                  stale      = withRecord
                      .filter(row => String(row.vnode?.attributes?.['aria-rowindex']) !== String(row.rowIndex + 2))
                      .map(row => `${row.id}: vnode ${row.vnode?.attributes?.['aria-rowindex']}, rowIndex+2 ${row.rowIndex + 2}`);

            expect(withRecord.length, 'rows hold records, so the check below reads something').toBeGreaterThan(0);
            expect(stale, 'every repainted row reached the DOM').toEqual([])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch;
            delete view.getVdomUpdatePayload
        }
    })
});
