/**
 * @module AgentOSWidget.util.createdGridEvidence
 * @summary Projects a live inserted grid into the first-widget evidence blueprint shape.
 *
 * The deterministic first-widget path fed a hand-authored blueprint object straight into the evidence
 * pane. This leaf moves the provenance to a live inserted grid: the grid is added to a stage container,
 * which fires `insert {index, item}` (see `src/container/Base.mjs`) — the same `add → insert` seam a
 * Neural-Link `create_component` drives (it calls `add` on the parent container). The `item` is the
 * real, mounted grid — not a config object. This projection turns that live grid into the SAME
 * `{schema:String, title:String, columns:Array, rows:Array}` shape `projectBlueprintEvidence` already
 * consumes, so the evidence pane reflects the grid that was actually inserted into the stage.
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
 * Whether a value is a usable object to read metadata off — a live `NeoInstance` (the grid + its
 * store are class instances, NOT plain objects) OR a plain config object (the defensive / unit path).
 * `Neo.isObject` is deliberately NOT used here: it is plain-object-only (`constructor.name === 'Object'`)
 * and would reject the live grid instance this projection exists to read.
 * @param {*} value
 * @returns {Boolean}
 * @private
 */
function isObjectLike(value) {
    const type = Neo.typeOf(value);
    return type === 'Object' || type === 'NeoInstance'
}

/**
 * Reads the live row count off a grid's store without copying any record data. A live store is a
 * Neo collection (`count` / `items`); a plain `{data}` config array is also accepted defensively.
 * @param {Object} store the grid's live store instance
 * @returns {Number} the row count (0 when it cannot be determined)
 * @private
 */
function readRowCount(store) {
    if (Number.isInteger(store.count)) {
        return store.count
    }

    for (const candidate of [store.items, store.data]) {
        if (Array.isArray(candidate)) {
            return candidate.length
        }
    }

    return 0
}

/**
 * Resolves a grid's columns to a plain array of column definitions. A live grid's `columns` is a Neo
 * collection (its `.items` are the column components); a plain config array is also accepted.
 * @param {Object} grid the live grid component
 * @returns {Object[]|null} the column array, or `null` when columns cannot be read
 * @private
 */
function readColumns(grid) {
    if (Array.isArray(grid.columns?.items)) {
        return grid.columns.items
    }

    if (Array.isArray(grid.columns)) {
        return grid.columns
    }

    return null
}

/**
 * Projects a live created grid into the deterministic first-widget blueprint shape.
 *
 * @param {Object} grid the live grid component received from the stage's insert event
 * @returns {{schema: String, title: String, columns: Object[], rows: Array}|null}
 *   the blueprint object (exactly the `schema`/`title`/`columns`/`rows` keys
 *   `projectBlueprintEvidence` allowlists) on success, or `null` when `grid` is not a usable grid —
 *   so the caller can fail the evidence pane closed.
 */
export function projectCreatedGrid(grid) {
    if (!isObjectLike(grid)) {
        return null
    }

    const
        schema      = typeof grid.className === 'string' && grid.className ? grid.className : null,
        store       = isObjectLike(grid.store) ? grid.store : null,
        columnItems = readColumns(grid);

    if (!schema || !columnItems || !store) {
        return null
    }

    // safe scalar metadata only — never the live column instances or record data
    const columns = columnItems.map(column => ({
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
