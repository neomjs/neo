import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const PORTAL = '/apps/portal/index.html',
      FAMILY = '.portal-examples-family-overview';

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
 * @summary Selects a family through its visible header or the tab bar's existing overflow menu.
 * @param {Object} page The test page.
 * @param {String} name Family label.
 * @returns {Promise<void>}
 */
async function selectFamily(page, name) {
    const tab = page.getByRole('tab', {name, exact: true});

    if (await tab.isVisible()) {
        await tab.click()
    } else {
        await page.locator('.neo-tab-overflow-control:visible').click();
        await page.locator('.neo-tab-overflow-menu:visible .neo-list-item').filter({hasText: name}).click()
    }
}

/**
 * @summary Checks the complete caption against its card and the visible cover, including long copy.
 * @param {Object} list The mounted list locator.
 * @param {Number} width Viewport width.
 * @returns {Promise<Object[]>} Measured cards for the retained evidence.
 */
async function expectCaptionLayout(list, width) {
    const cards = await list.locator('.neo-list-item').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).map(node => {
        const card    = node.getBoundingClientRect(),
              caption = node.querySelector('.neo-item-bottom-position'),
              copy    = caption.getBoundingClientRect(),
              image   = node.querySelector('.preview-image').getBoundingClientRect(),
              lip     = getComputedStyle(caption, '::before'),
              lipSize = lip.display === 'none' ? 0 : parseFloat(lip.height),
              texts   = [...caption.querySelectorAll('*')];

        return {
            title     : node.querySelector('.neo-title').textContent,
            top       : card.top,
            bottom    : card.bottom,
            height    : card.height,
            clearCover: (copy.top - card.top) / image.height,
            belowImage: copy.top >= image.bottom - 1,
            docked    : Math.abs(copy.left - card.left) < 1 && Math.abs(copy.right - card.right) < 1 && Math.abs(copy.bottom - card.bottom) < 1,
            fits      : copy.top >= card.top && caption.scrollHeight <= caption.clientHeight + 1 && caption.scrollWidth <= caption.clientWidth + 1,
            textFits  : texts.every(text => {
                const rect = text.getBoundingClientRect();
                return rect.left >= copy.left && rect.right <= copy.right + 1 && rect.top >= copy.top + lipSize - 1 && rect.bottom <= copy.bottom + 1
            }),
            opaque      : [node, caption, ...texts].every(text => getComputedStyle(text).opacity === '1'),
            noInlineSize: !node.style.height && !node.querySelector('.content').style.gridTemplateRows
        }
    }));

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.docked && card.fits && card.textFits && card.opaque && card.noInlineSize),
        'opaque caption copy and icons fit a full-width, bottom-docked surface without per-card sizing').toBe(true);
    expect(cards.every(card => width <= 600 ? card.belowImage : card.clearCover >= 0.499),
        'phone captions follow the image; desktop captions leave at least half the cover clear, including the lip').toBe(true);

    const rows = new Map();
    cards.forEach(card => {
        const top = Math.round(card.top);
        rows.has(top) || rows.set(top, []);
        rows.get(top).push(card.bottom)
    });
    expect([...rows.values()].every(bottoms => Math.max(...bottoms) - Math.min(...bottoms) < 1),
        'cards sharing a row have aligned bottoms').toBe(true);
    return cards
}

/**
 * @summary Measures ordinary caption text against the actual composited paint in its opaque padding.
 * @param {Object} caption Caption locator.
 * @param {Object} testInfo Playwright evidence writer.
 * @param {String} name Attachment name.
 * @returns {Promise<void>}
 */
