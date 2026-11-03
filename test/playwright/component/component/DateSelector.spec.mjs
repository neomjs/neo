import {test, expect} from '@playwright/test';

let componentId, extraComponentId;

/**
 * @param {import('@playwright/test').Page} page
 * @param {Object} [config={}]
 * @returns {Promise<String>}
 */
async function createDateSelector(page, config={}) {
    const result = await page.evaluate(async config => Neo.worker.App.createNeoInstance({
        importPath: '../component/DateSelector.mjs',
        ntype     : 'dateselector',
        parentId  : 'component-test-viewport',
        height    : 250,
        value     : '2023-10-15',
        width     : 300,
        ...config
    }), config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    return result.id
}

test.describe('Neo.component.DateSelector', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (extraComponentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), extraComponentId);
            extraComponentId = null
        }

        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('should render the DateSelector component', async ({page}) => {
        componentId = await createDateSelector(page);
        const dateSelector = page.locator(`#${componentId}`);
        await expect(dateSelector).toBeVisible()
    });

    test('focuses the destination day cell after animated cross-month and cross-year keyboard navigation and preserves same-month continuation', async ({page}) => {
        componentId = await createDateSelector(page, {
            selectionModel: {
                stayInMonth: false
            },
            useAnimations: true,
            value        : '2025-12-31'
        });

        const dec31Cell = page.locator(`#${componentId}__2025-12-31`),
              jan01Cell = page.locator(`#${componentId}__2026-01-01`),
              jan31Cell = page.locator(`#${componentId}__2026-01-31`),
              feb01Cell = page.locator(`#${componentId}__2026-02-01`),
              feb02Cell = page.locator(`#${componentId}__2026-02-02`);

        await dec31Cell.focus();
        await expect(dec31Cell).toBeFocused();

        // Cross year + month boundary: 2025-12-31 -> 2026-01-01
        await page.keyboard.press('ArrowRight');

        await expect(jan01Cell).toBeAttached();
        await expect(page.locator(`#${componentId} .neo-animation-wrapper`)).toHaveCount(0);
        await expect(jan01Cell).toBeFocused();
        await expect(jan01Cell).toHaveClass(/neo-selected/);

        // Jump to 2026-01-31 within January and cross month boundary: 2026-01-31 -> 2026-02-01
        await page.evaluate(id => Neo.worker.App.setConfigs({id, value: '2026-01-31'}), componentId);
        await jan31Cell.focus();
        await expect(jan31Cell).toBeFocused();

        await page.keyboard.press('ArrowRight');

        await expect(feb01Cell).toBeAttached();
        await expect(page.locator(`#${componentId} .neo-animation-wrapper`)).toHaveCount(0);
        await expect(feb01Cell).toBeFocused();
        await expect(feb01Cell).toHaveClass(/neo-selected/);

        // Same-month continuation control: 2026-02-01 -> 2026-02-02
        await page.keyboard.press('ArrowRight');
        await expect(feb02Cell).toBeFocused();
        await expect(feb02Cell).toHaveClass(/neo-selected/)
    });

    test('does not steal focus after an animated cross-month transition if the user moved focus outside during the transition', async ({page}) => {
        componentId = await createDateSelector(page, {
            selectionModel: {
                stayInMonth: false
            },
            useAnimations: true,
            value        : '2026-01-31'
        });

        const buttonResult = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath: '../button/Base.mjs',
            ntype     : 'button',
            parentId  : 'component-test-viewport',
            text      : 'Outside Focus Target'
        }));
        extraComponentId = buttonResult.id;

        const jan31Cell     = page.locator(`#${componentId}__2026-01-31`),
              feb01Cell     = page.locator(`#${componentId}__2026-02-01`),
              outsideButton = page.locator(`#${extraComponentId}`);

        await jan31Cell.focus();
        await expect(jan31Cell).toBeFocused();

        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`#${componentId} .neo-animation-wrapper`)).toHaveCount(1);

        // User moves focus away while the month slide animation is in flight
        await outsideButton.focus();
        await expect(outsideButton).toBeFocused();

        await expect(feb01Cell).toBeAttached();
        await expect(page.locator(`#${componentId} .neo-animation-wrapper`)).toHaveCount(0);
        await expect(feb01Cell).toHaveClass(/neo-selected/);
        await expect(outsideButton).toBeFocused()
    });
});
