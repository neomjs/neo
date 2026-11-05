import {test, expect} from '@playwright/test';

let createdIds = [];

/**
 * @summary Creates a toolbar inside the component-test viewport.
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<String>} The toolbar id
 */
async function createToolbar(page, config) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../toolbar/Base.mjs',
        ntype     : 'toolbar',
        parentId  : 'component-test-viewport',
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Toolbar creation failed: ${result.error.message}`)
    }

    createdIds.push(result.id);

    return result.id
}

/**
 * @summary Pins `keyboardNavigation` as a browser user meets it: real key presses, real focus.
 */
test.describe('Neo.toolbar.Base — keyboardNavigation', () => {
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

    test('arrow keys move focus between enabled buttons, and one button is a Tab stop', async ({page}) => {
        const id = await createToolbar(page, {
                  id                : 'kb-toolbar',
                  keyboardNavigation: true,
                  items             : [{text: 'One'}, {text: 'Two', disabled: true}, {text: 'Three'}]
              }),
              toolbar = page.getByRole('toolbar'),
              one     = toolbar.getByRole('button', {name: 'One'}),
              three   = toolbar.getByRole('button', {name: 'Three'});

        await expect(toolbar).toHaveAttribute('id', id);
        await expect(three, 'only the first button is a Tab stop').toHaveAttribute('tabindex', '-1');

        await one.focus();

        await page.keyboard.press('ArrowRight');
        await expect(three, 'the disabled button is skipped').toBeFocused();

        await page.keyboard.press('ArrowRight');
        await expect(one, 'navigation wraps').toBeFocused();

        await page.keyboard.press('End');
        await expect(three).toBeFocused();

        await page.keyboard.press('Home');
        await expect(one).toBeFocused()
    });

    test('a vertical toolbar navigates with the up and down arrows', async ({page}) => {
        await createToolbar(page, {
            id                : 'kb-toolbar-vertical',
            keyboardNavigation: true,
            layout            : {ntype: 'flexbox', align: 'center', direction: 'column', pack: 'start'},
            items             : [{text: 'Up'}, {text: 'Down'}]
        });

        const toolbar = page.getByRole('toolbar'),
              up      = toolbar.getByRole('button', {name: 'Up'}),
              down    = toolbar.getByRole('button', {name: 'Down'});

        await expect(down).toHaveAttribute('tabindex', '-1');
        await up.focus();

        await page.keyboard.press('ArrowRight');
        await expect(up, 'the cross axis does nothing').toBeFocused();

        await page.keyboard.press('ArrowDown');
        await expect(down).toBeFocused()
    });

    test('without keyboardNavigation a toolbar keeps every button a Tab stop', async ({page}) => {
        const id    = await createToolbar(page, {id: 'plain-toolbar', items: [{text: 'First'}, {text: 'Second'}]}),
              root  = page.locator(`#${id}`),
              first = root.getByRole('button', {name: 'First'});

        await expect(first).toBeVisible();
        await expect(root).not.toHaveAttribute('role', 'toolbar');
        await expect(root.getByRole('button', {name: 'Second'})).not.toHaveAttribute('tabindex', '-1');

        await first.focus();
        await page.keyboard.press('ArrowRight');
        await expect(first).toBeFocused()
    })
});
