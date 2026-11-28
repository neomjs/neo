import {test, expect}    from '@playwright/test';
import {themeSheetHrefs} from '../../util/themeSheets.mjs';

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
        await page.waitForSelector('#component-test-viewport', { state: 'attached' });
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

test.describe('ChipListComponent theme surfaces', () => {
    // A chip shares its list item's box, so the item paints the chip's fill and its states reach the chip.
    // The list carries its own theme class, as in a workbench: a classic theme's token rule then out-ranks one set on the list.
    for (const theme of ['neo-theme-dark', 'neo-theme-light', 'neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: a chip fills its pill, its text clears the border, and the list takes the theme's frame`, async ({page}) => {
            const sheets = themeSheetHrefs([theme], ['list.Base', 'component.Chip']);

            await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
            await page.waitForSelector('#component-test-viewport', {state: 'attached'});

            await page.evaluate(async hrefs => {
                for (const href of hrefs) {
                    const link = Object.assign(document.createElement('link'), {href, rel: 'stylesheet'});

                    await new Promise((resolve, reject) => {
                        link.onload  = resolve;
                        link.onerror = () => reject(new Error(`stylesheet did not load: ${href}`));
                        document.head.appendChild(link)
                    })
                }
            }, sheets);

            // getTheme() reads the mainView, so the theme goes there before the list exists
            await page.evaluate(async theme => {
                const cls = await Neo.worker.App.getConfigs({id: 'component-test-viewport', keys: 'cls'}) || [];

                await Neo.worker.App.setConfigs({cls: [...cls.filter(item => !item.startsWith('neo-theme-')), theme], id: 'component-test-viewport'})
            }, theme);

            const result = await page.evaluate(theme => Neo.worker.App.createNeoInstance({
                displayField: 'name',
                importPath  : '../list/Chip.mjs',
                ntype       : 'chip-list',
                parentId    : 'component-test-viewport',
                theme,
                width       : 300,
                store       : {
                    data : [{id: 1, name: 'Bastian'}, {id: 2, name: 'Gerard'}],
                    model: {fields: [{name: 'id', type: 'Number'}, {name: 'name', type: 'String'}]}
                }
            }), theme);

            expect(result.success, result.error?.message).toBe(true);

            const item = page.locator(`#${result.id} .neo-list-item`).first(),
                  chip = item.locator('.neo-chip'),
                  read = () => item.evaluate((node, theme) => {
                      const chip  = node.querySelector('.neo-chip'),
                            list  = node.closest('.neo-chip-list'),
                            probe = node.appendChild(document.createElement('div')),
                            frame = style => style.borderTopStyle === 'none' ? 'none' : `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;

                      // Resolves the theme's tokens where the item reads them
                      probe.style.cssText = 'background-color: var(--neo-chip-background-color); border-top: var(--neo-list-container-border)';

                      const values = {
                          background    : getComputedStyle(node).backgroundColor,
                          chipBackground: getComputedStyle(chip).backgroundColor,
                          chipFill      : getComputedStyle(probe).backgroundColor,
                          chipRadius    : getComputedStyle(chip).borderTopLeftRadius,
                          frame         : frame(getComputedStyle(list)),
                          listTheme     : list.classList.contains(theme),
                          radius        : getComputedStyle(node).borderTopLeftRadius,
                          textInset     : chip.querySelector('.neo-chip-text').getBoundingClientRect().left - chip.getBoundingClientRect().left,
                          themeFrame    : frame(getComputedStyle(probe))
                      };

                      probe.remove();
                      return values
                  }, theme);

            await expect(chip).toBeVisible();

            const rest = await read();

            expect(rest.listTheme).toBe(true);
            expect(rest.chipFill).not.toBe('rgba(0, 0, 0, 0)');
            expect(rest.background).toBe(rest.chipFill);
            expect(rest.chipBackground).toBe('rgba(0, 0, 0, 0)');
            expect(rest.chipRadius).not.toBe('0px');
            expect(rest.radius).toBe(rest.chipRadius);
            expect(rest.textInset).toBeGreaterThanOrEqual(7);
            expect(rest.frame).toBe(rest.themeFrame);

            await item.hover();
            await expect.poll(async () => (await read()).background).not.toBe(rest.background);

            await item.click();
            await expect.poll(() => chip.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');

            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), result.id)
        });
    }
});
