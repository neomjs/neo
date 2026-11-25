import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';
import {
    CARDS,
    expectCaptionContrast,
    expectCardLayout,
    expectOpenPage,
    FEATURED,
    GROUPS,
    luminance,
    openGroup,
    openOverview,
    PAGE,
    PORTAL,
    readList,
    readOverviewList,
    selectBuild,
    SIDEBAR,
    THEME
} from '../utils/portalExamplesCatalog.mjs';

/**
 * @summary Build-mode switching, card fit and contrast across viewports, and live app/example launch.
 */
test.describe('Portal examples builds, card layout and live launch', () => {
    test('the build control and the pages share one catalog, and the four build routes resolve as before', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        // the Start here list plus every published group's card list and tile list borrow the one catalog
        await expect(page.locator(FEATURED)).toBeVisible();
        let sources;
        await expect.poll(async () => (sources = await app.queryComponent({className: 'Portal.view.examples.List'}, ['store'])).length).toBe(2 * GROUPS.length + 1);
        expect(new Set(sources.map(item => item.properties.store.sourceId)).size).toBe(1);

        for (const [label, mode, prefix] of [
            ['ESM build', 'dist_esm', 'dist/esm/'],
            ['Development build', 'dist_dev', 'dist/development/'],
            ['Dev mode', 'devmode', ''],
            ['Production build', 'dist_prod', 'dist/production/']
        ]) {
            await selectBuild(page, label);
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'Open the 100,000 × 200 grid'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/bigData/index.html${THEME}`);
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html${THEME}`);

            await openGroup(page, 'Grid & Table');
            await expect(page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/treeBigData/index.html${THEME}`);
            await openGroup(page, 'Multi-Window');
            // the six covered records plus dock-cross-window, dock-tear-out and Email (via alsoIn); the external
            // OffscreenCanvas demo has no ESM destination, so the list's Store holds one card fewer there
            await expect.poll(async () => (await readList(app, 'multi-window')).properties.catalogMode).toBe(mode);
            await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount((await readList(app, 'multi-window')).properties.store.count);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Colors Dashboard', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/colors/index.html${THEME}`);
            await openOverview(page)
        }

        // A record without a cover stays in the catalog and gets no card: Calendar shows its covered examples only.
        await openGroup(page, 'Calendar');
        await expect(page.locator(`${CARDS} .neo-list-item`).first()).toBeVisible();
        await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount((await readList(app, 'calendar')).properties.store.count);
        await expect(page.locator(CARDS).getByRole('link', {name: 'Studio Bookings', exact: true})).toHaveCount(0);

        for (const [mode, prefix] of [['dist_prod', 'dist/production/'], ['dist_esm', 'dist/esm/'], ['dist_dev', 'dist/development/'], ['devmode', '']]) {
            await page.goto(`${PORTAL}#/examples/${mode}`);
            await expect(page.locator(FEATURED)).toBeVisible();
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html${THEME}`)
        }
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: the Examples sidebar keeps hovered labels and counts readable`, async ({page}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
            await page.goto(`${PORTAL}#/examples`);
            await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

            const sidebar = page.locator(SIDEBAR),
                  trees   = sidebar.getByRole('link', {name: /^Trees, /}),
                  current = sidebar.getByRole('link', {name: /^Start here, \d+ live examples?$/}),
                  paint   = link => link.evaluate(node => {
                      const style = getComputedStyle(node);
                      return {background: style.backgroundColor, marker: style.boxShadow}
                  });

            const resting = await paint(trees);
            await trees.hover();
            await expect.poll(async () => (await paint(trees)).background).not.toBe(resting.background);

            const row = decodePng(await trees.screenshot({animations: 'disabled'})),
                  // Sample the center of the right padding, clear of the count, glyph and rounded corners.
                  pixel  = (Math.floor(row.height / 2) * row.width + row.width - 4) * row.channels,
                  fill   = luminance([...row.pixels.subarray(pixel, pixel + 3)]),
                  labels = trees.locator('.portal-examples-group-index-title, .portal-examples-group-index-count'),
                  colors = await labels.evaluateAll(nodes => nodes.map(node =>
                      getComputedStyle(node).color.match(/[\d.]+/g).map(Number)
                  ));

            expect(colors).toHaveLength(2);
            for (const color of colors) {
                const text = luminance(color);
                expect((Math.max(fill, text) + 0.05) / (Math.min(fill, text) + 0.05)).toBeGreaterThanOrEqual(4.5)
            }

            const selected = await paint(current);
            expect(selected.marker).not.toBe('none');
            await current.hover();
            await expect(current).toHaveAttribute('aria-current', 'page');
            expect(await paint(current)).toEqual(selected);

            await sidebar.getByRole('link', {name: /^Grid & Table, /}).focus();
            await page.keyboard.press('ArrowDown');
            await expect(trees).toBeFocused();
            await expect(trees).toHaveCSS('outline-style', 'solid')
        });

        for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 844, height: 390}]) {
            test(`${theme} ${viewport.width}px: Start here cards and Grid and Table features are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
                await page.setViewportSize(viewport);
                await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
                await page.goto(`${PORTAL}#/examples`);
                const app = await neuralLink.connectToApp('Portal');
                await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

                const featured = page.locator(FEATURED);
                await expect(featured.locator('.neo-list-item').first()).toBeVisible();
                await expect(featured.locator('.neo-list-item')).toHaveCount((await readOverviewList(app)).properties.store.count);
                await page.evaluate(() => document.fonts.ready);
                const startHere = await expectCardLayout(featured, viewport.width);

                if (viewport.width > 600) {
                    // a desktop card never opens its proof line: what rests on the card is all a visitor reads
                    expect(startHere.filter(card => !card.featureWhole).map(card => card.title), 'every Start here proof line reads whole at rest').toEqual([])
                }
                await expect(featured.locator('.neo-title').nth(0)).toHaveText('Workstation');
                await expect(featured.locator('.portal-example-group-badge').nth(0)).toHaveText('Multi-Window');
                await expect(featured.locator('.neo-title').nth(1)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(featured.locator('.portal-example-group-badge').nth(1)).toHaveText('Grid & Table');
                await expect(featured.locator('.neo-multi-window[aria-label="Multi-window live example"]').first().locator('.neo-multi-window-label')).toHaveText('Multi-window');
                await expectCaptionContrast(featured.locator('.portal-example-footer').first(), testInfo, 'start-here-caption-contrast');

                await openGroup(page, 'Grid & Table');
                const overview = page.locator(CARDS),
                      list     = await readList(app, 'grid-table'),
                      // the page's Store lists the covered records, one card each; the catalog keeps the others for their covers
                      cards    = list.properties.store.count;

                await expect(overview.locator('.portal-example-feature')).toHaveCount(cards);
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 3 : 1);
                expect(list.id).toBe(await overview.getAttribute('id'));
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .portal-example-footer');
                await expect(covered).toHaveCount(cards);
                await expect(overview.locator('.portal-example-placeholder')).toHaveCount(0);

                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await expect(issues.locator('.portal-example-feature')).toHaveText('Searchable issue snapshot with wrapped rows');
                expect(await issues.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .toContain(theme === 'neo-theme-neo-light' ? 'grid-issues-14-light.jpg' : 'grid-issues-14.jpg');

                const geometry = await expectCardLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                // Table Filtering has a white cover: the footer rail and selected band stay legible across both themes.
                await expectCaptionContrast(covered.nth(4), testInfo, 'light-cover-caption-contrast');
                await testInfo.attach('card-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
                expect(await page.locator(PAGE).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
                await page.screenshot({path: testInfo.outputPath(`grid-page-${viewport.width}.png`)});

                /**
                 * @summary Reads the Issues card geometry across hover and selection.
                 * @returns {Promise<Object>}
                 */
                const opened = () => issues.evaluate(node => {
                    const card   = node.getBoundingClientRect(),
                          wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                          footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                          more   = node.querySelector('.portal-example-more').getBoundingClientRect(),
                          box    = selector => node.querySelector(selector).getBoundingClientRect(),
                          inside = rect => rect.height > 0 && rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1;

                    return {
                        height     : card.height,
                        moreHeight : more.height,
                        moreRatio  : more.height / wrap.height,
                        moreInCover: more.height > 0 && more.bottom <= wrap.bottom + 1.5 && more.top >= wrap.top - 1,
                        moreBelow  : more.height > 0 && more.top >= footer.bottom - 1.5,
                        action     : inside(box('.portal-example-look-for')),
                        scope      : inside(box('.portal-example-scope')),
                        source     : inside(box('.neo-github-image')),
                        title      : inside(box('.neo-title'))
                    }
                });
                const restHeight = geometry.find(card => card.title === 'GitHub Issues Grid').height;

                if (columns > 1) {
                    // Hover applies the chromatic blue wash without opening .portal-example-more; clicking selects and opens <= 40 % inside the cover frame.
                    await issues.hover();
                    expect((await opened()).moreHeight).toBeLessThan(1);
                    await issues.locator('.preview-image-wrap').click({position: {x: 24, y: 20}});
                    await expect(issues).toHaveClass(/neo-selected/);
                    await expect.poll(async () => (await opened()).action).toBe(true);
                    const state = await opened();
                    expect(Math.abs(state.height - restHeight)).toBeLessThan(1);
                    expect(state.moreInCover).toBe(true);
                    expect(state.moreRatio).toBeLessThanOrEqual(0.4 + 0.01);
                    expect(state.scope && state.source && state.title).toBe(true);
                    await expect(issues.locator('.portal-example-scope')).toContainText('public issue snapshot');
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                } else {
                    // Single-column (< 704 px list width, including 844 px sidebar 1-col and phones): selected details open in-flow below the footer.
                    await issues.locator('.preview-image-wrap').click({position: {x: 24, y: 20}});
                    await expect(issues).toHaveClass(/neo-selected/);
                    await expect.poll(async () => {
                        const s = await opened();
                        return s.moreBelow && s.action && s.scope && s.source && s.title && s.height > restHeight
                    }).toBe(true);
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                }

                // A stable string identity also survives the lazy-cover path when scrolled into view.
                const tableLink = overview.getByRole('link', {name: 'When to Use a Table', exact: true});
                await tableLink.scrollIntoViewIfNeeded();
                await expect(tableLink).toBeVisible()
            })
        }
    }

    test('a card opens the actual Workstation and Grid UI', async ({page, neuralLink, context, baseURL}) => {
        await page.goto(`${PORTAL}#/examples/multi-window`);
        let app = await neuralLink.connectToApp('Portal');
        // the group pages exist once the catalog has loaded
        await expectOpenPage(page, 'Multi-Window');

        // Rebase only the deployment origin to this test server. The real catalog's path and click stay intact.
        const list = await readList(app, 'multi-window');
        await app.setProperties(list.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(list.id, 'createItems');
        await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true})).toHaveAttribute('href',
            `${baseURL}/dist/production/apps/workstation/index.html${THEME}`);

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const devList = await readList(app, 'multi-window');
        await app.setProperties(devList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(devList.id, 'createItems');
        await page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true}).click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();
        await expect(page.locator('.neo-dock-workspace')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        const gridList = await readList(app, 'grid-table');
        await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(gridList.properties.store.count);
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        const gridPopup = context.waitForEvent('page');
        await page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}).click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index.html\?theme=neo-theme-neo-dark$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await expect(grid.getByText('Organization', {exact: true}).first()).toBeVisible();
        await grid.close()
    });

    test('the Open live cue activates the exact launch link across pointer, touch, keyboard and build modes', async ({page, neuralLink, context, browser, baseURL}) => {
        await page.goto(`${PORTAL}#/examples/multi-window`);
        let app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Multi-Window');

        const prodList = await readList(app, 'multi-window');
        await app.setProperties(prodList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(prodList.id, 'createItems');

        const workstationCard = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}),
              workstationCue  = workstationCard.locator('.portal-example-open-cue');

        await expect(workstationCue).toHaveAttribute('href', `${baseURL}/dist/production/apps/workstation/index.html${THEME}`);
        await expect(workstationCue).toHaveAttribute('target', '_blank');
        await expect(workstationCue).toHaveAttribute('aria-hidden', 'true');
        await expect(workstationCue).toHaveAttribute('tabindex', '-1');
        await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true})).toHaveCount(1);

        const titleLink = workstationCard.locator('.neo-title'),
              source    = workstationCard.locator('.neo-github-image');

        await titleLink.focus();
        await expect(titleLink).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(source).toBeFocused();
        await expect(workstationCue).not.toBeFocused();

        // In devmode, clicking Workstation's cue reuses the same window (sharedWorkers), while Enter on the title does the same
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const devList = await readList(app, 'multi-window');
        await app.setProperties(devList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(devList.id, 'createItems');

        const devWorkstation = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}),
              devCue         = devWorkstation.locator('.portal-example-open-cue');

        await expect(devCue).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html${THEME}`);
        await expect(devCue).not.toHaveAttribute('target', /_blank/);
        await devCue.click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const enterList = await readList(app, 'multi-window');
        await app.setProperties(enterList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(enterList.id, 'createItems');

        const enterTitle = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}).locator('.neo-title');
        await expect(enterTitle).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html${THEME}`);
        await enterTitle.focus();
        await expect(enterTitle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        // Single-window example keeps target="_blank" when clicking the cue in devmode
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        const gridList = await readList(app, 'grid-table');
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');

        const treeCue = page.locator(`${CARDS} .neo-list-item`, {hasText: 'TreeGrid - Big Data'}).locator('.portal-example-open-cue');
        await expect(treeCue).toHaveAttribute('href', `${baseURL}/examples/grid/treeBigData/index.html${THEME}`);
        await expect(treeCue).toHaveAttribute('target', '_blank');
        const gridPopup = context.waitForEvent('page');
        await treeCue.click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await grid.close();

        // Real touch tap on mobile viewport preserves both popup (_blank) and same-window (sharedWorkers) launch targets
        const touchContext = await browser.newContext({baseURL, hasTouch: true, viewport: {width: 390, height: 844}});
        await touchContext.route('https://neomjs.com/**', route => route.fulfill({
            status     : 200,
            contentType: 'text/html',
            body       : '<title>Launched</title>'
        }));
        const touchPage = await touchContext.newPage();
        await touchPage.goto(`${PORTAL}#/examples/devmode`);
        await expect(touchPage.locator(FEATURED)).toBeVisible();

        const gridCard = touchPage.locator(`${FEATURED} .neo-list-item`, {hasText: 'Data Grid: 100k Rows & 200 Columns'});
        await gridCard.scrollIntoViewIfNeeded();
        const touchPopup = touchContext.waitForEvent('page');
        await gridCard.locator('.portal-example-open-cue').tap();
        const touchedGrid = await touchPopup;
        await expect(touchedGrid).toHaveURL(/\/examples\/grid\/bigData\/index\.html\?theme=neo-theme-neo-dark$/);
        await touchedGrid.close();

        const wsCard = touchPage.locator(`${FEATURED} .neo-list-item`, {hasText: 'Workstation'});
        await wsCard.scrollIntoViewIfNeeded();
        await wsCard.locator('.portal-example-open-cue').tap();
        await expect(touchPage).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await touchContext.close()
    });
});
