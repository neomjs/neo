/**
 * @file test/playwright/unit/grid/SyncBodiesZeroDelta.spec.mjs
 * @summary Verifies that `Neo.grid.View#syncBodies` skips VDOM flights when a scroll pass mutates no body or row VDOM.
 * @see Neo.grid.Body#hasSilentVdomChanges
 * @see Neo.grid.View#syncBodies
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridSyncBodiesZeroDeltaTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

function createStore(count = 100) {
    return Neo.create(Store, {
        keyProperty: 'id',
        model      : {
            fields: [
                {name: 'id',   type: 'Integer'},
                {name: 'code', type: 'String'},
                {name: 'name', type: 'String'},
                {name: 'c1',   type: 'String'},
                {name: 'c2',   type: 'String'},
                {name: 'c3',   type: 'String'},
                {name: 'c4',   type: 'String'},
                {name: 'c5',   type: 'String'},
                {name: 'c6',   type: 'String'},
                {name: 'tail', type: 'String'}
            ]
        },
        data: Array.from({length: count}, (_, i) => ({
            id  : i,
            code: `K-${i}`,
            name: `Row ${i}`,
            c1  : `A-${i}`,
            c2  : `B-${i}`,
            c3  : `C-${i}`,
            c4  : `D-${i}`,
            c5  : `E-${i}`,
            c6  : `F-${i}`,
            tail: `T-${i}`
        }))
    })
}

async function settleView(grid) {
    const targets = [grid.view, grid.bodyStart, grid.body, grid.bodyEnd].filter(Boolean);

    await expect.poll(() => targets.some(item => item.isVdomUpdating || item.needsVdomUpdate)).toBe(false)
}

function staleRows(body, headerRowCount = 1) {
    return body.items
        .filter(row => row.record)
        .filter(row => String(row.vnode?.attributes?.['aria-rowindex']) !== String(row.rowIndex + 1 + headerRowCount))
        .map(row => `${row.id}:${row.vnode?.attributes?.['aria-rowindex']}!==${row.rowIndex + 1 + headerRowCount}`)
}

test.describe('grid.View#syncBodies zero-delta flight suppression', () => {
    let grid, store;

    test.afterEach(async () => {
        await grid?.timeout(30);
        grid?.destroy();
        store?.destroy();
        grid  = null;
        store = null
    });

    test('skips updateBatch inside vertical and horizontal buffers and flushes once upon crossing either buffer', async () => {
        store = createStore(100);
        grid  = Neo.create(GridContainer, {
            appName  : 'GridSyncBodiesZeroDeltaTest',
            body     : {bufferColumnRange: 2, bufferRowRange: 3},
            height   : 400,
            rowHeight: 40,
            store,
            width    : 300,
            columns  : [
                {dataField: 'id',   text: 'ID',   width: 100},
                {dataField: 'code', text: 'Code', width: 100},
                {dataField: 'name', text: 'Name', width: 100},
                {dataField: 'c1',   text: 'C1',   width: 100},
                {dataField: 'c2',   text: 'C2',   width: 100},
                {dataField: 'c3',   text: 'C3',   width: 100},
                {dataField: 'c4',   text: 'C4',   width: 100},
                {dataField: 'c5',   text: 'C5',   width: 100},
                {dataField: 'c6',   text: 'C6',   width: 100},
                {dataField: 'tail', text: 'Tail', width: 100}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.headerToolbar.passSizeToBody();
        grid.body.set({availableHeight: 360, containerWidth: 300});
        await grid.timeout(50);
        await settleView(grid);

        const {body, scrollManager, view} = grid,
              originalUpdateBatch         = VdomHelper.updateBatch,
              batches                     = [];

        VdomHelper.updateBatch = async function(data) {
            batches.push(Object.keys(data.updates));
            return originalUpdateBatch.call(this, data)
        };

        try {
            view.syncBodies(40);
            view.syncBodies(80);
            view.syncBodies(120);
            await grid.timeout(20);

            expect(batches).toEqual([]);
            expect(view.isVdomUpdating || view.needsVdomUpdate).toBe(false);
            expect(view.scrollTop).toBe(120);
            expect(body.startIndex).toBe(3);
            expect(body.mountedRows).toEqual([0, 14]);

            view.syncBodies(240);
            await settleView(grid);

            expect(batches).toEqual([[view.id]]);
            expect(staleRows(body)).toEqual([]);

            batches.length           = 0;
            scrollManager.scrollLeft = 300;
            body.skipCreateViewData  = true;
            body.scrollLeft          = 300;
            body.updateMountedAndVisibleColumns();
            body.skipCreateViewData  = false;
            view.syncBodies(240);
            await settleView(grid);

            expect(batches).toEqual([[view.id]]);
            expect(body.mountedColumns).toEqual([1, 8]);

            batches.length           = 0;
            scrollManager.scrollLeft = 320;
            body.skipCreateViewData  = true;
            body.scrollLeft          = 320;
            body.updateMountedAndVisibleColumns();
            body.skipCreateViewData  = false;
            view.syncBodies(260);
            await grid.timeout(20);

            expect(body.mountedColumns).toEqual([1, 8]);
            expect(batches).toEqual([]);

            view.maxScrollHeight = 1200;
            await settleView(grid);

            expect(batches.filter(ids => ids.includes(view.id))).toEqual([[view.id]]);
            expect(body.vnode.style.height).toBe('1200px')
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch
        }
    });

    test('preserves a queued buffer-crossing repaint when a zero-delta tick arrives while View is in flight', async () => {
        store = createStore(100);
        grid  = Neo.create(GridContainer, {
            appName  : 'GridSyncBodiesZeroDeltaTest',
            body     : {bufferRowRange: 3},
            height   : 400,
            rowHeight: 40,
            store,
            width    : 600,
            columns  : [
                {dataField: 'id',   text: 'ID',   width: 100},
                {dataField: 'name', text: 'Name', width: 200}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.headerToolbar.passSizeToBody();
        grid.body.set({availableHeight: 360, containerWidth: 600});
        await grid.timeout(50);
        await settleView(grid);

        const {body, view}        = grid,
              originalUpdateBatch = VdomHelper.updateBatch,
              batches             = [];

        VdomHelper.updateBatch = async function(data) {
            batches.push(Object.keys(data.updates));
            await new Promise(resolve => setTimeout(resolve, 25));
            return originalUpdateBatch.call(this, data)
        };

        try {
            view.syncBodies(240);
            await grid.timeout(5);
            expect(view.isVdomUpdating).toBe(true);

            view.syncBodies(360);
            expect(view.needsVdomUpdate).toBe(true);
            expect(view.denseUpdate).toBe(true);

            view.syncBodies(400);
            expect(view.needsVdomUpdate).toBe(true);
            expect(view.denseUpdate).toBe(true);

            await settleView(grid);

            expect(batches).toEqual([[view.id], [view.id]]);
            expect(staleRows(body)).toEqual([])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch
        }
    });

    test('delivers neo-is-scrolling on start and end across locked bodies with zero in-buffer flights', async () => {
        store = createStore(100);
        grid  = Neo.create(GridContainer, {
            appName  : 'GridSyncBodiesZeroDeltaTest',
            body     : {bufferRowRange: 3},
            height   : 400,
            rowHeight: 40,
            store,
            width    : 600,
            columns  : [
                {dataField: 'id',   locked: 'start', text: 'ID',   width: 80},
                {dataField: 'name',                  text: 'Name', width: 240},
                {dataField: 'tail', locked: 'end',   text: 'Tail', width: 100}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await Promise.all(grid.headerWrapper.getToolbars().map(toolbar => toolbar.passSizeToBody()));
        [grid.bodyStart, grid.body, grid.bodyEnd].forEach(item => item.set({availableHeight: 360, containerWidth: 300}));
        await grid.timeout(50);
        await settleView(grid);

        const {body, bodyEnd, bodyStart, scrollManager, view} = grid,
              bodies                                          = [bodyStart, body, bodyEnd],
              originalUpdateBatch                             = VdomHelper.updateBatch,
              batches                                         = [];

        scrollManager.rowHoverSync = false;

        VdomHelper.updateBatch = async function(data) {
            batches.push(Object.keys(data.updates));
            return originalUpdateBatch.call(this, data)
        };

        try {
            scrollManager.onContainerScroll({
                scrollLeft: 0,
                scrollTop : 20,
                target    : {id: view.id, scrollTop: 20}
            });

            scrollManager.onContainerScroll({
                scrollLeft: 0,
                scrollTop : 40,
                target    : {id: view.id, scrollTop: 40}
            });

            await settleView(grid);

            expect(batches).toEqual([[view.id]]);
            bodies.forEach(item => expect(item.vnode.className).toContain('neo-is-scrolling'));

            scrollManager.onContainerScroll({
                scrollLeft: 0,
                scrollTop : 60,
                target    : {id: view.id, scrollTop: 60}
            });
            await grid.timeout(20);

            expect(batches).toEqual([[view.id]]);

            await expect.poll(() => bodies.every(item => !item.isScrolling)).toBe(true);
            await settleView(grid);

            expect(batches).toEqual([[view.id], [view.id]]);
            bodies.forEach(item => expect(item.vnode.className).not.toContain('neo-is-scrolling'));

            batches.length = 0;
            view.syncBodies(160);
            await settleView(grid);

            expect(batches).toEqual([[view.id]]);
            expect(staleRows(bodyStart)).toEqual([])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch
        }
    });

    test('flushes contentSizedRows window transitions and row-height anchor corrections while skipping unchanged windows', async () => {
        store = createStore(60);
        grid  = Neo.create(GridContainer, {
            appName         : 'GridSyncBodiesZeroDeltaTest',
            body            : {bufferRowRange: 2},
            contentSizedRows: true,
            height          : 400,
            rowHeight       : 40,
            store,
            width           : 600,
            columns         : [
                {dataField: 'id',   text: 'ID',   width: 100},
                {dataField: 'name', text: 'Name', width: 200}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.headerToolbar.passSizeToBody();
        grid.body.set({availableHeight: 360, containerWidth: 600});
        await grid.timeout(50);
        await settleView(grid);

        const {body, view}        = grid,
              originalUpdateBatch = VdomHelper.updateBatch,
              batches             = [];

        VdomHelper.updateBatch = async function(data) {
            batches.push(Object.keys(data.updates));
            return originalUpdateBatch.call(this, data)
        };

        try {
            view.syncBodies(10);
            view.syncBodies(40);
            await grid.timeout(20);
            expect(body.mountedRows).toEqual([0, 13]);
            expect(batches).toEqual([]);

            view.syncBodies(120);
            await settleView(grid);
            expect(body.mountedRows).toEqual([1, 14]);
            expect(batches).toEqual([[view.id]]);

            batches.length = 0;
            view.syncBodies(130);
            await grid.timeout(20);
            expect(batches).toEqual([]);

            view.setRowHeights(new Map([[view.getRecordId(store.get(0)), 80]]));
            await settleView(grid);
            expect(batches.filter(ids => ids.includes(view.id))).toEqual([[view.id]])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch
        }
    });

    test('restores hasSilentVdomChanges after a rejected View flight so the next in-buffer tick repaints before scroll end', async () => {
        store = createStore(100);
        grid  = Neo.create(GridContainer, {
            appName  : 'GridSyncBodiesZeroDeltaTest',
            body     : {bufferRowRange: 3},
            height   : 400,
            rowHeight: 40,
            store,
            width    : 600,
            columns  : [
                {dataField: 'id',   text: 'ID',   width: 100},
                {dataField: 'name', text: 'Name', width: 200}
            ]
        });

        await grid.initVnode();
        grid.mounted = true;

        await grid.headerToolbar.passSizeToBody();
        grid.body.set({availableHeight: 360, containerWidth: 600});
        await grid.timeout(50);
        await settleView(grid);

        const {body, scrollManager, view} = grid,
              originalUpdateBatch         = VdomHelper.updateBatch,
              originalConsoleError        = console.error,
              batches                     = [],
              scroll                      = scrollTop => scrollManager.onContainerScroll({
                  scrollLeft: 0,
                  scrollTop,
                  target    : {id: view.id, scrollTop}
              });
        let rejectNext = false;

        scrollManager.rowHoverSync = false;
        console.error              = () => {};

        VdomHelper.updateBatch = async function(data) {
            const ids = Object.keys(data.updates);

            if (rejectNext && ids.includes(view.id)) {
                rejectNext = false;
                batches.push('view-REJECTED');
                throw new Error('simulated rejected scroll flight')
            }

            ids.includes(view.id) && batches.push('view');
            return originalUpdateBatch.call(this, data)
        };

        try {
            // 1. Start scroll inside initial buffer (flushes neo-is-scrolling)
            scroll(20);
            await settleView(grid);
            expect(staleRows(body)).toEqual([]);
            expect(batches).toEqual(['view']);

            // 2. Cross buffer at scrollTop 240 and reject that flight
            rejectNext = true;
            scroll(240);
            await settleView(grid);
            expect(staleRows(body)).toHaveLength(3);
            expect(body.hasSilentVdomChanges).toBe(true);
            expect(batches).toEqual(['view', 'view-REJECTED']);

            // 3. First tick inside the new buffer flies immediately and heals stale rows before scroll end
            scroll(250);
            await settleView(grid);
            expect(body.isScrolling).toBe(true);
            expect(staleRows(body)).toEqual([]);
            expect(body.hasSilentVdomChanges).toBe(false);
            expect(batches).toEqual(['view', 'view-REJECTED', 'view']);

            // 4. Subsequent in-buffer ticks resume zero-delta flight suppression
            scroll(260);
            await grid.timeout(16);
            scroll(270);
            await grid.timeout(16);
            expect(body.isScrolling).toBe(true);
            expect(staleRows(body)).toEqual([]);
            expect(batches).toEqual(['view', 'view-REJECTED', 'view']);

            // 5. Queued-flight rejection: Flight 1 lands while Flight 2 is queued, Flight 2 rejects, next tick heals
            let viewFlightIndex = 0;

            VdomHelper.updateBatch = async function(data) {
                const ids   = Object.keys(data.updates),
                      index = ids.includes(view.id) ? ++viewFlightIndex : 0;

                await new Promise(resolve => setTimeout(resolve, 20));

                if (index === 2) {
                    batches.push('view-REJECTED');
                    throw new Error('simulated rejected queued scroll flight')
                }

                index > 0 && batches.push('view');
                return originalUpdateBatch.call(this, data)
            };

            batches.length = 0;
            scroll(480);
            await grid.timeout(5);
            expect(view.isVdomUpdating).toBe(true);

            scroll(640);
            await settleView(grid);
            expect(batches).toEqual(['view', 'view-REJECTED']);
            expect(staleRows(body).length).toBeGreaterThan(0);
            expect(body.hasSilentVdomChanges).toBe(true);

            scroll(650);
            await settleView(grid);
            expect(body.isScrolling).toBe(true);
            expect(staleRows(body)).toEqual([]);
            expect(batches).toEqual(['view', 'view-REJECTED', 'view'])
        } finally {
            VdomHelper.updateBatch = originalUpdateBatch;
            console.error          = originalConsoleError
        }
    })
});
