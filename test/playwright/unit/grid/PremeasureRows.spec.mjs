import {setup} from '../../setup.mjs';

setup({neoConfig: {allowVdomUpdatesInTests: true, unitTestMode: true, useDomApiRenderer: true, useVdomWorker: false},
    appConfig: {name: 'GridPremeasureRowsTest', vnodeInitialising: false}});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Grid               from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * @summary Hidden batches use the same record-driven text-height oracle as mounted batches. The browser
 * parity witness supplies real layout separately; these arms falsify coverage and asynchronous invalidation.
 */
test.describe('Grid hidden row premeasurement', () => {
    let grid, store, oldAccess, read;

    test.beforeEach(async () => {
        store = Neo.create(Store, {keyProperty: 'id', data: Array.from({length: 80}, (_, id) =>
            ({id, name: `Name ${id}`, note: `Note ${id}`, nameLines: 1, noteLines: 4})),
            model: {fields: ['id', 'name', 'note', 'nameLines', 'noteLines'].map(name => ({name}))}});
        grid = Neo.create(Grid, {appName: 'GridPremeasureRowsTest', height: 400, width: 600,
            bufferRowRange: 2, rowHeight: 40, contentSizedRows: true, store,
            columns       : [{dataField: 'name', text: 'Name', locked: 'start', width: 150, wrapText: true},
                {dataField: 'id', text: 'ID', width: 80}, {dataField: 'note', text: 'Note', width: 200, wrapText: true}]});
        grid.view.scheduleRowMeasure = () => {};
        oldAccess = Neo.main.DomAccess;
        read = ids => ids.map(id => {
            let target;
            grid.view.bodies.forEach(body => body.rowMeasureVdom?.cn.forEach(row => row.cn.forEach(cell => {
                if (cell.cn[0].id === id) target = cell
            })));
            if (!target) return {};
            let record = store.items.find(item => grid.view.getRecordId(item) === target.data.recordId);
            return {width: parseFloat(target.style.width), height: record[`${target.data.field}Lines`] * 20}
        });
        Neo.main.DomAccess = {...oldAccess, getLayoutRect: async ({id}) =>
            id.every(value => value.includes('__measure_')) ? read(id) : id.map(value =>
                ({width: 600, height: value === grid.headerToolbar.id ? 40 : value === grid.view.id ? 360 : 400})),
            getComputedStyle: async () => ({'padding-top': '2px', 'padding-bottom': '2px', 'border-bottom-width': '1px'})};
        await grid.initVnode();
        grid.mounted = true;
        for (let toolbar of [grid.headerWrapper.headerStart, grid.headerToolbar, grid.headerWrapper.headerEnd]) {
            toolbar && await toolbar.passSizeToBody()
        }
        grid.view.bodies.forEach(body => body.set({availableHeight: 360, containerWidth: 600}));
        await grid.timeout(50)
    });

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        Neo.main.DomAccess = oldAccess
    });

    test('unmounted columns and ahead rows contribute without entering the physical row pool', async () => {
        let {body, view} = grid, pool = [...body.items];
        body.mountedColumns = [0, 0];
        body.createViewData(true, true);
        await body.promiseUpdate();
        await view.measureAheadRows();
        // The higher mean may shrink the normal pool; measurement identities never join it.
        expect(body.items.length).toBeLessThanOrEqual(pool.length);
        expect(body.items.every(row => pool.includes(row))).toBe(true);
        expect(body.rowMeasureVdom.style.visibility).toBe('hidden');
        expect(body.rowMeasureVdom.id).not.toBe(body.items[0].id);
        expect(view.rowGeometry.heightAt(body.mountedRows[1] + 2)).toBe(85);
        expect(view.rowGeometry.measuredMean).toBe(85);
        expect(view.rowGeometry.heightAt(79)).toBe(85)
    });

    test('font arrival rejects a pending batch and clears the retained fallback heights', async () => {
        let {view} = grid, release, baseRead = read;
        read = ids => new Promise(resolve => {release = () => resolve(baseRead(ids))});
        let flight = view.measureAheadRows();
        await expect.poll(() => typeof release).toBe('function');
        view.onFontChange({windowId: view.windowId});
        release();
        await flight;
        expect(view.rowGeometry.measuredMean).toBe(null);
        read = baseRead;
        await view.promiseUpdate();
        await view.measureAheadRows();
        expect(view.rowGeometry.measuredMean).toBe(85)
    });

    test('a width changed during the read rejects the old layout batch', async () => {
        let {view} = grid, release, baseRead = read;
        read = ids => new Promise(resolve => {release = () => resolve(baseRead(ids))});
        let flight = view.measureAheadRows();
        await expect.poll(() => typeof release).toBe('function');
        grid.body.columnPositions.get('note').width = 250;
        release();
        await flight;
        expect(view.rowGeometry.measuredMean).toBe(null)
    });

    test('a view-owned row refresh schedules measurement when it absorbs the body updates', async () => {
        const {view}    = grid;
        let   scheduled = 0, bodyUpdates = 0;
        view.scheduleRowMeasure = () => {scheduled++};
        view.bodies.forEach(body => {body.afterExecuteVdomUpdate = () => {bodyUpdates++}});

        expect(view.setRowHeights(new Map([[view.getRecordId(store.getAt(0)), 100]]))).toBe(true);
        await view.promiseUpdate();
        expect(bodyUpdates, 'the View owns this update, so child post-update hooks do not run').toBe(0);
        expect(scheduled, 'the landed parent render still owes a measurement pass').toBeGreaterThan(0)
    });

    test('the unseen-row estimate rounds the mean without rounding a known height or lowering the minimum', () => {
        const {view} = grid, id = view.getRecordId(store.getAt(0));
        view.setRowHeights(new Map([[id, 85.4]]), true);
        expect(view.rowGeometry.heightAt(0)).toBe(85.4);
        expect(view.rowGeometry.measuredMean).toBe(85.4);
        expect(view.rowGeometry.heightAt(79)).toBe(85);
        expect(grid.rowHeight).toBe(40)
    });

    test('font arrival preserves supplied geometry when no column declares wrapping text', () => {
        const {view} = grid, id = view.getRecordId(store.getAt(0));
        grid.columns.items.forEach(column => {column.wrapText = false});
        view.setRowHeights(new Map([[id, 240]]));
        const height = view.rowGeometry.totalHeight;
        view.onFontChange({windowId: view.windowId});
        expect(view.rowGeometry.heightAt(0)).toBe(240);
        expect(view.rowGeometry.totalHeight).toBe(height)
    });

    test('font arrival retains rendered heights until the fresh nearby batch replaces heights and mean together', async () => {
        const {view} = grid, geometry = view.rowGeometry, baseRead = read;
        await view.measureAheadRows();
        await view.promiseUpdate();
        const previous = geometry.totalHeight;
        let release;
        read = ids => new Promise(resolve => {
            release = () => resolve(baseRead(ids).map(rect => ({...rect, height: rect.height * 2})))
        });

        view.onFontChange({windowId: view.windowId});
        expect(geometry.heightAt(0), 'font invalidation alone never paints the estimate').toBe(85);
        expect(geometry.measuredMean).toBe(85);
        const flight = view.measureAheadRows();
        await expect.poll(() => typeof release).toBe('function');
        expect(geometry.totalHeight, 'the old extent survives the cross-thread read').toBe(previous);
        release();
        await flight;
        expect(geometry.heightAt(0)).toBe(165);
        expect(geometry.measuredMean).toBe(165);
        expect(geometry.estimate).toBe(165);
        expect(geometry.hasHeight(view.getRecordId(store.getAt(79))), 'unseen fallback-font knowledge is retired').toBe(false)
    });

    test('a thumb drag holds the old geometry until release swaps the ready font measurements and mean', async () => {
        const {view, verticalScrollbar} = grid,
              geometry                  = view.rowGeometry,
              recordId                  = view.getRecordId(store.getAt(0)),
              baseRead                  = read,
              extents                   = () => ({total: geometry.totalHeight, bodies: view.bodies.map(body => body.vdom.height),
                  scrollbar: verticalScrollbar.vdom.cn[0].height}),
              initial = extents();

        view.isThumbDragging = true;
        await view.measureAheadRows();
        expect(geometry.hasHeight(recordId)).toBe(false);
        expect(geometry.measuredMean).toBe(null);
        expect(geometry.estimate).toBe(40);
        expect(extents()).toEqual(initial);

        view.isThumbDragging = false;
        await view.promiseUpdate();
        expect(geometry.hasHeight(recordId)).toBe(true);
        expect(geometry.measuredMean).toBe(85);
        expect(geometry.estimate).toBe(85);
        expect(geometry.hasHeight(view.getRecordId(store.getAt(79)))).toBe(false);
        expect(geometry.heightAt(79)).toBe(85);
        const measured = extents();
        expect(measured).toEqual({total: 6800, bodies: view.bodies.map(() => '6885px'), scrollbar: '6885px'});

        // The same content and widths now have twice the text height: only font invalidation can renew them.
        read = ids => baseRead(ids).map(rect => ({...rect, height: rect.height * 2}));
        view.isThumbDragging = true;
        view.onFontChange({windowId: view.windowId});
        expect(geometry.hasHeight(recordId)).toBe(true);
        expect(geometry.measuredMean).toBe(85);
        expect(geometry.estimate).toBe(85);
        expect(extents()).toEqual(measured);
        await view.measureAheadRows();
        expect(geometry.measuredMean, 'fresh font measurements do not move the dragging thumb').toBe(85);
        expect(extents()).toEqual(measured);
        view.isThumbDragging = false;
        await view.promiseUpdate();
        expect(geometry.hasHeight(recordId)).toBe(true);
        expect(geometry.measuredMean).toBe(165);
        expect(geometry.estimate).toBe(165);
        expect(geometry.hasHeight(view.getRecordId(store.getAt(79)))).toBe(false);
        expect(geometry.heightAt(79)).toBe(165);
        expect(grid.rowHeight).toBe(40);
        expect(extents()).toEqual({total: 13200, bodies: view.bodies.map(() => '13365px'), scrollbar: '13365px'})
    });

    test('store replacement retires renderer contexts, resets every mounted source, and refuses the old pending reply', async () => {
        const {view, verticalScrollbar} = grid,
              geometry                  = view.rowGeometry,
              bodies                    = [...view.bodies],
              oldStore                  = store,
              contexts                  = [],
              baseRead                  = read;
        let release, replacement, pendingRects;

        grid.useInternalId = false;
        grid.columns.get('note').renderer = ({record, row, store: contextStore, value}) => {
            contexts.push({record, row, store: contextStore});
            return value
        };
        grid.repaintCells();
        await Promise.all(bodies.map(body => body.promiseUpdate()));
        await view.measureAheadRows();
        await view.promiseUpdate();
        expect(geometry.measuredMean).toBe(85);
        expect(geometry.estimate).toBe(85);
        const projectors = bodies.map(body => Neo.getComponent(body.rowMeasureVdom.cn[0].id.split('__measure_')[0]));
        expect(projectors.every(row => row && !row.isDestroyed)).toBe(true);
        expect(contexts.some(context => projectors.includes(context.row) && context.store === oldStore)).toBe(true);

        // A different record range contributes a valid old-store read with overlapping natural ids.
        view.syncBodies(geometry.offsetAt(40));
        await view.promiseUpdate();
        read = ids => {
            pendingRects = baseRead(ids);
            return new Promise(resolve => {release = () => resolve(pendingRects)})
        };
        const flight = view.measureAheadRows();
        await expect.poll(() => typeof release).toBe('function');
        expect(pendingRects.length).toBeGreaterThan(0);
        expect(pendingRects.every(rect => rect.width > 0 && rect.height > 0)).toBe(true);

        try {
            replacement = Neo.create(Store, {keyProperty: 'id',
                data: Array.from({length: 80}, (_, id) => ({id, name: `New name ${id}`, note: `New note ${id}`,
                    nameLines: 1, noteLines: 2})),
                model: {fields: ['id', 'name', 'note', 'nameLines', 'noteLines'].map(name => ({name}))}});
            grid.store = replacement;
            store = replacement;
            expect(view.bodies).toEqual(bodies);
            expect(view.rowGeometry).toBe(geometry);
            expect(geometry.store).toBe(replacement);
            expect(projectors.every(row => row.isDestroyed)).toBe(true);
            expect(bodies.every(body => body.rowMeasureVdom === null)).toBe(true);
            expect(geometry.measuredMean).toBe(null);
            expect(geometry.estimate).toBe(40);

            release();
            await flight;
            await view.promiseUpdate();
            expect(geometry.measuredMean).toBe(null);
            expect(replacement.items.every(record => !geometry.hasHeight(view.getRecordId(record)))).toBe(true);
            expect(geometry.totalHeight).toBe(3200);
            bodies.forEach(body => {
                expect(body.store).toBe(replacement);
                expect(body.vdom.height).toBe('3240px');
                expect(body.items.filter(row => row.record).every(row => replacement.items.includes(row.record))).toBe(true);
                expect(body.items.filter(row => row.record).every(row => row.vdom.style.height === '40px')).toBe(true)
            });
            expect(verticalScrollbar.vdom.cn[0].height).toBe('3240px');

            contexts.length = 0;
            read = baseRead;
            await Promise.all(bodies.map(body => body.promiseUpdate()));
            expect(bodies.every(body => !body.isVdomUpdating)).toBe(true);
            await view.measureAheadRows();
            expect(geometry.measuredMean).toBe(45);
            expect(geometry.estimate).toBe(45);
            expect(geometry.heightAt(79)).toBe(45);
            expect(bodies.every(body => body.rowMeasureVdom !== null)).toBe(true);
            expect(contexts.length).toBeGreaterThan(0);
            expect(contexts.every(context => context.store === replacement && replacement.items.includes(context.record))).toBe(true);
            const hiddenContexts = contexts.filter(context => !bodies.some(body => body.items.includes(context.row)));
            expect(hiddenContexts.length).toBeGreaterThan(0);
            expect(hiddenContexts.every(context => !projectors.includes(context.row) &&
                context.row.parent.store === replacement)).toBe(true)
        } finally {
            store === replacement ? oldStore.destroy() : replacement?.destroy()
        }
    })
});
