/**
 * @module e2e/utils/gridCellEditing
 * @summary The DOM reads every grid cell-editing e2e spec shares, bound to one grid.
 *
 * An embodied editor is a `.neo-grid-editor` inside the `.neo-grid-cell` whose `data-field` and `data-record-id`
 * name the edit target. Two specs read that contract — pooling on a synthetic fixture, the edit loop on the public
 * example — and it lives here so a change to it reddens both from one place.
 *
 * @param {String} grid A selector matching exactly one grid; a fixture holding several grids passes an id
 * @returns {{EDITOR: String, INPUT: String, cell: Function, editingIn: Function, embodiment: Function, recordLeaks: Function}}
 */
export default function gridCellEditing(grid) {
    const EDITOR = `${grid} .neo-grid-editor`,
          INPUT  = `${EDITOR} input`;

    return {
        EDITOR,
        INPUT,

        /**
         * The rendered cell showing `field` of the record `recordId`.
         * @param {import('@playwright/test').Page} page
         * @param {String} field
         * @param {String} recordId
         * @returns {import('@playwright/test').Locator}
         */
        cell: (page, field, recordId) => page.locator(`${grid} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`),

        /**
         * True while DOM focus is in an editor input embodied in exactly that cell.
         * @param {import('@playwright/test').Page} page
         * @param {String} field
         * @param {String} recordId
         * @returns {Promise<Boolean>}
         */
        editingIn: (page, field, recordId) => page.evaluate(({field, recordId}) => {
            const input = document.activeElement,
                  cell  = input?.closest?.('.neo-grid-cell');

            return input?.tagName === 'INPUT' && !!input.closest('.neo-grid-editor') &&
                cell?.dataset.field === field && cell?.dataset.recordId === recordId
        }, {field, recordId}),

        /**
         * Where the editor is embodied right now: `{count, field, recordId}` — `field`/`recordId` of its cell.
         * @param {import('@playwright/test').Page} page
         * @returns {Promise<Object>}
         */
        embodiment: page => page.evaluate(editor => {
            const nodes = document.querySelectorAll(editor),
                  cell  = nodes[0]?.closest('.neo-grid-cell');

            return {count: nodes.length, field: cell?.dataset.field ?? null, recordId: cell?.dataset.recordId ?? null}
        }, EDITOR),

        /**
         * Records into `window.__leaks`, on every DOM mutation, any editor embodied in a cell other than the target —
         * what a recycled pool slot, or a gesture that should have been refused, would show.
         * @param {import('@playwright/test').Page} page
         * @param {String} field
         * @param {String} recordId
         * @returns {Promise<void>}
         */
        recordLeaks: (page, field, recordId) => page.evaluate(({grid, field, recordId}) => {
            const root = document.querySelector(grid);

            window.__leaks = [];

            new MutationObserver(() => {
                root.querySelectorAll('.neo-grid-editor').forEach(editor => {
                    const cell = editor.closest('.neo-grid-cell');

                    if (cell?.dataset.field !== field || cell?.dataset.recordId !== recordId) {
                        window.__leaks.push(`${cell?.dataset.field}/${cell?.dataset.recordId}`)
                    }
                })
            }).observe(root, {attributes: true, childList: true, subtree: true})
        }, {grid, field, recordId})
    }
}
