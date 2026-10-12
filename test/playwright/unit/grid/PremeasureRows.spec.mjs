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
    })
});
