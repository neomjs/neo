/**
 * @module test/playwright/component/apps/grid-cell-editing/cancelListenerDriver
 * @summary Installs one `cellEditCancel` listener on `#grid-cell-editing` from inside the App Worker, named by the
 * module's own `action` query parameter.
 *
 * `cellEditCancel` fires synchronously while the cancel is still unwinding, so what a listener does lands in the
 * middle of it. A spec cannot install such a listener from the main thread — the grid, its selection model and the
 * event live in the App Worker — and `Neo.worker.App.loadModule()` imports this module where they are. The caller
 * adds a counter to the query, which makes every call a new module URL, evaluated again.
 *
 * Both listeners are `once`, so the arm that installs one does not leak it into the next.
 */

const {searchParams} = new URL(import.meta.url),
      grid           = Neo.getComponent('grid-cell-editing'),
      {store}        = grid;

const actions = {
    /**
     * The listener ends the grid while the cancel is still unwinding: anything the cancel touches afterwards is
     * reaching into a destroyed instance.
     */
    destroyOnCancel: () => {
        grid.on('cellEditCancel', () => grid.destroy(), grid, {once: true})
    },

    /**
     * The listener selects a different record's cell. That intent is newer than the one the cancel was about, so it
     * has to survive: whatever the cancel does with selection must already have happened.
     */
    selectOnCancel: () => {
        grid.on('cellEditCancel', () => {
            const {view} = grid,
                  record = store.getAt(3),
                  cellId = view.getLogicalCellId(record, 'score');

            view.selectionModel.select(cellId);
            grid.driverSelectedOnCancel = cellId
        }, grid, {once: true})
    }
};

actions[searchParams.get('action')]()
