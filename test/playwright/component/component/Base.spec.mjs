import {test, expect} from '@playwright/test';

let containerId, componentId, toolbarId, buttonId;

test.describe('Neo.component.Base', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test.afterEach(async ({page}) => {
        if (containerId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy container ${id}:`, result.error);
                }
            }, containerId);
            containerId = null;
        }
        if (componentId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy component ${id}:`, result.error);
                }
            }, componentId);
            componentId = null;
        }
        if (toolbarId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy toolbar ${id}:`, result.error);
                }
            }, toolbarId);
            toolbarId = null;
        }
        if (buttonId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy button ${id}:`, result.error);
                }
            }, buttonId);
            buttonId = null;
        }
    });

    test('Checking colliding style updates', async ({page}) => {
        const containerResult = await page.evaluate(async () => {
            return Neo.worker.App.createNeoInstance({
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport',
                height    : 250,
                style     : {backgroundColor: 'red'},
                width     : 300
            });
        });

        if (!containerResult.success) {
            throw new Error(`Container creation failed: ${containerResult.error.message}`);
        }
        containerId = containerResult.id;

        expect(containerId).toBe('neo-container-1');

        await page.waitForSelector('.neo-container');

        const initialContainerBgColor = await page.locator(`#${containerId}`).evaluate(el => el.style.backgroundColor);

        expect(initialContainerBgColor).toBe('red');

        const componentResult = await page.evaluate(async (containerId) => {
            return Neo.worker.App.createNeoInstance({
                importPath: '../component/Base.mjs',
                ntype     : 'component',
                parentId  : containerId,
                height    : 150,
                style     : {backgroundColor: 'blue'},
                width     : 150
            });
        }, containerId);

        if (!componentResult.success) {
            throw new Error(`Component creation failed: ${componentResult.error.message}`);
        }
        componentId = componentResult.id;

        expect(componentId).toBe('neo-component-1');

        const initialComponentBgColor = await page.locator(`#${componentId}`).evaluate(el => el.style.backgroundColor);

        expect(initialComponentBgColor).toBe('blue');

        // t.diag('Child update before parent update');
        await page.evaluate(async ({componentId, containerId}) => {
            Neo.worker.App.setConfigs({id: componentId, style: {backgroundColor: 'green'}});
            Neo.worker.App.setConfigs({id: containerId, style: {backgroundColor: 'orange'}});
        }, {componentId, containerId});

        await page.waitForTimeout(100);

        const componentBgColor = await page.locator(`#${componentId}`).evaluate(el => el.style.backgroundColor);
        const containerBgColor = await page.locator(`#${containerId}`).evaluate(el => el.style.backgroundColor);

        expect(componentBgColor).toBe('green');
        expect(containerBgColor).toBe('orange');

        // t.diag('Parent update before child update');
        await page.evaluate(async (id) => {
            await Neo.worker.App.setConfigs({id, style: {backgroundColor: 'pink'}});
        }, containerId);
        await page.evaluate(async (id) => {
            await Neo.worker.App.setConfigs({id, style: {backgroundColor: 'purple'}});
        }, componentId);

        await page.waitForTimeout(100);

        const componentBgColor2 = await page.locator(`#${componentId}`).evaluate(el => el.style.backgroundColor);
        const containerBgColor2 = await page.locator(`#${containerId}`).evaluate(el => el.style.backgroundColor);

        expect(containerBgColor2).toBe('pink');
        expect(componentBgColor2).toBe('purple');
    });

    test('Checking colliding vdom updates', async ({page}) => {
        const toolbarResult = await page.evaluate(async () => {
            return Neo.worker.App.createNeoInstance({
                importPath: '../toolbar/Base.mjs',
                ntype     : 'toolbar',
                parentId  : 'component-test-viewport',
                height    : 200,
                width     : 300
            });
        });

        if (!toolbarResult.success) {
            throw new Error(`Toolbar creation failed: ${toolbarResult.error.message}`);
        }
        toolbarId = toolbarResult.id;

        expect(toolbarId).toBe('neo-toolbar-1');

        await page.waitForSelector('.neo-toolbar');
        // t.diag('Toolbar got rendered.');

        const buttonResult = await page.evaluate(async (toolbarId) => {
            return Neo.worker.App.createNeoInstance({
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : toolbarId,
                text      : 'hello'
            });
        }, toolbarId);

        if (!buttonResult.success) {
            throw new Error(`Button creation failed: ${buttonResult.error.message}`);
        }
        buttonId = buttonResult.id;

        expect(buttonId).toBe('neo-button-1');

        await page.waitForSelector('.neo-button');

        const initialToolbarHeight = await page.locator(`#${toolbarId}`).evaluate(el => el.style.height);
        const initialButtonText    = await page.locator(`#${buttonId}`).evaluate(el => el.firstChild.innerHTML);

        expect(initialToolbarHeight).toBe('200px');
        expect(initialButtonText).toBe('hello');

        // t.diag('Child update before parent update');
        await page.evaluate(async ({buttonId, toolbarId}) => {
            Neo.worker.App.setConfigs({id: buttonId, text: 'world'});
            Neo.worker.App.setConfigs({id: toolbarId, height: 300});
        }, {buttonId, toolbarId});

        await page.waitForTimeout(50);

        const toolbarHeight = await page.locator(`#${toolbarId}`).evaluate(el => el.style.height);
        const buttonText    = await page.locator(`#${buttonId}`).evaluate(el => el.firstChild.innerHTML);

        expect(toolbarHeight).toBe('300px');
        expect(buttonText).toBe('world');

        // t.diag('Parent update before child update');
        await page.evaluate(async ({buttonId, toolbarId}) => {
            Neo.worker.App.setConfigs({id: toolbarId, height: 200});
            Neo.worker.App.setConfigs({id: buttonId, text: 'hello'});
        }, {buttonId, toolbarId});

        await page.waitForTimeout(50);

        const toolbarHeight2 = await page.locator(`#${toolbarId}`).evaluate(el => el.style.height);
        const buttonText2    = await page.locator(`#${buttonId}`).evaluate(el => el.firstChild.innerHTML);

        expect(toolbarHeight2).toBe('200px');
        expect(buttonText2).toBe('hello');
    });
});
