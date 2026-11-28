import fs                                    from 'node:fs';
import path                                  from 'node:path';
import {fileURLToPath}                       from 'node:url';
import {test, expect}                        from '../../fixtures.mjs';
import {readThemeDeclarations, resolveValue} from '../../../../buildScripts/util/check-theme-palette.mjs';

/**
 * @summary Whitebox E2E witness for Workstation's product palette: the Close action's tooltip paints the
 * product's colours in the populated pop-out and in the main window, in both schemes, on a fresh hover after each
 * runtime switch.
 *
 * The two windows hold different expectations until the `Workspace.css` tooltip block goes. The pop-out loads no
 * `Workspace.css`, so its tooltip paints what the shared tooltip's roles (`background-accent`, `text-on-accent`)
 * resolve to under the palette. The spec reads those values from theme Neo's `Global.css` with the product palette on
 * top, not from the running page, so a window that never loaded the palette fails. The main window's tooltip still
 * paints the bridge, `--workstation-panel-2` and `--workstation-ink`. Each reading also reports the role on the
 * tooltip element, which tells a missing palette from a missing binding.
 *
 * Runs in Playwright's default headless mode; the pop-out is a real second window either way.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8153 \
 *      npx playwright test workstation/WorkstationProductPaletteNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    ITEM    = 'metrics', // the active leaf of the boot document's right-top tabs
    root    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    read    = file => readThemeDeclarations(fs.readFileSync(path.join(root, file), 'utf8')),
    asArray = value => Array.isArray(value) ? value : (value?.instances ?? value?.items ?? []),
    flatten = entries => asArray(entries).map(entry => ({id: entry.id, ...(entry.properties ?? entry)}));

/**
 * @summary What a role resolves to for one theme class and scheme: theme Neo's declarations, the product palette's
 * on top.
 * @param {String} themeClass
 * @param {String} role
 * @returns {String}
 */
function productRole(themeClass, role) {
    const
        theme        = read('resources/css/theme-neo/Global.css'),
        product      = read('resources/css/theme-neo/apps/workstation/Global.css'),
        declarations = new Map([...theme.get(themeClass), ...(product.get(themeClass) ?? [])]);

    return resolveValue(`var(${role})`, declarations, themeClass.endsWith('dark') ? 'dark' : 'light')
}

/**
 * @summary A colour as the page serializes a computed colour, so a declared value and a painted one compare.
 * @param {import('@playwright/test').Page} page
 * @param {String} color
 * @returns {Promise<String>}
 */
function computed(page, color) {
    return page.evaluate(value => {
        const probe = document.createElement('i');

        probe.style.color = value;
        document.body.append(probe);

        const result = getComputedStyle(probe).color;

        probe.remove();
        return result
    }, color)
}

/**
 * @summary Hovers a window's Close action afresh and reads its tooltip: painted colours, the role on the element and
 * the theme class the tooltip carries.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readCloseTooltip(page) {
    const
        close   = page.locator('.workstation-viewport').getByRole('button', {name: /^close$/i}).first(),
        tooltip = page.locator('.neo-tooltip').filter({hasText: /^Close$/});

    await page.mouse.move(1, 1);
    await expect(tooltip).toBeHidden({timeout: 10000});
    await close.hover();
    await expect(tooltip).toBeVisible({timeout: 10000});

    return tooltip.evaluate(element => {
        const style = getComputedStyle(element);

        return {
            background: style.backgroundColor,
            color     : style.color,
            role      : style.getPropertyValue('--neo-color-background-accent').trim(),
            theme     : [...element.classList].find(name => name.startsWith('neo-theme-'))
        }
    })
}

test.describe('Workstation — the product palette paints the tooltip in every window (#22432)', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

    test('the pop-out tooltip paints the palette, the main tooltip the bridge, after each switch', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',              {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const
            app         = await neuralLink.connectToApp('Workstation'),
            workspaceId = flatten(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
            dockModel   = (await app.getComponent(workspaceId, ['dockModel'])).dockModel,
            nodeId      = Object.entries(dockModel.nodes || {}).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))?.[0],
            chrome      = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]),
            action      = await app.callMethod(chrome.containerId, 'getAction', ['pop-out']),
            paneId      = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
            popupOpened = page.waitForEvent('popup', {timeout: 30000});

        expect(action?.id, 'pop-out resolves on the live tab owner').toBeTruthy();

        // The pane owns DOM in the opener once its tab is active; the pop-out action then shows.
        await page.locator(`#${chrome.buttons[ITEM]}`).click();
        await expect(page.locator(`#${paneId}`)).toBeVisible({timeout: 10000});
        await expect(page.locator(`#${action.id}`)).toBeVisible({timeout: 10000});
        await page.locator(`#${action.id}`).click();

        const popup = await popupOpened;

        await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
        await expect(popup.locator(`#${paneId}`), 'the pop-out renders the populated pane').toBeVisible({timeout: 15000});

        const receipts = [];

        for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-neo-dark']) {
            if (receipts.length) {
                await page.locator('.workstation-theme-button').click()
            }

            for (const win of [page, popup]) {
                await expect.poll(() => win.evaluate(() =>
                    [...document.querySelector('.workstation-viewport').classList].find(name => name.startsWith('neo-theme-'))),
                {message: `the ${win === page ? 'main window' : 'pop-out'} switched to ${theme}`, timeout: 30000}).toBe(theme)
            }

            const
                bridge  = await page.locator('.workstation-viewport').evaluate(viewport => {
                    const style = getComputedStyle(viewport);

                    return {background: style.getPropertyValue('--workstation-panel-2').trim(), color: style.getPropertyValue('--workstation-ink').trim()}
                }),
                palette = {background: productRole(theme, '--neo-color-background-accent'), color: productRole(theme, '--neo-color-text-on-accent')},
                main    = await readCloseTooltip(page),
                popOut  = await readCloseTooltip(popup),
                receipt = {theme, bridge, main, palette, popOut};

            receipts.push(receipt);

            expect(main.theme,   `${theme}: the main tooltip carries the live theme`).toBe(theme);
            expect(popOut.theme, `${theme}: the pop-out tooltip carries the live theme`).toBe(theme);

            expect(main.background, `${theme}: the main tooltip paints the bridge's panel-2`).toBe(await computed(page, bridge.background));
            expect(main.color,      `${theme}: and its ink`).toBe(await computed(page, bridge.color));

            expect(await computed(popup, popOut.role),
                `${theme}: the pop-out tooltip's accent role is the product's, so the palette loaded there`).toBe(await computed(popup, palette.background));
            expect(popOut.background, `${theme}: the pop-out tooltip paints the product's accent`).toBe(await computed(popup, palette.background));
            expect(popOut.color,      `${theme}: and the product's on-accent text`).toBe(await computed(popup, palette.color))
        }

        console.log(`WORKSTATION_PRODUCT_PALETTE ${JSON.stringify(receipts)}`);
        await test.info().attach('workstation-product-palette', {body: JSON.stringify(receipts, null, 2), contentType: 'application/json'});

        expect(await app.callMethod(workspaceId, 'closeTearOutVessel', [{itemId: ITEM, windowName: `tearout-${ITEM}`}])).toBe(true)
    })
});
