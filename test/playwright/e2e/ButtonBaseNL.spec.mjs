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

    test('Agent-Driven Layout and Interaction Validation (NL -> InteractionService & ComponentService)', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await page.waitForTimeout(500);

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        
        // 1. Get the target example button
        const exampleButton = page.locator('.neo-example-container .neo-button').first();
        const btnId = await exampleButton.getAttribute('id');

        // 2. Test getDomRect
        const rects = await app.getDomRect([btnId]);
        expect(rects.length).toBe(1);
        expect(rects[0].width).toBeGreaterThan(0);
        expect(rects[0].height).toBeGreaterThan(0);

        // 3. Test getComputedStyles
        const styles = await app.getComputedStyles(btnId, ['display', 'cursor']);
        expect(styles.display).toBeTruthy();
        expect(styles.cursor).toBeTruthy();

        // 4. Test queryVdom
        // Search the VDOM for the button by tag name within the current button's context
        const vdomResult = await app.queryVdom({ tag: 'button' }, btnId);
        expect(vdomResult).toBeTruthy();
        expect(vdomResult.vdom).toBeTruthy();
        expect(vdomResult.vdom.tag).toBe('button');

        // 5. Test simulateEvent
        // Find the 'disabled' checkbox field to toggle state natively
        let checkboxes = await app.queryComponent({ ntype: 'checkboxfield' }, ['id', 'checked', 'labelText']);
        if (!Array.isArray(checkboxes)) checkboxes = [checkboxes];
        
        const disabledCheckbox = checkboxes.find(c => c.properties && c.properties.labelText === 'disabled');
        expect(disabledCheckbox).toBeTruthy();
        
        const initialState = disabledCheckbox.properties.checked;
        
        // Dispatch a native click event to the component's input VNode via Neural Link
        await app.simulateEvent({ type: 'click', targetId: `${disabledCheckbox.id}__input` });
        
        // Wait a slight tick for the App Worker to process the event and propagate reactive changes
        await page.waitForTimeout(100);
        
        // Fetch updated state directly from Backend
        const updatedProps = await app.getComponent(disabledCheckbox.id, ['checked']);
        expect(updatedProps.checked).not.toBe(initialState);
    });
});
