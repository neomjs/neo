import {test, expect} from '@playwright/test';

const
    THEMES         = ['neo-theme-neo-light', 'neo-theme-neo-dark'],
    unprefixedProp = suffix => '--' + suffix;

/**
 * @summary Verifies CSS custom-property namespace isolation on a shared page:
 * 1. An unlayered host stylesheet setting unprefixed button background and text custom properties on plain
 *    `button` elements does not alter a Neo button's computed `background-color` or `color`, whether the theme
 *    class lives on an ancestor or directly on the button.
 * 2. A foreign element inside a themed Neo container reading that unprefixed button custom property with a
 *    `lime` fallback computes `lime` (`rgb(0, 255, 0)`), proving Neo declares no unprefixed variable into the subtree.
 */
test.describe('Theme custom-property shared-page isolation (--neo- prefix)', () => {
    let createdIds = [];

    test.beforeEach(async ({page}) => {
        createdIds = [];

        await page.context().route('**/test/playwright/component/apps/empty-viewport/neo-config.json', async route => {
            const response = await route.fetch();

            await route.fulfill({
                body       : JSON.stringify({...await response.json(), themes: THEMES}),
                contentType: 'application/json'
            })
        });

        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        for (const id of createdIds.reverse()) {
            await page.evaluate(cmpId => Neo.worker.App.destroyNeoInstance(cmpId), id)
        }
    });

    test('an unlayered host rule on plain button elements does not alter Neo button colours (theme on ancestor and on button)', async ({page}) => {
        const
            hostBg = unprefixedProp('button-background-color'),
            hostFg = unprefixedProp('button-color');

        const {ancestorButtonId, directButtonId} = await page.evaluate(async () => {
            const ancestorRes = await Neo.worker.App.createNeoInstance({
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : 'component-test-viewport',
                text      : 'Inherited Theme'
            });
            const directRes = await Neo.worker.App.createNeoInstance({
                cls       : ['neo-theme-neo-dark'],
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : 'component-test-viewport',
                text      : 'Direct Theme'
            });

            if (!ancestorRes.success || !directRes.success) {
                throw new Error(ancestorRes.error?.message || directRes.error?.message)
            }

            return {ancestorButtonId: ancestorRes.id, directButtonId: directRes.id}
        });

        createdIds.push(ancestorButtonId, directButtonId);

        await expect(page.locator(`#${ancestorButtonId}`)).toBeVisible();
        await expect(page.locator(`#${directButtonId}`)).toBeVisible();

        await page.waitForFunction(
            () => [...document.styleSheets].some(sheet => sheet.href?.includes('/button/Base.css'))
        );

        const result = await page.evaluate(({ancestorButtonId, directButtonId, hostBg, hostFg}) => {
            const
                read = id => {
                    const style = getComputedStyle(document.getElementById(id));

                    return {backgroundColor: style.backgroundColor, color: style.color}
                },
                beforeAncestor = read(ancestorButtonId),
                beforeDirect   = read(directButtonId),
                hostStyle      = document.createElement('style');

            hostStyle.textContent = `button { ${hostBg}: rgb(255, 0, 0); ${hostFg}: rgb(255, 0, 0); }`;
            document.head.appendChild(hostStyle);

            const
                afterAncestor = read(ancestorButtonId),
                afterDirect   = read(directButtonId);

            hostStyle.remove();

            return {afterAncestor, afterDirect, beforeAncestor, beforeDirect}
        }, {ancestorButtonId, directButtonId, hostBg, hostFg});

        expect(result.beforeAncestor.backgroundColor).not.toBe('rgb(255, 0, 0)');
        expect(result.beforeAncestor.color).not.toBe('rgb(255, 0, 0)');
        expect(result.beforeDirect.backgroundColor).not.toBe('rgb(255, 0, 0)');
        expect(result.beforeDirect.color).not.toBe('rgb(255, 0, 0)');

        expect(result.afterAncestor).toEqual(result.beforeAncestor);
        expect(result.afterDirect).toEqual(result.beforeDirect)
    });

    test('a foreign element inside a themed Neo container reading an unprefixed button custom property paints its lime fallback', async ({page}) => {
        const hostBg = unprefixedProp('button-background-color');

        const {buttonId, containerId} = await page.evaluate(async () => {
            const containerRes = await Neo.worker.App.createNeoInstance({
                cls       : ['neo-theme-neo-dark'],
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport'
            });

            if (!containerRes.success) {
                throw new Error(containerRes.error?.message)
            }

            const buttonRes = await Neo.worker.App.createNeoInstance({
                importPath: '../button/Base.mjs',
                ntype     : 'button',
                parentId  : containerRes.id,
                text      : 'Neo Sibling'
            });

            if (!buttonRes.success) {
                throw new Error(buttonRes.error?.message)
            }

            return {buttonId: buttonRes.id, containerId: containerRes.id}
        });

        createdIds.push(containerId, buttonId);

        await expect(page.locator(`#${buttonId}`)).toBeVisible();

        await page.waitForFunction(
            () => [...document.styleSheets].some(sheet => sheet.href?.includes('/button/Base.css'))
        );

        const painted = await page.evaluate(({buttonId, containerId, hostBg}) => {
            const
                container = document.getElementById(containerId),
                foreign   = document.createElement('div');

            foreign.style.backgroundColor = `var(${hostBg}, lime)`;
            container.appendChild(foreign);

            const
                foreignBg = getComputedStyle(foreign).backgroundColor,
                neoBg     = getComputedStyle(document.getElementById(buttonId)).backgroundColor;

            foreign.remove();

            return {foreignBg, neoBg}
        }, {buttonId, containerId, hostBg});

        expect(painted.foreignBg).toBe('rgb(0, 255, 0)');
        expect(painted.neoBg).not.toBe('rgb(0, 255, 0)')
    })
});
