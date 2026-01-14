import {test, expect} from '../../fixtures.mjs';

let rootId;

test.describe('Neo.container.Base Atomic Moves', () => {
    test.beforeEach(async ({neo, page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');

        // Load core classes
        await neo.loadModule('../container/Base.mjs');
        await neo.loadModule('../button/Base.mjs');
        await neo.loadModule('../form/field/Text.mjs');
        // Ensure dependencies for Text field are loaded
        await neo.loadModule('../form/field/Base.mjs');
        await neo.loadModule('../form/field/trigger/Base.mjs');
        await neo.loadModule('../form/field/trigger/Clear.mjs');
    });

    test.afterEach(async ({neo}) => {
        if (rootId) {
            await neo.destroyComponent(rootId);
            rootId = null;
        }
    });

    test('Baseline: Native DOM move focus behavior', async ({page}) => {
        // Setup raw DOM structure
        await page.evaluate(() => {
            document.body.innerHTML = `
                <div id="parent-a">
                    <input id="test-input" type="text" value="focus me" />
                </div>
                <div id="parent-b"></div>
            `;
        });

        await expect(page.locator('#test-input')).toBeVisible();
        await page.focus('#test-input');
        await expect(page.locator('#test-input')).toBeFocused();

        // Perform native DOM move
        const wasFocused = await page.evaluate(() => {
            const input = document.getElementById('test-input');
            const parentB = document.getElementById('parent-b');

            // Log active element before move
            const beforeMoveActive = document.activeElement === input;

            // Move it
            parentB.appendChild(input);

            // Check active element immediately after synchronous move
            const afterMoveActive = document.activeElement === input;

            return {
                before: beforeMoveActive,
                after: afterMoveActive
            };
        });

        // Verify baseline behavior
        // In Chrome/WebKit, this is expected to be { before: true, after: false } (focus lost)
        // In Firefox, it might be { before: true, after: true }
        // console.log('Native move focus result:', wasFocused);

        // We assert what we *expect* browser behavior to be, to confirm our hypothesis
        // If this assertion fails (focus is preserved), then our Neo.mjs logic is breaking it unnecessarily.
        // If this assertion passes (focus is lost), then Neo.mjs MUST manually restore focus.
        expect(wasFocused.after).toBe(false);

        // Check moveBefore support (Atomic Move API)
        const moveBeforeResult = await page.evaluate(() => {
            const input = document.getElementById('test-input');
            const parentA = document.getElementById('parent-a');

            if (!parentA.moveBefore) {
                return { supported: false };
            }

            // Re-focus first, as previous move likely lost it
            input.focus();
            const beforeMoveActive = document.activeElement === input;

            // Move back to A using moveBefore
            parentA.moveBefore(input, null);

            const afterMoveActive = document.activeElement === input;

            return {
                supported: true,
                before: beforeMoveActive,
                after: afterMoveActive
            };
        });

        // console.log('Native moveBefore focus result:', moveBeforeResult);
    });

    test('Atomic Move: Preserve DOM state (custom property) when moving between sibling containers', async ({neo, page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'container', id: 'container-a', items: [
                    {ntype: 'button', id: 'my-btn', text: 'Move Me'}
                ]},
                {ntype: 'container', id: 'container-b', items: []}
            ]
        };

        const result = await neo.createComponent(config);
        rootId = result.id;

        await expect(page.locator('#my-btn')).toBeVisible();

        // Set a custom property on the DOM node
        await page.evaluate(() => {
            const btn = document.getElementById('my-btn');
            btn.__preservedState = 'alive';
        });

        // Move 'my-btn' from A to B
        await neo.moveComponent({
            id      : 'my-btn',
            parentId: 'container-b'
        });

        // Wait for the move to propagate to DOM (parent change)
        await page.waitForFunction(() => {
            const btn = document.getElementById('my-btn');
            const containerB = document.getElementById('container-b');
            return containerB && btn && containerB.contains(btn);
        });

        // Verify the custom property still exists
        const state = await page.evaluate(() => {
            return document.getElementById('my-btn').__preservedState;
        });

        expect(state).toBe('alive');
    });

    test('Atomic Move: Preserve input value when moving between sibling containers', async ({neo, page}) => {
        const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'container', id: 'container-c', items: [
                    {ntype: 'textfield', id: 'my-field', labelText: 'My Field'}
                ]},
                {ntype: 'container', id: 'container-d', items: []}
            ]
        };

        const result = await neo.createComponent(config);
        rootId = result.id;

        // Ensure the element is truly in the DOM
        await page.waitForSelector('#my-field__input', { state: 'attached', timeout: 10000 });
        await expect(page.locator('#my-field__input')).toBeVisible();

        // Type into the input to set transient state
        await page.fill('#my-field__input', 'Preserve Me');

        // Move 'my-field' from C to D
        await neo.moveComponent({
            id      : 'my-field',
            parentId: 'container-d'
        });

        // Wait for the move to propagate to DOM (parent change)
        await page.waitForFunction(() => {
            const el = document.getElementById('my-field');
            const containerD = document.getElementById('container-d');
            return containerD && el && containerD.contains(el);
        });

        // Verify value is preserved (proving atomic move / no destroy)
        const value = await page.inputValue('#my-field__input');
        expect(value).toBe('Preserve Me');
    });

    test('Atomic Move: Preserve focus when moving', async ({neo, page}) => {
         const config = {
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            parentId  : 'component-test-viewport',
            layout    : 'vbox',
            items: [
                {ntype: 'container', id: 'container-1', items: [
                    {ntype: 'textfield', id: 'focus-field', labelText: 'Focus Field'}
                ]},
                {ntype: 'container', id: 'container-2', items: []}
            ]
        };

        const result = await neo.createComponent(config);
        rootId = result.id;

        await page.waitForSelector('#focus-field__input', { state: 'attached', timeout: 10000 });
        await expect(page.locator('#focus-field__input')).toBeVisible();

        // Focus the input
        await page.focus('#focus-field__input');

        // Move 'focus-field' from 1 to 2
        await neo.moveComponent({
            id      : 'focus-field',
            parentId: 'container-2'
        });

        // Wait for move
        await page.waitForFunction(() => {
            const el = document.getElementById('focus-field');
            const container2 = document.getElementById('container-2');
            return container2 && el && container2.contains(el);
        });

        // Verify focus is preserved
        await expect(page.locator('#focus-field__input')).toBeFocused();
    });
});
