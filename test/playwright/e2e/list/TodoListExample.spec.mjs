import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The todo list example: it opens on four items with the first one done and checked, adds by Enter and by
 * its button, checks off by pointer and by Space, filters by all, open and done, counts what is left, and keeps the
 * list in the browser's storage across a reload until Start over.
 *
 * Each test runs in a fresh browser context, so its storage starts empty and the example opens on its start items.
 */
const URL    = '/examples/todoList/version2/index.html',
      ITEM   = '.neo-todo-item',
      COUNT  = '.neo-examples-todo-count',
      FIELD  = 'input[placeholder="What needs doing?"]',
      THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

/**
 * @summary Reads each shown item as `[x] text` or `[ ] text`.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
const readItems = page => page.locator(ITEM).evaluateAll(items => items.map(item =>
    `${item.querySelector('input').checked ? '[x]' : '[ ]'} ${item.innerText.trim()}`));

/**
 * @summary Clicks a footer button by its exact name.
 * @param {import('@playwright/test').Page} page
 * @param {String} name
 */
const press = (page, name) => page.getByRole('button', {name, exact: true}).click();

test.describe('Todo list example', () => {
    test('opens on four items, the done one checked and struck through', async ({page}) => {
        await page.goto(URL);

        await expect(page.locator(ITEM)).toHaveCount(4);
        await expect(page.locator(`${ITEM} input`).first()).toBeChecked();
        await expect(page.locator(ITEM).first()).toHaveClass(/\bneo-todo-done\b/);
        await expect(page.locator(COUNT)).toHaveText('3 items left')
    });

    test('adds by Enter and by its button, checks off by pointer and by Space, and filters', async ({page}) => {
        await page.goto(URL);
        await expect(page.locator(ITEM)).toHaveCount(4);

        await page.locator(FIELD).fill('Write the year recap');
        await page.keyboard.press('Enter');
        await expect(page.locator(ITEM)).toHaveCount(5);
        await expect(page.locator(FIELD)).toHaveValue('');

        await page.locator(FIELD).fill('Plan the spring sprint');
        await press(page, 'Add');
        await expect(page.locator(COUNT)).toHaveText('5 items left');

        await page.locator(`${ITEM} input`).nth(1).click();
        await expect(page.locator(COUNT)).toHaveText('4 items left');

        await page.locator(`${ITEM} input`).nth(2).focus();
        await page.keyboard.press('Space');
        await expect(page.locator(COUNT)).toHaveText('3 items left');

        await press(page, 'Open');
        await expect.poll(() => readItems(page)).toEqual([
            '[ ] Water the office plants', '[ ] Write the year recap', '[ ] Plan the spring sprint'
        ]);

        await press(page, 'Done');
        await expect.poll(() => readItems(page)).toEqual([
            '[x] Book a room for the team retro', '[x] Review the onboarding checklist', '[x] Order a second monitor'
        ]);

        await press(page, 'All');
        await expect(page.locator(ITEM)).toHaveCount(6)
    });

    test('keeps the list across a reload, clears the done items, and starts over', async ({page}) => {
        await page.goto(URL);
        await expect(page.locator(ITEM)).toHaveCount(4);

        await page.locator(FIELD).fill('Write the year recap');
        await page.keyboard.press('Enter');
        await page.locator(`${ITEM} input`).nth(1).click();
        await expect(page.locator(COUNT)).toHaveText('3 items left');

        await page.reload();
        await expect.poll(() => readItems(page)).toEqual([
            '[x] Book a room for the team retro', '[x] Review the onboarding checklist',
            '[ ] Order a second monitor', '[ ] Water the office plants', '[ ] Write the year recap'
        ]);

        await press(page, 'Clear done');
        await expect(page.locator(ITEM)).toHaveCount(3);
        await expect(page.locator(COUNT)).toHaveText('3 items left');

        await press(page, 'Start over');
        await expect(page.locator(ITEM)).toHaveCount(4);
        await expect(page.locator(COUNT)).toHaveText('3 items left')
    });

    for (const theme of THEMES) {
        for (const [width, height] of [[1440, 900], [390, 844]]) {
            test(`${theme} at ${width} × ${height}: no console error, and an item still checks off`, async ({page}) => {
                const errors = [];

                page.on('pageerror', error => errors.push(error.message));
                page.on('console',   msg   => msg.type() === 'error' && errors.push(msg.text()));

                await page.setViewportSize({width, height});
                await page.goto(`${URL}?theme=${theme}`);

                await expect(page.locator('.neo-viewport').first()).toHaveClass(new RegExp(`\\b${theme}\\b`));
                await expect(page.locator(ITEM)).toHaveCount(4);

                await page.locator(`${ITEM} input`).nth(1).click();
                await expect(page.locator(COUNT)).toHaveText('2 items left');

                expect(errors).toEqual([])
            })
        }
    }
});
