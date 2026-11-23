import Viewport from '../../../../../src/container/Viewport.mjs';

import {GridContentSizedGrid, GridContentSizedStore} from '../grid-content-sized/app.mjs';

/**
 * Extra heights in px by record id. `test/playwright/e2e/grid/RowGeometry.spec.mjs` mirrors them.
 * @type {Object}
 */
const EXTRAS = {2: 120};

/**
 * @summary The content-sized grid of `grid-content-sized` with an extra height on a record: room below its row's
 * cells for something that is not a cell. It logs the record id of every `rowClick` into {@link #rowClickLog},
 * which a spec reads through `Neo.worker.App.getConfigs()`.
 * @class Neo.test.playwright.GridRowExtraGrid
 * @extends Neo.test.playwright.GridContentSizedGrid
 */
class GridRowExtraGrid extends GridContentSizedGrid {
    static config = {
        className: 'Neo.test.playwright.GridRowExtraGrid'
    }

    /**
     * The record id of every rowClick, in order
     * @member {Number[]} rowClickLog=[]
     */
    rowClickLog = []

    /**
     * Applies the extra heights after the record heights, and starts the rowClick log
     */
    onConstructed() {
        super.onConstructed();

        let me            = this,
            {store, view} = me;

        view.setRowExtraHeights(new Map(Object.entries(EXTRAS).map(([id, extra]) => [view.getRecordId(store.get(Number(id))), extra])));

        me.on('rowClick', ({record}) => me.rowClickLog.push(record.id))
    }
}

GridRowExtraGrid = Neo.setupClass(GridRowExtraGrid);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: 'fit',
        items : [{
            module          : GridRowExtraGrid,
            contentSizedRows: true,
            id              : 'grid-row-extra',
            rowHeight       : 32,
            store           : GridContentSizedStore,
            columns         : [
                {dataField: 'id',     locked: 'start', text: '#',      width: 80},
                {dataField: 'name',                    text: 'Name',   flex : 1},
                {dataField: 'height', locked: 'end',   text: 'Height', width: 100}
            ]
        }]
    },
    name: 'Test.Playwright.GridRowExtra'
});
