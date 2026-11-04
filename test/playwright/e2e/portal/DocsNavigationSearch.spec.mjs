import {expect, test} from '../../fixtures.mjs';

/**
 * Typing a regex metacharacter such as `(` into the Docs app's navigation search must filter
 * the navigation tree lists as literal text without throwing `SyntaxError: Invalid regular expression`
 * in the App worker.
 */

const DOCS = '/docs/index.html';

test.describe('Docs navigation search literal escaping', () => {
    test('typing "(" into the navigation search filters literally with no App worker error', async ({page}) => {
        await page.goto(DOCS);

        const searchInput = page.locator('input[placeholder="Filter Navigation"]');
        await expect(searchInput).toBeVisible();

        const examplesTab = page.locator('.neo-docs-navigation-tab-container .neo-tab-header-button', {
            hasText: 'Examples'
        });
        await examplesTab.click();

        const dateSelectorLeaf = page.locator('.docs-examples-treelist .neo-list-item-leaf', {
            hasText: 'DateSelector'
        });

        await expect(dateSelectorLeaf).toBeVisible();

        // Typing `(` previously threw `SyntaxError: Invalid regular expression: /(/gi: Unterminated group`
        // in the App worker (captured by the auto `workerErrors` fixture) and left unmatched leaves visible.
        await searchInput.fill('(');
        await expect(dateSelectorLeaf).toBeHidden();

        // Typing `.` previously matched every character as a regex wildcard; literal escaping hides non-dot leaves.
        await searchInput.fill('.');
        await expect(dateSelectorLeaf).toBeHidden();

        // Subsequent literal search still highlights and reveals matching leaves cleanly.
        await searchInput.fill('DateSelector');
        await expect(dateSelectorLeaf).toBeVisible();
        await expect(dateSelectorLeaf.locator('.neo-highlight-search')).toHaveText('DateSelector');
    });
});
