import { test, expect } from '../fixtures.mjs';

test.describe('Neural Link Playwright Fixture Baseline', () => {
    test.setTimeout(90000);

    test('verifies layout, VDOM, computed style, and event simulation bridge APIs', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');

        const exampleButton = page.locator('.neo-example-container .neo-button').first();
        await expect(exampleButton).toBeVisible({ timeout: 30000 });

        const app      = await neuralLink.connectToApp('Neo.examples.button.base');
        const buttonId = await exampleButton.getAttribute('id');

        expect(buttonId).toBeTruthy();

        const buttonProps = await app.getComponent(buttonId, ['windowId']);
        expect(buttonProps.windowId).toBeDefined();

        const [workerRect] = await app.getDomRect(buttonId);
        const domBox       = await exampleButton.boundingBox();

        expect(workerRect.width).toBeGreaterThan(0);
        expect(workerRect.height).toBeGreaterThan(0);
        expect(Math.abs(workerRect.width - domBox.width)).toBeLessThan(2);
        expect(Math.abs(workerRect.height - domBox.height)).toBeLessThan(2);

        const workerStyles = await app.getComputedStyles(buttonId, ['display', 'cursor']);
        const domStyles    = await exampleButton.evaluate(node => {
            const computed = window.getComputedStyle(node);

            return {
                cursor : computed.cursor,
                display: computed.display
            };
        });

        expect(workerStyles.display).toBe(domStyles.display);
        expect(workerStyles.cursor).toBe(domStyles.cursor);

        const vdomResult = await app.queryVdom({ tag: 'button' }, buttonId);
        expect(vdomResult.vdom.tag).toBe('button');

        await page.evaluate(id => {
            window.__nlFixtureClickCount = 0;
            document.getElementById(id).addEventListener('click', () => {
                window.__nlFixtureClickCount += 1;
            }, { once: true });
        }, buttonId);

        const dispatched = await app.simulateEvent({
            options : { bubbles: true, cancelable: true },
            targetId: buttonId,
            type    : 'click',
            windowId: String(buttonProps.windowId)
        });

        expect(dispatched).toBe(true);
        await expect.poll(() => page.evaluate(() => window.__nlFixtureClickCount)).toBe(1);
    });
});
