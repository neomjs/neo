import {expect, test} from '../../fixtures.mjs';

/**
 * @summary An id an app gives a grid column names the column, and nothing else.
 *
 * `grid.Container#createColumns` builds a column's header button from the column's own config. With the id copied
 * along, one id named two instances: the instance manager refused the second and logged it, the DOM node carrying
 * the id was the header button, and the App Worker answered for the same id with the column.
 *
 * Fixture: `apps/grid-cell-editing`, whose pooled grid gives `c3` the id an arm reaches the column by. The refusal is
 * a `Neo.logError`, which writes to the console and raises nothing, so the arm reads the console itself.
 */
const COLUMN_ID = 'grid-cell-editing-pooled-c3',
      GRID      = '#grid-cell-editing-pooled';

test('a column\'s id resolves to the column, and its header button takes a generated one', async ({page}) => {
    const refusals = [];

    page.on('console', message => message.text().includes('already existing id') && refusals.push(message.text()));

    await page.goto('test/playwright/component/apps/grid-cell-editing/index.html');
    await expect(page.locator(`${GRID} .neo-grid-cell[data-field="c39"]`).first()).toBeVisible({timeout: 30000});

    const header = page.locator(`${GRID} .neo-grid-header-button`).filter({hasText: /^C3$/});

    await expect(header, 'c3 has its header button').toHaveCount(1);
    expect(await header.getAttribute('id'), 'the button does not carry the column\'s id').not.toBe(COLUMN_ID);
    await expect(page.locator(`[id="${COLUMN_ID}"]`), 'no DOM node carries the column\'s id').toHaveCount(0);

    expect(await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: ['className', 'dataField']}), COLUMN_ID),
        'the id answers with the column').toEqual(['Neo.grid.column.Base', 'c3']);

    expect(refusals, 'no instance was refused its id').toEqual([])
});
