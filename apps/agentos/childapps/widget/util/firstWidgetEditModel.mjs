/**
 * @module AgentOSWidget.util.firstWidgetEditModel
 * @summary The deterministic data model behind a bounded first-widget edit — the single source of the
 * canonical seed rows and the pure mapping from a parsed edit to a live-grid mutation.
 *
 * {@link AgentOSWidget.util.parseEditRequest} is the safe GRAMMAR (text → a typed `edit`); this module is
 * the safe MODEL (a typed `edit` → a bounded mutation descriptor). Keeping the model pure and free of any
 * live-component reference means every accepted edit's effect is unit-testable without a controller
 * harness, and the controller stays a thin applier: it asks this module WHAT to change, then sets exactly
 * that on the live grid. No data is ever read back off the view, and every produced row is a fresh object
 * with a unique key — so a mutation can never alias the seed rows or collide store keys.
 */

/**
 * The canonical seed rows for the first widget. Used both to seed the bootstrap grid's store and as the
 * `reset` target, so there is one source of truth for "the sample data". Treated as read-only — callers
 * receive fresh copies via {@link sampleRows}, never this array.
 * @type {Object[]}
 */
export const firstWidgetRows = [
    {id: 'intent',   task: 'Verify intent', owner: 'Ada',           evidence: 'Blueprint'},
    {id: 'render',   task: 'Render grid',   owner: 'Runtime',       evidence: 'Live widget'},
    {id: 'evidence', task: 'Show evidence', owner: 'Evidence pane', evidence: 'Safe text'}
];

/**
 * Builds exactly `count` deterministic rows as FRESH objects with unique `id` keys: the first rows reuse
 * the canonical seed (so the meaningful rows survive a row-count change), and any beyond the seed are
 * bounded deterministic filler. Fresh objects + unique ids keep the result safe to hand straight to a
 * keyed store without aliasing the seed or colliding keys. `count` is already bounded by the grammar.
 * @param {Number} count how many rows to produce
 * @returns {Object[]} `count` fresh row objects
 * @private
 */
function sampleRows(count) {
    return Array.from({length: count}, (_, index) => {
        const canonical = firstWidgetRows[index];

        return canonical ? {...canonical} : {
            id      : `row-${index + 1}`,
            task    : `Sample task ${index + 1}`,
            owner   : 'Agent',
            evidence: 'Generated'
        }
    })
}

/**
 * Maps a parsed, already-validated edit to a bounded live-grid mutation descriptor. Pure: it neither reads
 * nor touches any live component — the controller applies the returned descriptor to the grid.
 *
 * @param {Object} edit a typed edit from {@link AgentOSWidget.util.parseEditRequest}
 * @param {String} edit.type one of `'rename'` · `'rowCount'` · `'reset'`
 * @returns {{title: String}|{rows: Object[]}|{}}
 *   `{title}` for a rename, `{rows}` (fresh objects) for a row-count or reset, or `{}` for an
 *   unrecognised edit type (defensive — the caller only applies accepted edits).
 */
export function resolveWidgetEdit(edit) {
    switch (edit?.type) {
        case 'rename':
            return {title: edit.title};
        case 'rowCount':
            return {rows: sampleRows(edit.count)};
        case 'reset':
            return {rows: sampleRows(firstWidgetRows.length)}
    }

    return {}
}
