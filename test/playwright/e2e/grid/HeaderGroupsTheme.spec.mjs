import {expect, test} from '../../fixtures.mjs';

const asArray = value => Array.isArray(value) ? value : [value];

/**
 * @summary The standalone Header Groups demo switches modern skins on its existing grid without changing columns.
 */
test('Header Groups exposes modern light and dark themes without changing its grid', async ({page, neuralLink}, testInfo) => {
    await page.goto('/examples/grid/headerGroups/index.html');
    await expect(page.locator('.neo-grid-header-group-cell')).toHaveCount(5);
    await expect(page.getByRole('button', {name: 'Dark theme', exact: true})).toBeVisible();

    const app     = await neuralLink.connectToApp('Neo.examples.grid.headerGroups'),
          view    = asArray(await app.queryComponent({className: 'Neo.examples.grid.headerGroups.MainContainer'}, ['id']))[0],
          grid    = asArray(await app.queryComponent({className: 'Neo.grid.Container'}, ['id']))[0],
          columns = () => page.locator('.neo-grid-header-toolbar .neo-grid-header-button').evaluateAll(nodes =>
              nodes.map(node => ({id: node.id, text: node.textContent.trim(), width: Math.round(node.getBoundingClientRect().width)}))),
          before = await columns();

    expect(await app.callMethod(view.id, 'getTheme', [])).toBe('neo-theme-neo-light');
    for (const [button, theme, nextButton] of [
        ['Dark theme', 'neo-theme-neo-dark', 'Light theme'],
        ['Light theme', 'neo-theme-neo-light', 'Dark theme']
    ]) {
        await page.getByRole('button', {name: button, exact: true}).click();
        await expect.poll(() => app.callMethod(view.id, 'getTheme', [])).toBe(theme);
        await expect(page.locator('.neo-examples-grid-header-groups')).toHaveClass(new RegExp(theme));
        await expect(page.getByRole('button', {name: nextButton, exact: true})).toBeVisible();
        expect(asArray(await app.queryComponent({className: 'Neo.grid.Container'}, ['id']))[0].id).toBe(grid.id);
        expect(await columns()).toEqual(before);
        await expect.poll(() => page.locator('.neo-grid-container').first().evaluate(node =>
            Math.round(node.getBoundingClientRect().width))).toBe((await page.viewportSize()).width);
        await page.mouse.move(0, 0);
        await expect(page.locator('.header-groups-toolbar .neo-button-ripple-wrapper')).toHaveCount(0);
        await testInfo.attach(`${theme}.png`, {body: await page.screenshot(), contentType: 'image/png'})
    }

    await page.setViewportSize({width: 640, height: 720});
    await expect.poll(() => page.locator('.header-groups-toolbar').evaluate(node => ({
        width: Math.round(node.getBoundingClientRect().width),
        fits : node.scrollWidth === node.clientWidth
    }))).toEqual({width: 640, fits: true});
    const instruction = await page.locator('.header-groups-instruction').boundingBox(),
          header      = await page.locator('.neo-grid-header-group-row').first().boundingBox();
    expect(instruction.y + instruction.height).toBeLessThanOrEqual(header.y);
    await testInfo.attach('narrow.png', {body: await page.screenshot(), contentType: 'image/png'})
});
