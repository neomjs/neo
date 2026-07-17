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
        // dormant for as long as `.neo-disabled` was the only disabled authority. Same node, attribute
        // on vs off, class constant: any inequality is user-agent paint leaking past the class.
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
});
