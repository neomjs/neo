import {test, expect} from '@playwright/test';

const
    THEMES         = ['neo-theme-neo-light', 'neo-theme-neo-dark'],
    unprefixedProp = suffix => '--' + suffix;

/**
 * @summary Verifies CSS custom-property namespace isolation on a shared page:
 * 1. An unlayered host stylesheet setting unprefixed button background and text custom properties on plain
 *    `button` elements does not alter a Neo button's computed `background-color` (`.neo-button`) or painted
 *    label `color` (`.neo-button-text`), whether the theme class lives on an ancestor or directly on the button.
 * 2. A foreground-only host rule leaves `.neo-button-text` untouched, while a foreground-only sensitivity
 *    control proves the test reader catches a `.neo-button-text` rule reading the unprefixed property in both
 *    inherited and direct theme placements.
 * 3. A foreign element inside a themed Neo container reading unprefixed button custom properties paints its
 *    explicit fallbacks, proving Neo declares no unprefixed button variables into the subtree.
 */
test.describe('Theme custom-property shared-page isolation (--neo- prefix)', () => {
    let createdIds = [];

    async function mountButtons(page) {
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

        await expect(page.locator(`#${ancestorButtonId} .neo-button-text`)).toBeVisible();
        await expect(page.locator(`#${directButtonId} .neo-button-text`)).toBeVisible();

        await page.waitForFunction(
            () => [...document.styleSheets].some(sheet => sheet.href?.includes('/button/Base.css'))
        );

        return {ancestorButtonId, directButtonId}
    }

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

    test('an unlayered host rule on plain button elements does not alter Neo button background or painted .neo-button-text label colour (ancestor and direct theme)', async ({page}) => {
        const
            hostBg                             = unprefixedProp('button-background-color'),
            hostFg                             = unprefixedProp('button-color'),
            {ancestorButtonId, directButtonId} = await mountButtons(page);

        const result = await page.evaluate(({ancestorButtonId, directButtonId, hostBg, hostFg}) => {
            const
                read = id => {
                    const
                        buttonEl = document.getElementById(id),
                        labelEl  = buttonEl?.querySelector('.neo-button-text');

                    if (!buttonEl || !labelEl) {
                        throw new Error(`Missing button or .neo-button-text for #${id}`)
                    }

                    return {
                        backgroundColor: getComputedStyle(buttonEl).backgroundColor,
                        labelColor     : getComputedStyle(labelEl).color
                    }
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
        expect(result.beforeAncestor.labelColor).not.toBe('rgb(255, 0, 0)');
        expect(result.beforeDirect.backgroundColor).not.toBe('rgb(255, 0, 0)');
        expect(result.beforeDirect.labelColor).not.toBe('rgb(255, 0, 0)');

        expect(result.afterAncestor).toEqual(result.beforeAncestor);
        expect(result.afterDirect).toEqual(result.beforeDirect)
    });

    test('foreground-only host rule leaves .neo-button-text untouched and foreground-only sensitivity control catches an unprefixed label read in both placements', async ({page}) => {
        const
            hostFg                             = unprefixedProp('button-color'),
            {ancestorButtonId, directButtonId} = await mountButtons(page);

        const result = await page.evaluate(({ancestorButtonId, directButtonId, hostFg}) => {
            const
                read = id => {
                    const
                        buttonEl = document.getElementById(id),
                        labelEl  = buttonEl.querySelector('.neo-button-text');

                    return {
                        backgroundColor: getComputedStyle(buttonEl).backgroundColor,
                        labelColor     : getComputedStyle(labelEl).color
                    }
                },
                beforeAncestor = read(ancestorButtonId),
                beforeDirect   = read(directButtonId),
                hostStyle      = document.createElement('style');

            hostStyle.textContent = `button { ${hostFg}: rgb(255, 0, 0); }`;
            document.head.appendChild(hostStyle);

            const
                isolatedAncestor = read(ancestorButtonId),
                isolatedDirect   = read(directButtonId),
                probeStyle       = document.createElement('style'),
                ancestorEl       = document.getElementById(ancestorButtonId),
                directEl         = document.getElementById(directButtonId);

            probeStyle.textContent = `@layer neo.rules { .neo-button.neo-isolation-fg-probe .neo-button-text { color: var(${hostFg}); } }`;
            document.head.appendChild(probeStyle);
            ancestorEl.classList.add('neo-isolation-fg-probe');
            directEl.classList.add('neo-isolation-fg-probe');

            const
                leakedAncestor = read(ancestorButtonId),
                leakedDirect   = read(directButtonId);

            ancestorEl.classList.remove('neo-isolation-fg-probe');
            directEl.classList.remove('neo-isolation-fg-probe');
            probeStyle.remove();
            hostStyle.remove();

            return {
                beforeAncestor,
                beforeDirect,
                isolatedAncestor,
                isolatedDirect,
                leakedAncestor,
                leakedDirect
            }
        }, {ancestorButtonId, directButtonId, hostFg});

        expect(result.isolatedAncestor).toEqual(result.beforeAncestor);
        expect(result.isolatedDirect).toEqual(result.beforeDirect);

        expect(result.leakedAncestor.backgroundColor).toBe(result.beforeAncestor.backgroundColor);
        expect(result.leakedDirect.backgroundColor).toBe(result.beforeDirect.backgroundColor);
        expect(result.leakedAncestor.labelColor).toBe('rgb(255, 0, 0)');
        expect(result.leakedDirect.labelColor).toBe('rgb(255, 0, 0)')
    });

    test('a foreign element inside a themed Neo container reading unprefixed button custom properties paints its fallbacks', async ({page}) => {
        const
            hostBg = unprefixedProp('button-background-color'),
            hostFg = unprefixedProp('button-color');

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

        await expect(page.locator(`#${buttonId} .neo-button-text`)).toBeVisible();

        await page.waitForFunction(
            () => [...document.styleSheets].some(sheet => sheet.href?.includes('/button/Base.css'))
        );

        const painted = await page.evaluate(({buttonId, containerId, hostBg, hostFg}) => {
            const
                container = document.getElementById(containerId),
                buttonEl  = document.getElementById(buttonId),
                labelEl   = buttonEl.querySelector('.neo-button-text'),
                foreign   = document.createElement('div');

            foreign.style.backgroundColor = `var(${hostBg}, lime)`;
            foreign.style.color           = `var(${hostFg}, rgb(0, 128, 255))`;
            container.appendChild(foreign);

            const
                foreignStyle = getComputedStyle(foreign),
                foreignBg    = foreignStyle.backgroundColor,
                foreignFg    = foreignStyle.color,
                neoBg        = getComputedStyle(buttonEl).backgroundColor,
                neoFg        = getComputedStyle(labelEl).color;

            foreign.remove();

            return {foreignBg, foreignFg, neoBg, neoFg}
        }, {buttonId, containerId, hostBg, hostFg});

        expect(painted.foreignBg).toBe('rgb(0, 255, 0)');
        expect(painted.foreignFg).toBe('rgb(0, 128, 255)');
        expect(painted.neoBg).not.toBe('rgb(0, 255, 0)');
        expect(painted.neoFg).not.toBe('rgb(0, 128, 255)')
    })
});
