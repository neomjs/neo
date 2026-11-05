import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.form.field.Date` in a real browser, outside any grid: the keys that open its picker.
 *
 * Harness: `apps/empty-viewport`, one field created through `Neo.worker.App.createNeoInstance`.
 */
const PICKER = '.neo-picker-container';

let componentId;

test.describe('Neo.form.field.Date', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Date.mjs',
            ntype     : 'datefield',
            parentId  : 'component-test-viewport',
            labelText : 'Day',
            value     : '2024-12-18',
            width     : 300
        }));

        expect(result.success, 'the field was created').toBe(true);
        componentId = result.id
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('Alt+ArrowDown opens the picker and hands it focus, and Escape closes it again', async ({page}) => {
        const input = page.locator(`#${componentId} input`);

        await input.click();
        await page.keyboard.press('Alt+ArrowDown');

        await expect(page.locator(PICKER)).toBeVisible();
        await expect.poll(() => page.evaluate(picker => !!document.activeElement?.closest(picker), PICKER),
            {message: 'the date selector took focus'}).toBe(true);

        await page.keyboard.press('Escape');
        await expect(page.locator(PICKER)).toHaveCount(0)
    });

    // `window` hears a keydown last, after the engine's listener: that is where a cancelled default shows. Whether the
    // plain arrow opens NO picker is proven in the grid, where Escape tells an open picker from none
    test('plain ArrowDown keeps its native default; the picker key loses its default', async ({page}) => {
        const input = page.locator(`#${componentId} input`);

        await input.click();

        await page.evaluate(() => {
            window.__prevented = {};
            window.addEventListener('keydown', event => {
                if (event.key !== 'Alt') {
                    window.__prevented[`${event.altKey ? 'Alt+' : ''}${event.key}`] = event.defaultPrevented
                }
            })
        });

        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Alt+ArrowDown');
        await expect(page.locator(PICKER)).toBeVisible();

        expect(await page.evaluate(() => window.__prevented)).toEqual({'ArrowDown': false, 'Alt+ArrowDown': true})
    });

    test('exposes a non-modal dialog picker, focuses the selected day gridcell on open, and supports Tab/Shift+Tab traversal and Escape dismissal', async ({page}) => {
        const input  = page.locator(`#${componentId} input`),
              picker = page.locator(PICKER);

        await input.click();
        await page.keyboard.press('Alt+ArrowDown');
        await expect(picker).toBeVisible();

        await expect(picker).toHaveAttribute('role', 'dialog');
        await expect(picker).toHaveAttribute('aria-label', 'Choose Date');
        await expect(picker).not.toHaveAttribute('aria-modal');
        await expect(input).toHaveAttribute('aria-expanded', 'true');

        const selectorId   = await picker.locator('.neo-dateselector').getAttribute('id'),
              selectedCell = page.locator(`#${selectorId}__2024-12-18`),
              prevBtn      = picker.getByRole('button', {name: 'Previous Month'}),
              nextBtn      = picker.getByRole('button', {name: 'Next Month'});

        await expect(selectedCell).toBeFocused();
        await expect(selectedCell).toHaveAttribute('tabindex', '0');

        // Shift+Tab from the active day gridcell reaches Next Month, then Previous Month
        await page.keyboard.press('Shift+Tab');
        await expect(nextBtn).toBeFocused();
        await expect(picker).toBeVisible();

        await page.keyboard.press('Shift+Tab');
        await expect(prevBtn).toBeFocused();
        await expect(picker).toBeVisible();

        // Forward Tab returns through Next Month to the active day gridcell
        await page.keyboard.press('Tab');
        await expect(nextBtn).toBeFocused();

        await page.keyboard.press('Tab');
        await expect(selectedCell).toBeFocused();

        // Escape dismisses the dialog and restores focus to the input
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await expect(input).toBeFocused()
    });

    test('supports keyboard focus and Enter/Space activation on DateTrigger and DateSelector month navigation buttons', async ({page}) => {
        const input   = page.locator(`#${componentId} input`),
              trigger = page.locator(`#${componentId} .neo-field-trigger[role="button"]`),
              picker  = page.locator(PICKER);

        await input.focus();
        await expect(input).toBeFocused();

        // Tab steps through native <input type="date"> sub-segments (month -> day -> year) and then reaches DateTrigger
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect(trigger).toBeFocused();

        // Enter on DateTrigger opens the picker and focuses the selected day cell
        await page.keyboard.press('Enter');
        await expect(picker).toBeVisible();

        const selectorId = await picker.locator('.neo-dateselector').getAttribute('id'),
              dec18Cell  = page.locator(`#${selectorId}__2024-12-18`),
              prevBtn    = picker.getByRole('button', {name: 'Previous Month'}),
              nextBtn    = picker.getByRole('button', {name: 'Next Month'}),
              headerLive = page.locator(`#${selectorId}__header-center`);

        await expect(dec18Cell).toBeFocused();
        await expect(headerLive).toContainText('Dec');
        await expect(headerLive).toContainText('2024');

        // Close with Escape, Tab back to DateTrigger, and open with Space
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect(trigger).toBeFocused();

        await page.keyboard.press('Space');
        await expect(picker).toBeVisible();
        await expect(dec18Cell).toBeFocused();

        // Shift+Tab to Next Month and press Enter -> advances to January 2025 while preserving button focus
        await page.keyboard.press('Shift+Tab');
        await expect(nextBtn).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(picker.locator('.neo-animation-wrapper')).toHaveCount(0);
        await expect(headerLive).toContainText('Jan');
        await expect(headerLive).toContainText('2025');
        await expect(nextBtn).toBeFocused();

        // Shift+Tab to Previous Month and press Space -> returns to December 2024 while preserving button focus
        await page.keyboard.press('Shift+Tab');
        await expect(prevBtn).toBeFocused();
        await page.keyboard.press('Space');
        await expect(picker.locator('.neo-animation-wrapper')).toHaveCount(0);
        await expect(headerLive).toContainText('Dec');
        await expect(headerLive).toContainText('2024');
        await expect(prevBtn).toBeFocused()
    });

    test('exposes full localized weekday names in the browser accessibility tree for columnheader cells across dayNameFormat and locale changes', async ({page}) => {
        const input  = page.locator(`#${componentId} input`),
              picker = page.locator(PICKER);

        await input.click();
        await page.keyboard.press('Alt+ArrowDown');
        await expect(picker).toBeVisible();

        const selectorId = await picker.locator('.neo-dateselector').getAttribute('id');
        await page.evaluate(id => Neo.worker.App.setConfigs({id, locale: 'en-US', weekStartDay: 0}), selectorId);

        for (const weekday of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
            await expect(picker.getByRole('columnheader', {name: weekday})).toBeVisible()
        }

        // Switch to narrow format and de-DE locale and verify the accessibility tree still exposes full weekday names
        await page.evaluate(id => Neo.worker.App.setConfigs({id, dayNameFormat: 'narrow', locale: 'de-DE'}), selectorId);

        for (const weekday of ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']) {
            await expect(picker.getByRole('columnheader', {name: weekday})).toBeVisible()
        }
    })
});
