/**
 * @module AgentOSWidget.util.createdGridEvidence
 * @summary Projects a live, Neural-Link-created grid into the first-widget evidence blueprint shape.
 *
 * The deterministic first-widget path fed a hand-authored blueprint object straight into the evidence
 * pane. This leaf closes the H2 provenance loop: the grid is now created through the Neural-Link
 * `create_component` path and inserted into a live container, which fires
 * `insert {index, item}` (see `src/container/Base.mjs`). The `item` is the real, mounted grid — not a
 * config object. This projection turns that live grid into the SAME
 * `{schema:String, title:String, columns:Array, rows:Array}` shape `projectBlueprintEvidence` already
 * consumes, so the evidence pane reflects the grid that actually crossed the bridge.
 *
 * It is deliberately NOT the safety boundary — `projectBlueprintEvidence` remains that. This function
 * only reads safe scalar metadata off the live grid (its class id, a title label, the column
 * definitions, and the live row COUNT) and assembles exactly the four allowlisted blueprint keys.
 * Row data is never copied — only `Array.from({length: rowCount})` — so no live record payload can
 * ride into the view through the evidence path. Anything that is not a usable grid (non-object, no
 * class id, no columns array, no store) fails closed to `null`, which the pane renders as its bounded
 * rejected state via the downstream projection.
 */

/**
 * Reads the live row count off a grid's store without copying any record data.
 * @param {Object} store the grid's live store instance
 * @returns {Number} the row count (0 when it cannot be determined)
 * @private
 */
function readRowCount(store) {
    if (Number.isInteger(store.count)) {
        return store.count
    }

    if (Array.isArray(store.data)) {
        return store.data.length
    }

    return 0
}

/**
 * Projects a live created grid into the deterministic first-widget blueprint shape.
 *
 * @param {Object} grid the live grid component inserted via the Neural-Link create path
 * @returns {{schema: String, title: String, columns: Object[], rows: Array}|null}
 *   the blueprint object (exactly the `schema`/`title`/`columns`/`rows` keys
 *   `projectBlueprintEvidence` allowlists) on success, or `null` when `grid` is not a usable grid —
 *   so the caller can fail the evidence pane closed.
 */
export function projectCreatedGrid(grid) {
    if (!Neo.isObject(grid)) {
        return null
    }

    const
        schema = typeof grid.className === 'string' && grid.className ? grid.className : null,
        store  = Neo.isObject(grid.store) ? grid.store : null;

    if (!schema || !Array.isArray(grid.columns) || !store) {
        return null
    }

    // safe scalar metadata only — never the live column instances or record data
    const columns = grid.columns.map(column => ({
        dataField: typeof column?.dataField === 'string' ? column.dataField : '',
        text     : typeof column?.text === 'string' ? column.text : ''
    }));

    const title = [grid.title, grid.id].find(value => typeof value === 'string' && value) || schema;

    return {
        schema,
        title,
        columns,
        rows: Array.from({length: readRowCount(store)})
    }
}
