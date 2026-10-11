import {test, expect} from '@playwright/test';

let buttonId;

test.describe('Neo.button.Base', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', { state: 'attached' });
    });

    test.afterEach(async ({page}) => {
        if (buttonId) {
            await page.evaluate((id) => {
                return Neo.worker.App.destroyNeoInstance(id);
            }, buttonId);

            buttonId = null;
        }

        await page.locator('#button-focus-sentinel').evaluateAll(nodes => nodes.forEach(node => node.remove()));
    });

    test('should create a button with icon and text', async ({page}) => {
        const buttonConfig = {
            importPath: '../button/Base.mjs', // relative to the App worker
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            iconCls   : 'fa fa-home',
            text      : 'Hello Playwright'
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, buttonConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const button = page.locator(`#${buttonId}`);
        await expect(button).toBeVisible();

        const icon = button.locator('.fa-home');
        await expect(icon).toBeVisible();

        await expect(button).toHaveText('Hello Playwright');
    });

    test('should show isLoading UI', async ({page}) => {
        const buttonConfig = {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            iconCls   : 'fa fa-home',
            text      : 'Hello Playwright',
            isLoading : 'Loading...'
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, buttonConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const button = page.locator(`#${buttonId}`);
        const spinner = button.locator('.fa-spinner');
        const loadingMessage = button.locator('.neo-loading-message');

        // Spinner and text exist initially
        await expect(spinner).toBeVisible();
        await expect(loadingMessage).toHaveText('Loading...');

        // Change isLoading to true (shows only spinner)
        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, isLoading: true});
        }, buttonId);

        // We are not using `toBeHidden()`, since we want to verify a DOM removal
        await expect(loadingMessage).toHaveCount(0);
        await expect(spinner).toBeVisible();

        // Change isLoading to a new message
        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, isLoading: 'New loading message'});
        }, buttonId);

        await expect(loadingMessage).toHaveText('New loading message');
        await expect(spinner).toBeVisible();

        // Change isLoading to false (hides all loading UI)
        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, isLoading: false});
        }, buttonId);

        await expect(spinner).toHaveCount(0);
        await expect(loadingMessage).toHaveCount(0);
    });

    test('should expose disabled state natively and restore keyboard focus', async ({page}) => {
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            disabled  : true,
            text      : 'Focusable action'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const button = page.locator(`#${buttonId}`);

        await expect(button).toBeDisabled();
        await expect(button).toHaveClass(/neo-disabled/);
        await expect(page.getByRole('button', {disabled: true, name: 'Focusable action'})).toHaveCount(1);

        await page.evaluate((id) => {
            const sentinel = document.createElement('button');
            sentinel.id    = 'button-focus-sentinel';
            document.getElementById(id).before(sentinel);
            sentinel.focus();
        }, buttonId);

        await page.keyboard.press('Tab');
        await expect(button).not.toBeFocused();

        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, disabled: false});
        }, buttonId);

        await expect(button).toBeEnabled();
        await expect(button).not.toHaveClass(/neo-disabled/);

        await page.locator('#button-focus-sentinel').focus();
        await page.keyboard.press('Tab');
        await expect(button).toBeFocused();
    });

    test('should remove native disabled when a Button root becomes an anchor', async ({page}) => {
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            disabled  : true,
            text      : 'External link',
            url       : 'https://example.com'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const control = page.locator(`#${buttonId}`);

        await expect(control).toHaveClass(/neo-disabled/);
        expect(await control.evaluate(node => node.tagName)).toBe('A');
        expect(await control.getAttribute('disabled')).toBeNull();

        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, url: null});
        }, buttonId);

        await expect.poll(() => control.evaluate(node => node.tagName)).toBe('BUTTON');
        await expect(control).toBeDisabled();

        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, url: 'https://example.com/again'});
        }, buttonId);

        await expect.poll(() => control.evaluate(node => node.tagName)).toBe('A');
        expect(await control.getAttribute('disabled')).toBeNull();
    });

    test('should apply native disabled semantics to both SplitButton controls', async ({page}) => {
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, {
            importPath: '../button/Split.mjs',
            ntype     : 'split-button',
            parentId  : 'component-test-viewport',
            disabled  : true,
            text      : 'Split action'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const nativeButtons = page.locator(`#${buttonId}__wrapper button`);

        await expect(nativeButtons).toHaveCount(2);
        await expect(nativeButtons.nth(0)).toBeDisabled();
        await expect(nativeButtons.nth(1)).toBeDisabled();
        await expect(nativeButtons.nth(0)).toHaveClass(/neo-disabled/);
        await expect(nativeButtons.nth(1)).toHaveClass(/neo-disabled/);

        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, disabled: false});
        }, buttonId);

        await expect(nativeButtons.nth(0)).toBeEnabled();
        await expect(nativeButtons.nth(1)).toBeEnabled();
    });

    test('disabled paint is class-owned — the native attribute contributes no UA styling', async ({page}) => {
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            disabled  : true,
            text      : 'Painted action'
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        const button = page.locator(`#${buttonId}`);

        await expect(button).toBeDisabled();
        await expect(button).toHaveClass(/neo-disabled/);

        // Projecting the native attribute activates the UA `button:disabled` cascade, which had been
        // dormant for as long as `.neo-disabled` was the only disabled authority. The class explicitly
        // owns background, border and opacity via disabled tokens, plus the root color via inheritance
        // (child glyph/text colors have their own tokens). Same node, attribute on vs off, class constant:
        // any inequality across these four author-owned axes is user-agent paint leaking past the class.
        const {withAttribute, classOnly} = await button.evaluate(node => {
            const probe = () => {
                const style = getComputedStyle(node);

                return {
                    backgroundColor: style.backgroundColor,
                    borderTopColor : style.borderTopColor,
                    color          : style.color,
                    opacity        : style.opacity
                }
            };

            const withAttribute = probe();

            node.removeAttribute('disabled');

            const classOnly = probe();

            node.setAttribute('disabled', '');

            return {withAttribute, classOnly}
        });

        expect(withAttribute).toEqual(classOnly);
    });

    /**
     * Opening a button's menu hands focus to it, so the arrow keys work without anything focusing an item first.
     * The arms press no key and call no `focus()` between opening and ArrowDown: that gap is the contract.
     */
    for (const how of ['click', 'Enter', 'Space']) {
        test(`a menu opened by ${how} takes focus, so ArrowDown moves right away`, async ({page}) => {
            const result = await page.evaluate((config) => {
                return Neo.worker.App.createNeoInstance(config);
            }, {
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : 'component-test-viewport',
                text      : 'Actions',
                menu      : [{text: 'One'}, {text: 'Two'}, {text: 'Three'}]
            });

            if (!result.success) {
                throw new Error(`Component creation failed: ${result.error.message}`);
            }

            buttonId = result.id;

            const button      = page.locator(`#${buttonId}`),
                  focusedItem = () => page.evaluate(() => {
                      const node = document.activeElement;

                      return node?.closest('.neo-menu-list') ? node.textContent.trim() : null
                  });

            if (how === 'click') {
                await button.click();
            } else {
                await button.focus();
                await page.keyboard.press(how);
            }

            await expect(page.locator('.neo-menu-list')).toHaveCount(1);
            await expect.poll(focusedItem, 'focus is on the first item once the menu opens').toBe('One');

            await page.keyboard.press('ArrowDown');
            await expect.poll(focusedItem, 'the key moved it').toBe('Two');
        });
    }

    test('a click that lands before the lazily loaded menu exists still opens it', async ({page}) => {
        // The menu module loads on demand. Holding its fetch pins the click in the gap a slow load opens
        let release;
        const held = new Promise(resolve => release = resolve);

        await page.context().route('**/src/menu/List.mjs', async route => {await held; await route.continue()});

        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            text      : 'Actions',
            menu      : [{text: 'One'}, {text: 'Two'}]
        });

        buttonId = result.id;

        await page.locator(`#${buttonId}`).click();

        // The App Worker handles events in order, so this reply means it has handled the click
        await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: ['id']}), buttonId);
        release();

        await expect(page.locator('.neo-menu-list')).toHaveCount(1)
    });

    /**
     * @summary Creates a button whose menu has a submenu, sized so the menu opens on screen for pointer arms.
     * @param {Object} page
     * @returns {Promise<Object>} The button locator
     */
    async function createSubMenuButton(page) {
        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            flex      : 'none',
            height    : 40,
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            style     : {margin: '20px'},
            text      : 'Actions',
            width     : 120,
            menu      : [{text: 'Open'}, {text: 'Inspect', items: [{text: 'Details'}, {text: 'Properties'}]}, {text: 'Close'}]
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        buttonId = result.id;

        return page.locator(`#${buttonId}`)
    }

    const focusedMenuItem = page => page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.textContent.trim() ?? null);

    /**
     * @summary Opens the menu from the keyboard and walks focus into the Inspect submenu.
     * @param {Object} page
     * @returns {Promise<void>}
     */
    async function focusIntoSubMenu(page) {
        await (await createSubMenuButton(page)).focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => focusedMenuItem(page)).toBe('Open');

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedMenuItem(page)).toBe('Inspect');

        await page.keyboard.press('ArrowRight');
        await expect.poll(() => focusedMenuItem(page)).toBe('Details')
    }

    for (const how of ['Enter', 'Space', 'click']) {
        test(`a leaf chosen by ${how} inside a submenu returns focus to the button`, async ({page}) => {
            await focusIntoSubMenu(page);

            how === 'click' ? await page.getByText('Details', {exact: true}).click() : await page.keyboard.press(how);

            await expect(page.locator('.neo-menu-list')).toHaveCount(0);
            await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe(buttonId)
        });
    }

    test('after a submenu visit, Escape at the root returns focus to the button', async ({page}) => {
        await focusIntoSubMenu(page);

        await page.keyboard.press('ArrowLeft');
        await expect.poll(() => focusedMenuItem(page)).toBe('Inspect');

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-menu-list')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe(buttonId)
    });

    test('CONTROL: without a submenu visit, Escape returns focus to the button', async ({page}) => {
        await (await createSubMenuButton(page)).focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => focusedMenuItem(page)).toBe('Open');

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-menu-list')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe(buttonId)
    });
});
