import {test, expect} from '@playwright/test';

let labelId;

test.describe('Neo.component.Label', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test.afterEach(async ({page}) => {
        if (labelId) {
            await page.evaluate((id) => {
                return Neo.worker.App.destroyNeoInstance(id);
            }, labelId);
            labelId = null;
        }
    });

    async function createLabel(page, config) {
        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, {
            importPath: '../component/Label.mjs', // relative to the App worker
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            ...config
        });

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;
        return page.locator(`#${labelId}`);
    }

    test.describe('Component-Specific Feature Tests', () => {
        test('should have baseCls and render as a <label> tag', async ({page}) => {
            const label = await createLabel(page, {text: 'Test Label'});
            await expect(label).toHaveClass(/neo-label/);
            await expect(label).toHaveAttribute('data-ntype', 'label');
            expect(await label.evaluate(node => node.tagName)).toBe('LABEL');
        });

        test('should set textContent via the text config', async ({page}) => {
            const label = await createLabel(page, {text: 'Hello Playwright'});
            await expect(label).toHaveText('Hello Playwright');
        });

        test('should have user-select: none and white-space: nowrap', async ({page}) => {
            const label = await createLabel(page, {text: 'Test Label'});
            await expect(label).toHaveCSS('user-select', 'none');
            await expect(label).toHaveCSS('white-space', 'nowrap');
        });
    });

    test.describe('Inherited Behavior Tests', () => {
        test('should apply custom cls', async ({page}) => {
            const label = await createLabel(page, {cls: 'my-custom-class'});
            await expect(label).toHaveClass(/my-custom-class/);
        });

        test('should be disabled', async ({page}) => {
            const label = await createLabel(page, {disabled: true});
            await expect(label).toHaveClass(/neo-disabled/);
        });

        test('should be hidden', async ({page}) => {
            const label = await createLabel(page, {hidden: true});
            await expect(label).toBeHidden();
        });

        test('should set innerHTML via the html config', async ({page}) => {
            const label = await createLabel(page, {html: '<span>Hello</span> World'});
            await expect(label.locator('span')).toHaveText('Hello');
            await expect(label).toContainText('World');
        });

        test('should apply custom styles', async ({page}) => {
            const label = await createLabel(page, {style: {color: 'rgb(255, 0, 0)', height: '100px', width: '200px'}});
            await expect(label).toHaveCSS('color', 'rgb(255, 0, 0)');
            await expect(label).toHaveCSS('height', '100px');
            await expect(label).toHaveCSS('width', '200px');
        });

        test('should be scrollable', async ({page}) => {
            const label = await createLabel(page, {scrollable: true});
            await expect(label).toHaveClass(/neo-scrollable/);
            await expect(label).toHaveCSS('overflow', 'auto');
        });

        test('should apply ui classes', async ({page}) => {
            const label = await createLabel(page, {ui: 'my-ui'});
            await expect(label).toHaveClass(/neo-label-my-ui/);
        });

        test('should apply role', async ({page}) => {
            const label = await createLabel(page, {role: 'presentation'});
            await expect(label).toHaveAttribute('role', 'presentation');
        });

        test('should change tag', async ({page}) => {
            const label = await createLabel(page, {tag: 'div'});
            expect(await label.evaluate(node => node.tagName)).toBe('DIV');
        });

        test('should apply wrapperCls and wrapperStyle', async ({page}) => {
            const label = await createLabel(page, {
                wrapperCls  : 'my-wrapper-class',
                wrapperStyle: {
                    backgroundColor: 'rgb(0, 128, 0)',
                    padding        : '10px'
                }
            });
            const wrapper = label.locator('..');
            await expect(wrapper).toHaveClass(/my-wrapper-class/);
            await expect(wrapper).toHaveCSS('background-color', 'rgb(0, 128, 0)');
            await expect(wrapper).toHaveCSS('padding', '10px');
        });

        test('should show isLoading UI', async ({page}) => {
            const label = await createLabel(page, {isLoading: 'Loading...', text: 'Initial Text'});
            const spinner = label.locator('.fa-spinner');
            const loadingMessage = label.locator('.neo-loading-message');

            await expect(spinner).toBeVisible();
            await expect(loadingMessage).toHaveText('Loading...');

            await page.evaluate((id) => {
                return Neo.worker.App.setConfigs({id, isLoading: false});
            }, labelId);

            await expect(spinner).toHaveCount(0);
            await expect(loadingMessage).toHaveCount(0);
        });

        test('should create a tooltip', async ({page}) => {
            const label = await createLabel(page, {
                text   : 'Hover me',
                tooltip: {
                    text: 'This is a tooltip'
                }
            });

            await label.hover();
            const tooltip = page.locator('.neo-tooltip');
            await expect(tooltip).toBeVisible();
            await expect(tooltip).toHaveText('This is a tooltip');
        });
    });
});
