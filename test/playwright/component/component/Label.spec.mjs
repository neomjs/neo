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
        }
    });

    test('should create a label with default properties', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs', // relative to the App worker
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Hello Playwright'
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();

        // baseCls
        await expect(label).toHaveClass(/neo-label/);

        // tag
        await expect(label).toHaveAttribute('data-ntype', 'label');
        const tagName = await label.evaluate(node => node.tagName);
        expect(tagName).toBe('LABEL');

        // text config
        await expect(label).toHaveText('Hello Playwright');

        // user-select: none
        await expect(label).toHaveCSS('user-select', 'none');

        // white-space: nowrap
        await expect(label).toHaveCSS('white-space', 'nowrap');
    });

    test('should apply custom classes and styles', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Styled Label',
            cls       : 'my-custom-class',
            style     : {
                color: 'rgb(255, 0, 0)',
                fontSize: '20px'
            }
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();

        await expect(label).toHaveClass(/my-custom-class/);
        await expect(label).toHaveCSS('color', 'rgb(255, 0, 0)');
        await expect(label).toHaveCSS('font-size', '20px');
    });

    test('should handle disabled state', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Disabled Label',
            disabled  : true
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();
        await expect(label).toHaveClass(/neo-disabled/);

        // Re-enable
        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, disabled: false});
        }, labelId);

        await expect(label).not.toHaveClass(/neo-disabled/);
    });

    test('should handle hidden state', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Hidden Label',
            hidden    : true
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeHidden();

        // Unhide
        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, hidden: false});
        }, labelId);

        await expect(label).toBeVisible();
    });

    test('should render html content', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            html      : '<span>HTML Content</span>'
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();
        const span = label.locator('span');
        await expect(span).toHaveText('HTML Content');
    });

    test('should apply dimension configs', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Dimension Label',
            height    : 100,
            width     : 200,
            minHeight : 50,
            maxHeight : 150,
            minWidth  : 150,
            maxWidth  : 250
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();
        await expect(label).toHaveCSS('height', '100px');
        await expect(label).toHaveCSS('width', '200px');
        await expect(label).toHaveCSS('min-height', '50px');
        await expect(label).toHaveCSS('max-height', '150px');
        await expect(label).toHaveCSS('min-width', '150px');
        await expect(label).toHaveCSS('max-width', '250px');
    });

    test('should show isLoading UI', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Loading Label',
            isLoading : true
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        const loadMask = label.locator('.neo-load-mask');
        await expect(loadMask).toBeVisible();
        await expect(label).toHaveClass(/neo-masked/);

        await page.evaluate((id) => {
            return Neo.worker.App.setConfigs({id, isLoading: false});
        }, labelId);

        await expect(loadMask).toBeHidden();
        await expect(label).not.toHaveClass(/neo-masked/);
    });

    test('should show a tooltip', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Tooltip Label',
            tooltip: {
                text: 'This is a tooltip'
            }
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await label.hover();

        const tooltip = page.locator('.neo-tooltip');
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveText('This is a tooltip');
    });

    test('should be scrollable', async ({page}) => {
        const labelConfig = {
            importPath: '../../../src/component/Label.mjs',
            ntype     : 'label',
            parentId  : 'component-test-viewport',
            text      : 'Scrollable Label with very long text to ensure scrolling is possible',
            scrollable: true,
            width     : 100,
            height    : 50
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, labelConfig);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toHaveClass(/neo-scrollable/);
        await expect(label).toHaveCSS('overflow', 'auto');
    });

    test('should handle various component configs', async ({page}) => {
        const labelConfig = {
            importPath  : '../../../src/component/Label.mjs',
            ntype       : 'label',
            parentId    : 'component-test-viewport',
            text        : 'Component Configs',
            appName     : 'TestApp',
            data        : {foo: 'bar'},
            id          : 'my-label-id',
            role        : 'presentation',
            theme       : 'dark',
            ui          : 'highlight',
            windowId    : 'my-window-id',
            wrapperCls  : 'my-wrapper-class',
            wrapperStyle: {
                border: '1px solid rgb(255, 0, 0)'
            }
        };

        const result = await page.evaluate((config) => {
            Neo.worker.App.createNeoInstance(config);
            return Neo.worker.App.getComponent(config.id);
        }, labelConfig);

        labelId = result.id;

        const label = page.locator(`#${labelId}`);
        await expect(label).toBeVisible();

        // appName
        expect(result.appName).toBe('TestApp');

        // data
        expect(result.data.foo).toBe('bar');

        // id
        expect(result.id).toBe('my-label-id');

        // mounted
        expect(result.mounted).toBe(true);

        // role
        await expect(label).toHaveAttribute('role', 'presentation');

        // theme
        await expect(label).toHaveClass(/neo-theme-dark/);

        // ui
        await expect(label).toHaveClass(/neo-label-highlight/);

        // windowId
        expect(result.windowId).toBe('my-window-id');

        // wrapperCls & wrapperStyle
        const wrapper = page.locator(`#${labelId}-wrapper`);
        await expect(wrapper).toHaveClass(/my-wrapper-class/);
        await expect(wrapper).toHaveCSS('border', '1px solid rgb(255, 0, 0)');
    });

    test('should handle data binding and state provider', async ({page}) => {
        const result = await page.evaluate(() => {
            const stateProvider = Neo.worker.App.createNeoInstance({
                module    : Neo.state.Provider,
                name      : 'myState',
                data      : {
                    labelText: 'Initial Text'
                }
            });

            const label = Neo.worker.App.createNeoInstance({
                importPath    : '../../../src/component/Label.mjs',
                ntype         : 'label',
                parentId      : 'component-test-viewport',
                stateProvider : 'myState',
                bind          : {
                    text: '{labelText}'
                },
                reference     : 'myLabel'
            });

            return {
                labelId: label.id,
                stateProviderId: stateProvider.id,
                initialText: label.text
            };
        });

        labelId = result.labelId;
        const { stateProviderId, initialText } = result;

        expect(initialText).toBe('Initial Text');

        const label = page.locator(`#${labelId}`);
        await expect(label).toHaveText('Initial Text');

        // Update state provider data
        await page.evaluate((id) => {
            const stateProvider = Neo.worker.App.getComponent(id);
            stateProvider.data.labelText = 'Updated Text';
        }, stateProviderId);

        await expect(label).toHaveText('Updated Text');

        // Check reference
        const referenceResult = await page.evaluate(() => {
            return Neo.worker.App.getComponent('myLabel').id;
        });
        expect(referenceResult).toBe(labelId);
    });
});
