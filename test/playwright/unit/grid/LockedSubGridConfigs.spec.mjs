/**
 * @file test/playwright/unit/grid/LockedSubGridConfigs.spec.mjs
 * @summary A grid's locked bodies and locked header toolbars carry the configs of their center counterparts.
 *
 * Locked columns live in their own bodies and header toolbars. Each one is a clone of the center instance
 * (`Neo.cloneNeoInstance`): the same class and construction configs, with its own id, no reference, and the
 * parent, store and region it needs. Before, the locked instances spread a config record that nothing assigned,
 * so a locked column lost the grid's body and header settings. With `animatedRowSorting`, every body now runs its
 * own AnimateRows plugin, and a sort moves each record's locked and center rows together.
 *
 * @see Neo.grid.Container#createOrUpdateSubGrids
 * @see Neo.grid.header.Wrapper#updateHeaders
 * @see Neo.grid.plugin.AnimateRows
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
        name             : 'GridLockedSubGridConfigsTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import GridBody           from '../../../../src/grid/Body.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

/**
 * A body subclass, to show that a locked body takes the center body's class
 * @class Test.LockedSubGridConfigs.Body
 */
class CustomBody extends GridBody {
    static config = {
        className: 'Test.LockedSubGridConfigs.Body'
    }
}

Neo.setupClass(CustomBody);

/**
 * A grid with one locked column at each end
 * @param {Neo.data.Store} store
 * @param {Object} [body]
 * @param {Object} [headerToolbar]
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store, body = {}, headerToolbar = {}) {
    let grid = Neo.create(GridContainer, {
        appName: 'GridLockedSubGridConfigsTest',
        body,
        columns: [
            {dataField: 'id',    locked: 'start', text: 'ID',    width: 80},
            {dataField: 'name',                   text: 'Name',  width: 200},
            {dataField: 'state', locked: 'end',   text: 'State', width: 100}
        ],
        headerToolbar,
        height   : 400,
        rowHeight: 40,
        store,
        width    : 600
    });

    await grid.initVnode();
    await grid.timeout(50);

    return grid
}

/**
 * Each displayed record's row index, offset and opacity, keyed by record id
 * @param {Neo.grid.Body} body
 * @returns {Object}
 */
