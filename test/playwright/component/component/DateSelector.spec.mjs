import {test, expect} from '../../fixtures.mjs';

let componentId, extraComponentId;
const navigationModelId = 'date-preview-selection';

/**
 * @summary Reads committed selection and its separate keyboard destination through the fixture's public RPCs.
 * @param {Object} neo
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function readNavigation(neo, id) {
    const [[value], [items, navigationId]] = await Promise.all([
        neo.getConfig(id, ['value']),
        neo.getConfig(navigationModelId, ['items', 'navigationId'])
    ]);

    return {value, items, navigationId}
}

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

    test('opt-out arrows wrap repeatedly without selecting, show a distinct destination, and Enter commits', async ({page, neo}, testInfo) => {
        componentId = await createDateSelector(page, {
            selectionModel: {id: navigationModelId, selectOnNavigate: false},
            useAnimations : false,
            value         : '2026-01-31'
        });

        const selected = page.locator(`#${componentId}__2026-01-31`);

        await selected.focus();

        for (const [key, day] of [
            ['ArrowRight', '01'], ['ArrowRight', '02'], ['ArrowLeft', '01'],
            ['ArrowLeft', '31'], ['ArrowLeft', '30']
        ]) {
            const navigationId = `${componentId}__2026-01-${day}`,
                  destination  = page.locator(`#${navigationId}`);

            await page.keyboard.press(key);
            await expect(destination).toBeFocused();
            await expect(destination).toHaveClass(/neo-navigated/);
            await expect(selected).toHaveClass(/neo-selected/);
            await expect.poll(() => readNavigation(neo, componentId)).toEqual({
                value: '2026-01-31', items: [`${componentId}__2026-01-31`], navigationId
            })
        }

        const destination = page.locator(`#${componentId}__2026-01-30`);

        await expect(destination).not.toHaveClass(/neo-selected/);
        await expect(destination.locator('.neo-cell-content')).toHaveCSS('outline-style', 'solid');
        await expect(selected.locator('.neo-cell-content')).toHaveCSS('outline-style', 'none');
        await page.locator(`#${componentId}`).screenshot({path: testInfo.outputPath('date-preview.png')});

        await page.keyboard.press('Enter');
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2026-01-30', items: [`${componentId}__2026-01-30`], navigationId: null
        });
        await expect(destination).toHaveClass(/neo-selected/);
        await expect(page.locator(`#${componentId} .neo-navigated`)).toHaveCount(0)
    });

    test('opt-out queues arrows across an animated year boundary and focuses the final uncommitted date', async ({page, neo}) => {
        componentId = await createDateSelector(page, {
            selectionModel: {id: navigationModelId, selectOnNavigate: false, stayInMonth: false},
            useAnimations : true,
            value         : '2025-12-31'
        });

        const animation = page.locator(`#${componentId} .neo-animation-wrapper`),
              finalCell = page.locator(`#${componentId}__2026-01-03`);

        await page.locator(`#${componentId}__2025-12-31`).focus();
        await page.keyboard.press('ArrowRight');
        await expect(animation).toHaveCount(1);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');

        await expect(animation).toHaveCount(0);
        await expect(finalCell).toBeFocused();
        await expect(finalCell).toHaveClass(/neo-navigated/);
        await expect(finalCell).not.toHaveClass(/neo-selected/);
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2025-12-31', items: [`${componentId}__2025-12-31`], navigationId: `${componentId}__2026-01-03`
        });

        await page.keyboard.press('Enter');
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2026-01-03', items: [`${componentId}__2026-01-03`], navigationId: null
        });
        await expect(finalCell).toHaveClass(/neo-selected/)
    });

    test('opt-out animation preserves an intervening external focus without committing the preview', async ({page, neo}) => {
        componentId = await createDateSelector(page, {
            selectionModel: {id: navigationModelId, selectOnNavigate: false, stayInMonth: false},
            useAnimations : true,
            value         : '2026-01-31'
        });
        const result = await neo.createComponent({
            importPath: '../button/Base.mjs', ntype: 'button',
            parentId  : 'component-test-viewport', text: 'Outside preview'
        });
        expect(result.success).toBe(true);
        extraComponentId = result.id;

        const outside   = page.locator(`#${extraComponentId}`),
              nextDay   = page.locator(`#${componentId}__2026-02-01`),
              animation = page.locator(`#${componentId} .neo-animation-wrapper`);

        await page.locator(`#${componentId}__2026-01-31`).focus();
        await page.keyboard.press('ArrowRight');
        await expect(animation).toHaveCount(1);
        await outside.focus();
        await expect(outside).toBeFocused();
        await expect(animation).toHaveCount(0);
        await expect(nextDay).toHaveClass(/neo-navigated/);
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2026-01-31', items: [`${componentId}__2026-01-31`], navigationId: `${componentId}__2026-02-01`
        });
        await expect(outside).toBeFocused()
    });

    test('pointer and programmatic replacements discard the opt-out preview and rebase the next arrow', async ({page, neo}) => {
        componentId = await createDateSelector(page, {
            selectionModel: {id: navigationModelId, selectOnNavigate: false},
            useAnimations : false
        });

        await page.locator(`#${componentId}__2023-10-15`).focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`#${componentId}__2023-10-16`)).toHaveClass(/neo-navigated/);
        await page.locator(`#${componentId}__2023-10-20`).click();
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2023-10-20', items: [`${componentId}__2023-10-20`], navigationId: null
        });
        await expect(page.locator(`#${componentId} .neo-navigated`)).toHaveCount(0);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`#${componentId}__2023-10-21`)).toBeFocused();

        await neo.setConfig(componentId, {value: '2023-10-25'});
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2023-10-25', items: [`${componentId}__2023-10-25`], navigationId: null
        });
        await expect(page.locator(`#${componentId} .neo-navigated`)).toHaveCount(0);
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator(`#${componentId}__2023-10-24`)).toBeFocused();
        await expect.poll(() => readNavigation(neo, componentId)).toEqual({
            value: '2023-10-25', items: [`${componentId}__2023-10-25`], navigationId: `${componentId}__2023-10-24`
        })
    });

    for (const commit of ['Enter', 'pointer', 'Enter without arrows']) {
        test(`a null Date field stays empty with its picker open until ${commit} commits the opt-out destination`, async ({page, neo}) => {
            const result = await neo.createComponent({
                importPath        : '../form/field/Date.mjs', ntype: 'datefield',
                parentId          : 'component-test-viewport', width: 300,
                dateSelectorConfig: {
                    selectionModel: {id: navigationModelId, selectOnNavigate: false},
                    value         : '2026-01-15', useAnimations: false
                },
                hidePickerOnSelect: true,
                value             : null
            });
            expect(result.success).toBe(true);
            componentId = result.id;

            const input  = page.locator(`#${componentId} input`),
                  picker = page.locator(`#${componentId}__picker`);

            await expect.poll(() => neo.getConfig(componentId, ['value'])).toEqual([null]);
            await input.click();
            await page.keyboard.press('Alt+ArrowDown');
            await expect(picker).toBeVisible();

            const selectorId = await picker.locator('.neo-dateselector').getAttribute('id'),
                  navigate   = commit !== 'Enter without arrows',
                  value      = navigate ? '2026-01-17' : '2026-01-15';

            await page.locator(`#${selectorId}__2026-01-15`).focus();
            if (navigate) {
                await page.keyboard.press('ArrowRight');
                await page.keyboard.press('ArrowRight')
            }
            await expect(page.locator(`#${selectorId}__${value}`)).toBeFocused();
            await expect.poll(() => readNavigation(neo, selectorId)).toEqual({
                value       : '2026-01-15', items: [`${selectorId}__2026-01-15`],
                navigationId: navigate ? `${selectorId}__${value}` : null
            });
            expect(await neo.getConfig(componentId, ['value', 'pickerIsMounted'])).toEqual([null, true]);
            await expect(picker).toBeVisible();

            if (commit === 'pointer') {
                await page.locator(`#${selectorId}__${value}`).click()
            } else {
                await page.keyboard.press('Enter')
            }
            await expect.poll(() => neo.getConfig(componentId, ['value', 'pickerIsMounted'])).toEqual([value, false]);
            await expect(input).toHaveValue(value);
            await expect.poll(() => neo.getConfig(`${componentId}__picker`, ['hidden'])).toEqual([true]);
            await expect(picker).toBeHidden()
        });
    }
});
