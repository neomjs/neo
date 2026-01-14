import {test, expect} from '@playwright/test';

let fragmentId;

test.describe('Neo.container.Fragment (E2E)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
        
        // Preload classes in the App Worker to ensure ntypes are available
        await page.evaluate(async () => {
            await Neo.worker.App.loadModule({path: '../button/Base.mjs'});
            await Neo.worker.App.loadModule({path: '../container/Base.mjs'});
            await Neo.worker.App.loadModule({path: '../container/Fragment.mjs'});
        });
    });

    test.afterEach(async ({page}) => {
        if (fragmentId) {
            await page.evaluate((id) => {
                return Neo.worker.App.destroyNeoInstance(id);
            }, fragmentId);
        }
    });

    test('should render children without a wrapper element', async ({page}) => {
        const config = {
            importPath: '../container/Fragment.mjs',
            ntype     : 'fragment',
            parentId  : 'component-test-viewport',
            items: [
                {ntype: 'button', text: 'Child 1', id: 'child-1'},
                {ntype: 'button', text: 'Child 2', id: 'child-2'}
            ]
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, config);

        if (!result.success) {
            throw new Error(`Component creation failed: ${result.error.message}`);
        }

        fragmentId = result.id;

        // Verify children exist
        await expect(page.locator('#child-1')).toBeVisible();
        await expect(page.locator('#child-2')).toBeVisible();

        // Verify NO wrapper element with fragment ID
        const wrapper = page.locator(`#${fragmentId}`);
        await expect(wrapper).toHaveCount(0);

        // Verify comments exist
        const hasComments = await page.evaluate((id) => {
            const startComment = document.evaluate(`//comment()[contains(., ' ${id}-start ')]`, document, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
            const endComment   = document.evaluate(`//comment()[contains(., ' ${id}-end ')]`, document, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;
            return startComment && endComment;
        }, fragmentId);

        expect(hasComments).toBe(true);
    });

    test('children should participate in parent layout', async ({page}) => {
        // Create a parent container with VBox layout
        const parentConfig = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : {ntype: 'vbox', align: 'stretch'},
            items: [
                {ntype: 'button', text: 'Top', id: 'top-btn'},
                {
                    ntype: 'fragment',
                    items: [
                        {ntype: 'button', text: 'Frag 1', id: 'frag-1'},
                        {ntype: 'button', text: 'Frag 2', id: 'frag-2'}
                    ]
                },
                {ntype: 'button', text: 'Bottom', id: 'bottom-btn'}
            ]
        };

        const result = await page.evaluate((config) => {
            return Neo.worker.App.createNeoInstance(config);
        }, parentConfig);

        if (!result.success) {
            throw new Error(`Parent creation failed: ${result.error.message}`);
        }

        const parentId = result.id;
        // We'll clean up the parent, which cleans up the fragment
        fragmentId = null; 

        // Verify all buttons are siblings
        const parentNode = page.locator(`#${parentId}`);
        
        // VBox layout items usually get flex styles. 
        // We just verify they are direct children of the parent container.
        // Note: Container might have a vdom wrapper, but here we assume items go into the container's root or itemsRoot.
        // Neo.container.Base defaults to no extra wrapper unless specified.
        
        // Check if buttons are direct children of the container's DOM node
        // We can check the count of .neo-button inside the parent
        await expect(parentNode.locator('> .neo-button')).toHaveCount(4);
        
        await expect(page.locator('#top-btn')).toBeVisible();
        await expect(page.locator('#frag-1')).toBeVisible();
        await expect(page.locator('#frag-2')).toBeVisible();
        await expect(page.locator('#bottom-btn')).toBeVisible();

        // Cleanup
        await page.evaluate((id) => {
            return Neo.worker.App.destroyNeoInstance(id);
        }, parentId);
    });
});