function displayedRows(body) {
    return Object.fromEntries(body.items.filter(row => row.record).map(({record, rowIndex, vdom}) => [record.id, {
        offset : parseFloat(/calc\((-?[\d.]+)px/.exec(vdom.style.transform)[1]),
        opacity: vdom.style.opacity ?? null,
        rowIndex
    }]))
}

test.describe('Grid: locked bodies and header toolbars', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(() => {
        grid  = null;
        store = Neo.create(Store, {
            data : Array.from({length: 20}, (item, index) => ({id: index, name: `Row ${index}`, state: index % 2 ? 'open' : 'closed'})),
            model: {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'state', type: 'String'}]}
        })
    });

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy()
    });

    test('each locked body carries the grid\'s body configs', async () => {
        grid = await createGrid(store, {animatedRowSorting: true, highlightModifiedCells: true});

        let {body, bodyEnd, bodyStart} = grid;

        [bodyStart, bodyEnd].forEach(locked => {
            expect(locked.animatedRowSorting).toBe(true);
            expect(locked.highlightModifiedCells).toBe(true)
        });

        // animatedRowSorting brings its plugin into every body
        await expect.poll(() => [body, bodyStart, bodyEnd].every(item => !!item.getPlugin('grid-animate-rows'))).toBe(true)
    });

    test('each locked header toolbar carries the grid\'s header toolbar configs', async () => {
        grid = await createGrid(store, {}, {showHeaderFilters: true, sortable: false, useTriStateSorting: true});

        let {headerEnd, headerStart} = grid.headerWrapper;

        [headerStart, headerEnd].forEach(locked => {
            expect(locked.showHeaderFilters).toBe(true);
            expect(locked.sortable).toBe(false);
            expect(locked.useTriStateSorting).toBe(true)
        })
    });

    test('a locked instance keeps its own identity and placement', async () => {
        grid = await createGrid(store, {module: CustomBody, reference: 'centerBody'}, {reference: 'centerHeader'});

        let {body, bodyEnd, bodyStart, headerToolbar, view} = grid,
            {headerEnd, headerStart}                        = grid.headerWrapper;

        expect(new Set([body.id, bodyStart.id, bodyEnd.id]).size).toBe(3);
        expect(new Set([headerToolbar.id, headerStart.id, headerEnd.id]).size).toBe(3);

        [bodyStart, bodyEnd].forEach(locked => {
            expect(locked).toBeInstanceOf(CustomBody);
            expect(locked.reference).toBe(null);
            expect(locked.parentId).toBe(view.id);
            expect(locked.store).toBe(grid.store)
        });

        [headerStart, headerEnd].forEach(locked => expect(locked.reference).toBe(null));
        expect([headerStart.layoutLock, headerEnd.layoutLock]).toEqual(['start', 'end'])
    });

    test('with animatedRowSorting, the locked bodies move every record with the center body', async () => {
        grid = await createGrid(store, {animatedRowSorting: true, pluginAnimateRowsConfig: {transitionDuration: 200}});

        let {body, bodyEnd, bodyStart, headerWrapper} = grid,
            bodies                                    = [bodyStart, body, bodyEnd],
            often                                     = {intervals: [5]},
            start, center, end;

        await expect.poll(() => bodies.every(item => !!item.getPlugin('grid-animate-rows'))).toBe(true);

        grid.mounted = true;
        await Promise.all([headerWrapper.headerStart, grid.headerToolbar, headerWrapper.headerEnd].map(item => item.passSizeToBody()));
        bodies.forEach(item => item.set({availableHeight: 360, containerWidth: 600}));
        await grid.timeout(50);

        // Names sort as text: Row 10 moves up from index 10 to 2, and Row 14, which was not displayed, enters at index 6
        store.sort({direction: 'ASC', property: 'name'});

        [start, center, end] = bodies.map(displayedRows);
        expect([center[10], center[14]]).toEqual([{offset: 400, opacity: null, rowIndex: 2}, {offset: 240, opacity: 0, rowIndex: 6}]);
        expect([start, end]).toEqual([center, center]);

        await expect.poll(() => bodies.every(item => item.cls.includes('neo-animate-rows-moving')), often).toBe(true);
        [start, center, end] = bodies.map(displayedRows);
        expect([center[10], center[14]]).toEqual([{offset: 80, opacity: null, rowIndex: 2}, {offset: 240, opacity: null, rowIndex: 6}]);
        expect([start, end]).toEqual([center, center]);

        await expect.poll(() => bodies.some(item => item.cls.includes('neo-animate-rows-moving')), often).toBe(false);
        [start, center, end] = bodies.map(displayedRows);
        Object.values(center).forEach(({offset, rowIndex}) => expect(offset).toBe(rowIndex * 40));
        expect([start, end]).toEqual([center, center])
    });

    test('Neo.cloneNeoInstance applies the given configs over the original ones and drops the id', () => {
        let original = Neo.create(Button, {appName: 'GridLockedSubGridConfigsTest', iconCls: 'fa fa-home', id: 'clone-source', text: 'Home'}),
            clone    = Neo.cloneNeoInstance(original, {text: 'Away'});

        expect(clone).toBeInstanceOf(Button);
        expect(clone.id).not.toBe(original.id);
        expect([clone.iconCls, clone.text]).toEqual(['fa fa-home', 'Away']);

        // Neo.clone() takes the same path without configs
        let copy = Neo.clone(original);

        expect(copy).toBeInstanceOf(Button);
        expect(copy.id).not.toBe(original.id);
        expect([copy.iconCls, copy.text]).toEqual(['fa fa-home', 'Home']);

        copy.destroy();
        clone.destroy();
        original.destroy()
    })
});
