import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const PORTAL   = '/apps/portal/index.html',
      FAMILY   = '.portal-examples-family-overview',
      FAMILIES = ['Featured', 'Grid & Table', 'Forms', 'Multi-Window', 'Calendar'];

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
 * @summary Checks every family is reachable through the visible rail or its overflow menu.
 * @param {Object} page The test page.
 * @returns {Promise<void>}
 */
async function expectFamilyTabs(page) {
    const control = page.locator('.neo-tab-overflow-control:visible'),
          menu    = page.locator('.neo-tab-overflow-menu:visible .neo-list-item');
    let clicked = false;

    await expect.poll(async () => {
        if (!clicked && await control.isVisible() && !await menu.first().isVisible()) {
            try {
                // A recapture may withdraw this control and restore every header before the click.
                await control.click({timeout: 1000});
                clicked = true
            } catch (error) {
                if (await control.isVisible()) throw error
            }
        }

        return [...await page.getByRole('tab').allTextContents(), ...await menu.allTextContents()]
            .map(text => text.trim()).sort()
    }).toEqual([...FAMILIES].sort());

    if (await menu.first().isVisible()) {
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0)
    }
}

/**
 * @summary Checks the resting card: a 16:9 cover that fills it, with title and proof line on a docked scrim.
 * @param {Object} list The mounted list locator.
 * @param {Number} width Viewport width.
 * @returns {Promise<Object[]>} Measured cards for the retained evidence.
 */
async function expectCardLayout(list, width) {
    await list.page().mouse.move(0, 0); // a hovered card opens its action line

    const cards = await list.locator('.neo-list-item').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).map(node => {
        const card    = node.getBoundingClientRect(),
              caption = node.querySelector('.neo-item-bottom-position'),
              copy    = caption.getBoundingClientRect(),
              image   = node.querySelector('.preview-image').getBoundingClientRect(),
              shown   = [node.querySelector('.neo-title'), node.querySelector('.portal-example-feature')].filter(Boolean),
              texts   = [...caption.querySelectorAll('*')];

        return {
            title     : node.querySelector('.neo-title').textContent,
            top       : card.top,
            bottom    : card.bottom,
            height    : card.height,
            ratio     : card.width / card.height,
            clearCover: (copy.top - card.top) / card.height,
            coverFills: ['left', 'right', 'top', 'bottom'].every(side => Math.abs(image[side] - card[side]) < 1),
            docked    : Math.abs(copy.left - card.left) < 1 && Math.abs(copy.right - card.right) < 1 && Math.abs(copy.bottom - card.bottom) < 1,
            fits      : copy.top >= card.top && caption.scrollHeight <= caption.clientHeight + 1 && caption.scrollWidth <= caption.clientWidth + 1,
            textFits  : shown.every(text => {
                const rect = text.getBoundingClientRect();
                return rect.left >= copy.left && rect.right <= copy.right + 1 && rect.top >= copy.top - 1 && rect.bottom <= copy.bottom + 1
            }),
            closed      : node.querySelector('.portal-example-more').getBoundingClientRect().height < 1,
            opaque      : [node, caption, ...texts].every(text => getComputedStyle(text).opacity === '1'),
            noInlineSize: !node.style.height && !node.querySelector('.content').style.aspectRatio
        }
    }));

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.coverFills && Math.abs(card.ratio - 16 / 9) < 0.02), 'the cover fills a 16:9 card').toBe(true);
    expect(cards.every(card => card.docked && card.fits && card.textFits && card.closed && card.opaque && card.noInlineSize),
        'title and proof line fit a full-width, bottom-docked scrim; the action stays closed; no text is dimmed by opacity; no card is sized by hand').toBe(true);
    expect(cards.every(card => card.clearCover >= (width <= 600 ? 0.3 : 0.45)),
        'the resting caption leaves the upper part of the cover clear: 45 % of the card, 30 % at phone widths').toBe(true);

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
 * @summary Measures the caption's text colors against the actual composited paint of scrim and cover behind them.
 * The first sampled row is where the title starts, the place the scrim has to hold against a white cover.
 * @param {Object} caption Caption locator.
 * @param {Object} testInfo Playwright evidence writer.
 * @param {String} name Attachment name.
 * @returns {Promise<void>}
 */
