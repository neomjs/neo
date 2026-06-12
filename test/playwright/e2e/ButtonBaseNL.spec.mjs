import { test, expect } from '../fixtures.mjs';

test.describe('Desktop: Neural Link Baseline Validation (Button Base)', () => {
    test.setTimeout(90000);

    test('Direct Component Mutation via Worker State', async ({ page, neuralLink }) => {
        // Navigate to the Button Base Example
        await page.goto('/examples/button/base/index.html');
        
        console.log('[ButtonBaseNL.spec.mjs] Loading Button Base Example...');
        
        // Connect to the App Worker directly
        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        
        console.log(`[ButtonBaseNL.spec.mjs] Connected to App Session ID: ${app.sessionId}`);

        // Wait for the neo-button to be visible
        await page.waitForSelector('.neo-button', { state: 'visible', timeout: 30000 });
        
        // The ConfigurationViewport creates the example component logic.
        // Find the button with the text 'Hello World'
        const exampleButtonId = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('.neo-button'));
            const target = btns.find(b => b.textContent && b.textContent.includes('Hello World'));
            return target ? target.id : null;
        });

        expect(exampleButtonId).toBeTruthy();

        // Whitebox Assertion: Read from the App Worker via NL
        const btnProps = await app.getComponent(exampleButtonId, ['text', 'ui']);
        expect(btnProps.text).toBe('Hello World');
        expect(btnProps.ui).toBe('primary');

        // Whitebox Mutation: Modify the worker instance natively
        await app.setProperties(exampleButtonId, { 
            text: 'Neural Link Active',
            ui: 'secondary'
        });

        // DOM Assertion: Verify the VDOM automatically pushed the reactive update to the Main Thread
        const targetBtn = page.locator(`#${exampleButtonId}`);
        await expect(targetBtn).toContainText('Neural Link Active');
        await expect(targetBtn).toHaveClass(/neo-button-secondary/);
    });

    test('User-Driven Configuration Mutation (Playwright UI -> Config -> Button -> NL Validation)', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        // Give time for UI mount
        await page.waitForTimeout(500);

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        
        // Find the TextField for 'text' configuration using Neural Link semantic querying
        const results = await app.queryComponent({ ntype: 'textfield', labelText: 'text' }, ['id', 'value']);
        expect(Array.isArray(results) ? results.length : (results ? 1 : 0)).toBeGreaterThan(0);
        
        const textFieldId = Array.isArray(results) ? results[0].id : results.id;
        
        // Native DOM User Interaction: Type into the visual textfield using its ID from the Backend
        const inputLocator = page.locator(`#${textFieldId} input`);
        await inputLocator.fill('User Typed Label');
        await inputLocator.press('Enter'); // Trigger the change event
        
        // Assert: Main Example Button changes visually
        const exampleButton = page.locator('.neo-example-container .neo-button').first();
        await expect(exampleButton).toContainText('User Typed Label');
        
        // Assert: Backend State matches DOM intent
        const btnId = await exampleButton.getAttribute('id');
        const btnProps = await app.getComponent(btnId, ['text']);
        expect(btnProps.text).toBe('User Typed Label');
    });

    test('Agent-Driven Configuration Mutation (NL -> Config -> Button)', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await page.waitForTimeout(500);

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        
        // Find the TextField for 'text' configuration using Neural Link semantic querying
        const results = await app.queryComponent({ ntype: 'textfield', labelText: 'text' }, ['id']);
        const textFieldId = Array.isArray(results) ? results[0].id : results.id;
        
        // Mutate the Configuration field programmatically
        // Note: setting properties directly may not trigger the 'change' event listener unless afterSetValue fires it.
        // In Neo, setting `value` programmatically on a field does trigger `afterSetValue` -> `fire('change')`
        await app.setProperties(textFieldId, { value: 'Agent Manipulated config' });
        
        // Assert: Main Example Button DOM updates accordingly because the App Worker reconciled the change event!
        const exampleButton = page.locator('.neo-example-container .neo-button').first();
        await expect(exampleButton).toContainText('Agent Manipulated config');
        
        // Re-verify the Backend State of the main button directly
        const btnId = await exampleButton.getAttribute('id');
        const btnProps = await app.getComponent(btnId, ['text']);
        expect(btnProps.text).toBe('Agent Manipulated config');
    });

    test('Agent-Driven Layout vs DOM Physics Validation (NL -> Live DOM Verification)', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await page.waitForTimeout(500);

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        
        // 1. Get the target example button visually
        const exampleButton = page.locator('.neo-example-container .neo-button').first();
        const btnId = await exampleButton.getAttribute('id');

        // 2. Cross-check DOMRect (App Worker vs Live DOM)
        const workerRects = await app.getDomRect([btnId]);
        const workerRect = workerRects[0];
        
        const domBox = await exampleButton.boundingBox();
        
        // The Engine bounds should mathematically match the Live DOM visual output
        expect(Math.abs(workerRect.width - domBox.width)).toBeLessThan(2);
        expect(Math.abs(workerRect.height - domBox.height)).toBeLessThan(2);

        // 3. Cross-check Computed Styles (App Worker vs Live DOM)
        // We ask the worker what it sees over the remote bridge
        const workerStyles = await app.getComputedStyles(btnId, ['display', 'cursor']);
        
        // We directly ask the browser tab what CSS OM rendered natively
        const domStyles = await exampleButton.evaluate(node => {
            const computed = window.getComputedStyle(node);
            return {
                display: computed.display,
                cursor: computed.cursor
            };
        });

        expect(workerStyles.display).toBe(domStyles.display);
        expect(workerStyles.cursor).toBe(domStyles.cursor);

        // 4. Test queryVdom Structural Sanity
        const vdomResult = await app.queryVdom({ tag: 'button' }, btnId);
        expect(vdomResult).toBeTruthy();
        expect(vdomResult.vdom.tag).toBe('button');
        
        // Assert the Live DOM has the same structural tag match
        const tagName = await exampleButton.evaluate(node => node.tagName.toLowerCase());
        expect(vdomResult.vdom.tag).toBe(tagName);
    });
});
