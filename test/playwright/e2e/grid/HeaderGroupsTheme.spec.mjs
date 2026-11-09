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

for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
    test(`Header Groups keeps its live leaf and full-group proxies painted in ${theme}`, async ({page, neuralLink}, testInfo) => {
        await page.setViewportSize({width: 1991, height: 1000});
        await page.goto('/examples/grid/headerGroups/index.html');
        await expect(page.locator('.neo-grid-header-group-cell.neo-draggable')).toHaveCount(5);
        const app  = await neuralLink.connectToApp('Neo.examples.grid.headerGroups'),
              view = asArray(await app.queryComponent({className: 'Neo.examples.grid.headerGroups.MainContainer'}, ['id']))[0];

        if (theme === 'neo-theme-neo-dark') {
            await page.getByRole('button', {name: 'Dark theme', exact: true}).click();
            await expect(page.getByRole('button', {name: 'Light theme', exact: true})).toBeVisible()
        }
        await expect.poll(() => app.callMethod(view.id, 'getTheme', [])).toBe(theme);
        // Boot inherits the body's theme; the switch sets an explicit viewport theme.
        await expect(page.locator(theme === 'neo-theme-neo-light' ? 'body' : '.neo-examples-grid-header-groups'))
            .toHaveClass(new RegExp(theme));

        const toolbar = page.locator('.neo-grid-container .neo-grid-header-toolbar').nth(1),
              proxy   = page.locator('.neo-dragproxy'),
              scroll  = async value => {
                  await page.locator('.neo-grid-horizontal-scrollbar').evaluate((node, x) => {
                      node.scrollLeft = x;
                      node.dispatchEvent(new Event('scroll'))
                  }, value);
                  await expect.poll(() => toolbar.evaluate(node => node.scrollLeft)).toBe(value)
              };

        await scroll(230);
        for (const name of ['Oct', 'Sep', 'Nov', 'Oct', 'Sep', 'Oct']) {
            const leaf  = toolbar.locator('.neo-grid-header-button').filter({hasText: new RegExp(`^${name}$`)}),
                  from  = await leaf.boundingBox(),
                  color = await leaf.evaluate(node => getComputedStyle(node).backgroundColor),
                  y     = from.y + from.height / 2;
            await page.mouse.move(from.x + from.width / 2, y);
            await page.mouse.down();
            await page.mouse.move(from.x + from.width / 2 + 25, y, {steps: 4});
            await page.mouse.move(from.x + from.width / 2 + 260, y + 35, {steps: 20});
            const header = proxy.locator('.neo-grid-header-button');
            await expect(header).toHaveText(name);
            await expect(proxy).toHaveClass(new RegExp(theme));
            await expect(header).toHaveCSS('background-color', color);
            await expect.poll(() => header.evaluate(node => {
                const rect   = node.getBoundingClientRect(),
                      parent = node.closest('.neo-grid-header-toolbar').getBoundingClientRect();
                return [Math.round(rect.left - parent.left), Math.round(rect.top - parent.top)]
            })).toEqual([0, 0]);
            if (name === 'Nov') {
                await testInfo.attach(`${theme}-leaf.png`, {body: await page.screenshot(), contentType: 'image/png'})
            }
            await page.keyboard.press('Escape');
            await page.mouse.up();
            await expect(proxy).toHaveCount(0)
        }

        await scroll(0);
        const group  = page.locator('.neo-grid-container .neo-grid-header-group-cell').filter({hasText: /^Q2$/}),
              from   = await group.boundingBox(),
              target = await page.locator('.neo-grid-container .neo-grid-header-group-cell').filter({hasText: /^Q1$/}).boundingBox(),
              color  = await group.evaluate(node => getComputedStyle(node).backgroundColor),
              y      = from.y + from.height / 2;
        await page.mouse.move(from.x + from.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 - 25, y, {steps: 4});
        await page.mouse.move(target.x + 20, y, {steps: 20});
        await expect(proxy).toHaveClass(new RegExp(theme));
        await expect(proxy.locator('.neo-grid-header-group-cell')).toHaveText('Q2');
        await expect(proxy.locator('.neo-grid-header-group-cell')).toHaveCSS('background-color', color);
        await expect(proxy.locator('.neo-grid-header-button')).toHaveText(['Apr', 'May', 'Jun']);
        await expect(proxy.locator('.neo-grid-row').first()).toBeVisible();
        await testInfo.attach(`${theme}-group.png`, {body: await page.screenshot(), contentType: 'image/png'});
        await page.mouse.up();
        await expect(proxy).toHaveCount(0);
        await expect(toolbar.locator('.neo-grid-header-button')).toHaveText(
            ['Apr', 'May', 'Jun', 'Jan', 'Feb', 'Mar', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Id']
        )
    })
}