async function expectCaptionContrast(caption, testInfo, name) {
    await caption.page().mouse.move(0, 0);

    const screenshot = await caption.screenshot(),
          decoded    = decodePng(screenshot),
          titleTop   = await caption.evaluate(node => parseFloat(getComputedStyle(node).paddingTop)),
          // a mixed color computes to `color(srgb r g b)` with channels from 0 to 1
          colors     = await caption.locator('a, .portal-example-feature, p, .neo-inner-details').evaluateAll(nodes =>
              nodes.map(node => {
                  const color = getComputedStyle(node).color, values = color.match(/[\d.]+/g).map(Number);
                  return color.startsWith('color(') ? [...values.slice(0, 3).map(value => value * 255), ...values.slice(3)] : values
              }));
    const luminance = color => color.slice(0, 3).map(value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    // the pixel row above the title and one inside the bottom padding: both free of glyphs
    const rows      = [Math.max(0, Math.floor(titleTop) - 1), decoded.height - 8];
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

        await expectFamilyTabs(page);
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
            }).toEqual(FAMILIES.map(() => mode));
            await expect(page.locator('.portal-examples-list:visible').getByRole('link', {name: 'Workstation', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`);

            await selectFamily(page, 'Grid & Table');
            await expect(page.locator(FAMILY).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/treeBigData/index.html`);
            await selectFamily(page, 'Multi-Window');
            // the seven covered records; the external OffscreenCanvas demo has no ESM destination
            await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(mode === 'dist_esm' ? 6 : 7);
            await expect(page.locator(FAMILY).getByRole('link', {name: 'Colors Dashboard', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/colors/index.html`);
            await selectFamily(page, 'Featured')
        }

        // A record without a cover stays in the catalog and gets no card: Calendar shows its one covered example.
        await page.goto(`${PORTAL}#/examples/calendar`);
        await expect(page.locator(FAMILY).getByRole('link', {name: 'Calendar', exact: true})).toBeVisible();
        await expect(page.locator(`${FAMILY} .neo-list-item`)).toHaveCount(1);
        await expect(page.locator(FAMILY).getByRole('link', {name: 'Studio Bookings', exact: true})).toHaveCount(0);

        await page.goto(`${PORTAL}#/examples/forms`);
        await expectFamilyTabs(page);
        await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(3);
        const forms = await app.getComponent(view.id, ['activeIndex']);
        expect(forms.activeIndex).toBe(2);

        await page.goto(`${PORTAL}#/examples/unknown`);
        await expectFamilyTabs(page);
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
                    await expectFamilyTabs(page);
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
                    await expectCardLayout(featured, viewport.width);
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

                await expect(overview.locator('.portal-example-feature')).toHaveCount(4);
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 3 : viewport.width <= 600 ? 1 : 2);
                const list = await readList(app);
                expect(list.id).toBe(await overview.getAttribute('id'));
                // the overview's Store lists the covered records; the catalog keeps the others for their covers
                expect(list.properties.store.count).toBe(4);
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('Buffered Data Grid with 5M cells');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .neo-item-bottom-position');
                await expect(covered).toHaveCount(4);

                // No cover, no card: the 17 records that wait for a cover render nothing, and no placeholder exists.
                await expect(overview.locator('.neo-list-item').filter({hasText: 'Animated Row Sorting'})).toHaveCount(0);
                await expect(overview.locator('.portal-example-placeholder')).toHaveCount(0);

                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await expect(issues.locator('.portal-example-feature')).toHaveText('Searchable issue snapshot with wrapped rows');
                expect(await issues.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .toContain('grid-issues-13-3.jpg');

                const geometry = await expectCardLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                // Table Filtering has a white cover: the scrim alone has to carry the text there.
                await expectCaptionContrast(covered.nth(3), testInfo, 'light-cover-caption-contrast');
                await testInfo.attach('card-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
                expect(await overview.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
                await page.screenshot({path: testInfo.outputPath(`grid-overview-${viewport.width}.png`)});

                /**
                 * @summary Reads the opened Issues card: which parts lie inside it, and whether the caption left the cover.
                 * @returns {Promise<Object>}
                 */
                const opened = () => issues.evaluate(node => {
                    const card   = node.getBoundingClientRect(),
                          box    = selector => node.querySelector(selector).getBoundingClientRect(),
                          inside = rect => rect.height > 0 && rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1;

                    return {
                        height    : card.height,
                        action    : inside(box('.portal-example-look-for')),
                        scope     : inside(box('.portal-example-scope')),
                        source    : inside(box('.neo-github-image')),
                        title     : inside(box('.neo-title')),
                        belowImage: box('.neo-item-bottom-position').top >= box('.preview-image').bottom - 1
                    }
                });
                const restHeight = geometry.find(card => card.title === 'GitHub Issues Grid').height;

                if (viewport.width > 600) {
                    // The action, the limits and the source link open inside the card, on the cover.
                    await issues.hover();
                    await expect.poll(opened).toEqual({height: restHeight, action: true, scope: true, source: true, title: true, belowImage: false});
                    await expect(issues.locator('.portal-example-scope')).toContainText('public issue snapshot');

                    // Synthetic extra copy probes the clamp: a long line never pushes the links out of the card.
                    const original = await issues.locator('.portal-example-look-for').textContent();
                    await issues.locator('.portal-example-look-for').evaluate((node, text) => node.textContent = text,
                        original + ' ' + Array(8).fill('Additional caption copy that the clamp has to hold inside the card.').join(' '));
                    await expect.poll(opened).toEqual({height: restHeight, action: true, scope: true, source: true, title: true, belowImage: false});
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)});
                    await app.callMethod(list.id, 'createItems');
                    await expect(issues.locator('.portal-example-look-for')).toHaveText(original)
                } else {
                    // One column has room to grow: a tapped card opens under its cover, nothing clamped.
                    await issues.locator('.preview-image').click({position: {x: 24, y: 20}});
                    await expect.poll(opened).toMatchObject({action: true, scope: true, source: true, title: true, belowImage: true});
                    expect((await opened()).height).toBeGreaterThan(restHeight);
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                }

                // A stable string identity also survives the lazy-cover path at the end of the list.
                await overview.locator('.neo-list-item').last().scrollIntoViewIfNeeded();
                await expect(overview.locator('.neo-list-item').last().getByRole('link', {name: 'Table Filtering'})).toBeVisible()
            })
        }
    }

    test('four mode selections retain the first card and navigate to actual Workstation and Grid UI', async ({page, neuralLink, context, baseURL}) => {
        await page.goto(`${PORTAL}#/examples`);
        let app = await neuralLink.connectToApp('Portal');

        await page.getByRole('tab', {name: 'Grid & Table', exact: true}).click();
        await expect(page).toHaveURL(/#\/examples\/grid$/);
        await expect(page.locator(`${FAMILY} .portal-example-feature`)).toHaveCount(4);

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
        await expect(page.locator('.portal-examples-list:visible .portal-example-feature')).toHaveCount(4);
        const gridList = await readList(app);
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        const gridPopup = context.waitForEvent('page');
        await page.locator('.portal-examples-list:visible').getByRole('link', {name: 'TreeGrid - Big Data', exact: true}).click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index.html$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await expect(grid.getByText('Firstname', {exact: true}).first()).toBeVisible();
        await grid.close()
    })
});
