import {expect, test} from '../../fixtures.mjs';

/**
 * @summary The grid View paints no ring around its whole viewport by default: the selection shows where keyboard focus
 * is. That holds for keyboard navigation, and for an editor handing focus back to the View, which carries no modality
 * stamp and so would get the browser's own ring. `--grid-view-focus-outline` still frames keyboard focus, and never
 * pointer focus.
 *
 * Fixture: `test/playwright/component/apps/grid-cell-editing`, grid `#grid-cell-editing` (a cell-selecting model). The
 * arms read the View's computed outline, and the selected cells, after each gesture.
 */
const GRID = '#grid-cell-editing';

/**
 * The View's focus state in one read.
 * @returns {Promise<{focused: Boolean, modality: String, outline: String, selected: String[]}>}
 */
const readView = page => page.evaluate(grid => {
    const view        = document.querySelector(`${grid} .neo-grid-view`),
          {classList} = view,
          style       = getComputedStyle(view);

    return {
        focused : document.activeElement === view,
        modality: classList.contains('neo-focus-keyboard') ? 'keyboard' : classList.contains('neo-focus-pointer') ? 'pointer' : 'none',
        outline : style.outlineStyle === 'none' ? 'none' : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        selected: [...view.querySelectorAll('.neo-grid-cell.neo-selected')].map(cell => `${cell.dataset.field}/${cell.dataset.recordId}`)
    }
}, GRID);

/**
 * @returns {import('@playwright/test').Locator}
 */
const cell = (page, field, recordId) => page.locator(`${GRID} .neo-grid-cell[data-field="${field}"][data-record-id="${recordId}"]`);

/**
 * The internal record id of the row whose `name` cell shows `name`.
 * @returns {Promise<String>}
 */
const recordIdOf = (page, name) => page.locator(`${GRID} .neo-grid-cell[data-field="name"]`).getByText(name, {exact: true})
    .getAttribute('data-record-id');

test.describe('Grid View focus outline', () => {
    test.use({viewport: {width: 1400, height: 900}});

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/grid-cell-editing/index.html');
        await page.waitForSelector(`${GRID} .neo-grid-cell[data-field="name"]`, {state: 'visible', timeout: 30000})
    });

    test('keyboard navigation paints no ring around the View; the selected cell shows where focus is', async ({page}) => {
        const recordId = await recordIdOf(page, 'Name 2');

        await cell(page, 'name', recordId).click();
        await expect.poll(async () => (await readView(page)).modality, {message: 'pointer focus is stamped'}).toBe('pointer');

        await page.keyboard.press('ArrowRight');

        await expect.poll(async () => (await readView(page)).modality, {message: 'the keydown switches modality'}).toBe('keyboard');
        await expect.poll(async () => (await readView(page)).selected, {message: 'the selection moved to the next cell'})
            .toEqual([`score/${recordId}`]);

        expect(await readView(page)).toMatchObject({focused: true, outline: 'none'})
    });

    test('an editor handing focus back paints no ring, whether it was cancelled or completed', async ({page}) => {
        const recordId = await recordIdOf(page, 'Name 6');

        await cell(page, 'name', recordId).dblclick();
        await expect(page.locator(`${GRID} .neo-grid-editor input`)).toBeFocused();
        await page.keyboard.press('Escape');

        await expect.poll(async () => (await readView(page)).focused, {message: 'the cancel returns focus to the View'}).toBe(true);
        expect(await readView(page), 'focused without a modality stamp, and still no ring').toMatchObject({modality: 'none', outline: 'none'});

        // Tab past the last editable cell completes the edit and ends it on the View
        await cell(page, 'note', recordId).dblclick();
        await expect(page.locator(`${GRID} .neo-grid-editor input`)).toBeFocused();
        await page.keyboard.press('Tab');

        await expect(page.locator(`${GRID} .neo-grid-editor`)).toHaveCount(0);
        await expect.poll(async () => (await readView(page)).focused, {message: 'the completion returns focus to the View'}).toBe(true);
        expect((await readView(page)).outline, 'and no ring').toBe('none')
    });

    test('`--grid-view-focus-outline` frames keyboard focus, and never pointer focus', async ({page}) => {
        const recordId = await recordIdOf(page, 'Name 2');

        await page.addStyleTag({content: `${GRID} {--grid-view-focus-outline: 3px solid rgb(255, 0, 0)}`});

        await cell(page, 'name', recordId).click();
        await expect.poll(async () => (await readView(page)).modality).toBe('pointer');
        expect((await readView(page)).outline, 'pointer focus: no frame').toBe('none');

        await page.keyboard.press('ArrowRight');

        await expect.poll(async () => (await readView(page)).outline, {message: 'keyboard focus: the app\'s frame'})
            .toBe('solid 3px rgb(255, 0, 0)')
    })
});
