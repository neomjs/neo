import {test, expect} from '@playwright/test';

test.describe('ChipListComponent', () => {
    let componentId;

    const config = {
        importPath  : '../list/Chip.mjs', // relative to the App worker
        ntype       : 'chip-list',
        parentId    : 'component-test-viewport',
        displayField: 'firstname',
        width       : 300,
        role        : 'listbox',
        itemRole    : 'option',
        navigator   : {wrap: true},
        store: {
            keyProperty: 'githubId',
            model: {
                fields: [
                    { name: 'country',   type: 'String' },
                    { name: 'firstname', type: 'String' },
                    { name: 'githubId',  type: 'String' },
                    { name: 'lastname',  type: 'String' }
                ]
            },
            data: [
                { country: 'Germany',  firstname: 'Tobias',  githubId: 'tobiu',         lastname: 'Uhlig' },
                { country: 'USA',      firstname: 'Rich',    githubId: 'rwaters',       lastname: 'Waters' },
                { country: 'Germany',  firstname: 'Nils',    githubId: 'mrsunshine',    lastname: 'Dehl' },
                { country: 'USA',      firstname: 'Gerard',  githubId: 'camtnbikerrwc', lastname: 'Horan' },
                { country: 'Slovakia', firstname: 'Jozef',   githubId: 'jsakalos',      lastname: 'Sakalos' },
                { country: 'Germany',  firstname: 'Bastian', githubId: 'bhaustein',     lastname: 'Haustein' }
            ]
        }
    };

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, config);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        componentId = result.id;
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate((id) => {
                return Neo.worker.App.destroyNeoInstance(id);
            }, componentId);
        }
    });

    test('Sanity', async ({page}) => {
        const listSelector = `#${componentId}`;

        await page.waitForSelector(listSelector);

        // Click on the *item*, *not* the focusable chip.
        await page.click(`${listSelector} .neo-list-item`);

        // That should select and activate the clicked item.
        // And focus the chip inside it.
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item.neo-selected:nth-child(1) .neo-chip`)).toBeFocused();
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item`)).toHaveCount(1);

        await page.keyboard.press('End');

        // That should select and activate the last item.
        // And focus the chip inside it.
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item:not(.neo-selected):nth-child(6) .neo-chip`)).toBeFocused();

        // Item 1 is still the only one selected, and it's not focused
        await expect(page.locator(`${listSelector} .neo-list-item.neo-selected:nth-child(1) .neo-chip:not(:focus)`)).toHaveCount(1);
        await expect(page.locator(`${listSelector} .neo-list-item.neo-selected`)).toHaveCount(1);
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item`)).toHaveCount(1);

        await page.keyboard.press('Enter');

        // Item 6 is now the only one selected
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item.neo-selected:nth-child(6) .neo-chip`)).toBeFocused();
        await expect(page.locator(`${listSelector} .neo-list-item.neo-selected`)).toHaveCount(1);
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item`)).toHaveCount(1);

        await page.keyboard.press('ArrowDown');

        // That should select and activate the first item.
        // And focus the chip inside it.
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item:not(.neo-selected):nth-child(1) .neo-chip`)).toBeFocused();
        await expect(page.locator(`${listSelector} .neo-list-item.neo-selected`)).toHaveCount(1);
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item`)).toHaveCount(1);

        await page.keyboard.press('ArrowUp');

        // Item 6 is now the only one selected
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item.neo-selected:nth-child(6) .neo-chip`)).toBeFocused();
        await expect(page.locator(`${listSelector} .neo-list-item.neo-selected`)).toHaveCount(1);
        await expect(page.locator(`${listSelector} .neo-list-item.neo-navigator-active-item`)).toHaveCount(1);
    });
});
