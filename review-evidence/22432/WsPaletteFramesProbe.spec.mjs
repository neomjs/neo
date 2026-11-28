import fs             from 'node:fs';
import path           from 'node:path';
import {test, expect} from '../../fixtures.mjs';

/**
 * #22432 AC-6 probe (scratch, never committed): frames of the Close tooltip in the main window and the populated
 * pop-out, dark then light, plus every visible element's painted colours per window and scheme, for a dev/head diff.
 * Run inside a tree: WS_PROBE_OUT=<dir> NEO_AGENTOS_RUNTIME_ROOT=<brain> npx playwright test workstation/WsPaletteFramesProbe
 *     -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    ITEM    = 'metrics',
    out     = process.env.WS_PROBE_OUT,
    asArray = value => Array.isArray(value) ? value : (value?.instances ?? value?.items ?? []),
    flatten = entries => asArray(entries).map(entry => ({id: entry.id, ...(entry.properties ?? entry)}));

// Every visible element's paint, keyed by a class path that survives generated ids
const census = () => {
    const
        props = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow'],
        clean = el => [...el.classList].filter(name => !/^neo-(theme-|hover|focus|pressed|is-)|\d{3,}/.test(name)).sort().slice(0, 3).join('.'),
        key   = el => {
            const parts = [];
            for (let node = el; node && node !== document.body; node = node.parentElement) {
                const same = node.parentElement ? [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName && clean(sibling) === clean(node)) : [node];
                parts.unshift(`${node.tagName.toLowerCase()}${clean(node) ? '.' + clean(node) : ''}${same.length > 1 ? `[${same.indexOf(node)}]` : ''}`)
            }
            return parts.join('>')
        },
        rows  = {};

    // Only what paints: text colour where the element holds text or a glyph, a border side with width and style,
    // an outline that draws, a shadow that is set
    const painted = (el, style, prop) => {
        if (prop === 'color') return el.tagName === 'I' || el.tagName === 'svg' || [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (prop.startsWith('border-')) {
            const side = prop.split('-')[1];
            return parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 && !/none|hidden/.test(style.getPropertyValue(`border-${side}-style`))
        }
        if (prop === 'outline-color') return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        if (prop === 'box-shadow') return style.boxShadow !== 'none';
        return true
    };

    for (const el of document.body.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
        const style = getComputedStyle(el), paint = {};
        for (const prop of props) if (painted(el, style, prop)) paint[prop] = style.getPropertyValue(prop);
        rows[key(el)] = paint
    }
    return rows
};

async function hoverClose(page) {
    const
        close   = page.locator('.workstation-viewport').getByRole('button', {name: /^close$/i}).first(),
        tooltip = page.locator('.neo-tooltip').filter({hasText: /^Close$/});

    await page.mouse.move(1, 1);
    await expect(tooltip).toBeHidden({timeout: 10000});
    await close.hover();
    await expect(tooltip).toBeVisible({timeout: 10000});
    await page.waitForTimeout(400);

    return tooltip.evaluate(element => {const style = getComputedStyle(element); return {background: style.backgroundColor, color: style.color}})
}

test('probe: tooltip frames and paint census per window and scheme', async ({page, neuralLink}) => {
    test.setTimeout(240000);
    await page.setViewportSize({width: 1600, height: 900});
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

    await page.locator(`#${chrome.buttons[ITEM]}`).click();
    await expect(page.locator(`#${action.id}`)).toBeVisible({timeout: 10000});
    await page.locator(`#${action.id}`).click();

    const popup = await popupOpened;

    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
    await expect(popup.locator(`#${paneId}`)).toBeVisible({timeout: 15000});
    await popup.setViewportSize({width: 900, height: 600});

    const report = {};

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        if (theme !== 'neo-theme-neo-dark') await page.locator('.workstation-theme-button').click();

        for (const win of [page, popup]) {
            await expect.poll(() => win.evaluate(() =>
                [...document.querySelector('.workstation-viewport').classList].find(name => name.startsWith('neo-theme-'))), {timeout: 30000}).toBe(theme)
        }

        await page.waitForTimeout(1500);

        for (const [name, win] of [['main', page], ['popout', popup]]) {
            await win.mouse.move(1, 1);
            await win.waitForTimeout(600);
            report[`${name} ${theme}`] = {census: await win.evaluate(census)};
            report[`${name} ${theme}`].tooltip = await hoverClose(win);
            await win.screenshot({path: path.join(out, `${name}-${theme.slice(14)}.png`)})
        }
    }

    fs.writeFileSync(path.join(out, 'census.json'), JSON.stringify(report));
    await app.callMethod(workspaceId, 'closeTearOutVessel', [{itemId: ITEM, windowName: `tearout-${ITEM}`}])
});
