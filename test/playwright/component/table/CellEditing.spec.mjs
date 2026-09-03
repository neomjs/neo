import {test, expect} from '@playwright/test';

/**
 * The TABLE half of the cell-editing contract — a regression guard for the change that turned two
 * of the shared base's assumptions into hooks.
 *
 * `table.plugin.CellEditing` is the only implementation of cell editing; `grid.plugin.CellEditing`
 * is 34 lines of config on top of it. Two of the base's assumptions are hooks — the cell-id lookup
 * and the key-registry target — because `getCellId()` means a **record** in
 * `table.Body` and a **row index** in `grid.Body`, and the base was calling the table's contract on
 * both. The table is what those hooks default to, so it is the surface a refactor could silently
 * break while every grid arm went green.
 *
 * Asserted behaviourally rather than by reading the diff, and stated plainly: the table previously
 * had **no** cell-editing coverage, which is part of how a three-way break in the grid variant
 * survived. The double-click arm is the one that matters here — it is the gesture that worked on the
 * grid's broken plugin only because it never consulted focus, so it is the least-guarded path.
 *
 * Run: npm run test-components -- table/CellEditing
 */
const TABLE  = '#table-cell-editing',
      NAME   = '[id$="__name"]',
      EDITOR = '.neo-table-editor input';

/**
 * Addressed by cell ID, and that difference from the grid is the defect's own signature: a table
 * cell id is `{bodyId}__{recordId}__{dataField}` (`table.Body#getCellId`), while a grid cell id is
 * pool-slot based and carries its column in a `data-field` attribute instead. The same divergence
 * that made the shared plugin's lookup fail is visible right here in the two DOMs.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Locator}
 */
const nameCell = page => page.locator(`${TABLE} tbody tr`).first().locator(NAME).first();

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/table-cell-editing/index.html');
    await page.waitForSelector(`${TABLE} tbody tr`, {state: 'visible', timeout: 30000})
});

test.describe('table cell editing — the base the grid inherits', () => {
    test('a double-click mounts the editor over the cell, with its value', async ({page}) => {
        const cell  = nameCell(page),
              value = (await cell.innerText()).trim();

        await cell.dblclick();

        const editor = page.locator(EDITOR).first();

        await expect(editor, 'the default cell-id hook still resolves a table cell').toBeVisible({timeout: 10000});
        await expect(editor).toHaveValue(value)
    });

    test('a non-editable column mounts nothing, so the hook did not widen the surface', async ({page}) => {
        const score = page.locator(`${TABLE} tbody tr`).first().locator('[id$="__score"]').first();

        await score.dblclick();

        // `mountEditor` returns early on `!column.editable`. This is the arm that would catch a
        // "fix" that bought editing by opening an editor over every column.
        await expect(page.locator(EDITOR), 'editable:false is still respected').toHaveCount(0)
    })
});
