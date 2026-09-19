/**
 * @module test/playwright/component/apps/grid-cell-editing/gridDriver
 * @summary Drives `#grid-cell-editing-pooled` from inside the App Worker: one store, column or edit operation per
 * import, named by the module's own `action` query parameter.
 *
 * A spec cannot sort, filter or lock a column by pointer without ending the edit it wants to observe: a header click
 * moves focus, and focus leaving the editor commits. `Neo.worker.App.loadModule()` imports this module where the grid
 * lives, so each operation runs in the order the spec asks for it. The caller adds a counter to the query, which makes
 * every call a new module URL, evaluated again.
 *
 * `rowModel` swaps the View's cell-selecting model for the grid's default one, which selects rows and no cells.
 *
 * Store actions target record 3 and column actions target `c3`, the cell the arms edit. `optOutEdited` and
 * `optOutEnd` take `c3` and the locked `c39` out of suspension, for the arms that need an opted-out column under a lock
 * change or in a locked body. `updateEdited` also writes `c4`, so the row's repaint is visible while the edited cell
 * itself shows the editor. `startUpdates` writes `c4` every 4 ms until `stopUpdates`: a stream of row repaints, each a
 * render that covers the editor. `logEvents` records, in order, every record write (`commit:<fields>`) and every
 * selection change (`select`) into `grid.driverEventLog`, which a spec reads through `Neo.worker.App.getConfigs()`.
 */
import RowModel from '../../../../../src/selection/grid/RowModel.mjs';

const {searchParams}   = new URL(import.meta.url),
      grid             = Neo.getComponent('grid-cell-editing-pooled'),
      {columns, store} = grid;

const actions = {
    cancel      : () => grid.getPlugin('grid-cell-editing').cancelEdit(),
    clearFilter : () => store.clearFilters(),
    filterOut   : () => {store.filters = [{property: 'c3', operator: 'like', value: 'r1'}]},
    hold        : () => grid.getPlugin('grid-cell-editing').holdEdit(),
    lockEnd     : () => {columns.get('c3').locked = 'end'},
    lockStart   : () => {columns.get('c3').locked = 'start'},
    logEvents   : () => {
        const log = grid.driverEventLog = [];

        store.on('recordChange', ({fields}) => log.push(`commit:${fields.map(({name}) => name).join()}`));
        grid.view.selectionModel.on('selectionChange', () => log.push('select'))
    },
    optOutEdited: () => {columns.get('c3').cancelEditOnProjectionLoss = true},
    optOutEnd   : () => {columns.get('c39').cancelEditOnProjectionLoss = true},
    release     : () => grid.getPlugin('grid-cell-editing').releaseEdit(),
    remove      : () => store.remove(3),
    rowModel    : () => {grid.view.selectionModel = RowModel},
    sortAsc     : () => store.sort({property: 'id', direction: 'ASC'}),
    sortDesc    : () => store.sort({property: 'id', direction: 'DESC'}),
    startUpdates: () => {
        let count = 0;
        globalThis.gridDriverUpdates = setInterval(() => store.get(3).set({c4: `pushed ${++count}`}), 4)
    },
    stopUpdates : () => clearInterval(globalThis.gridDriverUpdates),
    unlock      : () => {columns.get('c3').locked = null},
    updateEdited: () => store.get(3).set({c3: 'pushed', c4: 'pushed'}),
    updateOther : () => store.get(3).set({c4: 'pushed'})
};

actions[searchParams.get('action')]()
