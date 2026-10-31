/**
 * @file test/playwright/unit/grid/AriaRegions.spec.mjs
 * @summary A grid with locked columns exposes one WAI-ARIA grid model across its regions.
 *
 * Locked columns render each record in up to three bodies (start, center, end), each with its own row and
 * header toolbar. WAI-ARIA positions a cell "with respect to the total number of columns", and requires row
 * indices to increase from row to row, so the regions must number their columns grid-wide and expose one row
 * per record: the lead region's row owns the other regions' rows through `aria-owns`, and those take
 * `role="none"`. The engine reads no ARIA attribute back: the header drag resolves columns by `dataField` and
 * the body resolves rows by their own `rowIndex`.
 *
 * @see Neo.grid.Container#getAriaColumnOffset
 * @see Neo.grid.Body#getAriaRowOwns
 * @see Neo.grid.header.Wrapper#syncAriaRows
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
        name             : 'GridAriaRegionsTest',
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

/**
 * Two columns locked at the start, two in the center, one locked at the end, rendered with rows
 * @param {Neo.data.Store} store
 * @returns {Promise<Neo.grid.Container>}
 */
async function createGrid(store) {
    let grid = Neo.create(GridContainer, {
        appName: 'GridAriaRegionsTest',
        columns: [
            {dataField: 'id',    locked: 'start', text: 'ID',    width: 80},
            {dataField: 'code',  locked: 'start', text: 'Code',  width: 80},
            {dataField: 'name',                   text: 'Name',  width: 200},
            {dataField: 'city',                   text: 'City',  width: 120},
            {dataField: 'state', locked: 'end',   text: 'State', width: 100}
        ],
        height   : 400,
        rowHeight: 40,
        store,
        width    : 700
    });

    await grid.initVnode();
    await grid.timeout(50);
    await renderRows(grid);

    return grid
}

/**
 * Sizes every present header toolbar and body so the bodies render their rows
 * @param {Neo.grid.Container} grid
 * @returns {Promise<void>}
 */
async function renderRows(grid) {
    grid.mounted = true;
    await Promise.all(grid.headerWrapper.getToolbars().map(toolbar => toolbar.passSizeToBody()));
    [grid.bodyStart, grid.body, grid.bodyEnd].filter(Boolean).forEach(body => body.set({availableHeight: 360, containerWidth: 700}));
    await grid.timeout(50)
}

/**
 * The `aria-colindex` of each cell a body row renders, keyed by its column
 * @param {Neo.grid.Row} row
 * @returns {Object}
 */
function cellIndices(row) {
    return Object.fromEntries(row.vdom.cn.filter(cell => cell.role === 'gridcell' && cell.data?.field).map(cell => [cell.data.field, cell['aria-colindex']]))
}

/**
 * The `aria-colindex` of each header's `columnheader` node in a toolbar, keyed by its column
 * @param {Neo.grid.header.Toolbar} toolbar
 * @returns {Object}
 */
function headerIndices(toolbar) {
    return Object.fromEntries(toolbar.items.map(button => [button.dataField, button.vdom['aria-colindex']]))
}

/**
 * The row a body renders for a row index
 * @param {Neo.grid.Body} body
 * @param {Number} rowIndex
 * @returns {Neo.grid.Row}
 */
function rowAt(body, rowIndex) {
    return body.items.find(row => row.rowIndex === rowIndex)
}

