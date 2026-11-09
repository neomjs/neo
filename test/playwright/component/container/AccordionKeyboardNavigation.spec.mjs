import {test, expect} from '@playwright/test';

let createdIds = [];

/**
 * @summary Creates an instance inside the component-test viewport.
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} The created component id
 */
async function createInViewport(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        parentId: 'component-test-viewport',
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Instance creation failed: ${result.error.message}`)
    }

    createdIds.push(result.id);

    return result.id
}

/**
 * @summary Pins Accordion selection & keyboard navigation as a real browser user meets it:
 * Tab focus entry onto headers, Arrow/Enter/Space header operation, and descendant input/button key isolation.
 */
test.describe('Neo.container.Accordion — selection & keyboard navigation', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async ids => {
            for (const id of ids) {
                await Neo.worker.App.destroyNeoInstance(id)
            }
        }, createdIds);

        createdIds = []
    });

    test('Tab enters the active accordion header, Arrow/Enter/Space operate items, and nested input/button keys stay isolated', async ({page}) => {
        await createInViewport(page, {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            id        : 'lead-in-button',
            text      : 'Before Accordion'
        });

        await createInViewport(page, {
            importPath      : '../container/Accordion.mjs',
            ntype           : 'accordion',
            id              : 'kb-accordion',
            initialOpen     : [0],
            maxExpandedItems: 1,
            selectionModel  : {ntype: 'selection-accordionmodel'},
            items           : [{
                id   : 'acc-item-1',
                title: 'First Section',
                items: [{
                    ntype: 'component',
                    id   : 'nested-input',
                    vdom : {
                        tag : 'input',
                        type: 'text'
                    }
                }, {
                    importPath: '../button/Base.mjs',
                    ntype     : 'button',
                    id        : 'nested-button',
                    text      : 'Inner Action'
                }]
            }, {
                id   : 'acc-item-2',
                title: 'Second Section',
                items: [{
                    ntype: 'component',
                    html : 'Second body'
                }]
            }]
        });

        const leadButton   = page.locator('#lead-in-button'),
              item1        = page.locator('#acc-item-1'),
              item2        = page.locator('#acc-item-2'),
              header1      = item1.locator('.neo-accordion-header'),
              header2      = item2.locator('.neo-accordion-header'),
              nestedInput  = page.locator('#nested-input'),
              nestedButton = page.locator('#nested-button');

        await expect(header1).toHaveAttribute('tabindex', '0');
        await expect(header2).toHaveAttribute('tabindex', '-1');
        await expect(item1).toHaveClass(/neo-expanded/);

        // 1. Focus preceding button and press Tab -> focus lands on the first accordion header and selects item 1
        await leadButton.focus();
        await expect(leadButton).toBeFocused();

        await page.keyboard.press('Tab');
        await expect(header1).toBeFocused();
        await expect(item1).toHaveClass(/neo-selected/);

        // 2. Typing Space or Enter inside the nested input must NOT collapse the expanded item
        await page.keyboard.press('Tab');
        await expect(nestedInput).toBeFocused();

        await page.keyboard.type('hello world');
        await expect(nestedInput).toHaveValue('hello world');
        await expect(item1, 'Space in nested input must not collapse item 1').toHaveClass(/neo-expanded/);
        await expect(item1).toHaveClass(/neo-selected/);

        await page.keyboard.press('Enter');
        await expect(item1, 'Enter in nested input must not toggle item 1').toHaveClass(/neo-expanded/);

        // 3. Tab to nested button and press Space/Enter -> item 1 stays expanded and selected
        await page.keyboard.press('Tab');
        await expect(nestedButton).toBeFocused();
        await page.keyboard.press('Space');
        await expect(item1, 'Space on nested button must not collapse item 1').toHaveClass(/neo-expanded/);

        // 4. Positive control on header: focus header 1, press Space to collapse, Enter to re-expand, ArrowDown to move to header 2
        await header1.focus();
        await expect(header1).toBeFocused();

        await page.keyboard.press('Space');
        await expect(item1).not.toHaveClass(/neo-expanded/);

        await page.keyboard.press('Enter');
        await expect(item1).toHaveClass(/neo-expanded/);

        await page.keyboard.press('ArrowDown');
        await expect(header2).toBeFocused();
        await expect(item2).toHaveClass(/neo-selected/);
        await expect(header1).toHaveAttribute('tabindex', '-1');
        await expect(header2).toHaveAttribute('tabindex', '0');

        await page.keyboard.press('Enter');
        await expect(item2).toHaveClass(/neo-expanded/);
        await expect(item1).not.toHaveClass(/neo-expanded/);

        // 5. ArrowLeft collapses expanded item 2, second ArrowLeft moves focus/selection back to header 1, Escape clears selection while keeping header 1 tabbable
        await page.keyboard.press('ArrowLeft');
        await expect(item2).not.toHaveClass(/neo-expanded/);

        await page.keyboard.press('ArrowLeft');
        await expect(header1).toBeFocused();
        await expect(item1).toHaveClass(/neo-selected/);

        await page.keyboard.press('Escape');
        await expect(item1).not.toHaveClass(/neo-selected/);
        await expect(header1).toHaveAttribute('tabindex', '0')
    })
});