async function expectCaptionContrast(caption, testInfo, name) {
    const screenshot = await caption.screenshot(),
          decoded    = decodePng(screenshot),
          lipHeight  = await caption.evaluate(node => {
              const style = getComputedStyle(node, '::before');
              return style.display === 'none' ? 0 : parseFloat(style.height)
          }),
          colors     = await caption.locator('a, .portal-example-feature, p, .neo-inner-details').evaluateAll(nodes =>
              nodes.map(node => getComputedStyle(node).color.match(/[\d.]+/g).map(Number)));
    const luminance = color => color.slice(0, 3).map(value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const rows      = [Math.min(decoded.height - 1, Math.floor(lipHeight + 6)), decoded.height - 8];
    const contrasts = rows.flatMap(row => [0.12, 0.5, 0.88].flatMap(fraction => {
        const offset     = (row * decoded.width + Math.floor(decoded.width * fraction)) * decoded.channels,
              background = luminance([...decoded.pixels.subarray(offset, offset + 3)]);
        return colors.map(color => {
            expect(color[3] ?? 1, 'text color has no alpha reduction').toBe(1);
            const foreground = luminance(color);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        })
    }));
    expect(Math.min(...contrasts), 'ordinary caption text contrasts with the rendered surface').toBeGreaterThanOrEqual(4.5);
    await testInfo.attach(name, {body: screenshot, contentType: 'image/png'})
}

/**
 * @summary Exercises canonical catalog data through the Portal's Model, Store, cards and navigation.
 */
test.describe('Portal example catalog', () => {
    test('family navigation and the live build menu share one catalog and retain fallback routes', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table', 'Forms', 'Multi-Window']);
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
            }).toEqual([mode, mode, mode, mode]);
            await expect(page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Workstation', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`);

            await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
            await expect(page.locator(FAMILY).getByRole('link', {name: 'Grid Cell Editing', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/cellEditing/index.html`);
            await selectFamily(page, 'Multi-Window');
            await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(mode === 'dist_esm' ? 11 : 12);
            await expect(page.locator(FAMILY).getByRole('link', {name: 'Dock Pane Pop-out', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/dashboard/tearOut/index.html`);
            await page.getByRole('tab', {name: 'Featured', exact: true}).click()
        }

        await page.goto(`${PORTAL}#/examples/forms`);
        await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table', 'Forms', 'Multi-Window']);
        await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(24);
        const forms = await app.getComponent(view.id, ['activeIndex']);
        expect(forms.activeIndex).toBe(2);

        await page.goto(`${PORTAL}#/examples/unknown`);
        await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table', 'Forms', 'Multi-Window']);
        await expect(page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Workstation', exact: true})).toBeVisible();
        const current = await app.getComponent(view.id, ['activeIndex']);
        expect(current.activeIndex).toBe(0)
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 844, height: 390}]) {
            test(`${theme} ${viewport.width}px: Grid and Table features are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
                await page.setViewportSize(viewport);
                await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
                const captureFeatured = viewport.width !== 844;
                await page.goto(`${PORTAL}#/examples${captureFeatured ? '' : '/grid'}`);
                const app      = await neuralLink.connectToApp('Portal');
                const overview = page.locator(FAMILY);
                await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

                if (captureFeatured) {
                    await expect(page.getByRole('tab')).toHaveText(['Featured', 'Grid & Table', 'Forms', 'Multi-Window']);
                    const selectors = await app.queryComponent({reference: 'example-build-selector'}, ['id']);
                    const selector  = page.locator('.portal-examples-build-selector');
                    await expect(selector).toHaveAttribute('id', selectors[0].id);
                    await expect(selector.locator('.neo-button-glyph')).toBeVisible();
                    const tabClearance = await page.getByRole('tab').first().evaluate(node =>
                        node.getBoundingClientRect().bottom - node.querySelector('.neo-button-glyph').getBoundingClientRect().bottom);
                    const control = await selector.evaluate(node => {
                        const button = node.getBoundingClientRect(),
                              glyph  = node.querySelector('.neo-button-glyph').getBoundingClientRect();

                        return {
                            glyphBottom: glyph.bottom,
                            clearance  : button.bottom - glyph.bottom,
                            viewport   : window.innerHeight
                        }
                    });
                    expect(control.glyphBottom).toBeLessThan(control.viewport);
                    expect(control.clearance).toBeGreaterThanOrEqual(tabClearance - 1);
                    await testInfo.attach('build-selector-geometry', {body: JSON.stringify({...control, tabClearance}), contentType: 'application/json'});
                    const featured = page.locator('.portal-examples-list:visible');
                    await expectCaptionLayout(featured, viewport.width);
                    await expectCaptionContrast(featured.locator('.neo-item-bottom-position').first(), testInfo, 'featured-caption-contrast');
                    await page.locator('.portal-examples-list:visible .preview-image').evaluateAll(async nodes => {
                        await Promise.allSettled(nodes.slice(0, 3).map(async node => {
                            const image = new Image();
                            image.src = getComputedStyle(node).backgroundImage.match(/url\("([^"]+)"\)/)[1];
                            await image.decode()
                        }))
                    });
                    await page.screenshot({path: testInfo.outputPath(`featured-after-${viewport.width}.png`)});

                    await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
                }

                await expect(overview.locator('.portal-example-feature')).toHaveCount(21);
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 3 : viewport.width <= 600 ? 1 : 2);
                const list = await readList(app);
                expect(list.id).toBe(await overview.getAttribute('id'));
                expect(list.properties.store.count).toBe(21);
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('Buffered Data Grid with 5M cells');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .neo-item-bottom-position');
                await expect(covered).toHaveCount(4);

                const animated = overview.locator('.neo-list-item').filter({hasText: 'Animated Row Sorting'});
                await expect(animated.locator('.portal-example-feature')).toHaveText('Animated sorting and filtering');
                await expect(animated.locator('.portal-example-look-for')).toContainText('Sort a header');
                expect(await animated.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .not.toContain('url(');

                const jsonGrid = overview.locator('.neo-list-item').filter({hasText: 'JSON-defined grid'});
                await expect(jsonGrid.locator('.portal-example-scope')).toContainText('static JSON configuration');
                await expect(jsonGrid.locator('.portal-example-scope')).toContainText('does not use a server-side row model');

                const geometry = await expectCaptionLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                await expectCaptionContrast(animated.locator('.neo-item-bottom-position'), testInfo, 'coverless-caption-contrast');
                await testInfo.attach('caption-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
                expect(await overview.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
                await page.screenshot({path: testInfo.outputPath(`grid-overview-${viewport.width}.png`)});

                if (viewport.width === 1440) {
                    const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                    await issues.scrollIntoViewIfNeeded();
                    await issues.screenshot({path: testInfo.outputPath('issues-caption-after-1440.png')});

                    // Synthetic extra copy probes intrinsic CSS sizing; restore the canonical Worker projection afterward.
                    const original = await issues.locator('.portal-example-look-for').textContent();
                    const longer   = original + ' ' + Array(8).fill('Additional caption copy demonstrates intrinsic row growth without measuring or assigning a height.').join(' ');
                    await issues.locator('.portal-example-look-for').evaluate((node, text) => node.textContent = text, longer);
                    const grown = await expectCaptionLayout(overview, viewport.width);
                    expect(grown.find(card => card.title === 'GitHub Issues Grid').height)
                        .toBeGreaterThan(geometry.find(card => card.title === 'GitHub Issues Grid').height);
                    await app.callMethod(list.id, 'createItems');
                    await expect(issues.locator('.portal-example-look-for')).toHaveText(original)
                }

                // A stable string identity also survives the lazy-cover path below the fold.
                await overview.locator('.neo-list-item').last().scrollIntoViewIfNeeded();
                await expect(overview.locator('.neo-list-item').last().getByRole('link', {name: 'Table Refresh Performance'})).toBeVisible()
            })
        }
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