test.describe('Grid: one ARIA grid across locked regions', () => {
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'bucket B: Grid tests require Playwright browsers in CI');

    let grid, store;

    test.beforeEach(() => {
        grid  = null;
        store = Neo.create(Store, {
            data : Array.from({length: 20}, (item, index) => ({city: `City ${index}`, code: `C${index}`, id: index, name: `Row ${index}`, state: index % 2 ? 'open' : 'closed'})),
            model: {fields: [
                {name: 'city',  type: 'String'},
                {name: 'code',  type: 'String'},
                {name: 'id',    type: 'Integer'},
                {name: 'name',  type: 'String'},
                {name: 'state', type: 'String'}
            ]}
        })
    });

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy()
    });

    test('cells and headers number their columns across the regions, not per region', async () => {
        grid = await createGrid(store);

        let {body, bodyEnd, bodyStart, headerToolbar, headerWrapper} = grid;

        expect(grid.getAriaRoot()['aria-colcount']).toBe(5);
        expect(['start', 'center', 'end'].map(region => grid.getAriaColumnOffset(region))).toEqual([0, 2, 4]);

        expect(cellIndices(rowAt(bodyStart, 3))).toEqual({code: 2, id: 1});
        expect(cellIndices(rowAt(body,      3))).toEqual({city: 4, name: 3});
        expect(cellIndices(rowAt(bodyEnd,   3))).toEqual({state: 5});

        expect(headerIndices(headerWrapper.headerStart)).toEqual({code: 2, id: 1});
        expect(headerIndices(headerToolbar)).toEqual({city: 4, name: 3});
        expect(headerIndices(headerWrapper.headerEnd)).toEqual({state: 5})
    });

    test('the lead region\'s row owns the other regions\' rows, which leave the accessibility tree', async () => {
        grid = await createGrid(store);

        let {body, bodyEnd, bodyStart} = grid,
            lead = rowAt(bodyStart, 3),
            center = rowAt(body, 3),
            end = rowAt(bodyEnd, 3);

        expect([lead.vdom.role, lead.vdom['aria-rowindex'], lead.vdom['aria-owns']]).toEqual(['row', 5, `${center.id} ${end.id}`]);

        [center, end].forEach(row => {
            expect(row.vdom.role).toBe('none');
            expect('aria-rowindex' in row.vdom || 'aria-owns' in row.vdom).toBe(false)
        });

        // Every rendered record pairs its lead row with the rows the other regions render for it
        bodyStart.items.filter(row => row.record).forEach(row => {
            expect(row.vdom['aria-owns']).toBe(`${rowAt(body, row.rowIndex).id} ${rowAt(bodyEnd, row.rowIndex).id}`)
        })
    });

    test('the header exposes one row: the first toolbar owns the others', async () => {
        grid = await createGrid(store);

        let {headerToolbar, headerWrapper} = grid,
            {headerEnd, headerStart}       = headerWrapper;

        expect([headerStart.role, headerStart.getVdomRoot()['aria-rowindex'], headerStart.getVdomRoot()['aria-owns']])
            .toEqual(['row', 1, `${headerToolbar.id} ${headerEnd.id}`]);

        [headerToolbar, headerEnd].forEach(toolbar => {
            expect(toolbar.role).toBe('none');
            expect('aria-rowindex' in toolbar.getVdomRoot()).toBe(false)
        })
    });

    test('without locked-start columns the center body leads, and unlocking re-numbers every region', async () => {
        grid = await createGrid(store);

        grid.columns.get('id').locked   = null;
        grid.columns.get('code').locked = null;
        await grid.timeout(50);
        await renderRows(grid);

        let {body, bodyEnd, bodyStart, headerToolbar, headerWrapper} = grid,
            lead = rowAt(body, 3),
            end  = rowAt(bodyEnd, 3);

        expect(bodyStart).toBeNull();
        expect([lead.vdom.role, lead.vdom['aria-owns']]).toEqual(['row', end.id]);
        expect(end.vdom.role).toBe('none');
        // Each unlocked column enters the center at its start, so `code`, unlocked last, comes first
        expect(cellIndices(lead)).toEqual({city: 4, code: 1, id: 2, name: 3});
        expect(cellIndices(end)).toEqual({state: 5});

        expect([headerToolbar.role, headerToolbar.getVdomRoot()['aria-owns']]).toEqual(['row', headerWrapper.headerEnd.id]);
        expect(headerIndices(headerWrapper.headerEnd)).toEqual({state: 5})
    });

    test('a grid with one region keeps plain rows: no owner, no ownership', async () => {
        grid = await createGrid(store);

        grid.columns.get('id').locked    = null;
        grid.columns.get('code').locked  = null;
        grid.columns.get('state').locked = null;
        await grid.timeout(50);
        await renderRows(grid);

        let row = rowAt(grid.body, 3);

        expect([grid.bodyStart, grid.bodyEnd]).toEqual([null, null]);
        expect([row.vdom.role, row.vdom['aria-rowindex'], 'aria-owns' in row.vdom]).toEqual(['row', 5, false]);
        expect(grid.headerToolbar.role).toBe('row');
        expect('aria-owns' in grid.headerToolbar.getVdomRoot()).toBe(false)
    });

    test('a body resolves the record of a row that carries no aria-rowindex', async () => {
        grid = await createGrid(store);

        let row = rowAt(grid.bodyEnd, 7);

        expect('aria-rowindex' in row.vdom).toBe(false);
        expect(grid.bodyEnd.getRecordByRowId(row.id)).toBe(store.getAt(7))
    });

    test('the ARIA grid wraps only the header and body view, leaving the search toolbar as a sibling (#20188)', async () => {
        grid = await createGrid(store);
        grid.searchToolbar = {};
        grid.updateRowCount();

        let ariaRoot = grid.getAriaRoot();

        expect(grid.vdom.role).toBeUndefined();
        expect(ariaRoot.role).toBe('grid');
        expect(ariaRoot['aria-colcount']).toBe(5);
        expect(ariaRoot['aria-rowcount']).toBe(21);
        expect(ariaRoot.cn.map(node => node.componentId)).toEqual([grid.headerWrapper.id, grid.view.id]);
        expect(grid.vdom.cn[0].componentId).toBe(grid.searchToolbar.id);
        expect(grid.vdom.cn[1].componentId).toBe(grid.ariaWrapper.id)
    });

    test('container items and vdom references stay index-aligned across insert, removeAt, and add/remove (#20188)', async () => {
        grid = await createGrid(store);

        const itemIds = () => grid.items.map(item => item.id),
              vdomIds = () => grid.vdom.cn.map(node => node.componentId);

        expect(vdomIds()).toEqual(itemIds());

        let inserted = grid.insert(grid.items.indexOf(grid.horizontalScrollbar), {ntype: 'component'});
        expect(vdomIds()).toEqual(itemIds());
        expect(vdomIds().indexOf(inserted.id)).toBe(vdomIds().indexOf(grid.horizontalScrollbar.id) - 1);
        grid.remove(inserted);
        expect(vdomIds()).toEqual(itemIds());

        let added = grid.add({ntype: 'component'});
        expect(vdomIds()).toEqual(itemIds());
        grid.remove(added);
        expect(vdomIds()).toEqual(itemIds());

        let removed = grid.removeAt(grid.items.indexOf(grid.horizontalScrollbar), false);
        expect(removed).toBe(grid.horizontalScrollbar);
        expect(vdomIds()).toEqual([grid.ariaWrapper.id, grid.verticalScrollbar.id]);
        removed.destroy()
    })
});
