import {expect, test} from '../../fixtures.mjs';

const PORTAL = '/apps/portal/index.html',
      FAMILY = '.portal-examples-grid-overview';

/**
 * @summary Reads the mounted list from this page's App Worker, rather than a sibling Portal.
 * @param {Object} app The bound Neural Link app.
 * @returns {Promise<Object>} Mounted list identity and Store.
 */
async function readList(app) {
    const matches = await app.queryComponent({className: 'Portal.view.examples.List'}, ['id', 'mounted', 'catalogMode', 'store']);

    return matches.find(match => match.properties.mounted)
}

/**
 * @summary Exercises canonical catalog data through the Portal's Model, Store, cards and navigation.
 */
test.describe('Portal example catalog', () => {
    test('family navigation and the live build menu share one catalog and retain fallback routes', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table']);
        const matches = await app.queryComponent({className: 'Portal.view.examples.TabContainer'}, ['id', 'activeIndex']);
        const view    = Array.isArray(matches) ? matches[0] : matches;
        const sources = await app.queryComponent({className: 'Portal.view.examples.List'}, ['store']);
        sources.forEach(item => expect(item.properties.store.sourceId).toEqual(expect.any(String)));
        expect(new Set(sources.map(item => item.properties.store.sourceId)).size).toBe(1);

        for (const [label, mode, prefix] of [
            ['ESM', 'dist_esm', 'dist/esm/'],
            ['Development build', 'dist_dev', 'dist/development/'],
            ['Dev mode', 'devmode', ''],
            ['Production', 'dist_prod', 'dist/production/']
        ]) {
            await page.getByRole('button', {name: /^Build: /}).click();
            await page.locator('.neo-menu-list:visible .neo-list-item').filter({hasText: label}).click();
            await expect.poll(async () => {
                const lists = await app.queryComponent({className: 'Portal.view.examples.List'}, ['catalogMode']);
                return lists.map(item => item.properties.catalogMode)
            }).toEqual([mode, mode]);
            await expect(page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Workstation', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`);

            await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
            await expect(page.locator(FAMILY).getByRole('link', {name: 'Grid Cell Editing', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/cellEditing/index.html`);
            await page.getByRole('tab', {name: 'Featured', exact: true}).click()
        }

        await page.goto(`${PORTAL}#/examples/forms`);
        await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table']);
        await expect(page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Workstation', exact: true})).toBeVisible();
        const current = await app.getComponent(view.id, ['activeIndex']);
        expect(current.activeIndex).toBe(0)
    });

    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}, {width: 844, height: 390}]) {
        test(`${viewport.width}px: Grid and Table features are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples/grid`);
            const app      = await neuralLink.connectToApp('Portal');
            const overview = page.locator(FAMILY);

            await expect(overview.locator('.portal-example-feature')).toHaveCount(21);
            const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
            expect(columns).toBe(viewport.width === 1440 ? 3 : viewport.width === 390 ? 1 : 2);
            const list = await readList(app);
            expect(list.id).toBe(await overview.getAttribute('id'));
            expect(list.properties.store.count).toBe(21);
            expect(list.properties.store.model.className).toBe('Portal.model.Example');
            await expect(overview.locator('.neo-title').nth(0)).toHaveText('TreeGrid - Big Data');
            await expect(overview.locator('.neo-title').nth(1)).toHaveText('Buffered Data Grid with 5M cells');
            await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

            const covered = overview.locator('.portal-example-image-card .neo-item-bottom-position');
            await expect(covered).toHaveCount(4);
            const panels = await covered.evaluateAll(nodes => nodes.map(node => ({
                alpha  : Number(getComputedStyle(node).backgroundColor.match(/[\d.]+/g).at(3)),
                padding: parseFloat(getComputedStyle(node).padding)
            })));
            expect(panels.every(panel => panel.alpha >= 0.85 && panel.padding >= 12),
                'photographed text has a separate dark caption surface').toBe(true);

            const animated = overview.locator('.neo-list-item').filter({hasText: 'Animated Row Sorting'});
            await expect(animated.locator('.portal-example-feature')).toHaveText('Animated sorting and filtering');
            await expect(animated.locator('.portal-example-look-for')).toContainText('Sort a header');
            expect(await animated.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                .not.toContain('url(');

            const jsonGrid = overview.locator('.neo-list-item').filter({hasText: 'JSON-defined grid'});
            await expect(jsonGrid.locator('.portal-example-scope')).toContainText('static JSON configuration');
            await expect(jsonGrid.locator('.portal-example-scope')).toContainText('does not use a server-side row model');

            const geometry = await overview.locator('.neo-list-item').evaluateAll(nodes => nodes.map(node => {
                const card = node.getBoundingClientRect(),
                      copy = node.querySelector('.neo-item-bottom-position').getBoundingClientRect();
                return {fits: copy.left >= card.left && copy.right <= card.right + 1 && copy.top >= card.top && copy.bottom <= card.bottom + 1}
            }));
            expect(geometry.every(row => row.fits), 'all captions stay inside their cards').toBe(true);
            expect(await overview.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
            await page.screenshot({path: testInfo.outputPath(`grid-overview-${viewport.width}.png`)});

            if (viewport.width === 1440) {
                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await issues.scrollIntoViewIfNeeded();
                await issues.screenshot({path: testInfo.outputPath('issues-caption-after-1440.png')})
            }

            // A stable string identity also survives the lazy-cover path below the fold.
            await overview.locator('.neo-list-item').last().scrollIntoViewIfNeeded();
            await expect(overview.locator('.neo-list-item').last().getByRole('link', {name: 'Table Refresh Performance'})).toBeVisible()
        })
    }

    test('four mode selections retain the first card and navigate to actual Workstation and Grid UI', async ({page, neuralLink, context, baseURL}) => {
        await page.goto(`${PORTAL}#/examples`);
        let app = await neuralLink.connectToApp('Portal');

        await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
        await expect(page).toHaveURL(/#\/examples\/grid$/);
        await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(21);

        for (const [mode, prefix] of [
            ['dist_prod', 'dist/production/'], ['dist_esm', 'dist/esm/'],
            ['dist_dev', 'dist/development/'], ['devmode', '']
        ]) {
            await page.goto(`${PORTAL}#/examples/${mode}`);
            const visible = page.locator('.portal-examples-list:visible');
            await expect(visible.getByRole('link', {name: 'Workstation', exact: true})).toHaveAttribute('href',
                `https://neomjs.com/${prefix}apps/workstation/index.html`);
            await expect(visible.getByRole('link', {name: 'GitHub Issues Grid', exact: true})).toHaveAttribute('href',
                `https://neomjs.com/${prefix}examples/grid/issues/index.html`)
        }

        // Rebase only the deployment origin to this test server. The real catalog's path and click stay intact.
        app = await neuralLink.connectToApp('Portal');
        const list = await readList(app);
        await app.setProperties(list.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(list.id, 'createItems');
        const visible = page.locator('.portal-examples-list:visible');
        await expect(visible.getByRole('link', {name: 'Workstation', exact: true})).toHaveAttribute('href',
            `${baseURL}/apps/workstation/index.html`);
        await visible.getByRole('link', {name: 'Workstation', exact: true}).click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index.html$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();
        await expect(page.locator('.neo-dock-workspace')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
        await expect(page.locator('.portal-examples-list:visible .portal-example-feature')).toHaveCount(21);
        const gridList = await readList(app);
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        const gridPopup = context.waitForEvent('page');
        await page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Grid Cell Editing', exact: true}).click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/cellEditing\/index.html$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await expect(grid.getByText('Firstname', {exact: true}).first()).toBeVisible();
        await grid.close()
    })
});
