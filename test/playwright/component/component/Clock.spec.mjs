import {test, expect} from '@playwright/test';

let componentId;

/**
 * @summary Changes the mounted clock through the App worker's existing config API.
 * @param {Object} page
 * @param {Object} config
 * @returns {Promise<void>}
 */
async function configure(page, config) {
    const result = await page.evaluate(config => Neo.worker.App.setConfigs(config), {id: componentId, ...config});
    expect(result.success).toBe(true)
}

test.beforeEach(async ({page}) => {
    componentId = null;
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    componentId = await page.evaluate(async () => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Clock.mjs',
            ntype     : 'clock',
            parentId  : 'component-test-viewport',
            time      : '08:10'
        });
        if (!result.success) throw new Error(`Clock creation failed: ${result.error.message}`);
        return result.id
    });
    await expect(page.locator(`#${componentId}`)).toBeVisible()
});

test.afterEach(async ({page}) => {
    if (componentId) {
        const result = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        expect(result.success).toBe(true);
        await expect(page.locator(`#${componentId}`)).toHaveCount(0)
    }
});

test.describe('Neo.component.Clock', () => {
    for (const {time, minutes, hours} of [
        {time: '03:30', minutes: 'rotate(180deg)', hours: 'rotate(105deg)'},
        {time: '15:45', minutes: 'rotate(270deg)', hours: 'rotate(112.5deg)'},
        {time: '12:00', minutes: 'rotate(0deg)', hours: 'rotate(0deg)'}
    ]) {
        test(`${time} turns the minute and hour hands to their inline target angles`, async ({page}) => {
            await configure(page, {time});
            const clock = page.locator(`#${componentId}`);
            await expect.poll(() => clock.locator(':scope > div').evaluateAll(hands =>
                hands.map(hand => hand.style.transform)
            )).toEqual([minutes, hours])
        })
    }

    test('a numeric size writes both inline dimensions in pixels', async ({page}) => {
        await configure(page, {size: 300});
        const clock = page.locator(`#${componentId}`);
        await expect.poll(() => clock.evaluate(node => [node.style.width, node.style.height]))
            .toEqual(['300px', '300px'])
    });

    test('a non-numeric size clears previously written inline dimensions', async ({page}) => {
        const clock = page.locator(`#${componentId}`);
        await configure(page, {size: 300});
        await expect.poll(() => clock.evaluate(node => [node.style.width, node.style.height]))
            .toEqual(['300px', '300px']);

        await configure(page, {size: '50%'});
        await expect.poll(() => clock.evaluate(node => [node.style.width, node.style.height]))
            .toEqual(['', ''])
    });

    test('showDisc removes and restores the rendered disc class', async ({page}) => {
        const clock = page.locator(`#${componentId}`);
        await expect(clock).toHaveClass(/\bneo-show-disc\b/);
        await configure(page, {showDisc: false});
        await expect(clock).not.toHaveClass(/\bneo-show-disc\b/);

        await configure(page, {showDisc: true});
        await expect(clock).toHaveClass(/\bneo-show-disc\b/)
    });

    test('fontSize writes the inline font size in pixels', async ({page}) => {
        await configure(page, {fontSize: 30});
        await expect.poll(() => page.locator(`#${componentId}`).evaluate(node => node.style.fontSize))
            .toBe('30px')
    });
});
