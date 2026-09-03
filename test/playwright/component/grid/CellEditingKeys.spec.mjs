import {test, expect} from '@playwright/test';

/**
 * `grid.plugin.CellEditing` offers two activation gestures and only one of them worked.
 *
 * A double-click reaches `mountEditor` directly. `Enter` and `Space` route through a key
 * registration, and on a grid that path is dead — for two independent reasons, either of which
 * alone is sufficient:
 *
 * 1. **The registration is on the wrong component.** `table.plugin.CellEditing` does
 *    `owner.body.keys.add({Enter: 'onTableKeyDown', …})`. `Neo.manager.DomEvent` routes a DOM event
 *    by walking its path UPWARD (`ComponentManager.getParentPath`), so a component's listener fires
 *    only when that component is on the target's ancestor path. Focus lives on `grid.View` and the
 *    bodies are its DESCENDANTS, so a body listener is never on the path.
 * 2. **The guard reads focus, not selection.** `onTableKeyDown` opens an editor only when
 *    `target.cls?.includes('neo-selected')` — the target being the focused element. `neo-selected`
 *    lands on the CELL, and a grid cell is not focusable: measured in a real browser, exactly ONE
 *    element inside a grid container declares `tabindex`, and it is `grid.View`.
 *
 * Both are inherited rather than authored: the base is correct for `table.Body`, whose `tbody`
 * carries `tabIndex:-1` and IS the focus owner. `grid.View.mjs` already declares the right home —
 * *"grid.View is the single key registry, the keyboard half of"* the View-owned focus contract — and
 * `selection.grid.CellModel` / `ColumnModel` both comply by pushing onto `view.keys._keys`.
 * `CellEditing` is the only key registration in the grid stack aimed at the body.
 *
 * **The controls are the load-bearing part of this spec.** A single red arm cannot distinguish "the
 * key path is broken" from "the editor never works", "the fixture has no editable column", or "focus
 * is broken" — and a grid click failing to move focus has been a real defect of its own. So the double-click
 * arm, the focus arm and the selection arm all pass BEFORE and after the fix, and pin the failure to
 * the keys alone.
 *
 * Run: npm run test-components -- grid/CellEditingKeys
 */
const GRID   = '#grid-cell-editing',
      NAME   = '[data-field="name"]',
      EDITOR = '.neo-grid-editor input';

const activeElementId = page => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

const viewIdOf = page => page.locator(`${GRID} .neo-grid-view`).first().getAttribute('id');

/**
 * The first row's Name cell — addressed by its `data-field`, never by DOM order or by a cell id.
 * `.neo-grid-cell` first() is a pooled cell of whichever column renders first, and the DOM id is
 * pool-slot based (`…__row-0__cell-0`), so neither identifies a column. `grid.Row` stamps
 * `data: {field: dataField, recordId}` on every cell, which is the only stable column handle.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Locator}
 */
const nameCell = page => page.locator(`${GRID} .neo-grid-row`).first().locator(NAME).first();

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/grid-cell-editing/index.html');
    await page.waitForSelector(`${GRID} .neo-grid-row`, {state: 'visible', timeout: 30000})
});

// The plugin is lazily imported by `afterSetCellEditing`, so every arm below assumes it is live.
// That assumption is witnessed by the double-click control rather than by a config read: a mounted
// editor proves the plugin armed AND that its editor path works, where `plugins.length >= 1` would
// only prove something was installed.

test.describe('grid cell editing — the key activation contract', () => {
    test('control: a click lands focus on the View, which is the only focusable element in the grid', async ({page}) => {
        await nameCell(page).click();

        expect(await activeElementId(page), 'the View is the grid\'s single focus anchor')
            .toBe(await viewIdOf(page));

        // Stated as a measurement rather than an assumption, because the whole defect turns on it.
        const declaring = await page.evaluate(sel => [...document.querySelectorAll(`${sel} [tabindex]`)]
            .map(el => el.className.split(' ')[0]), GRID);

        expect(declaring, 'exactly one element in a grid declares tabindex, and it is the View')
            .toEqual(['neo-grid-view'])
    });

    test('control: the click marks the CELL selected, which is where neo-selected lives', async ({page}) => {
        await nameCell(page).click();
        await expect(nameCell(page), 'a CellModel marks the clicked cell').toHaveClass(/neo-selected/)
    });

    test('control: a double-click mounts the editor, so the plugin and the editor path both work', async ({page}) => {
        const cell  = nameCell(page),
              value = (await cell.innerText()).trim();

        await cell.dblclick();

        await expect(page.locator(EDITOR), 'onCellDoubleClick reaches mountEditor directly').toBeVisible({timeout: 10000});
        await expect(page.locator(EDITOR)).toHaveValue(value)
    });

    test('Enter on a selected cell mounts the editor', async ({page}) => {
        const cell  = nameCell(page),
              value = (await cell.innerText()).trim();

        await cell.click();
        await expect(cell).toHaveClass(/neo-selected/);

        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR), 'Enter must reach the cell-editing plugin').toBeVisible({timeout: 10000});
        await expect(page.locator(EDITOR)).toHaveValue(value)
    });

    test('Space on a selected cell mounts the editor, since it is registered on the same handler', async ({page}) => {
        const cell = nameCell(page);

        await cell.click();
        await expect(cell).toHaveClass(/neo-selected/);

        await page.keyboard.press('Space');

        await expect(page.locator(EDITOR), 'Space is registered alongside Enter on onTableKeyDown').toBeVisible({timeout: 10000})
    });

    test('control: Enter on a non-editable column mounts nothing', async ({page}) => {
        const score = page.locator(`${GRID} .neo-grid-row`).first().locator('[data-field="score"]').first();

        await score.click();
        await expect(score).toHaveClass(/neo-selected/);
        await page.keyboard.press('Enter');

        // `mountEditor` returns early on `!column.editable`. Asserted so a fix cannot buy Enter by
        // opening an editor over every column.
        await expect(page.locator(EDITOR), 'a non-editable column stays non-editable').toHaveCount(0)
    });

    test('control: Enter with nothing selected mounts nothing', async ({page}) => {
        const view = page.locator(`${GRID} .neo-grid-view`).first(),
              box  = await view.boundingBox();

        // Below the last row: {x: 2, y: 2} lands on the first row's `id` cell, which SELECTS it —
        // so the arm would pass for the non-editable-column reason the previous arm already covers.
        await view.click({position: {x: 4, y: box.height - 8}});

        await expect(page.locator(`${GRID} .neo-selected`), 'the click must select nothing, or this arm is not about an empty selection')
            .toHaveCount(0);

        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR), 'no selection means no editor').toHaveCount(0)
    })
});
